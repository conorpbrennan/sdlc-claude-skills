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
- .claude/branch-review-repos.json.example
- .claude/sdlc-review.json.example
- 2026-11-13 `007cae2` — branch-review S4: branchReview section in sdlc-review.json and a CLI subcommand that prints it
- 2026-11-13 `07ebbfc` — branch-review S5: PreToolUse hook on gh pr create that checks the branch-review marker
- 2026-11-13 `18481d8` — branch-review S2: library that reads the branch-review repos config
- 2026-11-13 `651c9b1` — branch-review S3: parser that settles a branch-review report's verdict
- 2026-11-13 `d073a88` — branch-review S1: library that resolves the base, hashes the branch diff and judges a branch marker
- 2026-11-13 `e330e6a` — branch-review S6: CLI that plans a branch review and checks a report
- 2026-11-13 `ebc8847` — branch-review S6b: library that lists and unlists a repo in the branch-review repos config
- docs/plans/branch-review-pre-pr.md
- hooks/hooks.json
- run/reports/S1-implementer-1.md
- run/reports/S2-implementer-1.md
- run/reports/S3-implementer-1.md
- run/reports/S4-implementer-1.md
- run/reports/S5-implementer-1.md
- run/reports/S6-implementer-1.md
- run/reports/S6b-implementer-1.md
- run/reports/S6c-implementer-1.md
- run/tracker.md
- src/hooks/branch-review-cli.js
- src/hooks/lib/branch-report.js
- src/hooks/lib/branch-repos-config.js
- src/hooks/lib/branch-repos-write.js
- src/hooks/lib/branch-review.js
- src/hooks/lib/review-config.js
- src/hooks/lib/review-markers.js
- src/hooks/lib/steps.js
- src/hooks/pre-pr-branch-review.js
- src/hooks/review-config-cli.js
- src/hooks/test-branch-report.js
- src/hooks/test-branch-repos-config.js
- src/hooks/test-branch-repos-write.js
- src/hooks/test-branch-review-cli.js
- src/hooks/test-branch-review.js
- src/hooks/test-pre-pr-branch-review.js
- src/hooks/test-review-config.js
- src/hooks/test-review-markers.js
- src/hooks/test-steps.js
- src/test-plugin-layout.js
