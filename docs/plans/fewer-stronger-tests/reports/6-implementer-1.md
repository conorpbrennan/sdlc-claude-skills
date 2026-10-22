STEP: 6. Every pytest the toolchain tells anyone to run is parallel when xdist is present and serial with a WARNING when it is not.

GATE:
- `bash src/hooks/test-pre-commit-hygiene.sh`: exit 0, "Results: 30 passed, 0 failed"; contains "PASS: pytest runs -n auto when xdist imports, serial with a WARNING when it does not" (grep -c = 1).
- `grep -c "dist loadfile"` on hygiene-repos.json.example / commit-prep.md / verify.md: 1 / 2 / 1.
- COPY CHECK (`R=$(grep -m1 -o 'XD=.*pytest [$]XD' docs/plans/fewer-stronger-tests.md); test -n "$R" && grep -cF -- "$R" ...`) on the three files plus skills/code-review-pre-commit/SKILL.md: example 1, commit-prep 2, verify 1, SKILL.md 1.
- `wc -c instructions/hygiene-snippet.md`: 1504 before, 1504 after.
- `node src/hooks/test-session-start-instructions.js`: exit 0.
- `node src/test-plugin-layout.js`: exit 0. `node src/test-suite-isolation.js`: exit 0. `claude plugin validate .`: exit 0.
- `bash tools/run-tests.sh`: exit 0, "Files: 39  failed: 0".
- JSON parse of the example: ok.

RED FIRST: new case 16 in src/hooks/test-pre-commit-hygiene.sh, before the config change. Output:
`present: '-n auto --dist loadfile' log=no (want yes)`, `absent: 'WARNING: pytest-xdist missing' log=no ... stderr=no (want yes)`, `FAIL: xdist present/absent behaviour of the pytest-cov recipe`, "29 passed, 1 failed". Pytest log was `.../tests/test_mod.py --cov=pkg --cov-branch --cov-report=xml -q` (no `-n auto`).

FILES: touched .claude/hygiene-repos.json.example, instructions/hygiene-snippet.md, commands/commit-prep.md (both lines), commands/verify.md, README.md, src/hooks/test-pre-commit-hygiene.sh. All in the declared set. Not touched: SKILL.md, pre-commit-hygiene.js.

DISAGREEMENTS: none. Note: hygiene-snippet.md already contained `WARNING` (line 10, from before this step); I added none. The step text said the session-start test asserts its absence; that test passes anyway (it only asserts WARNING_HEAD "> sdlc plugin WARNING:").

DECISIONS THE PLAN LEFT OPEN:
- Recipe placed inline in the example's targeted branch (`then XD=...; pytest $XD $T $COV ...`), not at the very start of the command string, since the recipe ends in `pytest $XD` and must stay one byte-identical line. The smoke-marker `pytest -m smoke` call is left serial (conservative; the step names only the targeted call).
- Snippet sentence is paid for by dropping the "Hygiene pytest cost 436 min/week ..." sentence and rewording the `setup` note; the `.sqlite` example omitted from the snippet (README has all three).
- Test uses a stage-less direct `bash -c` run of the example command in the fixture repo (as the nosmoke case does), with fake python dirs earlier on PATH than the fakebin, so real xdist does not matter.

MEASUREMENTS: snippet bytes 1504 -> 1504 (`wc -c`). Test counts 29 pass/1 fail red, 30/0 green (test-pre-commit-hygiene.sh). run-tests: 39 files, 0 failed, 17970 ms.

REVIEW notes: (1) Absent xdist: `XD` is empty (echo goes to stderr), so the call is `pytest  <tests> --cov=...` which equals the old command apart from one extra space; the case asserts no `-n auto` and tests still run. (2) Single coverage.xml at repo root under xdist is NOT checked by this step's tests (fake pytest only); it relies on pytest-cov 7 behaviour stated in the plan. (3) Byte-identity: COPY CHECK numbers above.

BUDGET USED: about 16 calls of 35, one round.

NEXT: commit-prep.md carries the recipe twice (item 2 and default pipeline), so its COPY CHECK count is 2, not 1. Nothing else outstanding.

Test command: `bash src/hooks/test-pre-commit-hygiene.sh` -> "Results: 30 passed, 0 failed".

git diff --stat:
 .claude/hygiene-repos.json.example   |  2 +-
 README.md                            |  4 ++++
 commands/commit-prep.md              |  4 ++--
 commands/verify.md                   |  2 +-
 instructions/hygiene-snippet.md      |  9 ++++----
 src/hooks/test-pre-commit-hygiene.sh | 44 ++++++++++++++++++++++++++++++++++++
 6 files changed, 56 insertions(+), 9 deletions(-)
