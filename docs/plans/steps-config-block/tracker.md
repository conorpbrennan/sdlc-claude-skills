# Tracker: steps config block

Plan: docs/plans/steps-config-block.md. Branch: steps-config-block. Started 25 Oct 2026.
Owner authorisation D1 (plan Section 3): stage, commit and dispatch fix agents per step, this branch only. No push, no merge.

## RESUME

Next action: dispatch the step 7 implementer (`pre-commit-hygiene.js` and `pre-pr-verify.js`; plan Section 5 step 7 plus Section 2; ASSUMES LANDED 1). Step 6 built (test-pending-review-gate 21/0, test-review-config 112/0, run-tests 43 files 0 failed), commit with this tracker pending review.
Last committed: step 5 `c7a1049`, step 4 `adf1d40`, step 3 `77d6cdb`, step 2 `c84818a`, step 1 `6af81c5`, commit 0 `81d7c19` (the plan).
Owner request, 25 Oct 2026 (during step 5): "ensure README updated". Step 12 rewrites the README "Turning steps off" section; at step 13 verify it covers every step and every alias, and that `/sdlc:steps` is documented.

## Step state

| Step | Status | Commit | Review rounds | Notes |
|---|---|---|---|---|
| 1 | committed | 6af81c5 | 1 (PASS) | test-steps 56/0; run-tests 41 files 0 failed |
| 2 | committed | c84818a | 1 (PASS) | test-steps-cli 50/0; run-tests 42 files 0 failed; named reader: owner at the end (D2) |
| 3 | committed | 77d6cdb | 1 (PASS) | test-steps-cli 91/0; test-review-config 107/0; run-tests 42 files 0 failed |
| 4 | committed | adf1d40 | 1 (PASS) | three shell suites 43/65/34 passed; uses `stepState` not `isStepOn` (needs warnings) |
| 5 | committed | c7a1049 | 1 (PASS) | pre-commit-review 534/0; 8 red rows before the change; reviewer: no critical or important; advisory: `evaluateTddOrderGate` has no default for `tddState` (missing throws TypeError, fails closed) |
| 6 | built | (this commit) | | test-pending-review-gate 21/0; test-review-config 112/0; both steps are guard steps so no honoured repo-off row |
| 7 | not started | | | |
| 8 | not started | | | |
| 9 | not started | | | |
| 10 | not started | | | |
| 11 | not started | | | |
| 12 | not started | | | |
| 13 | not started | | | |

## DISAGREEMENTS

- Step 1: the brief put `marketplace-autoupdate` before `session-instructions`; the implementer built the plan's order (`session-instructions` first). Plan is authoritative. No action.

## DECISIONS

- Step 4: the post-commit `skip-disabled` log carries no `via: 'step-off'`, because the step says to keep that log; H2 says a hook with a timing log logs `via: 'step-off'`. Reviewer ruled it acceptable: no hook in `src/hooks` uses a `via` field in the timing log, and the `skip-disabled` log already marks the off path. Settled; no action. Interpretation, not verified: the plan's H2 `via: 'step-off'` may only be meant for hooks that already pass a `via` to a `hook.end` log, such as `pre-commit-review.js` in step 5; steps 5 to 11 should follow each step's own text.
- Step 1 brief: the area and step table was written into the brief from the Section 1 table; one difference to check on return: the plan lists `session-instructions` before `marketplace-autoupdate` in `standalone`, the brief had them the other way round. `listSteps` order follows `AREAS`, so if the implementer followed the brief, the reviewer checks the order against the plan.

## Advisories outside a step's file set (batched into step 13)

- From step 1 review (IMPORTANT, committed with the gap named): `src/hooks/test-steps.js` CASES tests the repo-guard rule at one key shape only (`steps.review.review-gate`). Add two rows: `repo: { steps: { tdd: false } }` with step `tdd-mandate`, and `repo: { steps: { 'commit-conventions': { enabled: false } } }` with step `enforce-co-author`; both expect `on: true`, source `default`, warning `is read from the user file only; ignored`.
- From step 1 review (ADVISORY): set `TDD_MANDATE_CONFIG` to a missing file under the scratch dir in `scratch()` of `src/hooks/test-steps.js`, so no case reads the real `~/.claude/tdd-mandate.json`.
- From step 2 review (ADVISORY): `src/hooks/test-steps-cli.js` has no case for a usage error (exit 2: no subcommand, unknown subcommand, `--repo` without a value) or for running outside a repo with no `--repo`. Both work by hand. Add rows in step 13.
- From step 3 review (IMPORTANT, committed with the gap named): no test checks that `updateConfigFile` keeps the file mode (mutating `mode = fs.statSync(target).mode & 0o777` to `0o600` left both suites green). Add a row: pre-create the file with mode 0640, call `setMainModel`, assert the mode is still 0640. Add it in `src/hooks/test-review-config.js` in step 13.
- From step 3 review (ADVISORY): `steps-cli.js set` replaces a wrong-typed `steps` or area value (`"steps": []`, `"features": "off"`) with an object, with no notice. Print a note that the old value was replaced, or refuse with exit 1. Decide in step 13.
- From step 5 report (UNRELATED): header comments in `src/hooks/pre-commit-review.js` around the TDD mandate block still point at `lib/tdd-order.js mandateInForce`, and the TDD block's remedy text does not mention the new `steps.tdd` switch. Update the comment and the remedy text (and its test) in step 13 or step 12.
- From step 1 report (UNRELATED): `bash tools/run-tests.sh` takes about 111 s at -j 16, close to the 120 s default tool timeout. Run it with a long timeout or in the background.
