---
description: Weekly model spend report from local transcripts - did steering work toward Sonnet?
argument-hint: [--days N | --since ISO] [--until ISO] [--split ISO] [--json]
---

<objective>
Run the model spend report over `~/.claude/projects` and say in plain English whether the spend is moving to Sonnet. The tool reads local transcripts only and prices them at list prices, so the figures are estimates.
</objective>

<arguments>
Parse `$ARGUMENTS` for:

- `--days N` (default 7) - window by message timestamp; `--days 0` means all time.
- `--since ISO` - window start; replaces `--days`. Giving both exits 2.
- `--until ISO` - drops every message after this time, in every section (default now).
- `--split ISO` - section 9 prefixes each group `before` or `after`, by whether the session ended before this time.
- An unparseable ISO value exits 2 with a usage line.
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
- how many Opus sub-agents ran, and how many prompts had no `TIER: opus:` line (the reason starts with plan writing, plan source review, fail triage or user asked; plan writing means a new plan, and edits of an existing plan run on Sonnet);
- review rounds: any session that reached round 3 or more;
- main-session prompt cache (section 8): cache-write cost by backend and TTL, and the rebuild cost after idle gaps. If it prints the `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` fix line, repeat it.

Section 9, "Orchestration signals per 10 implementer dispatches", has one line per group of orchestrated sessions (main model family and tier, then `before`/`after` with `--split`). The sessions are those active since the window start. Read each rate as events per 10 implementer dispatches ("steps"). A dash means a zero denominator; `none` means no orchestrated session. Each signal:

- `partial`: implementer final reports that say PARTIAL (the step did not finish).
- `tdd-fail`: reviewer reports that say `TDD_GATE: FAIL`.
- `interrupts`: user interrupts of the main session.
- `main-src-edits`: source files the main session edited itself instead of dispatching.
- `block-loops`: three or more identical commit-gate blocks in a row.
- `deny-retry`: a denied dispatch retried with the same agent type within 2 minutes.
- `same-prompt`: a dispatch whose prompt repeats an earlier one within 1 minute.
- `share`: the percent of sessions with at least one such event.
- `cost/commit` and `main/commit`: all spend, and main-session spend, per commit.
- `reviews/commit`: reviewer dispatches per commit.
- `review-cycles`: commits by how many reviews preceded them (1, 2, 3, 4 or more); `open` is reviews not yet followed by a commit.
- `peak-ctx`: median and maximum peak main context per session.

Rates under about 2x apart are noise at these sample sizes. Say which differences are bigger than that and which are not.

State that the figures are list-price estimates. Do not pad. If the tool prints "No transcripts found", say so and stop.
</output>

<constraints>
- Read-only. Do NOT write to `~/.claude` or any git state.
- If the tool exits non-zero, show the error and stop; do not try to fix transcripts.
</constraints>
