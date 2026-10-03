# sdlc-claude-skills - Project Instructions

This project holds the SDLC toolchain for Claude Code: the workflow skills,
the review sub-agents, the pre-commit hooks and the slash commands that
drive a plan -> build -> review -> commit loop. It is developed here and
ships as the `sdlc` plugin from this repo's own marketplace
(`sdlc-claude-skills`).

## Development Workflow

**CRITICAL RULE**: Always make changes to files within this project
directory first. NEVER edit the installed copy under
`~/.claude/plugins/` (the plugin cache) or anything this toolchain once
deployed into `~/.claude/` -- `/plugin update` replaces the cache, so an
edit made there is lost on the next update, and it never reaches the repo.

- Hook source is `src/hooks/`, wired by `hooks/hooks.json` through
  `${CLAUDE_PLUGIN_ROOT}`. Nothing is copied anywhere to run it.
- Skills are authored in `skills/`, commands in `commands/`, review
  sub-agents in `agents/`, the always-on instruction sections in
  `instructions/`.
- Try a change without installing: `claude --plugin-dir .` from the repo
  root. Ship it: commit, then `/plugin marketplace update sdlc-claude-skills`
  and `/plugin update sdlc@sdlc-claude-skills`.
- `claude plugin validate .` must exit 0.
- `./uninstall.sh` removes a pre-plugin deployment from `~/.claude/` (the
  one-time migration); `--dry-run` shows what it would do. It reads its
  legacy wiring from `legacy/hooks-config.json`.
- Tests live beside the code they exercise: `node src/hooks/test-*.js`,
  `bash src/hooks/test-*.sh` and `node src/test-*.js`.

## What ships here

| Piece | Path |
|---|---|
| `plan-spec` skill | `skills/plan-spec/` |
| `code-review-pre-commit` skill | `skills/code-review-pre-commit/SKILL.md` |
| `code-review-implementer` skill | `skills/code-review-implementer/SKILL.md` |
| `code-reviewer` / `code-reviewer-deep` agents | `agents/` |
| `/commit-prep`, `/review-timing`, `/feature`, `/feature-new` | `commands/` |
| Pre/post-commit hooks and their libs | `src/hooks/` |
| Plugin manifests and hook wiring | `.claude-plugin/`, `hooks/hooks.json` |
| Legacy-install removal (`uninstall.sh`) | `src/unmerge-*.js`, `src/lib/`, `legacy/` |
| Timing analyser | `tools/analyze-review-timing.py` |

See `README.md` for how the pieces fit together at run time.

## Code Review

The review system exists to produce code that is **correct, tested,
readable, optimized**, in that order of priority. The reviewer criteria in
`agents/code-reviewer.md` are the single source for criteria,
method, constraints and report format; the skills and the docs refer to
that file rather than restate it.

Every git read in the pre-commit hooks fails closed (`lib/git-read.js`),
and `lib/commit-command.js` blocks any commit whose contents cannot be
known from the index at hook time. Staging and committing must be two
separate Bash commands -- that is load-bearing, not style.

Note for anyone editing these docs: the commit classifier inspects Bash
command text, so a heredoc containing the literal two-word git commit
phrase is itself blocked. Write such files with the Write tool.
