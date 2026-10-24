# Default Main Model Sonnet

**Requirement**: Ship a plugin default so installing the plugin makes Sonnet the main-session model with no setup; /sdlc:main-model off is the explicit opt-out.

**Started**: 2026-10-24
**Last updated**: 2026-10-24
**Branch**: default-main-model-sonnet

## Acceptance

<!-- 2-5 checkable criteria; /sdlc:verify reads these -->

## Files involved

- .claude-plugin/plugin.json
- .claude/sdlc-review.json.example
- README.md
- commands/main-model.md
- defaults/sdlc-review.json
- src/hooks/lib/review-config.js
- src/hooks/review-config-cli.js
- src/hooks/session-start-instructions.js
- src/hooks/test-review-config.js
- src/hooks/test-session-start-instructions.js

## History

- 2026-10-24 `81ed9e7` — Ship a Sonnet main-model default applied by the SessionStart hook
  - .claude-plugin/plugin.json
  - .claude/sdlc-review.json.example
  - README.md
  - commands/main-model.md
  - defaults/sdlc-review.json
  - src/hooks/lib/review-config.js
  - src/hooks/review-config-cli.js
  - src/hooks/session-start-instructions.js
  - src/hooks/test-review-config.js
  - src/hooks/test-session-start-instructions.js
