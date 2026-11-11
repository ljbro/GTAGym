# Hugging Face dataset export

The export contains the frozen 150-task `test` split with exactly seven columns:
`id`, `category`, `instruction`, `initial_observation`, `environment_type`,
`movement`, and `play_url`. Each `play_url` opens the corresponding task on
[the hosted demo](https://ljbro.github.io/GTAGym/tasks.html), for example
`https://ljbro.github.io/GTAGym/?task=c02-n15`.
Initial screenshots use the Hugging Face `Image` feature, with the
image bytes embedded in Parquet. No local image paths are needed after upload.

Install the optional Python export dependencies:

```bash
python -m pip install 'datasets>=4' pyarrow Pillow
```

Provide a JSON manifest with one genuine initial screenshot per public task ID:

```json
{
  "observations": {
    "c01-n01": {
      "image": "images/c01-n01.jpg",
      "image_sha256": "OPTIONAL_IMAGE_SHA256",
      "instruction_sha256": "OPTIONAL_INSTRUCTION_SHA256"
    }
  }
}
```

The example is abbreviated: all 150 IDs are required. Remove the optional hash
fields when not supplying hashes. Image paths resolve relative to the manifest.
Use screenshots before the first agent action, at 1280 x 720; sniping starts
unscoped. Keep any capture provenance outside the upload directory.

```bash
python scripts/export-huggingface.py --observations /path/to/initial-observations.json
```

The exporter validates full ID coverage, instructions, image integrity and
dimensions, movement labels, Parquet round trips, and Hugging Face image
decoding. It refuses to overwrite existing output. Default outputs:

```text
outputs/huggingface/GTAVBench/
  README.md
  data/test-00000-of-00001.parquet
.cache/huggingface/export-report.json
```

Only the `GTAVBench` directory is intended for upload. The report and original
manifest stay local. Upload is a separate, explicit action:

```bash
hf upload OpenMOSS-Team/GTAVBench outputs/huggingface/GTAVBench --repo-type dataset
```

The seven movement tokens match the paper: `walk`, `drive`, `swim`, `dive`,
`boat`, `plane`, `helicopter`. A task can contain multiple tokens. Image-based
tasks use an empty list. Cars, motorcycles, and trucks all use `drive`;
vertical traversal uses `walk`. The submarine uses `boat` plus `dive`.
The reproducible category names and task-specific movement overrides are in
`configs/huggingface.json`. These labels describe benchmark tasks, rather than
an instruction to the generator to sample between the listed modes.

`play_base_url` in the same configuration controls the hosted game directory.
The exporter appends `?task=ID` for each task. To target a different deployment,
pass `--play-base-url https://YOUR_SITE/GTAGym/`; the URL must use HTTP(S) and
have no credentials, query, or fragment. Exporting does not publish a website.

The dataset card is generated from `docs/templates/huggingface-card.md`, with
the category distribution derived from exported rows. The task overview image
is copied from `docs/images/task-overview.png` into the export's `assets/`
directory. This keeps future exports consistent with the published layout.
