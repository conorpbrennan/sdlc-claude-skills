# Tracker: fable access check

RUN: docs/plans/fable-access-check.md, revision 3. Branch: fable-access-check (cut from origin/main c566c28). Started: 2026-11-22.
BUDGET: steps S1-S6, per the step BUDGET fields in the plan. Spent: plan source review rounds 1 and 2 (both NOT YET, folded into revision 3; cap reached, no third review).
IN FLIGHT: none. S1-S6 built. S2 54506b0, S3 6328488, S4 0390ddb and S5 f1c0c94 each PASS at review round 1 (code-reviewer, 0 critical, 0 important). S6 is docs only.
AS BUILT: signal = transcript inference_geo, with a failed Agent task-notification 403 and a Fable reply as overrides. Paid probe needed: no. AC1-AC5 met by tests; AC5: bash tools/run-tests.sh printed Files: 61  failed: 0.
OPEN GAPS: geo "" = gateway is INFERRED (no gateway run). Agent tool_result 403 shape is GUESSED (0 seen). The first Fable dispatch of a session reads unknown and is denied. S5 advisories left: AC1 test picks its prompt by row name; redundant assignment in the decideFable catch.
NOT DONE: push, PR, infra allow-list message.
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
