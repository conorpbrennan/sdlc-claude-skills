# sdlc-claude-skills - Project Instructions

This project holds the SDLC toolchain for Claude Code: the workflow skills,
the review sub-agents, the pre-commit hooks and the slash commands that
drive a plan -> build -> review -> commit loop. It is developed here and
installed to the user directory.

## Development Workflow

**CRITICAL RULE**: Always make changes to files within this project
directory first. NEVER edit files directly in the user `~/.claude/`
directory -- `install.sh` overwrites them, so an edit made there is lost on
the next install.

- Hook source is `src/hooks/`. `.claude/hooks/` is a gitignored deploy
  target populated by `install.sh`.
- Skills are authored in `.claude/skills/`, commands in `commands/`, review
  sub-agents in `.claude/agents/`.
- Run `./install.sh` to deploy, `./install.sh --dry-run` to see what it
  would do, `./uninstall.sh` to remove.
- Tests live beside the code they exercise: `node src/hooks/test-*.js` and
  `bash src/hooks/test-*.sh`.

## What ships here

| Piece | Path |
|---|---|
| `plan-spec` skill | `.claude/skills/plan-spec/` |
| `code-review-pre-commit` skill | `.claude/skills/code-review-pre-commit.md` |
| `code-review-implementer` skill | `.claude/skills/code-review-implementer.md` |
| `code-reviewer` / `code-reviewer-deep` agents | `.claude/agents/` |
| `/commit-prep`, `/review-timing`, `/feature`, `/feature-new` | `commands/` |
| Pre/post-commit hooks and their libs | `src/hooks/` |
| Install-time mergers | `src/merge-*.js`, `src/unmerge-*.js`, `src/lib/` |
| Timing analyser | `tools/analyze-review-timing.py` |

See `README.md` for how the pieces fit together at run time.

## Code Review

The review system exists to produce code that is **correct, tested,
readable, optimized**, in that order of priority. The reviewer criteria in
`.claude/agents/code-reviewer.md` are the single source for criteria,
method, constraints and report format; the skills and the docs refer to
that file rather than restate it.

Every git read in the pre-commit hooks fails closed (`lib/git-read.js`),
and `lib/commit-command.js` blocks any commit whose contents cannot be
known from the index at hook time. Staging and committing must be two
separate Bash commands -- that is load-bearing, not style.

Note for anyone editing these docs: the commit classifier inspects Bash
command text, so a heredoc containing the literal two-word git commit
phrase is itself blocked. Write such files with the Write tool.
