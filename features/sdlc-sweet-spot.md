# Sdlc Sweet Spot

**Requirement**: Cut sdlc run cost and cycle time: turn-capped implementer agent, plan size check, review cap 2, in-scope findings as fix rounds, self-contained briefs without mutation tables, targeted hygiene tests, Sonnet orchestrator prompt.

**Started**: 2026-10-19
**Last updated**: 2026-10-19
**Branch**: sdlc-sweet-spot

## Acceptance

<!-- 2-5 checkable criteria; /sdlc:verify reads these -->

## Files involved

- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- agents/implementer.md
- skills/plan-spec/SKILL.md
- skills/plan-spec/check_size.py
- skills/plan-spec/fixtures/size-over-bytes.md
- skills/plan-spec/fixtures/size-over-lines.md
- skills/plan-spec/fixtures/size-over-steps.md
- skills/plan-spec/fixtures/size-under.md
- skills/plan-spec/reference.md
- skills/plan-spec/test_check_size.py
- src/hooks/agent-tier-gate.js
- src/hooks/test-agent-tier-gate.js
- src/test-plugin-layout.js

## History

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
