# Tracker: fewer stronger tests

RUN: docs/plans/fewer-stronger-tests.md, revision 4. Branch: fewer-stronger-tests (cut from main a9a685e). Started: 2026-10-22.
BUDGET: steps 1-7, about 205 implementer calls per the step BUDGET fields. Spent: plan review rounds 1 (Opus source, NOT YET, 11 findings) and 2 (Sonnet consistency, NOT YET, 1 finding), all folded in; cap reached, plan READY.
IN FLIGHT: step 7, review round 1 (after fix round 1 for the HEAD-dependent test cases).
TREE: staged step 6's tracker block and 6-review-1 report; unstaged step 7. Worktrees open: none.

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

STEP 2: PASS
  commit:  4035d74
  gate:    test-run-tests 14/0; run-tests x3 exit 1 with only session-start-instructions (headroom); 18.0/17.8/18.8 s vs serial 72.2 s (25%); timing-log rows 104/104; guards pass
  reviews: code-reviewer, round 1, PASS, under 1 minute
  reports: reports/2-implementer-1.md, reports/2-review-1.md
  stage:   tools/run-tests.sh, tools/test-run-tests.sh, CLAUDE.md, README.md, skills/code-review-implementer/SKILL.md, src/hooks/test-session-start-instructions.js, .claude-plugin/plugin.json (1.0.38 -> 1.0.39), tracker, reports/1-review-1.md, reports/2-implementer-1.md, features record
  files:   two declared test files untouched (no flake reproduced)
  budget:  about 17 of 35 calls

STEP 3: PASS
  commit:  46ca34d
  gate:    grep 2.x bullets 7; deep cites 2.1-2.7 (1); plugin validate 0; plugin-layout 154/0; suite-isolation 43/0; runner 39 files, only the headroom FAIL
  reviews: code-reviewer, round 1, PASS, under 1 minute (run before the commit; docs-only, the hook did not block)
  reports: reports/3-implementer-1.md, reports/3-review-1.md
  stage:   agents/code-reviewer.md, agents/code-reviewer-deep.md, .claude-plugin/plugin.json (1.0.39 -> 1.0.40), plan rev 4, tracker, reports/2-review-1.md, reports/3-implementer-1.md
  files:   as declared
  decisions: plan rev 4 adds the isolation rule to 2.5 (Section 9)
  budget:  about 9 of 15 calls

STEP 4: PASS
  commit:  57e7e36
  gate:    session-start-instructions 73/0 (red 72/1 at HEAD); instructions total 8,242; "no uncovered line" 0; "2.2-2.7" in implementer.md and reference.md; check_citations on the fixture exits 1 before and after; run-tests 39 files 0 failed; guards pass
  reviews: code-reviewer, round 1, PASS, under 1 minute (run before the commit; docs-only)
  reports: reports/4-implementer-1.md, reports/4-review-1.md
  stage:   README.md, agents/implementer.md, instructions/tdd-mandate-snippet.md, skills/plan-spec/SKILL.md, skills/plan-spec/reference.md, .claude-plugin/plugin.json (1.0.40 -> 1.0.41), tracker, reports/3-review-1.md, reports/4-implementer-1.md
  files:   as declared
  decisions: three snippet sentences tightened beyond the move to reach 8,242 (wording only; reviewer confirmed no rule dropped); the Cucumber paragraph moved to README too
  budget:  about 12 of 30 calls

STEP 5: PASS
  commit:  833e5d0
  gate:    UNCOVERABLE 2; pragma 1; import xdist 1; COPY CHECK 1; plugin-layout 154/0; suite-isolation 43/0; plugin validate 0; run-tests 39 files 0 failed
  reviews: code-reviewer, round 1, PASS, under 1 minute (run before the commit; docs-only)
  reports: reports/5-implementer-1.md, reports/5-review-1.md
  stage:   skills/code-review-pre-commit/SKILL.md, .claude-plugin/plugin.json (1.0.41 -> 1.0.42), tracker, reports/4-review-1.md, reports/5-implementer-1.md
  files:   as declared
  decisions: UNCOVERABLE inserted as gap-prompt step 3 (7 steps now); recipe on one line inside the existing fence
  budget:  about 6 of 15 calls
  gap:     xdist-present path (one merged coverage.xml) unverified here: no xdist installed. Owner verifies in a target repo with xdist (barra-risk-reports already runs -n auto with pytest-cov 7.1 + diff-cover 10.6).

STEP 6: PASS
  commit:  b274715
  gate:    hygiene 30/0 (red 29/1); "dist loadfile" in all three; COPY CHECK example 1, commit-prep 2, verify 1, SKILL 1; hygiene-snippet 1504 bytes unchanged; session-start 0; run-tests 39 files 0 failed; guards pass
  reviews: code-reviewer, round 1, PASS, under 1 minute
  reports: reports/6-implementer-1.md, reports/6-review-1.md
  stage:   .claude/hygiene-repos.json.example, instructions/hygiene-snippet.md, commands/commit-prep.md, commands/verify.md, README.md, src/hooks/test-pre-commit-hygiene.sh, .claude-plugin/plugin.json (1.0.42 -> 1.0.43), tracker, reports/5-review-1.md, reports/6-implementer-1.md
  files:   as declared
  decisions: smoke fallback left serial (step names only the targeted call)
  budget:  about 24 of 35 calls
  gap:     merged coverage.xml under real xdist unverified (same as step 5)

CLOSE-OUT LIST (advisories outside a step's file set, batched for one close-out step):
  - step 6: hygiene-snippet line 12 lost `.sqlite` and "serial otherwise" (README has both); smoke fallback serial; optional opt-in real-xdist coverage.xml case.
  - step 4: SKILL.md item 4 "§17's four tests" -> six; wrap the two long snippet lines.
  - step 3: 2.6 names where the ceiling lives (`max_tests_per_commit`); restore "new behaviour exercised against the invariant, inputs a reader would think of" in the TESTED lead-in.
  - step 2: run-tests.sh exits 0 on zero files found (wrong ROOT); add a fail-closed guard.
  - step 2: README "Every suite passes" — now true (step 4: 39 files, 0 failed); drop from list at close-out.
  - step 1: tighten Go `Test` regex (exclude `TestMain`, `Testing`); count JS `test.each`/`it.each`; add failing-direction rows for Go, C#, Rust; header case could use a visible testLines effect.
