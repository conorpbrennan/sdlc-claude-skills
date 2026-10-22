STEP: C2. Reviewer: sdlc:code-reviewer (Sonnet), round 1, in a throwaway worktree. Verdict: PASS (TDD_GATE: PASS).

The diff is one hunk, `src/hooks/test-pre-commit-feature.sh:131-136`: the hook ran with cwd = the real checkout; now `REPO_AMEND=$(seed_repo)` and `run_hook "$REPO_AMEND" "git commit --amend --no-edit"`, with a why-comment. Expected decision `"approve"` unchanged. No sleep or retry.

RED confirmed: a copy with HEAD's test and one staged source file gave 56 passed, 1 failed (`FAIL: amend -> approve`); the fixed test gave 57/0.

Answers:
1. No assertion weakened; the command is still `git commit --amend --no-edit`. The sibling case "amend with staged source on main -> block" covers the block direction.
2. `run_hook` cds into the repo; `seed_repo` uses `mktemp -d` registered with `track`.
3. Intent preserved: temp repo on `main`, one init commit, nothing staged, matching the main-tree state the original ran in.

CRITICAL: none. IMPORTANT: none.
ADVISORY: the case proves approve when nothing is staged; renaming it "amend with nothing staged -> approve" would stop a reader assuming amends are always approved.

Process note: the reviewer's `cp -r` copy shared the review worktree's gitdir, so its probe staged a throwaway change to `src/hooks/lib/commit-command.js` in that worktree's index. The orchestrator confirmed the main tree's index held only the six staged paths, then removed the worktree before writing the marker.
