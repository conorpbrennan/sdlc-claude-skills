# Marketplace Plugin

**Requirement**: Install the SDLC toolchain as a Claude Code plugin from this repo's marketplace instead of install.sh.

**Started**: 2026-10-03
**Last updated**: 2026-10-03
**Branch**: marketplace-plugin

## Files involved

- .claude-plugin/marketplace.json
- .claude-plugin/plugin.json
- .claude/agents/code-reviewer-deep.md
- .claude/agents/code-reviewer.md
- .claude/claude-md-snippet.md
- .claude/feature-workflow-snippet.md
- .claude/hygiene-snippet.md
- .claude/skills/code-review-implementer.md
- .claude/skills/code-review-pre-commit.md
- .claude/skills/plan-spec/SKILL.md
- .claude/skills/plan-spec/check_citations.py
- .claude/skills/plan-spec/edit_doc.py
- .claude/skills/plan-spec/fixtures/clean-plan.md
- .claude/skills/plan-spec/fixtures/dirty-plan.md
- .claude/skills/plan-spec/fixtures/shapes-plan.md
- .claude/skills/plan-spec/fixtures/tests-first-plan.md
- .claude/skills/plan-spec/reference.md
- .claude/tdd-mandate-snippet.md
- CLAUDE.md
- README.md
- agents/code-reviewer-deep.md
- agents/code-reviewer.md
- commands/commit-prep.md
- commands/feature-new.md
- commands/feature.md
- commands/review-timing.md
- docs/plans/marketplace-plugin.md
- hooks/hooks.json
- install.sh
- instructions/claude-md-snippet.md
- instructions/feature-workflow-snippet.md
- instructions/hygiene-snippet.md
- instructions/tdd-mandate-snippet.md
- skills/code-review-implementer/SKILL.md
- skills/code-review-pre-commit/SKILL.md
- skills/plan-spec/SKILL.md
- skills/plan-spec/check_citations.py
- skills/plan-spec/edit_doc.py
- skills/plan-spec/fixtures/clean-plan.md
- skills/plan-spec/fixtures/dirty-plan.md
- skills/plan-spec/fixtures/shapes-plan.md
- skills/plan-spec/fixtures/tests-first-plan.md
- skills/plan-spec/reference.md
- src/hooks/enforce-review-implementer.js
- src/hooks/lib/plugin-names.js
- src/hooks/post-commit-feature.js
- src/hooks/pre-commit-feature.js
- src/hooks/pre-commit-review.js
- src/hooks/session-start-feature.js
- src/hooks/session-start-instructions.js
- src/hooks/test-post-commit-feature.sh
- src/hooks/test-pre-commit-feature.sh
- src/hooks/test-pre-commit-review.js
- src/hooks/test-session-start-feature.sh
- src/hooks/test-session-start-instructions.js
- src/test-install.sh
- src/test-merge-claude-md.js
- src/test-plugin-layout.js
- src/test-unmerge-claude-md.js
- uninstall.sh

## History

- 2026-10-03 `d15eb16` — Deliver the four CLAUDE.md sections through a plugin SessionStart hook
  - .claude/claude-md-snippet.md
  - .claude/feature-workflow-snippet.md
  - .claude/hygiene-snippet.md
  - .claude/tdd-mandate-snippet.md
  - docs/plans/marketplace-plugin.md
  - hooks/hooks.json
  - install.sh
  - instructions/claude-md-snippet.md
  - instructions/feature-workflow-snippet.md
  - instructions/hygiene-snippet.md
  - instructions/tdd-mandate-snippet.md
  - src/hooks/session-start-instructions.js
  - src/hooks/test-session-start-instructions.js
  - src/test-merge-claude-md.js
  - src/test-plugin-layout.js
  - src/test-unmerge-claude-md.js
  - uninstall.sh

- 2026-10-03 `921bf2c` — Namespace every invocable name as sdlc:<name> from one constant
  - .claude/claude-md-snippet.md
  - .claude/feature-workflow-snippet.md
  - agents/code-reviewer-deep.md
  - agents/code-reviewer.md
  - commands/commit-prep.md
  - commands/feature-new.md
  - commands/feature.md
  - docs/plans/marketplace-plugin.md
  - skills/code-review-implementer/SKILL.md
  - skills/code-review-pre-commit/SKILL.md
  - src/hooks/enforce-review-implementer.js
  - src/hooks/lib/plugin-names.js
  - src/hooks/post-commit-feature.js
  - src/hooks/pre-commit-feature.js
  - src/hooks/pre-commit-review.js
  - src/hooks/session-start-feature.js
  - src/hooks/test-post-commit-feature.sh
  - src/hooks/test-pre-commit-feature.sh
  - src/hooks/test-pre-commit-review.js
  - src/hooks/test-session-start-feature.sh
  - src/test-plugin-layout.js

- 2026-10-03 `34f4419` — Move skills and agents to the plugin layout
  - .claude/agents/code-reviewer-deep.md
  - .claude/agents/code-reviewer.md
  - .claude/skills/code-review-implementer.md
  - .claude/skills/code-review-pre-commit.md
  - .claude/skills/plan-spec/SKILL.md
  - .claude/skills/plan-spec/check_citations.py
  - .claude/skills/plan-spec/edit_doc.py
  - .claude/skills/plan-spec/fixtures/clean-plan.md
  - .claude/skills/plan-spec/fixtures/dirty-plan.md
  - .claude/skills/plan-spec/fixtures/shapes-plan.md
  - .claude/skills/plan-spec/fixtures/tests-first-plan.md
  - .claude/skills/plan-spec/reference.md
  - CLAUDE.md
  - README.md
  - agents/code-reviewer-deep.md
  - agents/code-reviewer.md
  - docs/plans/marketplace-plugin.md
  - install.sh
  - skills/code-review-implementer/SKILL.md
  - skills/code-review-pre-commit/SKILL.md
  - skills/plan-spec/SKILL.md
  - skills/plan-spec/check_citations.py
  - skills/plan-spec/edit_doc.py
  - skills/plan-spec/fixtures/clean-plan.md
  - skills/plan-spec/fixtures/dirty-plan.md
  - skills/plan-spec/fixtures/shapes-plan.md
  - skills/plan-spec/fixtures/tests-first-plan.md
  - skills/plan-spec/reference.md
  - src/test-install.sh
  - src/test-plugin-layout.js
  - uninstall.sh

- 2026-10-03 `4803eb2` — Make the repository a valid plugin and same-repo marketplace
  - .claude-plugin/marketplace.json
  - .claude-plugin/plugin.json
  - hooks/hooks.json
  - src/test-plugin-layout.js
