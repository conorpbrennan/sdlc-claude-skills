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
- .claude/hygiene-repos.json.example
- .claude/review-policy.json.example
- CLAUDE.md
- README.md
- commands/commit-prep.md
- commands/verify.md
- docs/plans/fewer-stronger-tests-closeout.md
- docs/plans/fewer-stronger-tests.md
- docs/plans/fewer-stronger-tests/reports/1-implementer-1.md
- docs/plans/fewer-stronger-tests/reports/1-review-1.md
- docs/plans/fewer-stronger-tests/reports/2-implementer-1.md
- docs/plans/fewer-stronger-tests/reports/5-review-1.md
- docs/plans/fewer-stronger-tests/reports/6-implementer-1.md
- docs/plans/fewer-stronger-tests/reports/6-review-1.md
- docs/plans/fewer-stronger-tests/reports/7-fix-1.md
- docs/plans/fewer-stronger-tests/reports/7-implementer-1.md
- docs/plans/fewer-stronger-tests/reports/7-review-1.md
- docs/plans/fewer-stronger-tests/reports/C1-implementer-1.md
- docs/plans/fewer-stronger-tests/reports/C1-review-1.md
- docs/plans/fewer-stronger-tests/reports/C2-implementer-1.md
- docs/plans/fewer-stronger-tests/tracker.md
- instructions/hygiene-snippet.md
- skills/code-review-implementer/SKILL.md
- src/hooks/lib/added-tests.js
- src/hooks/pre-commit-review.js
- src/hooks/test-added-tests.js
- src/hooks/test-pre-commit-feature.sh
- src/hooks/test-pre-commit-hygiene.sh
- src/hooks/test-pre-commit-review.js
- src/hooks/test-session-start-instructions.js
- tools/measure-tests.js
- tools/run-tests.sh
- tools/test-run-tests.sh

## History

- 2026-10-22 `9f39470` — Close-out C2: amend -> approve runs in its own temp repo
  - .claude-plugin/plugin.json
  - docs/plans/fewer-stronger-tests/reports/C1-review-1.md
  - docs/plans/fewer-stronger-tests/reports/C2-implementer-1.md
  - docs/plans/fewer-stronger-tests/tracker.md
  - src/hooks/test-pre-commit-feature.sh

- 2026-10-22 `193ba51` — Close-out C1: Go and JS each patterns, empty-root runner fails closed, parallel smoke fallback
  - .claude-plugin/plugin.json
  - .claude/hygiene-repos.json.example
  - docs/plans/fewer-stronger-tests-closeout.md
  - docs/plans/fewer-stronger-tests.md
  - docs/plans/fewer-stronger-tests/reports/7-review-1.md
  - docs/plans/fewer-stronger-tests/reports/C1-implementer-1.md
  - docs/plans/fewer-stronger-tests/tracker.md
  - src/hooks/lib/added-tests.js
  - src/hooks/test-added-tests.js
  - src/hooks/test-pre-commit-hygiene.sh
  - tools/run-tests.sh
  - tools/test-run-tests.sh

- 2026-10-22 `78369a4` — Review block message: advisory tests-added line against max_tests_per_commit
  - .claude-plugin/plugin.json
  - .claude/review-policy.json.example
  - README.md
  - docs/plans/fewer-stronger-tests/reports/6-review-1.md
  - docs/plans/fewer-stronger-tests/reports/7-fix-1.md
  - docs/plans/fewer-stronger-tests/reports/7-implementer-1.md
  - docs/plans/fewer-stronger-tests/tracker.md
  - src/hooks/pre-commit-review.js
  - src/hooks/test-pre-commit-review.js

- 2026-10-22 `b274715` — Parallel pytest recipe in every pytest the toolchain runs
  - .claude-plugin/plugin.json
  - .claude/hygiene-repos.json.example
  - README.md
  - commands/commit-prep.md
  - commands/verify.md
  - docs/plans/fewer-stronger-tests/reports/5-review-1.md
  - docs/plans/fewer-stronger-tests/reports/6-implementer-1.md
  - docs/plans/fewer-stronger-tests/tracker.md
  - instructions/hygiene-snippet.md
  - src/hooks/test-pre-commit-hygiene.sh

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

## Verification — 2026-10-22 @ 1579c22

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `bash tools/run-tests.sh` exits 0 three times in a row, each run taking at most 40% of the serial loop time quoted in step 2's report. | PASS | `bash tools/run-tests.sh` x3, each exit 0, `Files: 39 failed: 0 elapsed: 19300 ms`, `18322 ms`, `17907 ms` (-j 16). Serial figure 87.4 s from docs/plans/fewer-stronger-tests.md line 97 (the step 2 report itself was not found, so this relies on the plan figure). 40% is 35 s, and all three runs are under it. |
| 2 | `node tools/measure-tests.js --range a9a685e..HEAD` prints a test-lines-per-source-line figure at or below 0.8 for this plan's commits (baseline 2.00 over `a9a685e~40..a9a685e`). | FAIL | `node tools/measure-tests.js --range a9a685e..HEAD` printed `test lines per source line: 0.91 (306 / 335)`. The limit is 0.8 or below. |
| 3 | `node src/hooks/test-session-start-instructions.js` exits 0. | PASS | `node src/hooks/test-session-start-instructions.js` exited 0 (`t3 0`). |
| 4 | `claude plugin validate .` exits 0, and every commit in `a9a685e..HEAD` that is not features-only has a `.claude-plugin/plugin.json` version above its parent's. | PASS | `claude plugin validate .` exited 0. For the 13 non-features-only commits in `a9a685e..HEAD`, the version rises on each, 1.0.35 to 1.0.36 up to 1.0.47 to 1.0.48. |
| 5 | `grep -rn "2.2-2.7" agents/implementer.md skills/plan-spec/reference.md skills/code-review-pre-commit/SKILL.md` finds a hit in each file, and `agents/code-reviewer.md` is the only file that defines criteria 2.1-2.7. | PASS | `grep -rn "2.2-2.7"` hit `agents/implementer.md:22`, `skills/plan-spec/reference.md:1531` and `skills/code-review-pre-commit/SKILL.md:156`. A grep for "2.1" under agents and skills matched `agents/code-reviewer.md` and `agents/code-reviewer-deep.md`. The deep file only refers to the criteria at line 48 ("TESTED criteria 2.1-2.7 apply unchanged"). I did not read `code-reviewer.md` to confirm it holds the definitions. |

**Verdict**: FAIL
- The verifier ended the report with VERIFY_GATE: FAIL.
- Row 2 is FAIL.
