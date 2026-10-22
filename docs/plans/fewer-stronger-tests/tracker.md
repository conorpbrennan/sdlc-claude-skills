# Tracker: fewer stronger tests

RUN: docs/plans/fewer-stronger-tests.md, revision 3. Branch: fewer-stronger-tests (cut from main a9a685e). Started: 2026-10-22.
BUDGET: steps 1-7, about 205 implementer calls per the step BUDGET fields. Spent: plan review rounds 1 (Opus source, NOT YET, 11 findings) and 2 (Sonnet consistency, NOT YET, 1 finding), all folded in; cap reached, plan READY.
IN FLIGHT: step 1, review round 1.
TREE: staged nothing; unstaged step 1 (once dispatched). Worktrees open: none.

Owner decisions, 2026-10-22: Decision 1 (standing authorisation to stage, commit and dispatch fix rounds unattended) GRANTED. Follow-on plan to slim this repo's own suite after this one lands.

Step 1 notes (from reports/1-implementer-1.md), recorded before review:
  disagreements: none against the plan.
  decisions: comments and blanks excluded from line counts (tdd-order `isNonCommentLine`); `parametrised` counts decorators, not rows; singleAssert/mockOnly null without a Python test file; JS pattern anchored at line start.
  baseline: measure-tests over a9a685e~40..a9a685e prints 2.00 test lines per source line (6034/3014, 55 code commits). The plan's 1.20 came from a scratch script with an unknown definition. 2.00 is the baseline for DoD 2 comparisons.
  gap for step 7: this repo's .js suites use a custom harness, not `test(`/`it(`, so testFunctions reads 0 here; testLines is the usable measure in this repo. Target repos are Python, where `def test_` counts.
