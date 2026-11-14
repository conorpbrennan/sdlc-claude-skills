# Statusline Windows Datadir

**Requirement**: `/sdlc:statusline install` must work on native Windows, where the default data dir contains backslashes and the installer now refuses it.

**Started**: 2026-10-29
**Last updated**: 2026-10-29
**Branch**: statusline-windows-datadir

## Acceptance

<!-- 2-5 checkable criteria; /sdlc:verify reads these -->

## Files involved

- .claude-plugin/plugin.json
- src/statusline-install.js
- src/test-statusline-install.js

## History

- 2026-10-29 `2316672` — statusline install: accept a native Windows data dir by writing the command with forward slashes
  - .claude-plugin/plugin.json
  - src/statusline-install.js
  - src/test-statusline-install.js
