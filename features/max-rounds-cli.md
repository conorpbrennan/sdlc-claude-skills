# Max Rounds Cli

**Requirement**: Add a CLI command to show and set the review round cap (`maxRounds`) in the user sdlc-review.json, so the owner does not edit the file by hand.

**Started**: 2026-11-21
**Last updated**: 2026-11-21
**Branch**: max-rounds-cli

## Acceptance

<!-- 2-5 checkable criteria; /sdlc:verify reads these -->

## Files involved

- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- commands/max-rounds.md
- src/hooks/lib/review-config.js
- src/hooks/review-config-cli.js
- src/hooks/test-review-config.js

## History

- 2026-11-21 `9f3a0a9` — review-config CLI: max-rounds show | set <n> for the review round cap
  - .claude-plugin/plugin.json
  - README.md
  - src/hooks/lib/review-config.js
  - src/hooks/review-config-cli.js
  - src/hooks/test-review-config.js
