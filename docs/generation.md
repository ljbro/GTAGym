# Task generation

The generator implements the ten non-sniping task templates described in the
paper. Sniping is evaluation-only. Generated tasks are opt-in and never replace
the 150 test tasks or the retained 50-task walking training dataset.

## Commands

Install the repository dependencies and the YAML reader, then start the game:

```bash
npm ci
python3 -m pip install -r requirements-generation.txt
npx playwright install --with-deps chromium
npm run build
npm start -- --port 4203
```

In another terminal, inspect support, validate a configuration, and generate:

```bash
npm run generate -- matrix
npm run generate -- plan --spec configs/generation/online.yaml
npm run generate -- generate --spec configs/generation/online.yaml \
  --url http://127.0.0.1:4203/ --renderer gpu --output outputs/online-sample
```

`online.yaml` creates twelve examples spanning nine 3D categories and all seven
documented movement modes. It is an acceptance example, not a training recipe
or a claim about the distribution of the retained training set. JSON and YAML
resolve to the same plan; `plan` needs neither a running game nor a model API.
The generated browser uses the server's GPU. `--renderer cpu` explicitly selects
server-side software rendering; `auto` allows that fallback.

Play the result at `http://127.0.0.1:4203/?trainingDataset=online-sample.json`.
For MCP, select the saved task ID and dataset explicitly:

```bash
npm run mcp -- --task rl-task-outdoor-online-sample-0002 \
  --training-dataset online-sample.json --url http://127.0.0.1:4203/
```

## Paper coverage

| Paper category | `template` | Concrete `movement` modes | Validation |
| --- | --- | --- | --- |
| Road navigation | `road` | `drive` | Route clearance and real vehicle-controller traversal |
| On-foot navigation | `outdoor` | `walk` | Real walking-controller traversal; optional destination landmark |
| Aquatic navigation | `aquatic` | `swim`, `dive`, `boat` | Rendered water clearance and swimming/boat-controller traversal, including depth |
| Vertical traversal | `vertical` | `walk` | Multi-level room geometry and real walking/stair-controller traversal |
| Aerial navigation | `aviation` | `plane`, `helicopter` | Ordinary-key reference pilot completes boarding, flight route and landing |
| Indoor navigation | `indoor` | `walk` | Enclosed room topology, push doors, decoy doors and controller traversal |
| Following | `follow` | `walk`, `drive`, `swim`, `dive`, `boat` | Complete target-route traversal and player/target spawn clearance |
| Interception | `pursuit` | `drive` | Target-route traversal and separate player spawn; existing interception outcome rules |
| Evasion | `evasion` | `walk`, `drive`, `swim`, `dive`, `boat` | Initial pursuer placement and traversable local geometry; fixed evasion rules |
| Shooting | `shooting` | Stationary | Supplied annotated image/target pairs and original hit evaluator |

These checks establish static feasibility. They do not certify that a policy
can complete an interaction episode in dynamic traffic. The vertical template
generates stairs and height changes; it does not procedurally generate every
hand-authored climbing animation or ladder task. Aircraft use existing launch
and landing sites; endpoint bounds must include a compatible site.
Outdoor route lengths measure the horizontal polyline, with aquatic depth
controlled separately. Vertical lengths include stair elevation. Aerial length
and turns control the sampled flight segment; launch, recovery and landing
segments come from the selected aircraft template.

Shooting needs an explicitly imported source pool. Historical unused shooting
images are not bundled in this release; the generator does not silently use
benchmark images as training examples. See the import procedure below.

## Parameters and sampling

One request is a sampling object. A batch is
`{name, seed, split, requests: [sampling_object, ...]}`. Each request can specify:

| Parameter | Format and meaning |
| --- | --- |
| `template` | One of the ten names above |
| `name`, `seed`, `count`, `split` | Dataset name, deterministic seed, number of tasks, and `train`/`validation` |
| `start`, `destination` | `{x: number_or_interval, y: optional_number_or_interval, z: number_or_interval}` |
| `heading` | Degrees, fixed or `[min, max]` |
| `length`, `turns` | Metres and integer bends, fixed or `[min, max]` |
| `transport` | Allowed domains: `[land]`, `[water]`, `[air]`, or a supported combination |
| `movement` | Concrete modes within the selected domain and template |
| `actorSpeed`, `initialDistance` | Target/pursuer speed in m/s and initial separation in metres |
| `pursuerCount` | Integer count or interval; evasion only |
| `landmark` | On-foot arrival prop, e.g. `motorcycle-green`, `sedan`, `van`, `convertible`, `random`, or `none` |
| `timeLimit` | Arrival-only fixed seconds or measured-controller scaling, shown below |
| `minSeparation` | Minimum within-batch start/goal separation for the same template and movement |
| `imageIndices`, `aimOffset` | Shooting-pool 1-based candidate set and `{x: interval, y: interval}` in 1280x720-relative pixels |

Positions use `(x,z)` horizontally and `y` vertically. Underwater start/goal `y`
constraints are converted to depth below the local water surface. Positive aim
offsets mean right/up. Following and interception `length`, `turns` and
`destination` describe the **NPC route**; `start` and `heading` describe the
player. Evasion accepts no destination, route length, or turns. Unsupported
parameters and incompatible domains fail explicitly rather than being clamped.

Arrival timing examples:

```yaml
timeLimit: {mode: fixed, seconds: 150, showCountdown: true}
# Or scale the actual measured reference-controller game time:
timeLimit: {mode: controller, multiplier: 2, slackSeconds: 0}
```

An infeasible fixed deadline is rejected. Default navigation budgets are twice
the controller's measured completion time. An explicit `timeLimit` overrides
that default; controller mode defaults to a 1.5 multiplier and 5 seconds of slack
unless specified. Following/interception retain their
target-arrival rules, and evasion retains its fixed timers. The original frozen
training set and benchmark budgets remain unchanged.

Optional `--walk-constraints FILE` accepts `minSeparation`, `evalClearance`,
`referenceRoutes`, and `reservedRoutes` for an entirely on-foot navigation or
following batch. Routes are horizontal polylines. This enforces the supplied
route buffers; merely using different seeds does not imply spatial separation.

## Shooting source import

Prepare a JSON manifest of local annotated configurations. Each configuration
must use the existing shooting engine's `task`/`gold` schema, including a stage
image, dimensions, target region and reference impact point:

```json
{
  "pairs": [
    {"config": "sources/example/task.json", "instruction": "Shoot the person beside the vehicle."}
  ]
}
```

Config paths resolve relative to this manifest; image paths resolve relative to
their config. Then run:

```bash
npm run generate -- shooting-pool --source annotated-images.json \
  --output outputs/shooting-pool
npm run generate -- generate --spec configs/generation/shooting.yaml \
  --shooting-pool outputs/shooting-pool/pool.json --output outputs/shooting-sample
```

Import copies image bytes and preserves hit annotations in the ignored
`training-tasks/shooting-sources/` directory. It validates the original reference
hit, excludes current benchmark IDs and byte-identical benchmark shooting
images, and records content hashes. Camera initialization costs no model turn;
generated shooting retains the original hit rules and 20-turn budget. Aim
offsets vary initialization, not the scene content or target annotation.

## Outputs, resume, and checks

The output directory contains the original config, resolved plan, source hashes
and snapshots, `partial.json`, rejected proposals, controller proofs, English
instructions, and `dataset.json`. Publication to
`training-tasks/generated/<name>.json` happens only after all tasks pass.
Existing published names are refused. In-progress output can be resumed with
the same command plus `--resume`; source, spec, environment and renderer changes
are rejected. Use a new name after changing those conditions.

The retained `?trainingDataset=tasks.json` still loads only the original walking
set. Other safe basenames load from `training-tasks/generated/`. Generated
datasets and imported image sources are ignored by Git.

```bash
npm run test:generator:browser -- --dataset online-sample.json \
  --url http://127.0.0.1:4203/ --renderer gpu
```

The optional browser acceptance test opens each generated task in a fresh
browser episode, checks saved spawns/budgets and resource loading, and exercises
actual room completion and original shooting replay. It makes no model calls.
