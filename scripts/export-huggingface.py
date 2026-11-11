#!/usr/bin/env python3
"""Export the frozen benchmark and supplied initial screenshots to Parquet.

This is a local export. It does not access Hugging Face or upload any files.
"""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlencode, urlsplit, urlunsplit

from datasets import Dataset, Features, Image, List, Value
from PIL import Image as PILImage, ImageStat
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
CARD_TEMPLATE = ROOT / "docs/templates/huggingface-card.md"
CARD_ASSETS = {"assets/task-overview.png": ROOT / "docs/images/task-overview.png"}
COLUMNS = ["id", "category", "instruction", "initial_observation", "environment_type", "movement", "play_url"]
MOVEMENT = {"walk", "drive", "swim", "dive", "boat", "plane", "helicopter"}


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8"))


def task_play_url(task_id, base_url):
    if not re.fullmatch(r"c\d{2}-n\d{2,3}", task_id):
        raise ValueError(f"Invalid public task ID: {task_id}")
    url = urlsplit(base_url)
    if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError("Expected an HTTP(S) game directory URL without credentials, query, or fragment")
    return urlunsplit((url.scheme, url.netloc, url.path.rstrip("/") + "/", urlencode({"task": task_id}), ""))


def movement_for(task, metadata):
    if task["id"] in metadata["movement_overrides"]:
        values = metadata["movement_overrides"][task["id"]]
    elif task["kind"] in ("shooting", "sniper"):
        values = []
    elif task["category"] in ("outdoor-foot", "stairs", "indoor"):
        values = ["walk"]
    elif task["category"] == "air":
        values = ["walk", task["vehicle"]]
    elif task["vehicle"] == "walk":
        values = ["walk"]
    elif task["vehicle"] in ("jetski", "dinghy"):
        values = ["boat"]
    elif task["category"] in ("outdoor-road", "follow", "chase", "escape"):
        values = ["drive"]
    else:
        raise ValueError(f"No movement annotation for {task['id']}")
    if not isinstance(values, list) or len(set(values)) != len(values) or set(values) - MOVEMENT:
        raise ValueError(f"Invalid movement annotation for {task['id']}: {values}")
    return values


def image_bytes(entry, manifest_directory, task):
    entry = {"image": entry} if isinstance(entry, str) else entry
    file = Path(entry["image"])
    if not file.is_absolute():
        file = manifest_directory / file
    data = file.read_bytes()
    if entry.get("image_sha256") and hashlib.sha256(data).hexdigest() != entry["image_sha256"]:
        raise ValueError(f"Image checksum mismatch: {task['id']}")
    if entry.get("instruction_sha256") and hashlib.sha256(task["instruction"].encode()).hexdigest() != entry["instruction_sha256"]:
        raise ValueError(f"Instruction changed since capture: {task['id']}")
    with PILImage.open(io.BytesIO(data)) as image:
        image.load()
        if image.size != (1280, 720):
            raise ValueError(f"Expected a 1280x720 initial observation for {task['id']}, got {image.size}")
        if max(ImageStat.Stat(image.convert("RGB")).stddev) < 2:
            raise ValueError(f"Blank/near-uniform observation: {task['id']}")
        suffix = {"JPEG": ".jpg", "PNG": ".png"}.get(image.format)
        if suffix is None:
            raise ValueError(f"Unsupported screenshot format: {task['id']}")
    return {"bytes": data, "path": task["id"] + suffix}


def dataset_card(rows):
    counts = Counter((row["category"], row["environment_type"]) for row in rows)
    table = "\n".join(
        f"| {category} | {'3D' if environment == '3d' else 'Image-based'} | {count} |"
        for (category, environment), count in counts.items()
    )
    template = CARD_TEMPLATE.read_text(encoding="utf-8")
    if template.count("{{TASK_DISTRIBUTION}}") != 1:
        raise ValueError("Dataset card template must contain one task distribution placeholder")
    return template.replace("{{TASK_DISTRIBUTION}}", table)


def export(args):
    catalog = read_json(args.catalog)
    metadata = read_json(args.metadata)
    manifest = read_json(args.observations)
    observations = manifest.get("observations", manifest)
    ids = [row["id"] for row in catalog]
    if len(ids) != 150 or len(set(ids)) != 150:
        raise ValueError("Expected exactly 150 unique benchmark task IDs")
    if set(observations) != set(ids):
        raise ValueError(f"Initial-observation coverage mismatch: missing={sorted(set(ids)-set(observations))}, extra={sorted(set(observations)-set(ids))}")
    if set(metadata["movement_vocabulary"]) != MOVEMENT:
        raise ValueError("Movement vocabulary differs from the paper")
    if set(metadata["movement_overrides"]) - set(ids):
        raise ValueError("Movement overrides reference an unknown task")
    play_base_url = args.play_base_url or metadata["play_base_url"]
    task_play_url(ids[0], play_base_url)
    output = args.output.resolve()
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite an existing export: {output}")
    rows = []
    for task in catalog:
        if not task["instruction"].strip():
            raise ValueError(f"Empty instruction: {task['id']}")
        rows.append({"id": task["id"], "category": metadata["category_labels"][task["category"]],
            "instruction": task["instruction"],
            "initial_observation": image_bytes(observations[task["id"]], args.observations.resolve().parent, task),
            "environment_type": "image" if task["kind"] in ("shooting", "sniper") else "3d",
            "movement": movement_for(task, metadata), "play_url": task_play_url(task["id"], play_base_url)})
    features = Features({"id": Value("string"), "category": Value("string"), "instruction": Value("string"),
        "initial_observation": Image(), "environment_type": Value("string"), "movement": List(Value("string")),
        "play_url": Value("string")})
    dataset = Dataset.from_list(rows, features=features)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".hf-export-", dir=output.parent) as temp:
        directory = Path(temp)
        (directory / "data").mkdir()
        parquet = directory / "data/test-00000-of-00001.parquet"
        # Write the Arrow table directly to keep codec selection independent
        # of version-specific media compression defaults in datasets.
        pq.write_table(dataset.data.table, parquet, compression="zstd", row_group_size=50)
        table = pq.read_table(parquet)
        if table.column_names != COLUMNS or table.num_rows != 150:
            raise ValueError("Parquet row count or schema mismatch")
        # Check every embedded screenshot, including the absence of host paths.
        for expected, actual in zip(rows, table.to_pylist()):
            if actual != expected or "/" in actual["initial_observation"]["path"]:
                raise ValueError(f"Parquet round-trip mismatch: {expected['id']}")
        restored = Dataset.from_parquet(str(parquet))
        if not isinstance(restored.features["initial_observation"], Image):
            raise ValueError("Parquet did not preserve the Hugging Face Image feature")
        for record in restored:
            if record["initial_observation"].size != (1280, 720):
                raise ValueError("Decoded image dimensions changed")
        (directory / "README.md").write_text(dataset_card(rows), encoding="utf-8")
        for destination, source in CARD_ASSETS.items():
            target = directory / destination
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        directory.rename(output)
    report = {"schema": "gtagym.huggingface.export-report.v2", "rows": 150, "columns": COLUMNS,
        "play_base_url": play_base_url,
        "categories": dict(Counter(row["category"] for row in rows)),
        "environment_types": dict(Counter(row["environment_type"] for row in rows)),
        "movement_counts": dict(Counter(mode for row in rows for mode in row["movement"])),
        "image_size": [1280, 720], "all_images_decoded": True, "all_bytes_preserved": True,
        "files": {str(file.relative_to(output)): {"bytes": file.stat().st_size,
            "sha256": hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(output.rglob("*")) if file.is_file()}}
    try:
        report["code_revision"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "report": str(args.report), "rows": 150,
        "bytes": sum(item["bytes"] for item in report["files"].values())}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--observations", required=True, type=Path, help="JSON manifest mapping every public task ID to its initial screenshot")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/huggingface/GTAVBench")
    parser.add_argument("--catalog", type=Path, default=ROOT / "tasks/catalog.json")
    parser.add_argument("--metadata", type=Path, default=ROOT / "configs/huggingface.json")
    parser.add_argument("--report", type=Path, default=ROOT / ".cache/huggingface/export-report.json")
    parser.add_argument("--play-base-url", help="Hosted game directory URL; defaults to play_base_url in the metadata")
    export(parser.parse_args())
