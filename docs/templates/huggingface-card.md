---
license: apache-2.0
pretty_name: GTAVBench
language:
- en
tags:
- gui-agents
- game-environments
- multimodal
- reinforcement-learning
- arxiv:2611.13028
configs:
- config_name: default
  data_files:
  - split: test
    path: data/test-*.parquet
---

<h1 align="center">GTAVBench</h1>

<p align="center"><strong>150 GTA V tasks for evaluating agent perception, reasoning, and control</strong></p>

<div align="center">
  <a href="https://github.com/ljbro/GTAGym"><img src="https://img.shields.io/badge/GitHub-Code-181717?logo=github&amp;logoColor=white" alt="GTAGym code"></a>
  <a href="https://arxiv.org/abs/2611.13028"><img src="https://img.shields.io/badge/arXiv-2611.13028-B31B1B?logo=arxiv&amp;logoColor=white" alt="GTAGym paper"></a>
  <a href="https://arxiv.org/pdf/2611.13028"><img src="https://img.shields.io/badge/PDF-Download-D32F2F?logo=adobeacrobatreader&amp;logoColor=white" alt="Download the paper"></a>
  <a href="https://ljbro.github.io/GTAGym/tasks.html"><img src="https://img.shields.io/badge/Play-Online-0F766E?logo=githubpages&amp;logoColor=white" alt="Play the 150 benchmark tasks"></a>
</div>

<p align="center"><a href="https://github.com/ljbro/GTAGym">Code &amp; environments</a> · <a href="https://arxiv.org/abs/2611.13028">Paper</a> · <a href="https://ljbro.github.io/GTAGym/tasks.html">Try the benchmark</a></p>

GTAVBench is the evaluation benchmark of **[GTAGym](https://github.com/ljbro/GTAGym)**, an environment and framework for evaluation and reinforcement learning on GTA V tasks. It combines interactive 3D environments reconstructed from main-story missions with image-based shooting and sniping tasks using GTA V imagery.

<p align="center">
  <a href="https://ljbro.github.io/GTAGym/tasks.html"><img src="https://huggingface.co/datasets/OpenMOSS-Team/GTAVBench/resolve/main/assets/task-overview.png" alt="GTAVBench: nine interactive 3D task categories, shooting, and sniping before and after scoping in" width="1000"></a>
</p>

**Start here:** [Highlights](#-highlights) · [Play online](#-play-online) · [Download](#-download-and-load) · [Schema](#-dataset-schema) · [Task distribution](#-task-distribution) · [Citation](#-citation)

## 🌟 Highlights

- **150 tasks, 11 categories:** 103 interactive 3D tasks span navigation and interaction; 47 image-based tasks cover shooting and sniping.
- **Ready to explore:** each task includes its full English instruction, a 1280 × 720 initial observation, movement labels, and a direct browser-play link.
- **Shared evaluation interface:** screenshots and keyboard–mouse actions support both direct JSON evaluation and the Codex harness, with automatic outcome checks in the environment.

## 🎮 Play online

**[Open all 150 playable tasks →](https://ljbro.github.io/GTAGym/tasks.html)**

| Try a task | Link |
| --- | --- |
| On-foot navigation | [C02-N15](https://ljbro.github.io/GTAGym/?task=c02-n15) |
| Road navigation | [C01-N09](https://ljbro.github.io/GTAGym/?task=c01-n09) |
| Sniping | [C11-N01](https://ljbro.github.io/GTAGym/?task=c11-n01) |

Every dataset row has its own `play_url`. Open it, read the instruction, and press **Start task**. Loading and reading do not consume the task budget. The game renders in your browser; a desktop keyboard and mouse are recommended.

## 📦 Download and load

| Item | Value |
| --- | --- |
| Split | `test` |
| Tasks | **150** |
| Format | Parquet with embedded screenshot bytes |
| Data file | [test-00000-of-00001.parquet](https://huggingface.co/datasets/OpenMOSS-Team/GTAVBench/resolve/main/data/test-00000-of-00001.parquet?download=true) |
| Initial observation | 1280 × 720, Hugging Face `Image` feature |
| Fields | **7**, including per-task `play_url` |

```bash
pip install datasets
```

```python
from datasets import load_dataset

tasks = load_dataset("OpenMOSS-Team/GTAVBench", split="test")
task = tasks[0]

print(task["id"], task["category"])
print(task["instruction"])
print(task["play_url"])
image = task["initial_observation"]  # PIL image, 1280 × 720
```

For authenticated access, log in with `hf auth login` before loading.

<details>
<summary><strong>Download the Parquet file with the Hugging Face CLI</strong></summary>

```bash
hf download OpenMOSS-Team/GTAVBench \
  data/test-00000-of-00001.parquet \
  --repo-type dataset --local-dir ./gtavbench
```

</details>

## 🧩 Dataset schema

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Task ID in `cXX-nYY` format: category code and task number. |
| `category` | `string` | Human-readable task category. |
| `instruction` | `string` | Full English instruction used for evaluation. |
| `initial_observation` | `Image` | Initial screenshot before the first agent action. |
| `environment_type` | `string` | `3d` for interactive environments; `image` for shooting and sniping. |
| `movement` | `list[string]` | Movement modes involved in the task. |
| `play_url` | `string` | Link that selects this task in the hosted game. |

Initial observations are captured at game elapsed time zero. Sniping starts with an **unscoped** view. Screenshots retain their original bytes and are embedded in Parquet; they may include the in-game HUD and the instruction overlay used by the harness.

<details>
<summary><strong>Movement vocabulary</strong></summary>

| Mode | Meaning |
| --- | --- |
| `walk` | On-foot movement, including stairs, ladders, and climbing |
| `drive` | Cars, motorcycles, vans, trucks, and ATVs |
| `swim` | Swimming |
| `dive` | Underwater navigation |
| `boat` | Boats and other watercraft |
| `plane` | Fixed-wing aircraft |
| `helicopter` | Helicopters |

A task can involve several modes: `["walk", "drive"]` means it starts on foot and requires finding and driving a vehicle. Aircraft tasks starting on foot include `walk` with `plane` or `helicopter`; the submarine task uses `["boat", "dive"]`. Image-based shooting and sniping use `[]`. Labels describe the modes involved, rather than a prescribed action sequence.

</details>

## 🗂️ Task distribution

| Category | Environment | Tasks |
| --- | --- | ---: |
{{TASK_DISTRIBUTION}}
| **Total** | **103 3D + 47 image-based** | **150** |

## 📊 Benchmark context

The paper evaluates two protocols on the same task catalog:

| Protocol | Task instruction | Agent interface |
| --- | --- | --- |
| **GTAVBench** | Textual instruction | JSON keyboard–mouse actions |
| **GTAVBench-AGI** | Instruction appears in the first screenshot | Codex harness with the `game_step` tool |

This release provides the **test catalog and initial observations**. The [GTAGym repository](https://github.com/ljbro/GTAGym) contains the executable environments, evaluation runners, task generator, and separate on-foot RL training data. See the [paper](https://arxiv.org/abs/2611.13028) for benchmark results and RL transfer experiments.

## 🙏 Acknowledgements

**Our primary acknowledgement goes to [GTA_SZ](https://github.com/linranff/GTA_SZ)** and its contributors, whose city environment and game systems underpin GTAGym's 3D tasks. We also credit Rockstar Games for GTA V gameplay imagery and the authors of the supporting software and assets. Full credits and asset-specific notices are in the repository's [acknowledgements](https://github.com/ljbro/GTAGym/blob/main/ACKNOWLEDGEMENTS.md).

## 📎 Citation

If you use GTAVBench or GTAGym, please cite the [paper](https://arxiv.org/abs/2611.13028):

```bibtex
@misc{chen2026gtagym,
  title         = {GTAGym: Real AAA Game Tasks Environment for Evaluation and Reinforcement Learning},
  author        = {Jiajun Chen and Shicheng Fang and Jiahao Lu and Yuxin Wang and Xipeng Qiu},
  year          = {2026},
  eprint        = {2611.13028},
  archivePrefix = {arXiv},
  url           = {https://arxiv.org/abs/2611.13028}
}
```
