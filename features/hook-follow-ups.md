# Hook Follow Ups

**Requirement**: Close the five post-merge follow-ups. The test suites must never touch the repository they run from. The review-in-flight block must repeat the drift note. The block messages must share one path-list helper. SKILL.md must name which reports end in TDD_GATE. The intended absence of a plugin version must be recorded.

**Started**: 2026-10-04
**Last updated**: 2026-10-04
**Branch**: hook-follow-ups

## Files involved

- skills/code-review-pre-commit/SKILL.md
- src/hooks/lib/isolate-git-env.js
- src/hooks/pre-commit-review.js
- src/hooks/test-claude-attribution-note.sh
- src/hooks/test-commit-command.js
- src/hooks/test-enforce-co-author.sh
- src/hooks/test-fast-path-languages.js
- src/hooks/test-post-commit-feature.sh
- src/hooks/test-post-commit-hook.sh
- src/hooks/test-pre-commit-feature.sh
- src/hooks/test-pre-commit-hygiene.sh
- src/hooks/test-pre-commit-review.js
- src/hooks/test-protect-user-dir.js
- src/hooks/test-review-markers.js
- src/hooks/test-session-start-feature.sh
- src/hooks/test-session-start-instructions.js
- src/hooks/test-source-files.js
- src/hooks/test-stop-hook.sh
- src/hooks/test-tdd-mandate.js
- src/hooks/test-tdd-order.sh
- src/hooks/test-timing-log.js
- src/test-claude-md-section.js
- src/test-plugin-layout.js
- src/test-suite-isolation.js
- src/test-uninstall.sh
- src/test-unmerge-claude-md.js
- src/test-unmerge-hooks.js

## History

- 2026-10-04 `cf59b62` — Keep test suites out of the repository they run from
  - skills/code-review-pre-commit/SKILL.md
  - src/hooks/lib/isolate-git-env.js
  - src/hooks/pre-commit-review.js
  - src/hooks/test-claude-attribution-note.sh
  - src/hooks/test-commit-command.js
  - src/hooks/test-enforce-co-author.sh
  - src/hooks/test-fast-path-languages.js
  - src/hooks/test-post-commit-feature.sh
  - src/hooks/test-post-commit-hook.sh
  - src/hooks/test-pre-commit-feature.sh
  - src/hooks/test-pre-commit-hygiene.sh
  - src/hooks/test-pre-commit-review.js
  - src/hooks/test-protect-user-dir.js
  - src/hooks/test-review-markers.js
  - src/hooks/test-session-start-feature.sh
  - src/hooks/test-session-start-instructions.js
  - src/hooks/test-source-files.js
  - src/hooks/test-stop-hook.sh
  - src/hooks/test-tdd-mandate.js
  - src/hooks/test-tdd-order.sh
  - src/hooks/test-timing-log.js
  - src/test-claude-md-section.js
  - src/test-plugin-layout.js
  - src/test-suite-isolation.js
  - src/test-uninstall.sh
  - src/test-unmerge-claude-md.js
  - src/test-unmerge-hooks.js
