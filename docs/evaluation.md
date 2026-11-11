# Evaluation

## Task selection

`configs/benchmark150.json` freezes task identities and category order. `tasks/catalog.json` and `tasks/instructions.json` contain exactly those 150 current test tasks. Both protocols use this catalog; retired configurations and unused image assets are excluded.

| Category | Internal ID | Tasks |
| --- | --- | ---: |
| Road navigation | `outdoor-road` | 20 |
| On-foot navigation | `outdoor-foot` | 16 |
| Following | `follow` | 6 |
| Interception | `chase` | 13 |
| Evasion | `escape` | 16 |
| Aquatic navigation | `water` | 11 |
| Vertical traversal | `stairs` | 5 |
| Aerial navigation | `air` | 8 |
| Indoor navigation | `indoor` | 8 |
| Shooting | `shooting` | 24 |
| Sniping | `sniper` | 23 |

Set `tasks` to `"all"`, `"online"` (the 103 native 3D tasks), or an array such as `["c01-n04"]`. Codex subset evaluations retain the original benchmark index for seeds. Inventory the current build without a model call using:

```bash
npm run catalog -- --url http://127.0.0.1:4200/ --output .cache/catalog.json
```

## Configuration

The examples use four workers, 300 interaction rounds, 32,768 output tokens per request, seed 1234 and GPU rendering. Image-based tasks retain their separate 20-round cap. Environment code supplies task-specific success, failure and simulated game-time limits.

`model` is sent unchanged; `api` selects `responses` or `chat-completions`. Choose the provider's supported dialect. `effort` is explicit; supported levels are checked in `scripts/codex-eval/providers.mjs`. Changing a prompt, catalog, seed, renderer or protocol creates a different evaluation condition.

`keyEnv` names an environment variable, or `keyFile` points to a private text file. Inline credentials are rejected. `configs/local/` and `.cache/` are ignored by Git. Configuration paths resolve from the repository root. `baseURL` selects the model service; `url` selects this repository's game server, defaulting to `http://127.0.0.1:4200/`.

`--dry-run` validates selection and configuration without invoking a provider or browser. Actual evaluation needs the game server running.

## JSON and Codex

The JSON runner sends the shared Markdown system prompt, instruction and screenshots. Native 3D tasks retain at most ten observation/action pairs including the current observation, removing the oldest five before inference when the limit is exceeded. The instruction stays attached to the oldest retained observation. Image-based tasks preserve their original history policy.

Codex starts a fresh native session for each task and manages its own context. Initial input is `play the game use game_step` plus a screenshot whose top-left panel contains the instruction. Accepted actions return images through `mcp__game__game_step`; evaluator metadata is not observation text. Built-in shell and filesystem tools are not offered, and a host gateway validates tool names. This provides tool isolation, not an OS sandbox.

The Codex example has a three-hour host watchdog per task (`wallSeconds: 10800`), separate from simulated game-time budgets. The JSON runner has request, task and round limits; it does not use the Codex aggregate watchdog.

If Codex answers before the game ends, the host resumes the same native session with `game is not complete, use game_step and continue to play` and the current screenshot. Feedback consumes one interaction round. When a response contains multiple game calls, only the first valid call executes; additional calls receive text feedback without another image.

## Prompts and actions

The authored system-prompt sources are `scripts/server-eval/system-prompt.en.md` and `system-prompt.md`. Task instructions are the `instructions` mapping in `tasks/instructions.json`. No adapter description is appended to the model's system prompt.

After changing the English rules, regenerate and check the Codex instructions:

```bash
node scripts/game-mcp/build-codex-agents.mjs --write
node scripts/game-mcp/build-codex-agents.mjs --check
```

Generation removes JSON-specific history pruning and adapts the initial-observation and action-submission passages. Other game rules share the Markdown source. `harness/codex/AGENTS.md` is input to an evaluated agent, not repository development instructions.

The default JSON action has required `keys` and optional `mouse`/`wait_seconds`:

```json
{"keys":[{"key":"w","duration_seconds":1},{"key":"d","duration_seconds":0.15}],"mouse":{"move":{"dx":20,"dy":0}}}
```

Keys start together, expire independently and can remain held across round boundaries. Durations are at most one simulated second. Mouse deltas use the 1280×720 frame: positive `dx` moves right, positive `dy` moves up. Buttons belong inside `mouse.buttons` and remain held until released. Movement and scroll are mutually exclusive in one action.

```json
{"keys":[],"mouse":{"buttons":[{"button":"right","event":"down"}]}}
```

```json
{"keys":[],"mouse":{"scroll":{"direction":"up","steps":1}}}
```

```json
{"keys":[],"wait_seconds":0.5}
```

Ordinary shooting ignores keyboard, right-button and scroll input. Sniping supports scope controls, subject to original scoring. The whole action is validated before execution. Format correction and transport retries do not advance the game. Normal evaluation freezes simulated time during inference.

## Timing controls

Native Codex configurations support `maxActionSeconds` for both key holds and `wait_seconds`, and `clockMode` (`stepped` or `realtime`). The defaults are one second and paused inference. Use `tasks: "online"` to select the 103 native 3D tasks; realtime mode excludes shooting and sniping. The selected duration cap is reflected in the generated Codex instructions and game tool schema.

Realtime mode releases keys at their requested deadlines while inference continues. Task-defined countdown challenges and intrinsic completion/failure rules remain active.

## Results and recovery

Outputs default to `.cache/server-eval/`. Compressed trajectory archives retain per-round screenshots, model output, actions and outcomes, together with MP4 recordings. Context pruning does not discard the saved full trajectory. JSON checkpoints journal committed rounds.

Codex task directories additionally retain native session files, `codex.jsonl.gz`, `report.json`, generated rules and compressed provider requests/responses under `api/`. The game archive is under the task's `game/` directory. Batch `summary.json` records progress; `token-usage.json` records provider-reported usage.

Reasoning content or summaries are saved when the provider returns them. Some providers expose only token counts or summaries, not full internal reasoning. Format/transport retry usage is recorded separately from accepted game actions.

Send `SIGUSR1` to a Codex batch process to stop dispatching and finish active tasks. Set `resume: true` with the same output and configuration to retain completed tasks and retry unfinished/infrastructure-error episodes. Identity checks cover prompts, catalog and execution settings. Prior attempts are archived. Batch resume does not promise mid-task browser/native-session restoration.

JSON single-task continuation uses `scripts/server-eval/run.mjs --resume CHECKPOINT_DIRECTORY`, with matching task, seed, prompts, adapter and budgets, and a new output directory. Run its `--help` for arguments. Deterministic replay verifies committed states before new inference; divergence is reported. The launcher rejects generic JSON `resume: true` rather than claiming unverified recovery.

Network failures remain infrastructure errors until successfully retried.

## Rendering

Chromium runs on the evaluator host. Default GPU rendering checks actual WebGL hardware and rejects software fallback. Canvas 2D and page compositing use CPU paths to avoid the observed minimap-layer corruption; FFmpeg encodes on the same host. JSON/MCP support server-side CPU rendering for diagnostics. The native Codex batch uses GPU rendering.
