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

<!-- populated on commit -->
