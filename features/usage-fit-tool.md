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

- 2026-10-25 `cbd2d7b` — usage-fit: levers, model mix and the /sdlc:fit command
  - .claude-plugin/plugin.json
  - CLAUDE.md
  - README.md
  - commands/fit.md
  - tools/test-usage-fit.js
  - tools/usage-fit.js

- 2026-10-25 `d8f7183` — Add usage-fit: per-week context, reset, model and cache indicators from local transcripts
  - .claude-plugin/plugin.json
  - tools/test-usage-fit.js
  - tools/usage-fit.js

## Verification — 2026-10-25 @ cbd2d7b

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Running `node tools/usage-fit.js <transcripts-dir>` prints, per week, the share of main calls over 200K and 300K context, resets per 100 main calls, main Opus work cost, sub-agent runs over 100 calls and main-session cache rebuild cost, then lists each applicable lever with a counterfactual dollar figure for that history and a confidence label, and its combined figure does not add overlapping levers. | PASS | `node tools/usage-fit.js <fixture>` printed per-week rows for calls > 200K/300K, resets per 100 calls, main Opus cost, "over 100 calls" for sub-agent runs, and "cache: rebuild cost". The levers section printed `context-reset: $0.30 (50% of total cost), arithmetic`. It also printed `combined (levers applied in sequence, overlaps removed): $0.30-$0.30`. The other levers printed "not applicable" because the fixture did not trigger them, so I did not see their dollar figures. |
| 2 | The output never recommends a 1h cache for sub-agents. | PASS | The only "1h" hits in the output were the label "cache: 1h write cost" and the main-session lever "cache-1h-main: not applicable". There was no sub-agent 1h recommendation. |
| 3 | The output contains no prompt text, file paths, project names or session ids (checked by grep against a fixture transcript). | PASS | The fixture held SECRETPROMPT, secretuser, secretproj and SECRETSESSION in its content, cwd, sessionId and file names. `grep -ciE "secret\|SECRETSESSION\|opus\|/home"` on the output gave 3, all the "main Opus cost" and "of it work turns" labels. No fixture strings appeared. |
| 4 | An unrecognised transcript shape makes the command exit non-zero with a message, and a run writes nothing under `~/.claude` and changes no git state. | PASS | A transcript with `message.content: 42` and a bad usage value gave `Unrecognised transcript shapes: user-content-shape=1` and `rc=3`. The `git status --porcelain -z \| sha1sum` hash was identical before and after (c98b5cd4...), so no git state changed. `ls -la ~/.claude` was not hashed before the runs, so the run's writes under `~/.claude` are not covered by an observed before/after check. |
| 5 | On a fixture transcript with known token counts, the context-lever counterfactual equals the hand-computed figure, and the output states that the figures are counterfactuals on the user's own history and not forecasts. | PASS | The fixture had 5 Opus calls at 50K cache read and 5 at 350K, each with 1000 output tokens. By hand, a 350K call costs 0.09 and a 50K call costs 0.03, so the saving is 5 x (0.09 - 0.03) = $0.30. The tool printed `context-reset: $0.30`. The last line was "Counterfactuals on your own history at list prices, not forecasts." |

**Verdict**: PASS
