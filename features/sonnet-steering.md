# Sonnet Steering

**Requirement**: Keep the main Opus session a thin orchestrator so volume work runs on Sonnet: deny inline source edits and nudge inline investigation in orchestrator mode, deny Opus sub-agent dispatches without a stated TIER reason, default plan-spec implementers to Sonnet, make reviewer models configurable per user, repo and path with the two-round cap enforced, and add /sdlc:handoff and /sdlc:model-spend.

**Started**: 2026-10-18
**Last updated**: 2026-10-18
**Branch**: sonnet-steering

## Files involved

- .claude-plugin/plugin.json
- .claude/sdlc-review.json
- hooks/hooks.json
- instructions/claude-md-snippet.md
- skills/code-review-pre-commit/SKILL.md
- src/hooks/agent-tier-gate.js
- src/hooks/lib/review-config.js
- src/hooks/pre-commit-review.js
- src/hooks/review-config-cli.js
- src/hooks/test-agent-tier-gate.js
- src/hooks/test-pre-commit-review.js
- src/hooks/test-review-config.js
- src/hooks/test-timing-log.js

## History

- 2026-10-18 `590982f` — Name the configured reviewers in the gate and enforce the round cap
  - .claude-plugin/plugin.json
  - instructions/claude-md-snippet.md
  - skills/code-review-pre-commit/SKILL.md
  - src/hooks/pre-commit-review.js
  - src/hooks/review-config-cli.js
  - src/hooks/test-pre-commit-review.js
  - src/hooks/test-review-config.js
  - src/hooks/test-timing-log.js

- 2026-10-18 `a5c9539` — Add a layered resolver for reviewer and plan-review models
  - .claude-plugin/plugin.json
  - .claude/sdlc-review.json
  - src/hooks/lib/review-config.js
  - src/hooks/review-config-cli.js
  - src/hooks/test-review-config.js
