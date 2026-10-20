# Sdlc Sweet Spot

**Requirement**: Cut sdlc run cost and cycle time: turn-capped implementer agent, plan size check, review cap 2, in-scope findings as fix rounds, self-contained briefs without mutation tables, targeted hygiene tests, Sonnet orchestrator prompt.

**Started**: 2026-10-19
**Last updated**: 2026-10-19
**Branch**: sdlc-sweet-spot

## Acceptance

1. `node src/hooks/test-agent-tier-gate.js && node src/test-plugin-layout.js` exits 0 and `agents/implementer.md` exists with `maxTurns: 80`.
2. `python3 skills/plan-spec/test_check_size.py` exits 0, and `python3 skills/plan-spec/check_size.py skills/plan-spec/fixtures/size-over-bytes.md` exits 1.
3. `node src/hooks/review-config-cli.js plan-review` prints `"cap":2`, and `node src/hooks/test-review-config.js` exits 0.
4. `bash src/hooks/test-pre-commit-hygiene.sh` exits 0.
5. `node src/hooks/test-orchestrator-mode.js` exits 0, and `grep -c "/model sonnet" commands/handoff.md src/hooks/orchestrator-mode.js` reports at least 1 in each file.

## Files involved

- .claude-plugin/plugin.json
- .claude/hygiene-repos.json.example
- .claude/sdlc-review.json.example
- CLAUDE.md
- README.md
- agents/implementer.md
- commands/commit-prep.md
- commands/handoff.md
- commands/orchestrate.md
- commands/verify.md
- instructions/hygiene-snippet.md
- skills/plan-spec/SKILL.md
- skills/plan-spec/check_size.py
- skills/plan-spec/fixtures/size-over-bytes.md
- skills/plan-spec/fixtures/size-over-lines.md
- skills/plan-spec/fixtures/size-over-steps.md
- skills/plan-spec/fixtures/size-under.md
- skills/plan-spec/reference.md
- skills/plan-spec/test_check_size.py
- src/hooks/agent-tier-gate.js
- src/hooks/lib/review-config.js
- src/hooks/orchestrator-mode.js
- src/hooks/pre-commit-review.js
- src/hooks/test-agent-tier-gate.js
- src/hooks/test-orchestrator-mode.js
- src/hooks/test-pre-commit-hygiene.sh
- src/hooks/test-pre-commit-review.js
- src/hooks/test-review-config.js
- src/test-plugin-layout.js

## History

- 2026-10-19 `8d090dc` — Close out the sweet-spot phase: stop polling a vanished coverage.xml
  - .claude-plugin/plugin.json
  - README.md
  - instructions/hygiene-snippet.md
  - skills/plan-spec/reference.md
  - src/hooks/pre-commit-review.js
  - src/hooks/test-agent-tier-gate.js
  - src/hooks/test-orchestrator-mode.js
  - src/hooks/test-pre-commit-review.js

- 2026-10-19 `48b5249` — Prompt the owner to run orchestrator sessions on Sonnet
  - .claude-plugin/plugin.json
  - commands/handoff.md
  - commands/orchestrate.md
  - skills/plan-spec/SKILL.md
  - src/hooks/orchestrator-mode.js
  - src/hooks/test-orchestrator-mode.js

- 2026-10-19 `53a672e` — Run only the tests that match the staged modules in the hygiene gate
  - .claude-plugin/plugin.json
  - .claude/hygiene-repos.json.example
  - README.md
  - commands/commit-prep.md
  - commands/verify.md
  - instructions/hygiene-snippet.md
  - src/hooks/test-pre-commit-hygiene.sh

- 2026-10-19 `1b18785` — Cap the plan review loop at two rounds and take the cap off the owner list
  - .claude-plugin/plugin.json
  - .claude/sdlc-review.json.example
  - skills/plan-spec/SKILL.md
  - skills/plan-spec/reference.md
  - src/hooks/lib/review-config.js
  - src/hooks/test-review-config.js

- 2026-10-19 `136de4b` — Add a plan size check and cap plans at 40 KB, 15 steps, 80 lines a step
  - .claude-plugin/plugin.json
  - skills/plan-spec/SKILL.md
  - skills/plan-spec/check_size.py
  - skills/plan-spec/fixtures/size-over-bytes.md
  - skills/plan-spec/fixtures/size-over-lines.md
  - skills/plan-spec/fixtures/size-over-steps.md
  - skills/plan-spec/fixtures/size-under.md
  - skills/plan-spec/reference.md
  - skills/plan-spec/test_check_size.py

- 2026-10-19 `d04b008` — Add a turn-budgeted implementer agent and route plan-spec dispatch to it
  - .claude-plugin/plugin.json
  - CLAUDE.md
  - README.md
  - agents/implementer.md
  - skills/plan-spec/SKILL.md
  - skills/plan-spec/reference.md
  - src/hooks/agent-tier-gate.js
  - src/hooks/test-agent-tier-gate.js
  - src/test-plugin-layout.js

## Verification — 2026-10-19 @ 8d090dc

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `node src/hooks/test-agent-tier-gate.js && node src/test-plugin-layout.js` exits 0 and `agents/implementer.md` exists with `maxTurns: 80`. | PASS | `node src/hooks/test-agent-tier-gate.js && node src/test-plugin-layout.js` exited 0. `grep -n maxTurns agents/implementer.md` printed `5:maxTurns: 80`. |
| 2 | `python3 skills/plan-spec/test_check_size.py` exits 0, and `python3 skills/plan-spec/check_size.py skills/plan-spec/fixtures/size-over-bytes.md` exits 1. | PASS | `python3 skills/plan-spec/test_check_size.py` exited 0. `python3 skills/plan-spec/check_size.py skills/plan-spec/fixtures/size-over-bytes.md` exited 1. |
| 3 | `node src/hooks/review-config-cli.js plan-review` prints `"cap":2`, and `node src/hooks/test-review-config.js` exits 0. | PASS | `node src/hooks/review-config-cli.js plan-review` printed `{"source":"opus","consistency":"sonnet","cap":2,"warnings":[]}`. `node src/hooks/test-review-config.js` exited 0. |
| 4 | `bash src/hooks/test-pre-commit-hygiene.sh` exits 0. | PASS | `bash src/hooks/test-pre-commit-hygiene.sh` exited 0. |
| 5 | `node src/hooks/test-orchestrator-mode.js` exits 0, and `grep -c "/model sonnet" commands/handoff.md src/hooks/orchestrator-mode.js` reports at least 1 in each file. | PASS | `node src/hooks/test-orchestrator-mode.js` exited 0. `grep -c "/model sonnet" commands/handoff.md src/hooks/orchestrator-mode.js` printed `commands/handoff.md:1` and `src/hooks/orchestrator-mode.js:1`. |

**Verdict**: PASS
