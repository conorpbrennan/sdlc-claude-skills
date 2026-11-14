STEP: S4. branchReview section in sdlc-review.json and `branch-review` CLI subcommand.

GATE:
- `node src/hooks/test-review-config.js` -> "Results: 120 passed, 0 failed", exit 0.
- `node src/hooks/test-steps.js` -> "Results: 62 passed, 0 failed" (the echoed rc was tail's; the suite line shows 0 failed).
- `node src/test-plugin-layout.js` -> exit 0.
- `node src/test-suite-isolation.js` -> exit 0.
- `claude plugin validate .` -> exit 0.
- `SDLC_REVIEW_CONFIG_USER=/tmp/nonexistent-x.json node src/hooks/review-config-cli.js branch-review` -> `{"model":"opus","maxRounds":2,"maxChangedLines":25000,"warnings":[]}`, exit 0.

RED FIRST: the table rows call `cfg.resolveBranchReview`. Before the implementation: `TypeError: cfg.resolveBranchReview is not a function at src/hooks/test-review-config.js:239:19`.

FILES: touched `src/hooks/lib/review-config.js`, `src/hooks/review-config-cli.js`, `src/hooks/test-review-config.js`, `.claude/sdlc-review.json.example`. Exactly the declared set. This report is an always-permitted path.

DISAGREEMENTS: the step says `resolveBranchReview({ repoRoot })` goes "through resolveSection"; the real signature is positional `resolveSection(repoRoot, section, spec)`. Called that way, as `resolvePlanReview` does. No other disagreement.

DECISIONS THE PLAN LEFT OPEN:
- The `branch-review` CLI joins the cwd-not-in-git warning with the section warnings, as `plan-review` does. No step-enable fields were added.
- Test blocks: one 6-row table (5 specified rows plus a row proving the top-level `maxRounds: 7` does not leak into `branchReview`) and one child-process CLI block. That is 2 blocks, within the limit of 4. The table asserts [model, maxRounds, maxChangedLines, warning count].
- Example `_comment` names the three keys inside a sentence about `branchReview`.

MEASUREMENTS: 120 passed in test-review-config.js and 62 passed in test-steps.js (commands above). `git diff --stat -- src .claude`: 4 files changed, 55 insertions, 4 deletions.

BUDGET USED: about 7 tool calls, one round, inside the stated 20 calls.

NEXT: `resolveBranchReview` is exported from `src/hooks/lib/review-config.js` and returns `{ model, maxRounds, maxChangedLines, warnings }`. The CLI prints the same shape. `resolveReview` and the top-level `maxRounds` were not touched.

Test command: `node src/hooks/test-review-config.js` -> `Results: 120 passed, 0 failed`.
git diff --stat:
 .claude/sdlc-review.json.example | 3 ++-
 src/hooks/lib/review-config.js   | 13 ++++++++++++-
 src/hooks/review-config-cli.js   | 11 +++++++++--
 src/hooks/test-review-config.js  | 32 ++++++++++++++++++++++++++++++++
