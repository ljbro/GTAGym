# Test tasks

This directory contains only the frozen 150-task benchmark. `catalog.json` is the authoritative task index; `instructions.json` contains the corresponding English instructions. The native 3D layouts and controllers are implemented in `native-city/src/`.

The 47 image-based tasks each have a `<task-id>/task.json` configuration. Their original image bytes are stored once in `assets/`, named by SHA-256; task-relative references select the correct image and scope layers. `runtime.mjs`, the GUI action adapters and `engines/` implement their original scoring and controls.

`manifest.json` records checksums of the released task files. Historical configurations, inactive tasks and training datasets are excluded. The retained walking training set is in `training-tasks/outdoor-walk/` at the repository root.
