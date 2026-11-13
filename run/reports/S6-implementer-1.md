STEP: S6. A CLI that plans a branch review and checks a report.

GATE:
- `node src/hooks/test-branch-review-cli.js` -> exit 0, "43 passed, 0 failed".
- `node src/test-plugin-layout.js` -> exit 0.
- `node src/test-suite-isolation.js` -> exit 0.
- `claude plugin validate .` -> exit 0.
- `node src/hooks/branch-review-cli.js plan` in this repo -> printed `{"ok":true,"toplevel":"/home/coder/dev/sdlc-claude-skills",...}`, parses as JSON (checked with JSON.parse, "json ok").

RED FIRST: ran `node src/hooks/test-branch-review-cli.js` before the CLI existed. First failure: "FAIL: normal branch (exit) expected: 0 actual: 1" then "FAIL: normal branch (facts) expected: {...} actual: {}" (node could not find the CLI, exit 1, no JSON on stdout). Every later row failed the same way.

FILES: touched src/hooks/branch-review-cli.js (new), src/hooks/test-branch-review-cli.js (new), src/test-plugin-layout.js (NOT_HOOKS gains branch-review-cli.js). Matches the declared set. No differences.

DISAGREEMENTS: none.

DECISIONS THE PLAN LEFT OPEN:
- A broken repos config adds the config error text as a warning and falls back to no base. Plan said "a config error adds a warning".
- `--repo` feeds `locateRepo`; all later git reads use the toplevel as cwd.
- `plan` fails with ok:false if `git rev-parse HEAD` or `git status --porcelain` cannot be read (the conservative choice: never a plan with a null head).
- Order of failures: no repo, branch unreadable, detached, invalid config base, no base, unreadable diff, empty range.
- `review.warnings` from `resolveBranchReview` are appended to `warnings`.
- `check-report` takes exactly one positional; zero or more than one is a usage error (exit 2). Unknown subcommand is exit 2.
- Test layout: 5 blocks (plan table, shape/--repo, usage, recipe, check-report table). The `plan` table has 12 rows beyond the plan's list: cap-equal boundary (5 lines, cap 5 -> not over), unlisted repo, broken config file, invalid config `-x` base, not a repository.

MEASUREMENTS: test run `node src/hooks/test-branch-review-cli.js`: 43 passed, 0 failed. Scratch repo change = 5 changed lines (a.js 2, pkg/b.js 3). Real-repo plan printed changedLines 2561 against origin/main (from `node src/hooks/branch-review-cli.js plan`).

BUDGET USED: about 13 tool calls, one pass, no review round yet.

NEXT:
- `plan` output on a failure has only `ok` and `error`; callers must check `ok`.
- `overCap` is `changedLines > cap`; cap 5 with 5 lines is not over (tested).
- `groups` come from `groupByTopDir`: a root file is its own group named by the file.
- `dirty` is true for untracked files too (any `git status --porcelain` output).
- The `plan` run in this repo put the 2561-line branch against the default cap 25000 (overCap false).

Test command: `node src/hooks/test-branch-review-cli.js` -> "43 passed, 0 failed".
git diff --stat (tracked): src/test-plugin-layout.js | 2 +-  (1 insertion, 1 deletion). Two new untracked files: src/hooks/branch-review-cli.js, src/hooks/test-branch-review-cli.js.
