STEP: C1. Reviewer: sdlc:code-reviewer (Sonnet), round 1, in a throwaway worktree. Verdict: PASS (TDD_GATE: PASS).

RED confirmed for the Go TestMain row by mutation (pattern back to `Test\w*(`: 65 passed, 1 failed; restored: 66/0). The other three claimed reds not mutated.

Answers:
1. Rows only: three in the `CASES` table of test-added-tests.js, one in tools/test-run-tests.sh, one table line (plus a `smoke` value in the existing loop) in test-pre-commit-hygiene.sh. No new function.
2. Empty ROOT: `no test files under <ROOT>`, exit 2. A ROOT with one `tools/test-a.sh` ran it and exited 0. Existing rows unchanged (16/16).
3. Go: `TestFoo`, `Test_xxx` match; `TestMain(`, `Testing(`, `Test(t` do not; `TestMainFoo(` matches. JS: `test.each(`, `it.only(`, `test(` match; `items.each(`, `list.forEach(` do not. `describe.each` not counted.

Recipe occurs twice in the example config, byte-identical; smoke is now `pytest $XD -m smoke -q`.

Worktree runs: test-added-tests 66/0; test-run-tests 16/0; test-pre-commit-hygiene 30/0. Full runner and guards not re-run (implementer: run-tests 39 files 0 failed in the main tree).

CRITICAL: none. IMPORTANT: none.
ADVISORY: the smoke run's pass depends on `pkg/other.py` having no matching `test_other*.py` in `$TREPO`; the comment says so.
