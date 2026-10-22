STEP: 6. Reviewer: sdlc:code-reviewer (Sonnet), round 1, in a throwaway worktree. Verdict: PASS (TDD_GATE: PASS).

Hygiene suite 30 passed, 0 failed in the worktree. COPY CHECK and mutation held. Status hash unchanged.

Answers:
1. With xdist absent `XD` is empty (the echo goes to stderr) and the assignment succeeds; the pytest log shows the old argument list (one extra leading space).
2. One merged `coverage.xml` under real xdist: not checked by any staged test (the fake pytest touches coverage.xml itself, line 448). Rests on pytest-cov 7 behaviour. To test it: an opt-in case running real `pytest -n auto --cov` on a tiny package.
3. COPY CHECK: example config 1, commit-prep.md 2, verify.md 1, gap prompt SKILL.md 1.
4. Case 16: one 5-row table, fake python first on PATH under `$TMPROOT`, reads the command from the example config, both directions. RED confirmed by mutation: with HEAD's example config, 29 passed, 1 failed. hygiene-snippet.md 1504 bytes before and after; dropped the "436 min/week" statistic (data, not a rule); conda rule kept.

CRITICAL: none. IMPORTANT: none.

ADVISORY (to the close-out list):
- hygiene-snippet.md line 12 drops `.sqlite` and the "warn and serial otherwise" half (README has both); byte-budget trade; long line.
- verify.md:41 closing `)` after the recipe on a very long line (readability).
- `pytest -m smoke` fallback left serial.
