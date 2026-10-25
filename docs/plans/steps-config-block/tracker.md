# Tracker: steps config block

Plan: docs/plans/steps-config-block.md. Branch: steps-config-block. Started 25 Oct 2026.
Owner authorisation D1 (plan Section 3): stage, commit and dispatch fix agents per step, this branch only. No push, no merge.

## RESUME

Next action: step 12 built (README, example config, CLAUDE.md; plugin 1.0.78). Stage, attempt the commit, review in a throwaway worktree. Then step 13 (close-out).
Last committed: step 11 `1d46a5a`, step 10 `f4d9d3f`, step 9 `11e637f`, step 8 `46ef586`, step 7 `8eae77e`, step 6 `d58a18d`.
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
| 6 | committed | d58a18d | 1 (PASS) | test-pending-review-gate 21/0; test-review-config 112/0; both steps are guard steps so no honoured repo-off row; reviewer advisory: test-review-config.js does not set CLAUDE_CONFIG_DIR or TDD_MANDATE_CONFIG (harmless for plan-review; set them in step 13) |
| 7 | committed | 8eae77e | 1 (PASS) | hygiene suite 31/0; verify suite 63/0 (enforce mode, off approves); reviewer IMPORTANT, committed with the gap named: older cases in test-pre-commit-hygiene.sh do not isolate the user's sdlc-review.json |
| 8 | committed | 46ef586 | 1 (PASS) | co-author 54/0; attribution-note 7/0; notify 10/0; all three are guard steps so no honoured repo-off row; reviewer advisories: no test for a steps.js-missing variant of the co-author crash (covered by the commit-command.js case); the co-author table merges stderr into stdout so it cannot prove H4 by itself |
| 9 | committed | 11e637f | 1 (PASS) | orchestrator-mode 176/0; enforce-review-implementer 6/0; non-guard area so repo off honoured; reviewer advisories committed with the gaps named |
| 10 | committed | f4d9d3f | 1 (PASS) | agent-tier-gate 145/0 (16 STEP_CASES rows); read-trim 29/0; non-guard area so repo off honoured; default path byte-identical to HEAD on 4 inputs |
| 11 | committed | 1d46a5a | 1 (PASS) | session-start-instructions 556/0; 0 critical, 0 important; cache-ttl alias warns, no write |
| 12 | committed | 6df66dd | 1 (PASS, run after the commit: docs-only commits are not gated) | reviewer ran the CLI in a real git scratch repo: guard warning text, alias-wins and all 13 old alias rows confirmed; advisory (R2 "warns on false") applied in step 13 |
| 14 | built, in review | | | Added after `/sdlc:verify` FAILed on 4f1c522 (row 1: `test-enforce-co-author.sh` "steps block table" flaked; row 3 UNVERIFIED, ids not compared to the Section 1 table). Cause: `echo \| grep -q` SIGPIPE under pipefail, reproduced 2 in 30 under load, 0 in 30 after the fix. Six pipes fixed in test-enforce-co-author.sh (14), 13 more in test-stop-hook.sh, test-post-commit-hook.sh and test-pre-commit-hygiene.sh (14b), which closes the gap named in the step 13 commit. Test-only change. Next: commit, rerun `/sdlc:verify` on the new HEAD. |
| 13 | committed | 4f1c522 | 1 (PASS) | 13a tests/docs, 13b hook source, 13c fix (`/sdlc:steps` literal in pre-commit-review.js broke test-plugin-layout; now `cmd('steps')`). run-tests 46 files 0 failed. Gaps named: four `echo ... \| grep -q` checks remain in test-pre-commit-hygiene.sh (lines 36, 37, 146, 627); `enforce-review-implementer.js` missing-lib behaviour left as is, header comment corrected; analyser does not pair hook.start/hook.end so hygiene's unpaired step-off end is harmless |

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
- From step 7 review (IMPORTANT, committed with the gap named): `src/hooks/test-pre-commit-hygiene.sh` older cases (outside the new step table) do not export `SDLC_REVIEW_CONFIG_USER`, `CLAUDE_CONFIG_DIR` or `TDD_MANDATE_CONFIG`; run directly with `{"steps":{"hygiene":false}}` in the user file, 15 of 31 fail. Export the three to scratch paths once at the top of the suite. `tools/run-tests.sh` already isolates `SDLC_REVIEW_CONFIG_USER`.
- From step 7 review (ADVISORY, unverified): the hygiene red-by-mutation was not reproduced by the reviewer (scratch layout lacked `hygiene-repos.json.example`); the implementer's red run is the only evidence. On hygiene's off path `hook.start` is not logged, only `hook.end` with `via: 'step-off'`; the reviewer did not check whether `tools/analyze-review-timing.py` pairs start and end events. Check in step 13.
- From step 9 review (ADVISORY): with the orchestrator mode on and a malformed config, each inline Bash call prints the config warning twice (once from `stepIsOff`, once from the existing `nudgeThreshold`). Resolve once per event. Stderr only.
- From step 9 review (ADVISORY): a missing `lib/steps.js` makes `orchestrator-mode.js` and `enforce-review-implementer.js` exit 1 with a stack trace and no stdout (non-blocking in Claude Code), not the silent exit 0 the orchestrator-mode header comment promises. Matches other hooks with a missing lib. Fix the header comment or catch the require, decide in step 13.
- From step 10 review (ADVISORY): `src/hooks/read-trim.js` reads the resolver for any sub-agent whole-file Read, including a 2-byte one (about 3 ms a call, and a config warning on reads the hook would ignore). `trimRead` is pure: call it first, then `stepIsOff` only when it returns non-null. Same behaviour, cheaper. Do it in step 13.
- From step 10 review (ADVISORY): `STEP_CASES` in `src/hooks/test-agent-tier-gate.js` has no row for the plan-edit deny or the `TIER: opus: user asked` ask with `agent-tier-gate` off (both live in the Opus branch and are dropped by design). Add two rows in step 13.
- From step 10 review (ADVISORY): a missing `lib/steps.js` makes both hooks exit 1 with a stack trace and no stdout (no deny). Same as every other missing lib.
- From the step 11 gate (DIAGNOSED, pre-existing, not caused by steps 1 to 11): `test-pre-commit-hygiene` fails about 1 run in 15 under `tools/run-tests.sh` load. Cause: `src/hooks/test-pre-commit-hygiene.sh:539` pipes `printf` into `grep -q` under `set -euo pipefail`; `grep -q` exits at its first match, `printf` can get SIGPIPE (141), the pipeline fails and the `if` takes the FAIL branch with the text correct. Fix: use here-strings (`grep -q 'no tests match' <<<"$SMOKE_OUT" && grep -q WARNING <<<"$SMOKE_OUT"`), and the same for the other `printf ... | grep -q` checks in that suite (for example around line 468). Do it in step 13 or as a separate small fix; it is not step 11's change. Rerun `tools/run-tests.sh` once more if it fails on that file alone.
- From step 1 report (UNRELATED): `bash tools/run-tests.sh` takes about 111 s at -j 16, close to the 120 s default tool timeout. Run it with a long timeout or in the background.
