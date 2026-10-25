# Steps Config Block

**Requirement**: A `steps` block in `sdlc-review.json` (user file and repo file) lets each sdlc workflow area and each step inside it be turned off, with a shared resolver every hook consults and a `/sdlc:steps` command that lists every step with its state and source and toggles one. Everything defaults to on, a bad file never switches a gate off, the commit-guarding areas (tdd, review, commit-conventions) switch off from the user file only, and the existing `.disabled` files and opt-ins keep working as aliases.

**Started**: 2026-10-25
**Last updated**: 2026-10-25
**Branch**: steps-config-block
**Plan**: docs/plans/steps-config-block.md

## Acceptance

1. `bash tools/run-tests.sh` exits 0 with every file `rc=0`.
2. `claude plugin validate .` exits 0.
3. `node src/hooks/steps-cli.js list` prints one line per step id in the plan's Section 1 table and the guard footer.
4. With `{"steps":{"features":false}}` in the user `sdlc-review.json`, `node src/hooks/steps-cli.js list` shows the three features steps off with source `user`.
5. With `{"steps":{"tdd":false}}` only in a repo `sdlc-review.json`, the tdd step stays on and a one-line warning names the file and key.
6. With invalid JSON in the user `sdlc-review.json`, every step stays on and a warning is printed.
7. `grep -ln "feature-tracking.disabled')\|mandateInForce(" src/hooks/*.js | grep -v /test-` prints nothing: no hook reads an alias itself.

## Files involved

- .claude-plugin/plugin.json
- README.md
- commands/orchestrate.md
- commands/steps.md
- docs/plans/steps-config-block/reports/1-implementer-1.md
- docs/plans/steps-config-block/reports/10-implementer-1.md
- docs/plans/steps-config-block/reports/11-implementer-1.md
- docs/plans/steps-config-block/reports/13a-implementer-1.md
- docs/plans/steps-config-block/reports/13b-implementer-1.md
- docs/plans/steps-config-block/reports/13c-fix-1.md
- docs/plans/steps-config-block/reports/14-fix-1.md
- docs/plans/steps-config-block/reports/14b-fix-1.md
- docs/plans/steps-config-block/reports/2-implementer-1.md
- docs/plans/steps-config-block/reports/3-implementer-1.md
- docs/plans/steps-config-block/reports/4-implementer-1.md
- docs/plans/steps-config-block/reports/5-implementer-1.md
- docs/plans/steps-config-block/reports/6-implementer-1.md
- docs/plans/steps-config-block/reports/7-implementer-1.md
- docs/plans/steps-config-block/reports/8-implementer-1.md
- docs/plans/steps-config-block/reports/9-implementer-1.md
- docs/plans/steps-config-block/tracker.md
- skills/plan-spec/SKILL.md
- src/hooks/agent-tier-gate.js
- src/hooks/claude-attribution-note.js
- src/hooks/enforce-co-author.js
- src/hooks/enforce-review-implementer.js
- src/hooks/lib/review-config.js
- src/hooks/lib/steps.js
- src/hooks/orchestrator-mode.js
- src/hooks/pending-review-gate.js
- src/hooks/post-commit-feature.js
- src/hooks/post-commit-notify.js
- src/hooks/pre-commit-feature.js
- src/hooks/pre-commit-hygiene.js
- src/hooks/pre-commit-review.js
- src/hooks/pre-pr-verify.js
- src/hooks/read-trim.js
- src/hooks/review-config-cli.js
- src/hooks/session-start-feature.js
- src/hooks/session-start-instructions.js
- src/hooks/steps-cli.js
- src/hooks/test-agent-tier-gate.js
- src/hooks/test-claude-attribution-note.sh
- src/hooks/test-enforce-co-author.sh
- src/hooks/test-enforce-review-implementer.js
- src/hooks/test-orchestrator-mode.js
- src/hooks/test-pending-review-gate.js
- src/hooks/test-post-commit-feature.sh
- src/hooks/test-post-commit-hook.sh
- src/hooks/test-post-commit-notify.js
- src/hooks/test-pre-commit-feature.sh
- src/hooks/test-pre-commit-hygiene.sh
- src/hooks/test-pre-commit-review.js
- src/hooks/test-pre-pr-verify.js
- src/hooks/test-read-trim.js
- src/hooks/test-review-config.js
- src/hooks/test-session-start-feature.sh
- src/hooks/test-session-start-instructions.js
- src/hooks/test-steps-cli-replace.js
- src/hooks/test-steps-cli.js
- src/hooks/test-steps.js
- src/hooks/test-stop-hook.sh
- tools/run-tests.sh

## History

- 2026-10-25 `4f1c522` — steps: close-out applies the batched advisories
  - .claude-plugin/plugin.json
  - README.md
  - docs/plans/steps-config-block/reports/13a-implementer-1.md
  - docs/plans/steps-config-block/reports/13b-implementer-1.md
  - docs/plans/steps-config-block/reports/13c-fix-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/orchestrator-mode.js
  - src/hooks/pre-commit-review.js
  - src/hooks/read-trim.js
  - src/hooks/steps-cli.js
  - src/hooks/test-agent-tier-gate.js
  - src/hooks/test-orchestrator-mode.js
  - src/hooks/test-pre-commit-hygiene.sh
  - src/hooks/test-pre-commit-review.js
  - src/hooks/test-read-trim.js
  - src/hooks/test-review-config.js
  - src/hooks/test-steps-cli-replace.js
  - src/hooks/test-steps-cli.js
  - src/hooks/test-steps.js

- 2026-10-25 `1d46a5a` — steps: session-start-instructions honours its four steps
  - .claude-plugin/plugin.json
  - docs/plans/steps-config-block/reports/11-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/session-start-instructions.js
  - src/hooks/test-session-start-instructions.js

- 2026-10-25 `f4d9d3f` — steps: agent-tier-gate honours its three steps; read-trim honours its step
  - .claude-plugin/plugin.json
  - docs/plans/steps-config-block/reports/10-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/agent-tier-gate.js
  - src/hooks/read-trim.js
  - src/hooks/test-agent-tier-gate.js
  - src/hooks/test-read-trim.js

- 2026-10-25 `11e637f` — steps: orchestrator-mode gains its permanent switch; enforce-review-implementer honours its step
  - .claude-plugin/plugin.json
  - commands/orchestrate.md
  - docs/plans/steps-config-block/reports/9-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/enforce-review-implementer.js
  - src/hooks/orchestrator-mode.js
  - src/hooks/test-enforce-review-implementer.js
  - src/hooks/test-orchestrator-mode.js

- 2026-10-25 `46ef586` — steps: the commit-convention hooks honour their steps, user file only
  - .claude-plugin/plugin.json
  - docs/plans/steps-config-block/reports/8-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/claude-attribution-note.js
  - src/hooks/enforce-co-author.js
  - src/hooks/post-commit-notify.js
  - src/hooks/test-claude-attribution-note.sh
  - src/hooks/test-enforce-co-author.sh
  - src/hooks/test-post-commit-notify.js

- 2026-10-25 `8eae77e` — steps: hygiene and verify hooks honour their steps
  - .claude-plugin/plugin.json
  - docs/plans/steps-config-block/reports/7-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/pre-commit-hygiene.js
  - src/hooks/pre-pr-verify.js
  - src/hooks/test-pre-commit-hygiene.sh
  - src/hooks/test-pre-pr-verify.js

- 2026-10-25 `d58a18d` — steps: pending-review-gate and plan-review honour their steps
  - .claude-plugin/plugin.json
  - docs/plans/steps-config-block/reports/6-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - skills/plan-spec/SKILL.md
  - src/hooks/pending-review-gate.js
  - src/hooks/review-config-cli.js
  - src/hooks/test-pending-review-gate.js
  - src/hooks/test-review-config.js

- 2026-10-25 `c7a1049` — steps: pre-commit-review honours tdd-mandate and review-gate independently
  - .claude-plugin/plugin.json
  - docs/plans/steps-config-block/reports/5-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/pre-commit-review.js
  - src/hooks/test-pre-commit-review.js

- 2026-10-25 `adf1d40` — steps: the three feature hooks ask the resolver
  - .claude-plugin/plugin.json
  - docs/plans/steps-config-block/reports/4-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/post-commit-feature.js
  - src/hooks/pre-commit-feature.js
  - src/hooks/session-start-feature.js
  - src/hooks/test-post-commit-feature.sh
  - src/hooks/test-pre-commit-feature.sh
  - src/hooks/test-session-start-feature.sh

- 2026-10-25 `77d6cdb` — steps: /sdlc:steps on|off toggles one switch through a shared config writer
  - .claude-plugin/plugin.json
  - commands/steps.md
  - docs/plans/steps-config-block/reports/3-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/lib/review-config.js
  - src/hooks/steps-cli.js
  - src/hooks/test-steps-cli.js

- 2026-10-25 `c84818a` — steps: /sdlc:steps lists every step with its state and source
  - .claude-plugin/plugin.json
  - commands/steps.md
  - docs/plans/steps-config-block/reports/2-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/steps-cli.js
  - src/hooks/test-steps-cli.js

- 2026-10-25 `6af81c5` — steps: resolver lib answering is-step-X-on for every sdlc step
  - .claude-plugin/plugin.json
  - docs/plans/steps-config-block/reports/1-implementer-1.md
  - docs/plans/steps-config-block/tracker.md
  - src/hooks/lib/review-config.js
  - src/hooks/lib/steps.js
  - src/hooks/test-steps.js
  - tools/run-tests.sh

## Verification — 2026-10-25 @ 4f1c522

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `bash tools/run-tests.sh` exits 0 with every file `rc=0`. | FAIL | `bash tools/run-tests.sh -j 8` printed `FAIL: steps block table` from test-enforce-co-author.sh (stderr lacks the repo file and key), then `Files: 46  failed: 1` and exit 1. The same file run alone printed `Results: 54 passed, 0 failed`. |
| 2 | `claude plugin validate .` exits 0. | PASS | `claude plugin validate .` exited 0. |
| 3 | `node src/hooks/steps-cli.js list` prints one line per step id in the plan's Section 1 table and the guard footer. | UNVERIFIED | `node src/hooks/steps-cli.js list` printed 23 lines: 22 step rows plus the footer `Guard areas (tdd, review, commit-conventions) switch from the user file only.` I did not compare the ids to the plan's Section 1 table. |
| 4 | With `{"steps":{"features":false}}` in the user `sdlc-review.json`, `node src/hooks/steps-cli.js list` shows the three features steps off with source `user`. | PASS | With `{"steps":{"features":false}}` in the user file, `list` printed `features session-start-feature off user file (steps.features)`, and the same for `pre-commit-feature` and `post-commit-feature`. |
| 5 | With `{"steps":{"tdd":false}}` only in a repo `sdlc-review.json`, the tdd step stays on and a one-line warning names the file and key. | PASS | In a `git init` scratch repo with `{"steps":{"tdd":false}}` only in `.claude/sdlc-review.json`, `list` printed `tdd tdd-mandate on default` and `warning: <repo>/.claude/sdlc-review.json: steps.tdd is read from the user file only; ignored`. |
| 6 | With invalid JSON in the user `sdlc-review.json`, every step stays on and a warning is printed. | PASS | With `{bad` in the user file, `list 2>&1\|grep -iv " on  default"` printed only `warning: .../sdlc-review.json: invalid JSON (...); ignored` and the footer. `list` showed no step off (0 rows matching " off"). |
| 7 | `grep -ln "feature-tracking.disabled')\\|mandateInForce(" src/hooks/*.js \| grep -v /test-` prints nothing: no hook reads an alias itself. | PASS | `grep -ln "feature-tracking.disabled')\|mandateInForce(" src/hooks/*.js\|grep -v /test-` printed nothing. |

**Verdict**: FAIL
- The verifier ended the report with VERIFY_GATE: FAIL.
- Row 1 is FAIL.
- Row 3 is UNVERIFIED.
