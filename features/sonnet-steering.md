# Sonnet Steering

**Requirement**: Keep the main Opus session a thin orchestrator so volume work runs on Sonnet: deny inline source edits and nudge inline investigation in orchestrator mode, deny Opus sub-agent dispatches without a stated TIER reason, default plan-spec implementers to Sonnet, make reviewer models configurable per user, repo and path with the two-round cap enforced, and add /sdlc:handoff and /sdlc:model-spend.

**Started**: 2026-10-18
**Last updated**: 2026-10-18
**Branch**: sonnet-steering

## Files involved

- .claude-plugin/plugin.json
- .claude/sdlc-review.json
- src/hooks/lib/review-config.js
- src/hooks/review-config-cli.js
- src/hooks/test-review-config.js

## History

<!-- populated on commit -->
