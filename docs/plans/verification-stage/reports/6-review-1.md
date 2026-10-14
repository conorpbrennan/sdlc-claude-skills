# Step 6 — review round 1

Reviewer: sdlc:code-reviewer (Sonnet), throwaway worktree at HEAD 91c6468 with the staged diff applied. Brief stated the bounded threat model and its non-goals. Under 1 minute.

Verdict: PASS.

- `test-pre-pr-verify.js` 58/0; `test-hook-output.js` 24/0; `test-plugin-layout.js` 133/0. The real hook driven by spawnSync with stdin JSON.

Answers:
1. Enforce errors deny (all rc 0, deny): broken `GIT_DIR` ("Could not locate the repository"); config path that is a directory (EISDIR); unparsable config; detached HEAD (`no-record`); feature record that is a directory; no acceptance section. Marker-is-a-directory taken from the staged test (`test-pre-pr-verify.js:262-265`), not probed.
2. Advisory cannot deny: every advisory `report()` returns `notice` (no `decision`); same states gave a bare `systemMessage`. Deny paths: crash handler, unknown mode, enforce.
3. Non-PR command: `isPrCreate` first, `approve()` exits before any config read or git spawn. `ls`: 43 ms per call vs 26 ms for bare `node -e 0` (about 17 ms, mostly requires). Implementer measured 36.4 vs 25.1 ms median of 20.
4. Notice via `hookOutput.notice`, deny via `hookOutput.deny`; only the crash-handler deny is inline, as specified.
5. `hooks.json` entry (last in PreToolUse Bash, timeout 2000) matches `EXPECTED_WIRING`.
6. Header names the gaps: `bash -c`/`eval`/`$GH`/`--repo`/`sudo`, `cd other && ...`, linked worktree outside the listed toplevel, forged marker.

The reviewer did not run the claimed red. **Orchestrator confirmed it** in the same worktree before writing the marker: without `pre-pr-verify.js` the suite gave 5 passed, 53 failed ("stdout parses to approve and nothing else"); with HEAD's `hook-output.js`, "TypeError: hookOutput.notice is not a function"; with HEAD's `hooks.json`, "FAIL: PreToolUse: matchers, scripts, order and timeouts".

ADVISORY, not actioned:
- A broken `verify-repos.json` denies `gh pr create` in every repo, listed or not, because the config-error deny precedes the D9 match. Fail-closed and per spec (an unparsable config cannot be matched). Worth knowing when editing that file.
- "The PR is allowed anyway" appears only when the mode is known; consistent, since an unknown mode denies.

After the commit (4d5dab1), `test-pre-commit-review.js` is back to 472/0, confirming the HEAD-dependent diagnosis.

TDD_GATE: PASS
