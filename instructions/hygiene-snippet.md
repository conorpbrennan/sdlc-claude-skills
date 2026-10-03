## Pre-Commit Hygiene Gate

The `pre-commit-hygiene.js` hook runs `ruff check --fix`, `ruff format`, and
`pytest -q` before allowing `git commit` in opted-in repos. Opt-in is
per-repo via `~/.claude/hygiene-repos.json`. A passing run writes
`.git/.claude-last-hygiene` (body `PASS\n<staged-diff-hash>`, 10-minute TTL)
so unchanged re-commits skip the work.

To opt in a new repo: add a top-level key (repo path with forward slashes)
to `repos` in `~/.claude/hygiene-repos.json` with `setup` (shell lines) and
`checks` (list of `{ name, command }`). See `.claude/hygiene-repos.json.example`.

Note: the hook runs `bash -c` (not a login shell), so anything your profile
would normally set up must be done explicitly in `setup` — conda, for
instance: `source /path/to/conda/etc/profile.d/conda.sh && conda activate <env>`.

Emergency override: `printf 'PASS\n%s' "$(git diff --cached | git hash-object --stdin)" > .git/.claude-last-hygiene`.
