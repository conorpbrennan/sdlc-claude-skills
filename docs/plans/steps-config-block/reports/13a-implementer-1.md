# 13a implementer report (round 1)

Status: DONE. Nothing staged or committed. Only test files and README.md edited.

## Per item
1. test-steps.js: two CASES rows added (tdd:false -> tdd-mandate; commit-conventions {enabled:false} -> enforce-co-author). Both on:true, source default, warning "is read from the user file only; ignored". Pass.
2. test-steps.js scratch(): TDD_MANDATE_CONFIG set to a missing file under the case dir.
3. test-steps-cli.js: new "usage errors" block. No subcommand, unknown subcommand, `list --repo` with no value: all exit 2 with usage on stderr. Outside a repo with no --repo (cwd = sandbox, not a repo): the CLI does NOT error; `list` exits 0 and prints every step on default. Asserted that (exit 0, all steps "on default").
4. test-review-config.js: CLAUDE_CONFIG_DIR and TDD_MANDATE_CONFIG set to scratch paths at the top. New row: file pre-created at 0640, setMainModel('opus') ok, mode still 640. (Row sits before the sandbox cleanup.)
5. test-pre-commit-hygiene.sh: every `printf '%s' "$X" | grep ...` (lines 491-495, 507-508, 521-522, 539, 572-573) now uses a here-string. The remaining `echo | grep -q` at lines 36, 37, 146, 627 were left: the task named printf pipes only. Same SIGPIPE risk applies in principle (small inputs, low risk); say if you want them changed. Exports for SDLC_REVIEW_CONFIG_USER, CLAUDE_CONFIG_DIR, TDD_MANDATE_CONFIG added after TMPROOT. Ran 5 times in a row: rc=0 x5.
6. test-agent-tier-gate.js: two STEP_CASES rows with agent-tier-gate off. Plan-edit deny (opus, "TIER: opus: plan writing" + "Revise the existing plan") and "TIER: opus: user asked". Real behaviour: both are dropped; the hook passes opus through with only the budget appended (expect [null,'opus',true]). No deny, no ask.
7. README.md rule R2 now: "`/sdlc:steps` warns when the repo value is `false`, and ignores the key."
8. Investigation, no edit: tools/analyze-review-timing.py does not pair start and end events. It never reads `hook.start`. It uses only `hook.end` events with hook == 'pre-commit-review' (line 100) for fast-path rates, plus hygiene.check events (line 150) for hygiene. An unpaired hygiene `hook.end` (via: step-off) is not counted at all, so nothing breaks.

## Gate (all exit 0)
- node src/hooks/test-steps.js: 62 passed, 0 failed
- node src/hooks/test-steps-cli.js: 99 passed, 0 failed
- node src/hooks/test-review-config.js: 113 passed, 0 failed
- node src/hooks/test-agent-tier-gate.js: 147 passed, 0 failed
- bash src/hooks/test-pre-commit-hygiene.sh x5: rc=0 each; last run 31 passed, 0 failed
