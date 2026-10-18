# Sub Agent Context

**Requirement**: Shrink Sonnet sub-agent context per run (target 80K avg from 114K) by putting one shared output-and-turn budget into every dispatch brief and adding whatever mechanical caps Claude Code allows.

**Started**: 2026-10-18
**Last updated**: 2026-10-18
**Branch**: sub-agent-context

## Files involved

- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- agents/code-reviewer-deep.md
- agents/code-reviewer.md
- hooks/hooks.json
- skills/code-review-pre-commit/SKILL.md
- src/hooks/agent-tier-gate.js
- src/hooks/lib/context-budget.js
- src/hooks/lib/read-trim.js
- src/hooks/read-trim.js
- src/hooks/test-agent-tier-gate.js
- src/hooks/test-context-budget.js
- src/hooks/test-read-trim.js
- src/test-plugin-layout.js

## History

- 2026-10-18 `2baf7cd` — Cap reviewer turns and stop forcing allow on a budget-only rewrite
  - .claude-plugin/plugin.json
  - README.md
  - agents/code-reviewer-deep.md
  - agents/code-reviewer.md
  - skills/code-review-pre-commit/SKILL.md
  - src/hooks/agent-tier-gate.js
  - src/hooks/test-agent-tier-gate.js
  - src/test-plugin-layout.js

- 2026-10-18 `5876e9f` — Append a context budget to generic sub-agent briefs
  - .claude-plugin/plugin.json
  - CLAUDE.md
  - README.md
  - src/hooks/agent-tier-gate.js
  - src/hooks/lib/context-budget.js
  - src/hooks/test-agent-tier-gate.js
  - src/hooks/test-context-budget.js
