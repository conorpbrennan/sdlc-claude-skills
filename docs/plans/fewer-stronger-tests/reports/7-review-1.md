STEP: 7 (after fix round 1). Reviewer: sdlc:code-reviewer (Sonnet), round 1, in a throwaway worktree, on the whole staged diff. Verdict: PASS (TDD_GATE: PASS).

RED confirmed by mutation: the staged test against HEAD's pre-commit-review.js in a temp repo gave 505 passed, 2 failed (the two tests-added assertions); the decision-unchanged assertion passes on both. Staged tree: 507 passed, 0 failed.

Answers:
1. `testsAddedLine` is called at pre-commit-review.js:1316 inside the string argument of the existing `block('review-required', ...)`, after `writeBlockMarker`. It reads no files, spawns nothing, writes nothing. Approve paths return earlier. Ceiling 3 changes only the text.
2. try/catch around the whole body; `diffText === null` gives `Tests added: unreadable.`; the block still fires. The read-failure path (line 1081) already forces full review.
3. `diffRead` (line 1071) reused; no new spawn.
4. Moved no_tests cases: every decision and reason assertion is textually identical to HEAD. `buildTddScratch()` makes a two-commit temp repo whose HEAD changes `src/app.py`, so the test-only exemption cannot fire. Markers read via `tddScratch.readMarker()`, cleaned in each finally. Presentational case keys policy to the scratch path and restores it. Scratch dir removed on exit.

CRITICAL: none. IMPORTANT: none.

ADVISORY:
- Blank-line case now stages `head + '\n\n'` instead of `head + '\n'` (both blank-only; intent holds).
- README is the only place defining the rows figure as a decorator count.
- `bash tools/run-tests.sh` in the review worktree: 39 files, 1 failed — `src/hooks/test-pre-commit-feature.sh` "amend -> approve". Not in this diff. Orchestrator re-ran it in the main tree three times: 57 passed, 0 failed each. Fails in a worktree only; to the close-out list.
