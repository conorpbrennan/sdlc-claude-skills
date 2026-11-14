STEP: S5. PreToolUse hook on `gh pr create` that checks the branch-review marker, wired and switchable.

GATE:
- `node src/hooks/test-pre-pr-branch-review.js`: rc 0, "Results: 51 passed, 0 failed".
- `node src/hooks/test-pre-pr-verify.js`: rc 0, 63 passed, 0 failed.
- `node src/hooks/test-steps.js`: rc 0, 62 passed, 0 failed.
- `node src/test-plugin-layout.js`: rc 0, 167 passed, 0 failed.
- `node src/test-suite-isolation.js`: rc 0, 54 passed, 0 failed.
- `claude plugin validate .`: rc 0, "Validation passed with warnings" (warnings not inspected, not from this step's files as far as shown).
- `node src/hooks/steps-cli.js list | grep pre-pr-branch-review`: prints `branch-review  pre-pr-branch-review  on  default  runs only in repos listed in ~/.claude/branch-review-repos.json`.
- `git diff --stat HEAD -- src/hooks/pre-pr-verify.js`: empty.
- Extra: `node src/hooks/test-session-start-instructions.js`: 544 passed, 0 failed.

RED FIRST: ran `node src/hooks/test-pre-pr-branch-review.js` with the hook absent. Failure text: `FAIL: not a PR command: kind / expected: "approve" / actual: "other:"` (and the same for every row; the child process printed nothing because the hook file did not exist).

FILES: touched, all in the declared set: NEW src/hooks/pre-pr-branch-review.js, NEW src/hooks/test-pre-pr-branch-review.js, hooks/hooks.json, src/hooks/lib/steps.js, src/hooks/test-steps.js, src/test-plugin-layout.js. No difference. Unrelated pre-existing edits (features/statusline-windows-datadir.md, run/tracker.md) left alone.

DISAGREEMENTS: none. The spec says the recipe tag `<n>` is substituted by the caller (S1 report) while the step says the text says "replace round<n> with the round used"; I followed the step: RECIPE_TAG is passed unchanged and the text tells the reader to replace it. The recipe runs verbatim as is (the literal `round<n>` is written if not replaced; the round is not checked, P5).

DECISIONS THE PLAN LEFT OPEN:
- Marker path null (cannot locate): report state `error` in the repo's mode (not approve), since a read failure must not approve.
- States for config errors, invalid mode and invalid base are labelled `error`, mode unknown (deny).
- `empty` state gets a fixed explanatory text (no recipe, since there is nothing to review).
- Recipe sits on its own line starting with `printf `, so a test and a reader can lift it exactly.
- Step count in test-steps.js assertion 'areasShape' raised 22 to 23 (the only enumeration changed).

MEASUREMENTS: test counts above, each from the command quoted in GATE. Hook file length not measured.

BUDGET USED: about 17 tool calls, well under 40.

NEXT: the hook uses `markerPaths(toplevel).branch` (a path inside the git dir), recipe text format is "Fix: run <cmd>. ... \n<printf line>". A later step that documents the hook (S6+) can quote the header comment in src/hooks/pre-pr-branch-review.js. test file has 5 blocks, 19 table rows, 51 assertions. Test command run: `node src/hooks/test-pre-pr-branch-review.js` -> "Results: 51 passed, 0 failed".

git diff --stat (tracked files I changed; new files untracked):
 hooks/hooks.json          | 5 +++++
 src/hooks/lib/steps.js    | 2 ++
 src/hooks/test-steps.js   | 2 +-
 src/test-plugin-layout.js | 1 +
 plus NEW src/hooks/pre-pr-branch-review.js and src/hooks/test-pre-pr-branch-review.js
