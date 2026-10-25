# Opus New Plans Only

**Requirement**: Restrict the plan writing Opus tier to new plans only: the agent-tier-gate denies a plan writing dispatch whose description or first sentence shows an edit of an existing plan, so folding review findings runs on Sonnet.

**Started**: 2026-10-25
**Last updated**: 2026-10-25
**Branch**: opus-new-plans-only

## Acceptance

1. Running `node src/hooks/test-agent-tier-gate.js` exits 0.
2. A `TIER: opus: plan writing` dispatch whose description is "Fold C3a plan review findings" is denied and the reason names `model: "sonnet"`.
3. A `TIER: opus: plan writing` dispatch whose description is "Write cube optimise plan" is allowed unchanged.

## Files involved

- .claude-plugin/plugin.json
- README.md
- commands/handoff.md
- commands/model-spend.md
- skills/plan-spec/SKILL.md
- skills/plan-spec/reference.md
- src/hooks/agent-tier-gate.js
- src/hooks/orchestrator-mode.js
- src/hooks/test-agent-tier-gate.js
- src/hooks/test-orchestrator-mode.js

## History

- 2026-10-25 `427daec` — agent-tier-gate: Opus plan writing for new plans only
  - .claude-plugin/plugin.json
  - README.md
  - commands/handoff.md
  - commands/model-spend.md
  - skills/plan-spec/SKILL.md
  - skills/plan-spec/reference.md
  - src/hooks/agent-tier-gate.js
  - src/hooks/orchestrator-mode.js
  - src/hooks/test-agent-tier-gate.js
  - src/hooks/test-orchestrator-mode.js
