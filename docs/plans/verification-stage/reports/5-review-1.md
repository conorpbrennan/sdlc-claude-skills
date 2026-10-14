# Step 5 — review round 1

Reviewer: sdlc:code-reviewer (Sonnet), throwaway worktree at HEAD b22aced with the staged diff applied. Brief stated the bounded threat model. Under 1 minute.

Verdict: PASS.

- `test-pr-command.js` 35/0; `test-commit-command.js` 297/0 (baseline). Index hash unchanged.
- Red confirmed: the test copied to a scratch dir with no `pr-command.js` died with "Cannot find module '…/lib/pr-command.js'"; first assertion `yes('bare', 'gh pr create')`.
- Probes of the shapes Claude writes, all as expected: `--body "$(cat <<'EOF' … EOF)"` true; `git push -u origin b && gh pr create --fill` true; `… | cat` true; `--body-file /tmp/f` true; `cd x && gh pr create …` with heredoc body true; `FOO=1 gh pr create` true; a heredoc body holding only the phrase false; `echo gh pr create` false.

Answers:
1. No list copied: `WRAPPER_WORDS`, `SHELL_RESERVED_WORDS` imported. `ASSIGNMENT_RE` and `DURATION_RE` restated, commented as mirroring commit-command.js; not lists.
2. Yes: double and single quotes, a quoted `"gh"`, command substitution, two heredoc shapes, `ghx`/`xgh`/`/usr/bin/ghx`, wrong order, later argument, `undefined`, empty string, the commit-message case (also a two-`-m` form).
3. No: two names added to `module.exports` only; 297/0 unchanged.
4. Yes: header names `bash -c`/`eval`/`sh -c`, non-flag wrapper arguments (`sudo -u root`), `$GH`, quoted `"gh"`, `gh --repo x pr create` as ADVISORY; tests lock in `bash -c` and `sudo -u`.

ADVISORY, not actioned: the two restated regexes can drift (`pr-command.js:23,26`); switch to imports if commit-command.js ever exports them. Cost is one `tokenize` call, no spawn.

TDD_GATE: PASS
