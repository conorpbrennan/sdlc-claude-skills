## Pre-Commit Hygiene Gate

The `pre-commit-hygiene.js` hook runs `ruff check --fix`, `ruff format`, and
a targeted `pytest` before allowing `git commit` in opted-in repos. The
targeted run covers only the test files that match the staged modules
(`test_<basename>*.py` found anywhere in the repo outside `.venv`,
`node_modules` and `archive`, plus any staged test file), with
`--cov=<pkg>` and `diff-cover --fail-under=95` on the result. With no
matching test it says so and runs the `smoke` marker, or passes with a
`WARNING` line when the repo has none. The full suite runs in
`/sdlc:verify` and `/sdlc:commit-prep`. Pytest runs `-n auto --dist loadfile`
when xdist imports; move fixed-path fixtures (`.db`, `/tmp/<name>`) to
`tmp_path_factory` before opting in. Opt-in is per-repo via `~/.claude/hygiene-repos.json`. A passing run writes
`.git/.claude-last-hygiene` (body `PASS\n<staged-diff-hash>`, 10-minute TTL)
so unchanged re-commits skip the work.

To opt in a new repo: add a top-level key (repo path with forward slashes)
to `repos` in `~/.claude/hygiene-repos.json` with `setup` (shell lines) and
`checks` (list of `{ name, command }`). See `.claude/hygiene-repos.json.example`.

Note: the hook runs `bash -c` (not a login shell), so anything your profile
sets up needs to go in `setup`, e.g. conda: `source /path/to/conda/etc/profile.d/conda.sh && conda activate <env>`.

Emergency override: `printf 'PASS\n%s' "$(git diff --cached | git hash-object --stdin)" > .git/.claude-last-hygiene`.
