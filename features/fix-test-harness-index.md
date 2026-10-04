# Fix Test Harness Index

**Requirement**: Running the hook test suite never changes the caller's index, and a crash exits non-zero.

**Started**: 2026-10-04
**Last updated**: 2026-10-04
**Branch**: fix-test-harness-index

## Files involved

- src/hooks/pre-commit-review.js
- src/hooks/test-pre-commit-review.js

## History

- 2026-10-04 `3d17faf` — Leave the caller's index intact and fail on a crash in the hook tests
  - src/hooks/pre-commit-review.js
  - src/hooks/test-pre-commit-review.js
