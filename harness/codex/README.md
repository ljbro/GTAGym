# Codex instructions

`AGENTS.md` is provided to the evaluated agent in a fresh task workspace. It is not a development policy for this repository and does not replace Codex's native base instructions.

The shared source is `scripts/server-eval/system-prompt.en.md`. `scripts/game-mcp/rules.mjs` adapts the opening and action-submission passages and removes JSON-specific history pruning. Codex manages its own context. Regenerate and check this file from the repository root:

```bash
node scripts/game-mcp/build-codex-agents.mjs --write
node scripts/game-mcp/build-codex-agents.mjs --check
```

The evaluator prepares the task, injects the initial screenshot with its instruction, and provides only `mcp__game__game_step`. Accepted actions return images; observation and scoring metadata remain in the trusted host. A host gateway validates tool names. The native process uses an isolated configuration without provider credentials.

Use `configs/codex.example.json` with the root evaluation launcher. Installation, result files and recovery are documented in [evaluation.md](../../docs/evaluation.md).
