# Step 9 report (implementer 1)

## FILES CHANGED
- src/hooks/orchestrator-mode.js: `stepIsOff(cwd)` helper (calls `stepState('orchestrator-mode')`, warnings to stderr prefixed `orchestrator-mode: `), `OFF_LINE` built with `cmd('steps')`. Called only where the hook acts: trigger turn-on, Agent counter reset write, inline-Bash count/nudge, the deny (after the allowed-path check), and a SWITCH_PROMPT match.
- src/hooks/enforce-review-implementer.js: after the `!hasReview || !hasImpl` exit, `stepState('enforce-review-implementer', {cwd: hookData.cwd})`; off -> `approve()`.
- src/hooks/test-orchestrator-mode.js: ENV also sets CLAUDE_CONFIG_DIR and TDD_MANDATE_CONFIG to scratch; new STEP_CASES block (4 rows x trigger read, on prompt, Edit on code, 8th inline Bash).
- src/hooks/test-enforce-review-implementer.js (new): 4 H6 rows, a non-matching prompt, a stderr-prefix check.
- commands/orchestrate.md: item 2 says the off line can appear and `on` then has no effect.

## RED RUNS
Before the code: `node src/hooks/test-enforce-review-implementer.js | grep -c FAIL` -> 3 (the three off rows).
`node src/hooks/test-orchestrator-mode.js` (excerpt):
```
FAIL: area off in the user file: a trigger read writes no state   expected: false actual: true
FAIL: area off in the user file: the on prompt gives the off line and writes no state  ... actual: "Orchestrator mode: on (trigger: owner: ..."
FAIL: area off in the user file: an Edit on code is not denied   expected: null actual: "deny"
FAIL: area off in the user file: the eighth inline command gives no nudge and no count  actual: [{...8 inline commands...},8]
```
Same 4 failures for the step-off and repo-off rows (12 total).

## GATE OUTPUT
- `node src/hooks/test-orchestrator-mode.js`: 176 passed, 0 failed.
- `node src/hooks/test-enforce-review-implementer.js`: 6 passed, 0 failed.
- `bash tools/run-tests.sh`: Files: 45  failed: 0 (baseline 44 + the new suite).
- `node src/test-plugin-layout.js` rc 0; `node src/test-suite-isolation.js` rc 0; `claude plugin validate .` rc 0.

## DISAGREEMENTS
None.

## DECISIONS
- The SWITCH_PROMPT off line is returned for `on`, `off` and `status` alike, with no state write.
- On a Bash call with the mode on, the resolver is read before counting (the count write and nudge are the acts). Off: no count, no nudge. The Agent reset also checks the step, only when it would write.
- Deny: the allowed-path check runs first, so only a would-be deny reads config.
- Resolver exceptions count as on (unchanged behaviour; the hook already fails open).
- enforce-review-implementer passes `hookData.cwd || process.cwd()`, as enforce-co-author does.
- Tests cannot assert "an ordinary call never reads config" directly; it follows from the code placement.

## UNRELATED FINDINGS
None.
