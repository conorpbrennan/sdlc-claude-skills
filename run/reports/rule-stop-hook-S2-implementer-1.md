# S2 implementer report (rule-reminder)

Status: DONE. Nothing staged or committed.

## Files touched
NEW: src/hooks/rule-reminder.js, src/hooks/test-rule-reminder.js.
EDIT: hooks/hooks.json (hook added to the single UserPromptSubmit entry after orchestrator-mode.js, timeout 5), src/hooks/lib/steps.js (conduct area: rule-stop-hook, rule-reminder), src/hooks/test-steps.js (step count 23 -> 24), src/test-plugin-layout.js (frozen wiring), README.md (hook table row; conduct row in the steps table lists both steps).
Not touched: features/statusline-windows-datadir.md (pre-existing modification).

## Red run
Before rule-reminder.js existed: `node src/hooks/test-rule-reminder.js` ended `1 passed, 10 failed`. Every spawn exited 1 (script missing). Cause is "script missing"; I did not make a stub to get a different red.
Example: `FAIL: error: invalid stdin prints nothing, exit 0 expected ["",0] actual ["",1]`.

## Gate
- `node src/hooks/test-rule-reminder.js`: 11 passed, 0 failed, exit 0.
- `grep -c '"UserPromptSubmit"' hooks/hooks.json`: 1.
- `bash tools/run-tests.sh`: `Files: 51  failed: 0`.
- `claude plugin validate .`: exit 0.

## Decisions
- Output is printed as a literal hookSpecificOutput object, as orchestrator-mode.js does for UserPromptSubmit. It does not use hook-output.js: that file exports only deny and notice, which are PreToolUse/PostToolUse shapes.
- Text is a 4-line block: a header and points (a), (b), (c).
- A first test run failed because I wrote the per-step off as `{steps:{'rule-reminder':false}}`. The resolver wants `{steps:{conduct:{'rule-reminder':false}}}`. I fixed the test, not the code.

## Disagreements
None.
