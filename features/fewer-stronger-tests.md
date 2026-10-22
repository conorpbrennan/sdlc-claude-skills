# Fewer Stronger Tests

**Requirement**: Make the sdlc toolchain produce substantially fewer tests that cover more and test behaviour, and run every test suite in parallel so it finishes as fast as possible.

**Started**: 2026-10-22
**Last updated**: 2026-10-22
**Branch**: fewer-stronger-tests

## Acceptance

1. `bash tools/run-tests.sh` exits 0 three times in a row, each run taking at most 40% of the serial loop time quoted in step 2's report.
2. `node tools/measure-tests.js --range a9a685e..HEAD` prints a test-lines-per-source-line figure at or below 0.8 for this plan's commits.
3. `node src/hooks/test-session-start-instructions.js` reports no headroom FAIL.
4. `claude plugin validate .` exits 0 and `node tools/plugin-version.js check` exits 0.
5. `grep -rn "2.2-2.7" agents/implementer.md skills/plan-spec/reference.md skills/code-review-pre-commit/SKILL.md` finds a hit in each file, and `agents/code-reviewer.md` is the only file that defines criteria 2.1-2.7.

## Files involved

<!-- populated on commit -->

## History

<!-- populated on commit -->
