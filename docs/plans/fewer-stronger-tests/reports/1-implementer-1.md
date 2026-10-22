STEP: 1 (measurement tool and baseline)

GATE:
- `node src/hooks/test-added-tests.js` -> exit 0, "48 passed, 0 failed".
- `node tools/measure-tests.js --range a9a685e~40..a9a685e` -> prints "test lines per source line: 2.00 (6034 / 3014)" over 55 code commits. The plan's scratchpad figure is 1.20. The two differ (see DECISIONS and NEXT).
- `node src/test-plugin-layout.js` -> exit 0, 154 passed, 0 failed.
- `node src/test-suite-isolation.js` -> exit 0, 42 passed, 0 failed.
- `claude plugin validate .` -> exit 0, "Validation passed with warnings" (warnings not inspected; none from this step's files expected).

RED FIRST: `node src/hooks/test-added-tests.js` before the lib existed: "Error: Cannot find module './lib/added-tests.js'" (MODULE_NOT_FOUND from the test's require).

FILES: touched exactly the declared set, all new and untracked: src/hooks/lib/added-tests.js, tools/measure-tests.js, src/hooks/test-added-tests.js. No difference.

DISAGREEMENTS: none against the plan. One harness note: a command using a shell loop with `$c` as the command name was blocked by the PRE_COMMIT_GATE hook (computed command name); I reran the gates as separate plain commands.

DECISIONS THE PLAN LEFT OPEN:
- testLines and sourceLines count added non-blank, non-comment lines, using `isNonCommentLine` from tdd-order.js (not restated). The spec's "test file with only a comment added" case implies comments do not count. Source lines are source-extension files that are not test files.
- Test file with an extension in no language row (e.g. .sh) contributes testLines but no testFunctions.
- `parametrised` counts `parametrize(` (Python) and `[Theory]` (C#) occurrences; it is a count of decorators, not rows. The three-row case gives 1.
- `singleAssert`/`mockOnly`: null unless the diff adds a Python test file; 0 when it does but none match. A body's end is the next line at indent <= the def's. A mock assertion is `assert_called*`/`assert_not_called`/`assert_any_call`/`assert_has_calls`/`call_count`; a plain one is `assert ...` or `.assertXxx(`. singleAssert = exactly one assertion of either kind (so a lone mock assert counts as single and as mock-only). mockOnly = mock assertions and no plain ones.
- JS pattern anchored to line start (`test(`/`it(`, with `.only`/`.skip`), so `latest(` does not match; Java `@Test`; Go `^func Test`; Rust `#[test]`; C# `[Fact]`/`[Theory]`. `.ts/.tsx/.jsx` share the JS row. All are applied only to files that tdd-order calls tests.
- byFile entries are `{testFunctions, testLines, sourceLines, python}`; `python` is extra to the spec and lets the tool compute the single-assert share over Python test functions only.
- Diffs without `diff --git` lines are not split into files (the `+++ ` header is only read outside a hunk, and `diff --git` resets state). `git show` always emits them.

MEASUREMENTS (command: `node tools/measure-tests.js --range a9a685e~40..a9a685e`):
- code commits 55; median test functions per code commit 0; test lines per source line 2.00 (6034/3014); parametrised share 0; single-assert share (Python) 0.40; mock-only total 0.
- top ratios: ce835c10 51, 3d17fafa 48, 9195ea43 23, c8547190 15, 34f44190 13.20 (the first four have 1 source line).
- Plan's figure 1.20 is not reproduced. Likely causes: my count drops comments and blanks from both sides, and `--unified=0` on source-extension commits includes test-only commits with tiny source counts; the scratch script's definition is unknown.

BUDGET USED: about 12 tool calls against about 30.

NEXT:
- The 2.00 vs 1.20 gap needs a decision before step "after" numbers are compared: the baseline recorded for later steps should be the figure this tool prints (2.00), not 1.20. Say so in the tracker.
- Median test functions per commit is 0 because most code commits add no test functions in a language row (the repo's tests are .js using a custom `assert`, not `test(`/`it(`). Tests in this repo are invisible to testFunctions; testLines is the usable measure here.
- `--json` output includes the per-commit-folded summary only, not per-commit rows.

Test command run: `node src/hooks/test-added-tests.js` -> `48 passed, 0 failed`.

git diff --stat (working tree; all new, untracked, nothing staged):
- src/hooks/lib/added-tests.js (new)
- src/hooks/test-added-tests.js (new)
- tools/measure-tests.js (new)
