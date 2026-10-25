# Step 11 report: session-start-instructions honours the four standalone steps

## FILES CHANGED
- src/hooks/session-start-instructions.js: requires lib/steps.js (`stepStates`, `configDir`, `CACHE_TTL_OPT_OUT`, `AUTO_UPDATE_OPT_OUT`, `SOURCE_ALIAS`). Removed its own `configDir`, `CONFIG_DIR_ENV`, `OPT_OUT_FILE`, `AUTO_UPDATE_OPT_OUT_FILE`. New `resolveSteps(cwd)` (one `stepStates` call for the four ids; warnings to stderr, one line each, prefix `session-start-instructions: `; on a throw, every step stays on). `build()` gates each part on its state. `cacheTtlWarning(cwd, optedOut)` takes the alias flag in place of its `existsSync`. `emit('')` prints nothing. Header bullet rewritten.
- src/hooks/test-session-start-instructions.js: suite-level exports of `CLAUDE_CONFIG_DIR`, `SDLC_REVIEW_CONFIG_USER`, `TDD_MANDATE_CONFIG` to a scratch dir; `run()` strips `CLAUDE_CONFIG_DIR` and `TDD_MANDATE_CONFIG` from the child env (old cases use scratch HOME, so none reads real files); `scratch()` copies `lib/` with `fs.cpSync`; new `STEP_CASES` table (9 rows, 11 asserts each).

## RED RUNS
Before the hook change, `node src/hooks/test-session-start-instructions.js`:
```
  FAIL: session-instructions off: sections -- expected false, got true
  FAIL: main-model off: model line -- expected false, got true
  FAIL: main-model off: model in settings -- expected "opus", got "sonnet"
  FAIL: cache-ttl off by the block: ttl written -- expected false, got true
  FAIL: cache-ttl off by the block: promptCacheTtl in settings -- expected undefined, got "1h"
  FAIL: marketplace-autoupdate off: autoUpdate in settings -- expected false, got true
  FAIL: all four off: one backup per write -- expected 0, got 3
  FAIL: all four off: nothing printed -- expected "", got "{\"hookSpecificOutput\":...
  FAIL: repo off for session-instructions: sections -- expected false, got true
```
(20 FAIL lines; the first draft used a wrong `steps` shape, the real shape is `steps.standalone.<id>`, fixed in the test, still red for the reasons above.)

## GATE OUTPUT
- `node src/hooks/test-session-start-instructions.js`: `Results: 556 passed, 0 failed`
- `grep -c "OPT_OUT_FILE = \|function configDir" src/hooks/session-start-instructions.js`: `0`
- `node src/test-plugin-layout.js`: exit 0; `node src/test-suite-isolation.js`: exit 0; `claude plugin validate .`: exit 0
- `bash tools/run-tests.sh`: `Files: 45  failed: 0` on 3 of 6 full runs. The other 3 failed one file each, see UNRELATED FINDINGS.

## DISAGREEMENTS
None.

## DECISIONS
- Alias detection uses `state.source === SOURCE_ALIAS` (exported by steps.js), so no constant is redefined. cache-ttl off by alias: `cacheTtlWarning(cwd, true)` warns, writes nothing, no backup. cache-ttl off by block: no call.
- autoupdate off by alias is off in the resolver, so `autoUpdateLines` lost its own opt-out check; the opt-out file name in its message comes from `AUTO_UPDATE_OPT_OUT`.
- Table row "all four off" sets `steps.standalone: false`; "repo off" row needs a `.git` dir in the scratch cwd (the repo root marker) and the `standalone` area (non-guard, repo honoured).
- A failed lookup keeps every step on (prior behaviour) and warns on stderr.
- The mainModel read inside the hook is unchanged (still reads the user file directly; out of scope).

## UNRELATED FINDINGS
- Under `tools/run-tests.sh` load, one file failed in 3 of 6 runs, different ones: `test-session-start-instructions.js` once (before I fixed the `.git` marker in the repo row), and `test-pre-commit-hygiene.js` ("no-smoke path did not say so and warn") once. The latter passes alone, also on the stashed baseline (3 of 3). Load-flaky, not caused by this step.
- I ran `git stash`/`pop` once; the staged `features/steps-config-block.md` was restored to staged. Nothing else staged by me.
