---
description: Weekly model spend report from local transcripts - did steering work toward Sonnet?
argument-hint: [--days N] [--json]
---

<objective>
Run the model spend report over `~/.claude/projects` and say in plain English whether the spend is moving to Sonnet. The tool reads local transcripts only and prices them at list prices, so the figures are estimates.
</objective>

<arguments>
Parse `$ARGUMENTS` for:

- `--days N` (default 7) - window by message timestamp; `--days 0` means all time.
- `--json` (optional) - the tool prints JSON instead of tables.

Pass arguments through verbatim to the tool.
</arguments>

<steps>
1. Resolve the tool path, first match wins:
   - `./tools/model-spend.js` if `$PWD` is inside the `sdlc-claude-skills` source repo;
   - else `${CLAUDE_PLUGIN_ROOT}/tools/model-spend.js` if that variable is set and the file exists;
   - else the newest match of
     `~/.claude/plugins/cache/*/sdlc/*/tools/model-spend.js`, e.g.
     `ls -t ~/.claude/plugins/cache/*/sdlc/*/tools/model-spend.js | head -1`;
   - otherwise tell the user to install or update the `sdlc` plugin from the
     `sdlc-claude-skills` marketplace, and stop.
2. Run `node <resolved path> $ARGUMENTS`. It has no dependencies. The real tree is large, so allow up to two minutes.
3. Summarise the output.
</steps>

<output>
Lead with the finding, in plain short sentences: what share of the window's cost is Opus, and what share is Sonnet. Then, only where the numbers show it:

- how much main-session Opus cost is work (reading, editing, running tests) versus orchestration versus text-only turns. Work on Opus is the leak this steering aims to close;
- how much cost sits in calls with main context over 300K;
- how many Opus sub-agents ran, and how many prompts had no `TIER: opus:` line;
- review rounds: any session that reached round 3 or more.

State that the figures are list-price estimates. Do not pad. If the tool prints "No transcripts found", say so and stop.
</output>

<constraints>
- Read-only. Do NOT write to `~/.claude` or any git state.
- If the tool exits non-zero, show the error and stop; do not try to fix transcripts.
</constraints>
