STEP: S6c. enable, disable and status subcommands in src/hooks/branch-review-cli.js.

GATE:
- `node src/hooks/test-branch-review-cli.js`: `70 passed, 0 failed`.
- `node src/hooks/test-branch-repos-write.js`: `83 passed, 0 failed`.
- `node src/test-plugin-layout.js`: exit 0. `node src/test-suite-isolation.js`: exit 0. `claude plugin validate .`: exit 0.
- `! grep -qE "writeFileSync|renameSync" src/hooks/branch-review-cli.js`: exit 0.
- `git diff --quiet HEAD -- hooks/hooks.json src/hooks/pre-pr-verify.js src/hooks/lib/steps.js src/hooks/lib/branch-repos-write.js .claude/verify-repos.json.example commands/branch-review.md`: exit 0.
- `bash /tmp/s6c-cycle.sh` (from repo root): last line `CYCLE OK`. The shell's own exit code was masked by a `| tail` pipe, but `set -eu` means the last line proves it passed. Output also showed the stderr line `--mode must be advisory or enforce` from the `--mode loud` row.

RED FIRST: the new blocks were added before the implementation. Run result: 14 FAIL lines, for example `FAIL: enable outside a repo (exit, ok, bytes equal)`, `FAIL: status unlisted (exit, fields)`, `FAIL: enable (exit, fields)`, `FAIL: disable again (exit, fields)`, `FAIL: nested status says listed false`, `FAIL: nested enable adds its own key`. The usage rows that expect exit 2 already passed red, because unknown subcommands exited 2 before this step.

FILES: touched `src/hooks/branch-review-cli.js` and `src/hooks/test-branch-review-cli.js` only (plus the always-permitted paths). `features/statusline-windows-datadir.md` and `run/tracker.md` show in `git diff --stat` from before my start; I did not edit them. No difference from the declared set.

DISAGREEMENTS: none.

DECISIONS THE PLAN LEFT OPEN:
- `plan` still lets a repeated `--repo` pass (last wins). Only `enable`, `disable` and `status` reject repeated flags, so `plan` behaviour is unchanged. Conservative.
- `disable --mode x`, any positional argument, and `--repo` repeated on the new subcommands exit 2. This reads "unknown flag" strictly.
- `status` on an unlisted repo still resolves a base from origin/HEAD (`baseOf` of no entry gives null). If that fails, base and baseSource are null plus a warning.
- `status` on a detached HEAD or a branch-read failure adds a warning and still exits 0. `enable` and `disable` exit 1.
- `disable` message for a removal is `removed <key>`. The step only fixes the `not listed` text.
- The step-off warning reads: `the pre-pr-branch-review step is off, so the gate does not run; /sdlc:steps on branch-review turns it on`. `stepState` warnings are passed through into `warnings`.
- Tests turn the step off through `SDLC_REVIEW_CONFIG_USER` (a temp file with `steps.branch-review.pre-pr-branch-review: false`). `run()` got an optional `extraEnv` argument for this.

MEASUREMENTS: test counts above, from the quoted commands. The CLI grew by about 150 lines (the diff stat shows 162 changed lines, including header comments). The test file grew by 104 lines.

BUDGET USED: about 14 tool calls, one pass, no review round yet.

NEXT:
- S7 can route to `enable`, `disable` and `status` directly. `status` has no `ok` field. `enable` and `disable` print `{ ok: false, error }` and exit 1 on a refusal.
- Writing the new tests through bash with `git(['commit'...` in a heredoc trips the commit-classifier hook. Use the file tool for any such text.
- Test commands run: `node src/hooks/test-branch-review-cli.js` gives `70 passed, 0 failed`.

git diff --stat (mine): `src/hooks/branch-review-cli.js` 162 lines changed, `src/hooks/test-branch-review-cli.js` 104 lines changed.
