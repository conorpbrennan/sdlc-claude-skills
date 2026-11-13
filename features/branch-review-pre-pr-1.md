# Branch Review Pre Pr 1

**Requirement**: Add a whole-branch review gate before `gh pr create`: the `/sdlc:branch-review` skill and command, a report parser and CLI, a marker, and an advisory-by-default PreToolUse hook that checks the marker.

**Started**: 2026-11-12
**Last updated**: 2026-11-13
**Branch**: branch-review-pre-pr-1

## Acceptance

1. Running `bash tools/run-tests.sh` exits 0 and `claude plugin validate .` exits 0.
2. Running `node src/hooks/test-branch-review.js` exits 0.
3. Running `node src/hooks/test-pre-pr-branch-review.js` exits 0.
4. Running `node src/hooks/test-branch-review-cli.js` exits 0.

## Files involved

- ## History
- .claude-plugin/plugin.json
- docs/plans/branch-review-pre-pr.md
- run/reports/S1-implementer-1.md
- run/tracker.md
- src/hooks/lib/branch-review.js
- src/hooks/lib/review-markers.js
- src/hooks/test-branch-review.js
- src/hooks/test-review-markers.js
