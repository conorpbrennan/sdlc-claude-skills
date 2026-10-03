# Fix Subdir Staged Diff

**Requirement**: Pre-commit review must read the real staged diff when the commit runs from a subdirectory, and must not fast-path a zero-byte diff over staged code files.

**Started**: 2026-10-03
**Last updated**: 2026-10-03
**Branch**: fix-subdir-staged-diff

## Files involved

- docs/plans/fix-subdir-staged-diff.md
- src/hooks/pre-commit-review.js
- src/hooks/test-pre-commit-review.js

## History

- 2026-10-03 `785a7ef` — Read the staged diff from the repo root and fail closed on an empty read
  - docs/plans/fix-subdir-staged-diff.md
  - src/hooks/pre-commit-review.js
  - src/hooks/test-pre-commit-review.js
