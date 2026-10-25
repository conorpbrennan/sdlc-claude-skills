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
- **Every commit raises the plugin version.** `/plugin update` ignores a
  commit that leaves `version` in `.claude-plugin/plugin.json` unchanged, so
  users silently keep the old copy. Before staging a commit, run
  `node tools/plugin-version.js bump` (raises the patch number), then stage
  `.claude-plugin/plugin.json` with the rest. Raise minor or major by hand
  for a larger change. `node tools/plugin-version.js check` blocks a commit
  whose staged version is not above HEAD's; it runs from this repo's entry in
  `~/.claude/hygiene-repos.json`. Two branches that each bump will conflict
  on that line at merge; keep the higher number and bump once more.
  A commit that carries only `features/*.md` records is exempt: it ships no
  plugin content, and the verification marker depends on it leaving the
  version alone.
- `./uninstall.sh` removes a pre-plugin deployment from `~/.claude/` (the
  one-time migration); `--dry-run` shows what it would do. It reads its
  legacy wiring from `legacy/hooks-config.json`.
- Tests live beside the code they exercise. Run all the suites in parallel
  with `bash tools/run-tests.sh [-j N]` (it isolates the timing log and prints
  one rc line per file). Run one suite with `node src/hooks/test-X.js`,
  `bash src/hooks/test-X.sh` or `node src/test-X.js`.

## What ships here

| Piece | Path |
|---|---|
| `plan-spec` skill | `skills/plan-spec/` |
| `code-review-pre-commit` skill | `skills/code-review-pre-commit/SKILL.md` |
| `code-review-implementer` skill | `skills/code-review-implementer/SKILL.md` |
| `code-reviewer` / `code-reviewer-deep` agents | `agents/` |
| `implementer` agent (Sonnet, turn budget) | `agents/implementer.md` |
| `verifier` agent (read-only, outside-in) | `agents/verifier.md` |
| `/commit-prep`, `/review-timing`, `/feature`, `/feature-new`, `/sdlc:main-model` | `commands/` |
| `/verify` and its recorder | `commands/verify.md`, `src/hooks/record-verification.js` |
| `gh pr create` gate (advisory by default) | `src/hooks/pre-pr-verify.js` |
| Pre/post-commit hooks and their libs | `src/hooks/` |
| Plugin manifests and hook wiring | `.claude-plugin/`, `hooks/hooks.json` |
| Legacy-install removal (`uninstall.sh`) | `src/unmerge-*.js`, `src/lib/`, `legacy/` |
| Timing analyser | `tools/analyze-review-timing.py` |
| Review config resolver and CLI (`sdlc-review.json`) | `src/hooks/lib/review-config.js`, `src/hooks/review-config-cli.js`, `.claude/sdlc-review.json.example` |
| `agent-tier-gate` hook (Opus dispatch needs a TIER reason; appends the context-budget block) | `src/hooks/agent-tier-gate.js`, `src/hooks/lib/context-budget.js` |
| `read-trim` hook (trims whole-file Reads over 12K chars inside sub-agents) | `src/hooks/read-trim.js`, `src/hooks/lib/read-trim.js` |
| Orchestrator mode hook and `/sdlc:orchestrate` | `src/hooks/orchestrator-mode.js`, `commands/orchestrate.md` |
| `/sdlc:steps` and the steps resolver (`steps` block of `sdlc-review.json`) | `commands/steps.md`, `src/hooks/steps-cli.js`, `src/hooks/lib/steps.js` |
| `/sdlc:handoff` | `commands/handoff.md` |
| `/sdlc:model-spend` and its tool | `commands/model-spend.md`, `tools/model-spend.js` |
| `/sdlc:fit` and its tool | `commands/fit.md`, `tools/usage-fit.js` |

See `README.md` for how the pieces fit together at run time.

## Code Review

The review system exists to produce code that is **correct, tested,
readable, optimized**, in that order of priority. The reviewer criteria in
`agents/code-reviewer.md` are the single source for criteria,
method, constraints and report format; the skills and the docs refer to
that file rather than restate it.

**Reviewing this project's own gates.** The hooks guard against honest
mistakes in the ordinary commands Claude writes. They do not guard against
adversarial shell. A hook that reads command text can never prove what
bash will do, so an invariant such as "approve only when the hook knows
the message" cannot pass an adversarial reviewer. The co-author fix spent
four `code-reviewer-deep` rounds chasing process substitution,
backslash-newline joins and `3<<` heredocs.

- Every reviewer brief for a hook or gate diff states that threat model and
  lists its non-goals. Genuine findings get fixed: a bug in a command shape
  Claude writes, or a regression in an existing gate. A shape Claude would
  not write is a rabbit hole. It is ADVISORY, not CRITICAL, and it is named
  as a gap, not chased.
- Stop at the two-round cap. Do not offer a third round. Commit with the
  open gaps named in the commit message and PR, and let the owner decide
  from there.

Every git read in the pre-commit hooks fails closed (`lib/git-read.js`),
and `lib/commit-command.js` blocks any commit whose contents cannot be
known from the index at hook time. Staging and committing must be two
separate Bash commands -- that is load-bearing, not style.

Note for anyone editing these docs: the commit classifier inspects Bash
command text, so a heredoc containing the literal two-word git commit
phrase is itself blocked. Write such files with the Write tool.
