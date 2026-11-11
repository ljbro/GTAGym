# Task identifiers

Benchmark IDs use `cXX-nYY`: `cXX` selects a category and `nYY` is the task number within that category. IDs and their order are frozen in `configs/benchmark150.json`.

| Code | Category | Benchmark tasks |
| --- | --- | ---: |
| `c01` | Road Navigation | 20 |
| `c02` | On-foot Navigation | 16 |
| `c03` | Following | 6 |
| `c04` | Interception | 13 |
| `c05` | Evasion | 16 |
| `c06` | Aquatic Navigation | 11 |
| `c07` | Vertical Traversal | 5 |
| `c08` | Aerial Navigation | 8 |
| `c09` | Indoor Navigation | 8 |
| `c10` | Shooting | 24 |
| `c11` | Sniping | 23 |

For example, `c01-n04` is road-navigation task 4. `c10` and `c11` use the image-based evaluator; the other categories use the native 3D environment.

The test catalog contains only the frozen 150 IDs. The retained walking training tasks use a separate `rl-*` namespace and live in `training-tasks/outdoor-walk/`.
