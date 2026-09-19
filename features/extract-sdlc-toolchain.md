# Extract the SDLC toolchain into its own project

**Requirement**: Extract the workflow skills (plan-spec, code-review-pre-commit, code-review-implementer) and /commit-prep out of risk-claude-skills into a separate sdlc-claude-skills project under ~/dev, with an appropriate install/uninstall script and .gitignore.

**Started**: 2026-09-18
**Last updated**: 2026-09-19
**Branch**: extract-sdlc-toolchain

## Scope decisions

- Full SDLC toolchain came across, not just the skill files: the review
  sub-agents, every pre-commit/post-commit hook and its lib, the
  install-time mergers, hooks-config.json, the three CLAUDE.md snippets,
  both .json.example config templates and the timing analyser. The review
  skills are inert without the agents and hooks.
- `/review-timing`, `/feature` and `/feature-new` came too: the feature
  hooks instruct Claude to run `/feature-new` on a block, so leaving those
  commands behind would dangle.
- Commands consolidated into one `commands/` directory (risk-claude-skills
  split them across `commands/` and `.claude/commands/`).
- risk-claude-skills is deliberately left untouched — this is a copy. The
  prune of the extracted files from that repo is a separate follow-up, to
  be done only once this install is confirmed working.

## Files involved

- .claude/agents/code-reviewer-deep.md
- .claude/agents/code-reviewer.md
- .claude/claude-md-snippet.md
- .claude/feature-workflow-snippet.md
- .claude/hooks-config.json
- .claude/hygiene-repos.json.example
- .claude/hygiene-snippet.md
- .claude/review-policy.json.example
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
- .gitignore
- CLAUDE.md
- README.md
- commands/commit-prep.md
- commands/feature-new.md
- commands/feature.md
- commands/review-timing.md
- install.sh
- src/hooks/claude-attribution-note.js
- src/hooks/enforce-co-author.js
- src/hooks/enforce-review-implementer.js
- src/hooks/lib/commit-command.js
- src/hooks/lib/diff-classifier.js
- src/hooks/lib/feature-file.js
- src/hooks/lib/git-read.js
- src/hooks/lib/tdd-order.js
- src/hooks/pending-review-gate.js
- src/hooks/post-commit-feature.js
- src/hooks/post-commit-notify.js
- src/hooks/post-commit-review.js
- src/hooks/pre-commit-feature.js
- src/hooks/pre-commit-hygiene.js
- src/hooks/pre-commit-review.js
- src/hooks/protect-user-dir.js
- src/hooks/session-start-feature.js
- src/hooks/stop-review-trigger.js
- src/hooks/test-claude-attribution-note.sh
- src/hooks/test-commit-command.js
- src/hooks/test-enforce-co-author.sh
- src/hooks/test-post-commit-feature.sh
- src/hooks/test-post-commit-hook.sh
- src/hooks/test-pre-commit-feature.sh
- src/hooks/test-pre-commit-hygiene.sh
- src/hooks/test-pre-commit-review.js
- src/hooks/test-protect-user-dir.js
- src/hooks/test-session-start-feature.sh
- src/hooks/test-stop-hook.sh
- src/hooks/test-tdd-order.sh
- src/hooks/test-timing-log.js
- src/hooks/timing-log.js
- src/lib/claude-md-section.js
- src/merge-claude-md.js
- src/merge-hooks.js
- src/test-claude-md-section.js
- src/test-install.sh
- src/test-merge-claude-md.js
- src/test-merge-hooks.js
- src/test-unmerge-claude-md.js
- src/test-unmerge-hooks.js
- src/unmerge-claude-md.js
- src/unmerge-hooks.js
- tools/analyze-review-timing.py
- uninstall.sh

## History

<!-- populated on commit -->
