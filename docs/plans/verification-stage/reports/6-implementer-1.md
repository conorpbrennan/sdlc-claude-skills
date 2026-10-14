STEP: 6 (A PreToolUse hook checks verification before `gh pr create`, advisory by default)

GATE:
- `node src/hooks/test-pre-pr-verify.js`: exit 0, 58 passed, 0 failed.
- `node src/hooks/test-hook-output.js`: exit 0, 24 passed, 0 failed.
- `node src/test-plugin-layout.js`: exit 0, 133 passed, 0 failed.
- `claude plugin validate .` (own exit code): 0.
- Baseline suites: all 0 failed except `test-pre-commit-review.js` 462/10, the same at HEAD without this step (see DISAGREEMENTS and the orchestrator's correction).
  - JS: commit-command 297/0, fast-path-languages 74/0, feature-file 19/0, hook-output 24/0, pr-command 35/0, protect-user-dir 13/0, record-verification 35/0, review-markers 33/0, session-start-instructions 73/0, source-files 67/0, tdd-mandate 188/0, timing-log 25/25, verification 108/0, claude-md-section 67/0, plugin-layout 133/0, suite-isolation 35/0, unmerge-claude-md 86/0, unmerge-hooks 22/0, tools/test-plugin-version 22/0.
  - Shell: claude-attribution-note 6/0, enforce-co-author 53/0, post-commit-feature 26/0, post-commit-hook 17/0, pre-commit-feature 57/0, pre-commit-hygiene 22/0, session-start-feature 28/0, stop-hook 16/0, tdd-order 6/0, src/test-uninstall.sh 98/0.
- GUARDS: all pass (counts above).

RED FIRST:
- `test-pre-pr-verify.js` exit 1, e.g. "FAIL: stdout parses to approve and nothing else — expected {"decision":"approve"}, actual null" (script missing).
- `test-hook-output.js`: "TypeError: hookOutput.notice is not a function".
- `test-plugin-layout.js`: "FAIL: PreToolUse: matchers, scripts, order and timeouts", expected six hooks, actual five (after EXPECTED_WIRING, before hooks.json).

FILES: created `src/hooks/pre-pr-verify.js`, `src/hooks/test-pre-pr-verify.js`, `.claude/verify-repos.json.example`; extended `hooks/hooks.json`, `src/test-plugin-layout.js`, `src/hooks/lib/hook-output.js`, `src/hooks/test-hook-output.js`, `.gitignore`; plan §9. Exactly the declared set.

DISAGREEMENTS:
- Plan §4 baseline says 0 failed; `test-pre-commit-review.js` reports 10 failed at HEAD before this step. Implementer attributed it to machine mandate config. **Orchestrator correction:** bisected on clean worktrees, 472/0 through 3dbf51d and 462/10 at 91c6468. The cause is the hook's split rule reading HEAD (step 4's commit is test-only by `isTestOnlyCommit`, its other paths being `.md`) while the suite stages fixtures in the real repo with no transcript. Test-isolation gap; clears once HEAD carries implementation. Recorded in plan §9 (g).

DECISIONS THE PLAN LEFT OPEN (plan §9, step 6; fail closed in enforce, never deny in advisory):
- (a) A parsed config with no `repos` object is unparsable and denies.
- (b) The listed repo's mode is validated before the branch is read; an invalid mode, or a null or non-object entry, denies even if fresh.
- (c) With several listed keys holding the cwd, the longest decides the mode on a `locateRepo` error; keys match as written and by real path.
- (d) A failed branch read, a record unreadable other than ENOENT, and `checkFresh` `error` go to decision 5 or 8. Only ENOENT is `no-record`.
- (e) A non-feature branch such as `main` is `no-record`.
- (f) Config-level errors name the record as `features/<branch>.md`.

MEASUREMENTS:
- Q3: hook on an `ls` command, median of 20 runs, 36.4 ms; bare `node -e 0` 25.1 ms; about 11 ms over node startup (node -e spawnSync loop with stdin `{"tool_input":{"command":"ls"}}`). `isPrCreate` runs before any config read or git call; test (b) confirms no git spawn under a failing-git shim.
- Q1: enforce denies in every probe, each tested: broken GIT_DIR (g), detached HEAD (h), marker that is a directory (i), config that is a directory (i), unparsable config, empty config, no `repos`, invalid mode, non-string mode, null entry.
- Q2: in advisory, broken GIT_DIR and marker-directory give a notice. The only denies are the crash handler and an unreadable or invalid config or mode (mode unknown).
- Q4: notices via `hookOutput.notice`, denies via `hookOutput.deny`; the approve output is hand-built, as in the other hooks.
- Q5: hooks.json order feature, review, pending, co-author, hygiene, pre-pr-verify (2000); EXPECTED_WIRING matches.
- Q6: header names the isPrCreate misses (bash -c, eval, $GH, gh --repo, sudo -u), the cwd-only judgement (`cd other && ...`), the D9 linked-worktree gap, and the forgeable local marker.

BUDGET USED: 1 build round; review rounds not yet run (1 + 2).

NEXT:
- The hook judges the cwd the hook process starts in, not a `cd` target inside the command.
- `notice` is the first output with no `decision` key. Claude never sees `systemMessage`; step 8's snippet line is how Claude learns the rule.
