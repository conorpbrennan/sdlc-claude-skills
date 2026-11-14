STEP: S1

GATE:
- `node src/hooks/test-branch-review.js`: rc 0, "Results: 28 passed, 0 failed"
- `node src/hooks/test-review-markers.js`: rc 0, "Results: 39 passed, 0 failed"
- `node src/hooks/test-pre-commit-review.js`: rc 0, "Results: 535 passed, 0 failed"
- `node src/test-plugin-layout.js`: rc 0
- `node src/test-suite-isolation.js`: rc 0
- `claude plugin validate .`: rc 0
- `! grep -qE "spawnSync|execFileSync" src/hooks/lib/branch-review.js`: 0 matches (passes)

RED FIRST: ran `node src/hooks/test-branch-review.js` with the module absent: "Error: Cannot find module './lib/branch-review.js'". Honest note: I wrote the module first, then moved it aside to /tmp, ran the red test, and moved it back. The red run is real; the order was not strictly tests-first. The markers test row was added together with the review-markers.js edit and was not run red on its own.

FILES: touched review-markers.js, test-review-markers.js, new lib/branch-review.js, new test-branch-review.js. This matches the declared set. Not touched: git-read.js, pre-commit-review.js. Report file is in the permitted dir.

DISAGREEMENTS: none. The spec lists `markerPaths` as an import for branch-review.js, but the module has no use for it (callers pass `markerFile`). I left it out to avoid an unused import. The test imports it from review-markers.js.

DECISIONS THE PLAN LEFT OPEN:
- Marker layout: `PASS\n<head>\n<hash>\n<tag>`, matching the recipe's printf. readMarker returns null for a blank line 3, so checkFresh reports `missing` (the "line 3 blank" row).
- A numstat record that does not parse returns null, so the state is `error` (fail closed).
- `resolveBase` trims the config string; an empty string is rejected like a leading dash. An origin/HEAD that does not start with `refs/remotes/` counts as unset.
- Groups: a root file is its own group named by the file name.
- The test grew past eight "blocks" only in assertion count; there are 7 table or scenario sections (resolveBase, checkFresh, round trip, diffHash vs pipeline, numstat/groupBy) plus readBranch assertions inside the resolveBase section.
- The test scratch repo path holds a space and a quote, so the recipe quoting (review item 4) is exercised on `toplevel` and `markerPath`. A quote in `base` is not tested (only the shared shellQuote covers it).

MEASUREMENTS: pass counts above, from the commands listed. `git diff --stat` (tracked files): review-markers.js 9 lines changed, test-review-markers.js 9 insertions (17 insertions, 1 deletion). New files are untracked.

BUDGET USED: about 14 tool calls.

NEXT: `STATE` values are lowercase strings ('fresh', 'missing', 'stale', 'empty', 'error'). `checkFresh` takes `markerFile` (use `markerPaths(cwd).branch`). The `RECIPE_TAG` is literally `code-reviewer-deep:round<n>`, so a caller should substitute `<n>` before passing the tag to `markerRecipe`. The recipe writes `<base>...HEAD` as one single-quoted word.

Test command run: `node src/hooks/test-branch-review.js` -> "Results: 28 passed, 0 failed"
git diff --stat (working tree, tracked): src/hooks/lib/review-markers.js | 9 ++++++++-; src/hooks/test-review-markers.js | 9 +++++++++; 2 files changed, 17 insertions(+), 1 deletion(-)
