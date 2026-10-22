STEP: 2. Parallel runner `tools/run-tests.sh`, isolated from the real timing log.

GATE:
- `bash tools/test-run-tests.sh`: exit 0, "Results: 14 passed, 0 failed".
- `bash tools/run-tests.sh`, three consecutive runs: each exit 1, 39 files, one failing file only, `rc=1 src/hooks/test-session-start-instructions.js`. `node src/hooks/test-session-start-instructions.js | grep FAIL` shows one line: "at least 1500 characters of headroom -- expected true, got false". Plus the pytest WARNING line each run.
- Elapsed: 18036, 17761, 18820 ms (-j 16). Serial loop over the same files in the same session (node files, then bash files, `TIMING_LOG_PATH=/dev/null`): 72184 ms. 18.4/72.2 = 25%, under the 40% limit.
- `grep -c "repo[0-9]\|targeted-" ~/.claude/code-review-timing.jsonl`: 104 before, 104 after the three runs. (The serial loop used /dev/null, so it did not touch the log either.)
- `node src/hooks/test-added-tests.js`: exit 0.
- `node src/test-plugin-layout.js`: exit 0. `node src/test-suite-isolation.js`: exit 0. `claude plugin validate .`: "Validation passed with warnings".
- Review item 1 (broken file makes the runner exit non-zero): proven by the "failing suite" rows of `tools/test-run-tests.sh` (fixture root under `mktemp -d` with a failing .sh and .js; runner exits 1, rc=1 lines printed).

RED FIRST: `bash tools/test-run-tests.sh` before `tools/run-tests.sh` existed: "Results: 4 passed, 10 failed" (e.g. "FAIL: failing suite: rc line 'rc=1 src/hooks/test-fixture.sh'", "FAIL: failing suite: sh suite saw TIMING_LOG_PATH exported"). The 4 passes were the "did not see the real timing log" rows, which pass vacuously with no runner; the exit-code, rc-line and exported rows were red.

FILES: New: `tools/run-tests.sh`, `tools/test-run-tests.sh`. Edited: `CLAUDE.md`, `README.md`, `skills/code-review-implementer/SKILL.md`, `src/hooks/test-session-start-instructions.js`. NOT touched, though listed as EXTEND: `src/hooks/test-pre-commit-feature.sh`, `src/hooks/test-pre-commit-hygiene.sh`. No parallel-only failure reproduced in 3 gate runs plus the 4 full runs I made, so there was nothing to fix. The files are not touched, and no difference outside the declared set.

DISAGREEMENTS:
- `src/hooks/test-session-start-instructions.js`: the plan says five `ctx.includes('WARNING')` assertions; there are five (lines 253, 272, 281, 289, 296), all changed.
- README had no "tests paragraph" with prose to extend; it had a code block under `## Tests`. I replaced the block with the runner command plus one paragraph. The final README paragraph "Every suite passes" is now untrue (session-start headroom fails); that is pre-existing, I left it.
- CLAUDE.md lines were 41-42 as stated; SKILL.md lines 63-64 were actually 62-65; edited in place.

DECISIONS THE PLAN LEFT OPEN:
- Per-file rc for node files: `node --test` gives no per-file rc, so I use `--test-reporter=tap` and read the top-level `ok`/`not ok` line per file (rc shown as 0 or 1). If node fails but no file is reported failing, an extra `rc=<n> node --test (no per-file result)` line is added, so a non-zero is never swallowed.
- Bash files run through `xargs -P N -n1 bash -c '<wrapper>' _` (a wrapper to capture each file's rc and log), not bare `xargs ... bash`.
- rc line format: `rc=N path`, relative to ROOT. Failing bash files get their last 15 log lines printed.
- Node and bash run concurrently, pytest runs after both (it is skipped here anyway).
- `N` default `nproc`, fallback 4. Fixture suites also check the value is not under `$HOME/.claude/`.

MEASUREMENTS:
- Parallel total (`bash tools/run-tests.sh`, -j 16): 18036, 17761, 18820 ms. Source: the runner's own `Files:` line.
- Serial loop: 72184 ms. Command: a `for f in` loop over `src/hooks/test-*.js src/test-*.js tools/test-*.js` with `node`, then over `src/hooks/test-*.sh src/test-*.sh tools/test-*.sh` with `bash`, timed with `date +%s%N`.
- Ratio 25%. File count 39.
- Timing-log fixture-row count 104 before and after.

BUDGET USED: about 17 tool calls of the 35. One round.

NEXT:
- `src/hooks/test-session-start-instructions.js` still has one real FAIL (headroom). It makes the runner exit 1 on this branch until it is fixed or moved, so the later steps' "runner passes" checks must name it as the one known failure.
- The runner prints the pytest WARNING and skips `skills/plan-spec` here; pytest is not installed. The pytest branch is therefore untested in this environment.
- Parallel flakes did not reproduce (`test-pre-commit-hygiene.sh` and `test-pre-commit-feature.sh` passed in all 7 full runs), so those two files were left alone. If hygiene flakes later, check its shared `$TMPROOT`/git state first.
- The runner writes its scratch dir via `mktemp -d` and removes it on exit.

Test command run: `bash tools/test-run-tests.sh` -> "Results: 14 passed, 0 failed".

git diff --stat (working tree):
 CLAUDE.md                                    |  6 ++++--
 README.md                                    |  9 +++++++--
 skills/code-review-implementer/SKILL.md      |  7 ++++---
 src/hooks/test-session-start-instructions.js | 10 +++++-----
 4 files changed, 20 insertions(+), 12 deletions(-)
Untracked (new): tools/run-tests.sh, tools/test-run-tests.sh
