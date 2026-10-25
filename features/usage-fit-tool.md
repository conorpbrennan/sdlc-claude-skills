# Usage Fit Tool

**Requirement**: Add a read-only /sdlc:fit command that reads a user's local Claude Code transcripts and reports where their cost sits and what each sdlc lever would have saved on their own history, as a counterfactual and not a forecast.

**Started**: 2026-10-25
**Last updated**: 2026-10-25
**Branch**: usage-fit-tool

## Acceptance

1. Running `node tools/usage-fit.js <transcripts-dir>` prints, per week, the share of main calls over 200K and 300K context, resets per 100 main calls, main Opus work cost, sub-agent runs over 100 calls and main-session cache rebuild cost, then lists each applicable lever with a counterfactual dollar figure for that history and a confidence label, and its combined figure does not add overlapping levers.
2. The output never recommends a 1h cache for sub-agents.
3. The output contains no prompt text, file paths, project names or session ids (checked by grep against a fixture transcript).
4. An unrecognised transcript shape makes the command exit non-zero with a message, and a run writes nothing under `~/.claude` and changes no git state.
5. On a fixture transcript with known token counts, the context-lever counterfactual equals the hand-computed figure, and the output states that the figures are counterfactuals on the user's own history and not forecasts.

## Files involved

- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- commands/fit.md
- tools/test-usage-fit.js
- tools/usage-fit.js

## History

- 2026-10-25 `d8f7183` — Add usage-fit: per-week context, reset, model and cache indicators from local transcripts
  - .claude-plugin/plugin.json
  - tools/test-usage-fit.js
  - tools/usage-fit.js
