STEP: 7 (tests-added advisory line, ceiling, thresholds documented). Status: built; GATE has two red conditions that are red at clean HEAD too (see GATE).

GATE:
- `node src/hooks/test-pre-commit-review.js`: exit 1. 10 FAIL lines, all `no_tests` / TDD-mandate-on cases ("comment-only, no test, mandate on: blocked", "presentational-eligible...", "staged cafe.py ... no_tests", etc.). The same 10 FAIL lines appear in a clean `git worktree` of HEAD (no changes of mine), so they pre-exist. Cause not chased (environment: the TDD mandate config / marker state in this checkout). Not caused by this step.
- Hook decision on the existing review-required fixture unchanged: new assertion `policy ceiling leaves the review-required decision unchanged` PASS; existing `message reports non-trivial line counts` and the rounds/marker assertions in the same case still PASS.
- My two new assertions PASS: `message carries the tests-added line with the fixture counts`, `policy max_tests_per_commit 3 shows in the tests-added line`.
- `node src/hooks/test-added-tests.js`: exit 0.
- `bash tools/run-tests.sh`: exit 1, "Files: 39 failed: 1" (only test-pre-commit-review.js, for the pre-existing reason above).
- `node src/test-plugin-layout.js`: exit 0. `node src/test-suite-isolation.js`: exit 0. `claude plugin validate .`: exit 0.

RED FIRST: assertions added before the hook change. Failure text: `FAIL: message carries the tests-added line with the fixture counts -- expected to contain "Tests added: 0 functions, 0 parametrised rows, 0/2 test/source lines (ceiling 8).", got "PRE_COMMIT_REVIEW: Run /sdlc:code-review-pre-commit --fresh on the staged files: tmp/pre-commit-hook-test.py (3 non-trivial lines added, 1 removed). Round 1: ..."` and `FAIL: policy max_tests_per_commit 3 shows ...` (that one first failed on a stale BLOCK marker; I added cleanAll() around the second run so it sees a fresh block).

FILES: touched exactly the declared set: src/hooks/pre-commit-review.js, src/hooks/test-pre-commit-review.js, .claude/review-policy.json.example, README.md. Nothing staged or committed.

DISAGREEMENTS: none. Note on the plan: the fixture dummy is a plain 2-line source file, so counts are 0 functions, 0 rows, 0/2. No nonzero count is exercised in the hook test; added-tests.js has its own tests.

DECISIONS THE PLAN LEFT OPEN:
- Diff scope: `readStagedDiff(codeFiles, -U1)` reads only staged files passing `isSourcePath`. That includes test files with a source extension (.py, .js, ...), so tests are visible. Test files with a non-source extension are not. One read, no second `git diff`; the hook's `diffRead.text` is reused. Conservative.
- "parametrised rows" prints `parametrised` (decorator count), as step 1 said.
- Unreadable text: `Tests added: unreadable.` (with a full stop), used when `diffRead.text === null` or counting throws. The line is placed after the file list and `semanticNote`, before the rounds policy; it sits only in the final block message, not in `reason`.
- Counting is inside try/catch in new `testsAddedLine()`; it returns a string only and cannot change `decision`, the marker or the lock. It runs after the decision is made, in the default block path only.
- README: paragraph placed in `### ~/.claude/review-policy.json` (after the field list), since no "fast-path" section exists; `max_tests_per_commit` added to that field list.
- The pre-existing 10 failures: recorded, not fixed (out of the file set).

MEASUREMENTS: 10 FAIL lines at clean HEAD and with my change: `node src/hooks/test-pre-commit-review.js 2>&1 | grep -c "FAIL:"` (run in a temporary worktree of HEAD gave 10; with my change the listing shows 10 lines). run-tests: "Files: 39  failed: 1" from `bash tools/run-tests.sh`. Evidence figures (3 of 31, 10 of 285) are quoted from the step text, not measured.

BUDGET USED: about 17 calls of ~30; one round.

NEXT: Review should check the 10 pre-existing `no_tests` failures before committing: step 6 reported 0 failed, so something in the current environment (staged orchestrator files are not the cause, since a clean HEAD worktree fails the same way) differs. Review answers: (1) the line is built after `block()` inputs are decided and is string-only, so it cannot turn approve into block or touch a marker (the marker write precedes it unchanged); (2) a throw is caught inside `testsAddedLine` and prints "unreadable", the block path is unchanged; (3) no new `git diff` spawn, diff read once.

Test command: `node src/hooks/test-pre-commit-review.js` -> exit 1, 10 FAIL lines (pre-existing); new assertions all PASS.
git diff --stat:
 .claude/review-policy.json.example  |  5 +++--
 README.md                           | 10 +++++++++-
 src/hooks/pre-commit-review.js      | 27 ++++++++++++++++++++++++++-
 src/hooks/test-pre-commit-review.js | 15 +++++++++++++++
 4 files changed, 53 insertions(+), 4 deletions(-)
