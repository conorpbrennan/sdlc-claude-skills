# Step 1 report: steps.js

## FILES CHANGED
- NEW `src/hooks/lib/steps.js`
- NEW `src/hooks/test-steps.js` (13 CASES rows x on/source/warnings, plus alias, areasShape, neverThrows, rootWalk)
- EXTEND `src/hooks/lib/review-config.js`: exports `loadFile`, `userConfigPath`, `repoConfigPath` (export line only)
- EXTEND `tools/run-tests.sh`: exports `SDLC_REVIEW_CONFIG_USER="$WORK/no-user-sdlc-review.json"` beside `TIMING_LOG_PATH`
- `docs/plans/steps-config-block/tracker.md` shows modified in git status; not by me.

## RED RUNS
`node src/hooks/test-steps.js` before steps.js existed:
```
    at Object.<anonymous> (/home/coder/dev/sdlc-claude-skills/src/hooks/test-steps.js:9:15)
  code: 'MODULE_NOT_FOUND',
  requireStack: [ '/home/coder/dev/sdlc-claude-skills/src/hooks/test-steps.js' ]
Node.js v22.23.1
```
First green attempt: 55 passed, 1 failed (`areasShape: 24 steps`, actual 22). My test miscounted; the table has 22 ids. Test fixed, not the code.

## GATE OUTPUT
- `node src/hooks/test-steps.js`: `Results: 56 passed, 0 failed`
- `node src/hooks/test-review-config.js`: `Results: 107 passed, 0 failed`
- `grep -c SDLC_REVIEW_CONFIG_USER tools/run-tests.sh`: 3
- `grep -cE "spawn|execFile|writeFile" src/hooks/lib/steps.js`: 0
- `bash tools/run-tests.sh`: `Files: 41  failed: 0` (baseline 40 + test-steps.js)
- `node src/test-plugin-layout.js`: exit 0
- `node src/test-suite-isolation.js`: exit 0
- `claude plugin validate .`: exit 0

## DISAGREEMENTS
- Plan Section 1 lists `standalone` as `main-model, cache-ttl, session-instructions, marketplace-autoupdate`. The brief had `marketplace-autoupdate` before `session-instructions`. I built the plan's order (authoritative). Set of ids is identical.
- Brief said "13 rows". The CASES table has 13 rows; the config-dir aliases (main-model, cache-ttl, marketplace-autoupdate) and the opt-in detail are covered in an extra block outside CASES.

## DECISIONS
- Guard-area repo `false` warnings are emitted while validating the repo file, once per key present (not per requested step). Text: `<repo file>: <key> is read from the user file only; ignored`.
- Alias detail: alias reason and `block says on; the alias wins` joined by `; ` when both apply.
- Opt-in detail names the file: `hygiene-repos.json` for `pre-commit-hygiene`, `verify-repos.json` for `pre-pr-verify`. Shown only when the step is on (cleared when a block turns it off).
- `mandateInForce(repoRoot)` is called with no `configPath`, so it reads the real `~/.claude/tdd-mandate.json` exemptions. A temp repo path will not match any.
- `main-model` alias reads `userFile.data.mainModel` from the `loadFile` result and compares to `reviewConfig.MAIN_MODEL_OFF`.
- Also exported `findRepoRoot` and `listSteps` beyond the named exports.
- Exception handling: per-step try/catch plus an outer one; a failure gives `on: true`, source `default`, warning ending `; treated as on`.

## UNRELATED FINDINGS
- `bash tools/run-tests.sh` takes about 111 s at -j 16, which exceeds the default 120 s tool timeout when chained with other commands.
