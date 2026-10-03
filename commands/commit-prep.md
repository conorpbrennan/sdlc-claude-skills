---
description: Pre-flight ruff + pytest + coverage before git commit
argument-hint: [--skip-tests]
---

<objective>
Run the same checks the pre-commit hooks will run, so the next `git commit` passes both the hygiene gate and the review coverage gate in a single round-trip. Do NOT stage files and do NOT commit — this is a pre-flight only.

Parse `$ARGUMENTS` for `--skip-tests` (run lint/format only, skip pytest/coverage — useful for quick JS-only changes).
</objective>

<steps>
1. Resolve the repo root: `git rev-parse --show-toplevel` and normalise to forward slashes.
2. Read `~/.claude/hygiene-repos.json`. If `repos[<toplevel>]` exists, use its `setup` + `checks` as the authoritative pipeline — this guarantees parity with the `pre-commit-hygiene.js` hook.
3. If no entry exists, use the default pipeline (skip the `pytest` + `diff-cover` stages when `--skip-tests` is passed):
   - `ruff check --fix`
   - `ruff format`
   - `pytest --cov --cov-branch --cov-report=xml -q`
   - `diff-cover coverage.xml --compare-branch=HEAD --fail-under=95` (only if `coverage.xml` was produced)
4. Run each stage in a single `bash -c` invocation so environment (conda, PYTHONPATH) is preserved across stages. Stop on the first failing stage.
5. Report per-stage PASS/FAIL. On failure, print the last ~30 lines of combined output and stop — do not attempt to auto-fix beyond what the tools do themselves (ruff's `--fix` is enough).

The configured hygiene `checks` may reference `$STAGED_PY` / `$STAGED_PY_PKGS`, which the hygiene hook exports from the staged diff. For `/sdlc:commit-prep` (which runs before staging), export them from the working tree instead:

```bash
STAGED_PY=$(git diff --name-only --diff-filter=ACMR HEAD | grep '\.py$' | sed "s|^|$(pwd)/|" | tr '\n' ' ')
STAGED_PY_PKGS=$(echo "$STAGED_PY" | tr ' ' '\n' | grep -v '^$' | sed 's|/[^/]*$||' | sort -u | sed "s|^$(pwd)/||" | tr '\n' ',')
```

This covers unstaged + staged changes so the pre-flight catches everything the commit will eventually see.
</steps>

<output>
When all stages pass: `Pre-flight OK — safe to git commit.`

When a stage fails: print the failing stage name, tail output, and stop. Do not run `git add` or `git commit`.
</output>

<constraints>
- Do NOT stage, commit, push, or modify git state.
- Do NOT write to `.git/.claude-last-review` or `.git/.claude-last-hygiene` — the hooks own those markers and use content hashes, not a "claude said so" signal.
- If the repo is not Python (no `.py` files in the working tree), skip pytest/coverage silently and run only ruff steps.
</constraints>
