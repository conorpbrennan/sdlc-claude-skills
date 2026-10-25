# Step 7 report: pre-commit-hygiene and pre-pr-verify honour their steps

## FILES CHANGED
- src/hooks/pre-commit-hygiene.js: requires lib/steps; after the not-a-commit approve, `stepState('pre-commit-hygiene', { cwd })`; off logs `endHook('approve', { via: 'step-off' })` and approves. Before hook.start, git calls and the opt-in read.
- src/hooks/pre-pr-verify.js: requires lib/steps; after `if (!isPrCreate(command)) approve();`, `stepState('pre-pr-verify', { cwd })`; off approves (any mode), before the verify-repos read.
- src/hooks/test-pre-commit-hygiene.sh: table of 4 rows (default blocks; area off in user file; step off in on area; repo off beats user on). Opted-in repo with a failing check.
- src/hooks/test-pre-pr-verify.js: section (k), same 4 rows in enforce mode with no marker, plus unlisted repo still approves.

Warnings (H4) go to stderr as `<hook>: <line>`.

## RED RUNS (quoted)
Hygiene (before code): `step row 'hygiene area off in the user file: approves': expected approve, got: {"hookSpecificOutput":...,"permissionDecision":"deny",...Hygiene check failed: always-fail...}` (same for the step-off and repo-off rows); `FAIL: steps block table`; `Results: 30 passed, 1 failed`.
Verify (before code): `FAIL: verification area off in the user file: approves / expected {"decision":"approve"} / actual {...permissionDecision":"deny"... Verification is missing...}`; same for step-off and repo-off rows.

## GATE OUTPUT (tails)
- `bash src/hooks/test-pre-commit-hygiene.sh`: `Results: 31 passed, 0 failed`
- `node src/hooks/test-pre-pr-verify.js`: `Results: 63 passed, 0 failed`
- `bash tools/run-tests.sh`: `Files: 43  failed: 0`
- `node src/test-plugin-layout.js` rc 0; `node src/test-suite-isolation.js` rc 0; `claude plugin validate .` rc 0.

## DISAGREEMENTS
None.

## DECISIONS
- Used `stepState` (not `isStepOn`) to surface warnings, as steps 4 to 6.
- Hygiene resolver sits before `hook.start` logging, so an off call logs only the `step-off` hook.end.
- Tests do not assert on stderr rows (no warning case in the required H6 rows).
- The unlisted-repo check is in the verify suite only; the hygiene opt-in path is unchanged (existing case 1 covers unlisted).

## UNRELATED FINDINGS
None.
