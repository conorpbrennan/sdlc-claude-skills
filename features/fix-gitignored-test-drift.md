# Fix Gitignored Test Drift

**Requirement**: The coverage fast path never approves on a gitignored test file the index can't hold, and the gap-patcher never writes one.

**Started**: 2026-10-04
**Last updated**: 2026-10-04
**Branch**: fix-gitignored-test-drift

## Files involved

- README.md
- skills/code-review-pre-commit/SKILL.md
- src/hooks/pre-commit-review.js
- src/hooks/test-pre-commit-review.js
- src/test-plugin-layout.js

## History

- 2026-10-04 `892a330` — Count gitignored test files as coverage drift
  - README.md
  - skills/code-review-pre-commit/SKILL.md
  - src/hooks/pre-commit-review.js
  - src/hooks/test-pre-commit-review.js
  - src/test-plugin-layout.js
