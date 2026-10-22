# Fewer Stronger Tests

**Requirement**: Make the sdlc toolchain produce substantially fewer tests that cover more and test behaviour, and run every test suite in parallel so it finishes as fast as possible.

**Started**: 2026-10-22
**Last updated**: 2026-10-22
**Branch**: fewer-stronger-tests

## Acceptance

1. `bash tools/run-tests.sh` exits 0 three times in a row, each run taking at most 40% of the serial loop time quoted in step 2's report.
2. `node tools/measure-tests.js --range a9a685e..HEAD` prints a test-lines-per-source-line figure at or below 0.8 for this plan's commits (baseline 2.00 over `a9a685e~40..a9a685e`).
3. `node src/hooks/test-session-start-instructions.js` exits 0.
4. `claude plugin validate .` exits 0, and every commit in `a9a685e..HEAD` that is not features-only has a `.claude-plugin/plugin.json` version above its parent's.
5. `grep -rn "2.2-2.7" agents/implementer.md skills/plan-spec/reference.md skills/code-review-pre-commit/SKILL.md` finds a hit in each file, and `agents/code-reviewer.md` is the only file that defines criteria 2.1-2.7.

## Files involved

- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- docs/plans/fewer-stronger-tests/reports/1-implementer-1.md
- docs/plans/fewer-stronger-tests/reports/1-review-1.md
- docs/plans/fewer-stronger-tests/reports/2-implementer-1.md
- docs/plans/fewer-stronger-tests/tracker.md
- skills/code-review-implementer/SKILL.md
- src/hooks/lib/added-tests.js
- src/hooks/test-added-tests.js
- src/hooks/test-session-start-instructions.js
- tools/measure-tests.js
- tools/run-tests.sh
- tools/test-run-tests.sh

## History

- 2026-10-22 `4035d74` — Run the suites in parallel through tools/run-tests.sh
  - .claude-plugin/plugin.json
  - CLAUDE.md
  - README.md
  - docs/plans/fewer-stronger-tests/reports/1-review-1.md
  - docs/plans/fewer-stronger-tests/reports/2-implementer-1.md
  - docs/plans/fewer-stronger-tests/tracker.md
  - skills/code-review-implementer/SKILL.md
  - src/hooks/test-session-start-instructions.js
  - tools/run-tests.sh
  - tools/test-run-tests.sh

- 2026-10-22 `d78b0c9` — Add measure-tests: count tests added over a git range
  - .claude-plugin/plugin.json
  - docs/plans/fewer-stronger-tests/reports/1-implementer-1.md
  - docs/plans/fewer-stronger-tests/tracker.md
  - src/hooks/lib/added-tests.js
  - src/hooks/test-added-tests.js
  - tools/measure-tests.js
