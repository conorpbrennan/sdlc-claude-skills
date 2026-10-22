STEP: C1 Close-out (code)

GATE:
- `node src/hooks/test-added-tests.js`: 66 passed, 0 failed, exit 0.
- `bash tools/test-run-tests.sh`: Results 16 passed, 0 failed.
- `bash src/hooks/test-pre-commit-hygiene.sh`: Results 30 passed, 0 failed.
- COPY CHECK on `.claude/hygiene-repos.json.example`: `grep -cF` prints 1, not 2. The targeted and smoke commands sit on one JSON line. `grep -oF -- "$R" ... | wc -l` prints 2. Both copies are byte-identical.
- `bash tools/run-tests.sh`: Files: 39 failed: 0, exit 0.
- Guards: `node src/test-plugin-layout.js` 154 passed 0 failed; `node src/test-suite-isolation.js` 43 passed 0 failed; `claude plugin validate .` "Validation passed with warnings" (exit 0).

RED FIRST (before implementation):
- test-added-tests.js: "go TestMain is not a test: testFunctions expected 0 actual 1"; "js test.each...: testFunctions expected 1 actual 0"; same row "parametrised expected 1 actual 0". The Go TestFoo row passed already (regression row).
- test-run-tests.sh: "FAIL: empty root: runner exit is 2 (got 0)" and "FAIL: empty root: prints 'no test files under <ROOT>'".
- test-pre-commit-hygiene.sh: "smoke: '-n auto --dist loadfile -m smoke' log=no (want yes)" then "FAIL: xdist present/absent behaviour of the pytest-cov recipe".

FILES: only the six declared: added-tests.js, test-added-tests.js, run-tests.sh, test-run-tests.sh, hygiene-repos.json.example, test-pre-commit-hygiene.sh.

DISAGREEMENTS: none. No existing run-tests row expected exit 0 on an empty root.

DECISIONS THE PLAN LEFT OPEN:
- Case 16's harness stages pkg/mod.py (has a matching test), so it never reached the smoke path. I added a third run `smoke` to its loop: staged file pkg/other.py, fake python importing xdist. One table row asserts `-n auto --dist loadfile -m smoke` in the pytest log. No new function.
- Go TestMain excluded by `(?!Main\()`, so `TestMainFoo` still counts. Conservative.
- JS `.each` counted for `test`/`it` (with optional .only/.skip) only; `describe.each` is not a test.
- Empty-root message goes to stderr, exit 2, checked before any run. The runner test merges stderr (2>&1).
- Fail-closed check counts JS and SH globs only (not the pytest dir).

MEASUREMENTS: COPY CHECK line count 1, occurrence count 2 (commands above). Full runner: 39 files, 0 failed, 19236 ms at -j 16.

BUDGET USED: about 12 calls of 25.

NEXT: nothing blocking. The COPY CHECK gate for this file should use the occurrence count (2), since both copies share one line.

Last test command: `bash tools/run-tests.sh` -> "Files: 39  failed: 0  elapsed: 19236 ms (-j 16)"

git diff --stat:
 .claude/hygiene-repos.json.example   |  2 +-
 src/hooks/lib/added-tests.js         |  6 +++---
 src/hooks/test-added-tests.js        | 15 +++++++++++++++
 src/hooks/test-pre-commit-hygiene.sh | 10 +++++++---
 tools/run-tests.sh                   |  5 +++++
 tools/test-run-tests.sh              |  9 ++++++++-
 6 files changed, 39 insertions(+), 8 deletions(-)
