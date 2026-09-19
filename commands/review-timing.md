---
description: Report where time is being spent in the code review / TDD hooks and skills
argument-hint: [--days N] [--repo PATH] [--json]
---

<objective>
Print a summary of the code review / TDD timing log (`~/.claude/code-review-timing.jsonl`), showing fast-path hit rate, per-gate breakdown, expensive-phase percentiles (coverage regen, diff-cover, inferred sub-agent review), and per-repo hygiene check durations. Use this to find where to optimize.
</objective>

<arguments>
Parse `$ARGUMENTS` for:

- `--days N` (default 7) — window; use `--days 0` for all time.
- `--repo PATH` (optional) — filter to one repo toplevel (forward-slash path).
- `--json` (optional) — emit the aggregated report as JSON instead of text.

Pass arguments through verbatim to the analyser.
</arguments>

<steps>
1. Resolve the analyser path, first match wins:
   - `./tools/analyze-review-timing.py` if `$PWD` is inside the
     `sdlc-claude-skills` source repo;
   - `~/.claude/tools/analyze-review-timing.py`, where `install.sh`
     deploys it;
   - otherwise tell the user to run `install.sh` from the
     `sdlc-claude-skills` repo, and stop.
2. If the repo pins a conda env (a `setup` line in
   `~/.claude/hygiene-repos.json`, or a local convention), source and
   activate it first. Otherwise use whatever `python3` is on PATH — the
   analyser is stdlib-only.
3. `export PYTHONIOENCODING=utf-8`.
4. Run `python3 <resolved path> $ARGUMENTS`. No need to interpret — just show the output.
</steps>

<output>
Print the analyser output verbatim. If the log file is missing or empty, the analyser handles that itself — don't pre-check.
</output>

<constraints>
- Read-only analysis. Do NOT write to the log, the markers, or any git state.
- If the analyser exits non-zero, show the error and stop; do not try to "fix" the log.
</constraints>
