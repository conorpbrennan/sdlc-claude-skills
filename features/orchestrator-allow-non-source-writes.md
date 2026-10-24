# Orchestrator Allow Non Source Writes

**Requirement**: Orchestrator mode denies main-session edits only on code files; docs, config and data stay writable.

**Started**: 2026-10-24
**Last updated**: 2026-10-24
**Branch**: orchestrator-allow-non-source-writes

## Acceptance

1. Running `node src/hooks/test-orchestrator-mode.js` exits 0.
2. With the mode on, a main-session Write to `README.md` is allowed.
3. With the mode on, a main-session Write to `src/app.js` is denied.

## Files involved

- .claude-plugin/plugin.json
- README.md
- commands/orchestrate.md
- src/hooks/orchestrator-mode.js
- src/hooks/test-orchestrator-mode.js

## History

- 2026-10-24 `fa79fa1` — Orchestrator mode: deny main-session writes only on code files
  - .claude-plugin/plugin.json
  - README.md
  - commands/orchestrate.md
  - src/hooks/orchestrator-mode.js
  - src/hooks/test-orchestrator-mode.js

## Verification — 2026-10-24 @ fa79fa1

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Running `node src/hooks/test-orchestrator-mode.js` exits 0. | PASS | `node src/hooks/test-orchestrator-mode.js; echo $?` printed `0` |
| 2 | With the mode on, a main-session Write to `README.md` is allowed. | PASS | With mode on in a scratch state dir, I fed a PreToolUse Write to README.md on stdin to `node src/hooks/orchestrator-mode.js`. It printed nothing and exited 0, so the write was allowed. |
| 3 | With the mode on, a main-session Write to `src/app.js` is denied. | PASS | With mode on in a scratch state dir, I fed a PreToolUse Write to src/app.js on stdin to `node src/hooks/orchestrator-mode.js`. It printed `permissionDecision":"deny"` and `"decision":"block"`. |

**Verdict**: PASS
