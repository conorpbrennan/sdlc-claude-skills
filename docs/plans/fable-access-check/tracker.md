# Tracker: fable access check

RUN: docs/plans/fable-access-check.md, revision 3. Branch: fable-access-check (cut from origin/main c566c28). Started: 2026-11-22.
BUDGET: steps S1-S6, per the step BUDGET fields in the plan. Spent: plan source review rounds 1 and 2 (both NOT YET, folded into revision 3; cap reached, no third review).
IN FLIGHT: S3 (checkAccess cache).
TREE: staged feature record; plan untracked. Worktrees open: none.

Owner decisions, 2026-11-22:
1. Standing authorisation to stage, commit and dispatch fix agents unattended for S1-S6, no push, no PR: GRANTED.
2. S1 spend (about $0.39 for one Fable probe run): GRANTED.
3. Cache TTL: 10 minutes.
AC4 wording amended to "(no readable signal)".
Owner confirmed the S1 signal and decision table after the geo check, 2026-11-22: 0 of 11 Fable-capable sessions wrote "" before or during a successful Fable record; the one with "" records switched from direct to gateway part way (newest record wins); 6 of 6 refused sessions were all "". Gateway meaning of "" stays INFERRED.

STEP S1: PASS
  commit:  f3d0d47
  findings: docs/plans/fable-access-check/probe-findings.md; Paid probe needed: no
  gaps: geo "" = gateway INFERRED; Agent tool_result 403 shape GUESSED

Owner break after S1 (done): owner reads the findings file and confirms the signal and decision table before S2.
