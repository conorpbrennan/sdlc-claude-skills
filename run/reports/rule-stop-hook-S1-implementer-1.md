# S1 implementer report: rule stop hook

Status: DONE. Nothing staged or committed.

## Files touched
- NEW `src/hooks/rule-stop-hook.js`, `src/hooks/test-rule-stop-hook.js`
- `hooks/hooks.json` (Stop entry, timeout 5, placed last), `src/hooks/lib/steps.js` (area `conduct`), `src/hooks/test-steps.js` (22 -> 23 steps), `README.md` (hook table line + steps table row)
- `src/test-plugin-layout.js` (not in the listed set): its frozen EXPECTED_WIRING had to gain the `Stop` event, or run-tests failed. Reviewer: confirm this is acceptable.
- `steps-cli.js` needed no change (reads AREAS).

## Red run
`node src/hooks/test-rule-stop-hook.js` before the hook existed:
`FAIL: sample do you want me to: exit 0  expected: 0  actual: 1` (script missing; every spawn fails).

## Gate
- `node src/hooks/test-rule-stop-hook.js`: 27 passed, 0 failed, rc 0 (7 samples, reason text, loop guard, step off, 4 error cases, log line, log-write failure).
- `node src/hooks/test-steps.js`: 62 passed, 0 failed.
- `bash tools/run-tests.sh`: Files 50, failed 0.
- `claude plugin validate .`: exit 0 (passed with warnings).

## Decisions
- Step check: `stepState('rule-stop-hook', {cwd})`; area-level `steps.conduct:false` switches it off (tested).
- "let me know" regex narrowed to "let me know which" per plan (start code had if/whether).
- `sso` gate word now `\bsso\b` so "assorted" is not a gate.
- Log tail is the last 200 chars of the 3-line tail, so the question stays in it.
- Stop block output is printed directly as `{decision, reason}`; `hook-output.js` has no Stop helper and I did not add one.
- Stop placed after PostToolUse in hooks.json to keep event order in the layout test.
- Stepping errors in the step check fail open (print nothing).

## Disagreements
None. Minor: unused variable `offFile` in the test (harmless).
