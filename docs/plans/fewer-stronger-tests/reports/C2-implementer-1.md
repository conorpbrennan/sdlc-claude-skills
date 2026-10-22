STEP: C2 (test isolation: "amend -> approve" in a worktree)

Cause: the case ran the hook in the suite's own cwd (the real checkout). The hook reads that checkout's index and branch. A checkout with staged source files on a detached HEAD gets a correct block ("Feature work must happen on a branch, not HEAD"). A clean HEAD worktree passes, so the failure needs staged source, which a review worktree has after `git apply --index`. Not a hook defect: the hook blocked as designed. Hook not edited.

Fix: the case now runs via `run_hook` in a `seed_repo` temp repo with nothing staged. Decision unchanged: `"approve"`.

GATE:
- Fresh `git worktree add --detach` of HEAD with the fix copied in, plus a staged source file (`src/hooks/lib/git-read.js`) to reproduce the failing condition: `bash src/hooks/test-pre-commit-feature.sh` -> `=== 57 passed, 0 failed ===`
- Fresh detached worktree of HEAD, fix copied in, clean index: `=== 57 passed, 0 failed ===`
- Main tree: `=== 57 passed, 0 failed ===`
- `bash tools/run-tests.sh` -> exit 0
- `node src/test-plugin-layout.js` -> Results: 154 passed, 0 failed
- `node src/test-suite-isolation.js` -> Results: 43 passed, 0 failed
- `claude plugin validate .` -> "Validation passed with warnings" (exit not separately captured; passed)

RED FIRST: in a fresh detached worktree of HEAD (old test) with `src/hooks/lib/git-read.js` staged:
`FAIL: amend -> approve` / Expected: "approve" / Got: deny, "Feature work must happen on a branch, not HEAD" / `=== 56 passed, 1 failed ===`. A clean HEAD worktree with no staged files passed 57/0, so staged source is the trigger.

FILES: touched only `src/hooks/test-pre-commit-feature.sh` (declared set). Index untouched.

DISAGREEMENTS: none. Note: the failure needs staged source in the checkout, not just a worktree or detached HEAD; the facts block implied worktree alone. The xargs -P16 failure is unexplained by this cause unless the other tests staged files in the shared checkout; not reproduced.

DECISIONS THE PLAN LEFT OPEN: used the existing `seed_repo`/`run_hook` helpers rather than a new fixture; the conservative choice, no new code. The "non-commit -> approve" case still runs in cwd; it never reads git state (non-commit passes through), left unchanged.

MEASUREMENTS: 57 passed / 0 failed (main, worktree); 56/1 red. Commands above.

BUDGET USED: about 8 calls of about 20; one round.

NEXT: nothing. Worktrees removed (`git worktree list` shows only the main tree).

Test command run: `bash src/hooks/test-pre-commit-feature.sh` -> `=== 57 passed, 0 failed ===`
git diff --stat: src/hooks/test-pre-commit-feature.sh | 6 +++++-  (1 file changed, 5 insertions(+), 1 deletion(-))
