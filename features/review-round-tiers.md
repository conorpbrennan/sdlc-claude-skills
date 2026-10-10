# Review Round Tiers

**Requirement**: Round 1 of the pre-commit review always runs on Sonnet (code-reviewer); every rerun after a FAIL runs on Opus (code-reviewer-deep).

**Started**: 2026-10-05
**Last updated**: 2026-10-10
**Branch**: review-round-tiers

## Files involved

- .claude-plugin/plugin.json
- README.md
- agents/code-reviewer-deep.md
- instructions/claude-md-snippet.md
- skills/code-review-implementer/SKILL.md
- skills/code-review-pre-commit/SKILL.md
- skills/plan-spec/reference.md
- src/hooks/pre-commit-review.js
- src/hooks/test-pre-commit-review.js

## History

- 2026-10-10 `9ee39f1` — Run review round 1 on Sonnet and every rerun on Opus
  - .claude-plugin/plugin.json
  - README.md
  - agents/code-reviewer-deep.md
  - instructions/claude-md-snippet.md
  - skills/code-review-implementer/SKILL.md
  - skills/code-review-pre-commit/SKILL.md
  - skills/plan-spec/reference.md
  - src/hooks/pre-commit-review.js
  - src/hooks/test-pre-commit-review.js
