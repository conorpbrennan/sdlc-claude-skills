# Tracker: fewer stronger tests

RUN: docs/plans/fewer-stronger-tests.md, revision 3. Branch: fewer-stronger-tests (cut from main a9a685e). Started: 2026-10-22.
BUDGET: steps 1-7, about 205 implementer calls per the step BUDGET fields. Spent: plan review rounds 1 (Opus source, NOT YET, 11 findings) and 2 (Sonnet consistency, NOT YET, 1 finding), all folded in; cap reached, plan READY.
IN FLIGHT: step 2, review round 1.
TREE: staged step 1's tracker block and 1-review-1 report; unstaged step 2. Worktrees open: none.

Owner decisions, 2026-10-22: Decision 1 (standing authorisation to stage, commit and dispatch fix rounds unattended) GRANTED. Follow-on plan to slim this repo's own suite after this one lands.

Step 1 notes (from reports/1-implementer-1.md), recorded before review:
  disagreements: none against the plan.
  decisions: comments and blanks excluded from line counts (tdd-order `isNonCommentLine`); `parametrised` counts decorators, not rows; singleAssert/mockOnly null without a Python test file; JS pattern anchored at line start.
  baseline: measure-tests over a9a685e~40..a9a685e prints 2.00 test lines per source line (6034/3014, 55 code commits). The plan's 1.20 came from a scratch script with an unknown definition. 2.00 is the baseline for DoD 2 comparisons.
  gap for step 7: this repo's .js suites use a custom harness, not `test(`/`it(`, so testFunctions reads 0 here; testLines is the usable measure in this repo. Target repos are Python, where `def test_` counts.

STEP 1: PASS
  commit:  d78b0c9
  gate:    test-added-tests 48/0; measure-tests prints 2.00 (6034/3014, 55 code commits); plugin-layout 154/0; suite-isolation 42/0; plugin validate exit 0 (warnings)
  reviews: code-reviewer, round 1, PASS, about 1 minute
  reports: reports/1-implementer-1.md, reports/1-review-1.md
  stage:   src/hooks/lib/added-tests.js, src/hooks/test-added-tests.js, tools/measure-tests.js, .claude-plugin/plugin.json (1.0.37 -> 1.0.38), tracker, reports/1-implementer-1.md, features/fewer-stronger-tests.md (acceptance aligned to DoD)
  files:   as declared
  disagreements: none
  decisions: see Step 1 notes above
  budget:  about 12 of 30 calls

Step 2 notes (from reports/2-implementer-1.md), recorded before review:
  disagreements: README had a code block, not a paragraph, under Tests (replaced); its "Every suite passes" line is untrue until step 4 lands the headroom fix. SKILL.md lines were 62-65, not 63-64.
  decisions: node per-file rc read from TAP top-level ok/not ok, with a catch-all rc line so a non-zero is never swallowed; bash files through an xargs wrapper; node and bash concurrent, pytest after; N defaults to nproc, fallback 4.
  files: test-pre-commit-feature.sh and test-pre-commit-hygiene.sh declared but untouched: no parallel-only failure in 7 full runs.
  measured: parallel 18.0/17.8/18.8 s vs serial 72.2 s (25%); timing-log fixture rows 104 before and after.

CLOSE-OUT LIST (advisories outside a step's file set, batched for one close-out step):
  - step 2: README "Every suite passes" sentence — recheck after step 4.
  - step 1: tighten Go `Test` regex (exclude `TestMain`, `Testing`); count JS `test.each`/`it.each`; add failing-direction rows for Go, C#, Rust; header case could use a visible testLines effect.
