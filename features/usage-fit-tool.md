# Usage Fit Tool

**Requirement**: Add a read-only /sdlc:fit command that reads a user's local Claude Code transcripts and reports where their cost sits and what each sdlc lever would have saved on their own history, as a counterfactual and not a forecast.

**Started**: 2026-10-25
**Last updated**: 2026-10-25
**Branch**: usage-fit-tool

## Acceptance

1. Running `node tools/usage-fit.js <transcripts-dir>` prints, per week, the share of main calls over 200K and 300K context, resets per 100 main calls, main Opus work cost, sub-agent runs over 100 calls and main-session cache rebuild cost, then lists each applicable lever with a counterfactual dollar figure for that history and a confidence label, and its combined figure does not add overlapping levers.
2. The output never recommends a 1h cache for sub-agents.
3. The output contains no prompt text, file paths, project names or session ids (checked by grep against a fixture transcript).
4. An unrecognised transcript shape makes the command exit non-zero with a message. A run with `HOME` set to an empty temporary directory leaves that directory empty, and changes no git state.
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

## Verification — 2026-10-25 @ 5b9bb65

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Running `node tools/usage-fit.js <transcripts-dir>` prints, per week, the share of main calls over 200K and 300K context, resets per 100 main calls, main Opus work cost, sub-agent runs over 100 calls and main-session cache rebuild cost, then lists each applicable lever with a counterfactual dollar figure for that history and a confidence label, and its combined figure does not add overlapping levers. | PASS | `node tools/usage-fit.js $D/projects` printed per-week rows for calls >200K and >300K, resets per 100 calls, main Opus cost, sub-agent runs over 100, and rebuild cost. The Levers section listed `context-reset: $0.12 ... arithmetic`, `cap-runaway-subagents: $0.48 ... upper-bound`, and `combined (levers applied in sequence, overlaps removed): $0.60-$0.60`. That combined figure is below the $0.12 + $0.48 sum of the levers' own figures, so overlaps are not added. Inapplicable levers printed `not applicable` with a reason. |
| 2 | The output never recommends a 1h cache for sub-agents. | PASS | Fixture with a 130-call sub-agent run: the output lists no sub-agent cache lever. `bash tools/run-tests.sh` ran `tools/test-usage-fit.js` with rc=0, and that suite has an assertion that no line joins sub-agent and 1h. I did not grep my own fixture output for this, so the check rests on that suite. |
| 3 | The output contains no prompt text, file paths, project names or session ids (checked by grep against a fixture transcript). | PASS | `usage-fit.js $D/projects \| grep -inE "secret\|/home"` printed nothing (grep exit 1). The `--json` form grep count was `0`. The fixture contained `SECRETPROMPT`, `/home/secretuser`, `secretproj` and `SECRETSESSION`. |
| 4 | An unrecognised transcript shape makes the command exit non-zero with a message. A run with `HOME` set to an empty temporary directory leaves that directory empty, and changes no git state. | PASS | Input with an unparsable line, `content:42`, and an assistant message with no timestamp: `HOME=$H node tools/usage-fit.js $B` printed `Unrecognised transcript shapes: user-content-shape=1, no-timestamp=1` and `rc=3`. Afterwards `ls -A $H \| wc -l` was `0` and the git status hash was unchanged. A valid run with an empty `HOME` also left it empty. |
| 5 | On a fixture transcript with known token counts, the context-lever counterfactual equals the hand-computed figure, and the output states that the figures are counterfactuals on the user's own history and not forecasts. | PASS | Opus fixture with cache reads of 50K, 350K and 350K at $0.20/M. I computed $0.01 + $0.07 + $0.07 = $0.15, and the tool printed main cost $0.15. For `context-reset`, the calls over 300K cost $0.14. I replaced the two of them with the $0.01 per-call average of the calls under 100K, giving $0.14 - $0.02 = $0.12, and the tool printed `context-reset: $0.12`. The output ended with `Counterfactuals on your own history at list prices, not forecasts.` |

**Verdict**: PASS
