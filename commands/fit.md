---
description: Usage fit report from local transcripts - where your cost sits and what each sdlc lever would have saved on your own history
argument-hint: [--days N] [--json]
---

<objective>
Run the usage fit report over `~/.claude/projects` and say in plain English where the user's main-session cost sits and which lever would have saved most on their own history. The tool reads local transcripts only and prices them at list prices. Every dollar figure is a counterfactual on past usage, not a forecast.
</objective>

<arguments>
Parse `$ARGUMENTS` for:

- `--days N` (default 56) - window in days; weeks are 7-day buckets ending now.
- `--json` (optional) - the tool prints JSON instead of the table.

Pass arguments through verbatim to the tool.
</arguments>

<steps>
1. Resolve the tool path, first match wins:
   - `./tools/usage-fit.js` if `$PWD` is inside the `sdlc-claude-skills` source repo;
   - else `${CLAUDE_PLUGIN_ROOT}/tools/usage-fit.js` if that variable is set and the file exists;
   - else the newest match of
     `~/.claude/plugins/cache/*/sdlc/*/tools/usage-fit.js`, e.g.
     `ls -t ~/.claude/plugins/cache/*/sdlc/*/tools/usage-fit.js | head -1`;
   - otherwise tell the user to install or update the `sdlc` plugin from the
     `sdlc-claude-skills` marketplace, and stop.
2. Run `node <resolved path> ~/.claude/projects $ARGUMENTS`. It has no dependencies. The real tree is large, so allow up to two minutes.
3. Summarise the output.
</steps>

<output>
Lead with the largest applicable lever: its name, its dollars and its share of total cost. Then, in short plain sentences:

- the context profile: share of calls over 300K context, resets per 100 calls, handoff-style starts;
- the model mix: the Opus and Fable share of main-session work cost;
- the cache backend: claude.ai or gateway, and the rebuild cost on the gateway.

A lever the user already uses shows savings they have already taken (for example resets, a Sonnet main model, a 1h cache). So run the tool once for the default window and once with `--days 7`, compare the two, and say which levers the latest week no longer needs. Do not say any figure `will` save money; say `would have saved on this history`.

State that these are counterfactuals on the user's own history at list prices, not forecasts. If the tool prints the claude.ai line, tell the user to read the shares, not the dollars. If it reports unpriced-model calls, say how many and that their cost is not included. Do not claim sdlc quality benefits: the tool does not measure them. Do not pad.
</output>

<constraints>
- Read-only. Do NOT write to `~/.claude` or any git state.
- If the tool exits non-zero, show the error and stop; do not try to fix transcripts. Exit 3 means an unrecognised transcript shape: say which shape kinds the tool listed on stderr and nothing more.
</constraints>
