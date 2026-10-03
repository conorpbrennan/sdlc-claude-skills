# Marketplace Plugin

**Requirement**: Install the SDLC toolchain as a Claude Code plugin from this repo's marketplace instead of install.sh.

**Started**: 2026-10-03
**Last updated**: 2026-10-03
**Branch**: marketplace-plugin

## Files involved

- .claude-plugin/marketplace.json
- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- agents/code-reviewer-deep.md
- agents/code-reviewer.md
- docs/plans/marketplace-plugin.md
- hooks/hooks.json
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

## History

- 2026-10-03 `4803eb2` — Make the repository a valid plugin and same-repo marketplace
  - .claude-plugin/marketplace.json
  - .claude-plugin/plugin.json
  - hooks/hooks.json
  - src/test-plugin-layout.js
