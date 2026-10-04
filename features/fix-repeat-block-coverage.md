# Fix Repeat Block Coverage

**Requirement**: A quick retry repeats the previous block only when neither the staged diff nor coverage.xml has changed, and the repeat says so.

**Started**: 2026-10-04
**Last updated**: 2026-10-04
**Branch**: fix-repeat-block-coverage

## Files involved

- src/hooks/lib/review-markers.js
- src/hooks/pre-commit-review.js
- src/hooks/test-pre-commit-review.js

## History

<!-- populated on commit -->
