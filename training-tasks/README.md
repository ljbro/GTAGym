# Walking training tasks

The retained, versioned training data contains only outdoor on-foot navigation:

- `outdoor-walk/tasks.json`: the 50 finalized training tasks, with their original IDs, routes, landmarks, instructions and validation records.
- `outdoor-walk/config.yaml`: the expanded sampling specification stored with the dataset.
- `outdoor-walk/sampling.json`: the original empirical sampling setup; its retained-task reference points to the finalized dataset.

The frozen task records are authoritative, including the retained first task and any subsequently reviewed route changes. Re-running a sampling specification alone is not a guarantee of byte-identical final routes.

To play a task, open the game with `?trainingDataset=tasks.json`, then select its training ID from the task menu. A trusted MCP launcher can select one task with `--task ID --training-dataset tasks.json`. Benchmark evaluations use the independent 150-task catalog in `tasks/`.

New tasks from all ten supported non-sniping templates are written separately to
the ignored `generated/` directory. They load through their own dataset basename.
See [generation.md](../docs/generation.md); no other pre-generated training sets
or historical shooting source images are bundled.
