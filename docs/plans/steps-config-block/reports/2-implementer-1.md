# Step 2 report: /sdlc:steps list

## FILES CHANGED
- NEW `src/hooks/steps-cli.js`
- NEW `src/hooks/test-steps-cli.js` (LIST_CASES 5 rows, plus --json, bad-config blocks)
- NEW `commands/steps.md`

## RED RUNS
`node src/hooks/test-steps-cli.js` before steps-cli.js existed:
```
  FAIL: no config: every line default: exit
  FAIL: no config: every line default: has 'orchestration orchestrator-mode on default'
  FAIL: no config: every line default: has 'orchestration enforce-review-implementer on default'
```
(the run then crashed at the --json block: JSON.parse of empty stdout.)

## GATE OUTPUT
- `node src/hooks/test-steps-cli.js`: `Results: 50 passed, 0 failed`
- `bash tools/run-tests.sh`: `Files: 42  failed: 0`
- `node src/test-plugin-layout.js`: exit 0
- `node src/test-suite-isolation.js`: exit 0
- `claude plugin validate .`: exit 0

## DISAGREEMENTS
None.

## DECISIONS
- The "alias (<path or key>)" label uses `state.key` as steps.js sets it.
- The user-file label is `user file (<key>)`; with no key it prints the bare label.
- Usage errors (unknown command or argument, `--repo` without a value) exit 2. Bad config always exits 0.
- Tests collapse runs of spaces, so column widths are not asserted.
- Added a "bad config still exits 0" block beyond the five LIST_CASES rows.
- `commands/steps.md` has no plugin-root fallback logic; it uses `${CLAUDE_PLUGIN_ROOT}` as briefed.

## UNRELATED FINDINGS
None.
