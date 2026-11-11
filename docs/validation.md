# Validation

The release was checked on Linux with Node.js 22.22.1, Playwright 1.63.0, FFmpeg 4.4.2, Codex CLI 0.164.0 and a server NVIDIA RTX 4090.

| Check | Result |
| --- | --- |
| Dependency installation and production build | Passed |
| Frozen catalog and category-based IDs | Passed: 150 tasks across 11 categories |
| Local static resource references | Passed: 180 references |
| Core evaluator and MCP tests | 353 passed |
| Additional native Codex integration tests | 57 passed using local provider fixtures |
| Environment tests | 645 passed |
| Shared Markdown and generated Codex instructions | In sync |
| English release text and credential checks | Passed |
| Real server-side browser check | Passed |

The browser check starts a temporary game server from this checkout, verifies every task-menu ID against the frozen catalog, opens a navigation task, loads all 24 shooting and 23 sniping scenes, and executes an MCP action. It checks hardware-backed WebGL, software Canvas 2D/page compositing, failed resources and external game-resource requests. It does not call a paid model or measure model accuracy.

## Test scope

Tests cover the current action protocol, input timing, context pruning, checkpoints and replay, result recording, task outcomes, timeouts, geometry and tool isolation. Obsolete fixed-speed reference-driver tests, retired bilingual alignment checks, unused cursor-coordinate observations and private deployment-sidecar checks have been removed. Mouse tests use descriptive names instead of historical protocol-version filenames.

Evaluation scripts implement the paper's JSON and native Codex protocols, together with its Codex action-duration and unpaused ablations. Timing-parameter tests check selection of the same 103 online tasks and validate action caps, round limits and clock modes before browser startup. Codex owns its batch scheduler and socket bridge; MCP owns the shared observation boundary.

Original source annotations, SVG drawings and full expert recordings are not distributed. Their provenance audits and frozen recording-replay tests are excluded; standalone task geometry, live control tests, timeout handling and compact calibrated time-budget checks remain available. All eight flight configurations and runway/boarding/landing geometry were compared before and after extraction, and their numerical parameters were preserved.

## Task-data consolidation

The release contains one 150-task test catalog under `tasks/` and one separate 50-task walking training dataset under `training-tasks/outdoor-walk/`. Current image scenes share 110 content-addressed original images. All 150 instructions were compared with the previous release; all 47 image-task configurations were compared after normalizing image paths, preserving scoring regions and control parameters. The retained walking dataset is byte-identical to its original snapshot. A real GPU browser also loaded a walking training task and executed an MCP action through the new dataset URL.

## Generator acceptance

All ten non-sniping templates passed generation and runtime acceptance. The
test generated twelve 3D tasks covering all nine native categories, including
swimming, diving, boats, planes and helicopters, and four shooting tasks from
an explicitly imported non-benchmark annotated image. All sixteen tasks loaded
in fresh hardware-GPU browser episodes without script or resource errors;
saved spawns, headings and budgets were checked. Indoor/stair tasks were
completed through ordinary forward movement and push-door interaction.

One generated shooting task also completed through a real MCP session and
compressed trajectory recording: one GUI turn hit the annotated target, and
the original replay evaluator returned reward 1. These are controller/oracle
acceptance checks, not model results. The CLI's persisted partial generation
was resumed successfully; a changed configuration was rejected. Generated
samples, imported source images and local acceptance output remain ignored.

The shipped release still contains only the original fifty walking training
examples. Generation coverage and its template constraints are documented in
[generation.md](generation.md); historical shooting training images are not
included.
