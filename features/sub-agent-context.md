# Sub Agent Context

**Requirement**: Shrink Sonnet sub-agent context per run (target 80K avg from 114K) by putting one shared output-and-turn budget into every dispatch brief and adding whatever mechanical caps Claude Code allows.

**Started**: 2026-10-18
**Last updated**: 2026-10-18
**Branch**: sub-agent-context

## Files involved

- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- src/hooks/agent-tier-gate.js
- src/hooks/lib/context-budget.js
- src/hooks/test-agent-tier-gate.js
- src/hooks/test-context-budget.js

## History

<!-- populated on commit -->
