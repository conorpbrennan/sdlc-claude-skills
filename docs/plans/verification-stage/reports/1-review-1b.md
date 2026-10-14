# Step 1 — review round 1, rerun after marker expiry

Why: round 1's PASS marker was written at about 19:06 and the commit ran at 19:47. The marker TTL is 10 minutes (`MARKER_MAX_AGE_MS`), so the hook refused it. Same staged diff (hash prefix c5f18fca); a fresh round-1 review, not a fix round.

Reviewer: sdlc:code-reviewer (Sonnet), fresh worktree at HEAD 1778c08 with the staged diff applied. Under 1 minute.

Verdict: PASS.

- `node src/hooks/test-feature-file.js`: 19 passed, 0 failed. Against HEAD's `feature-file.js` in a scratch copy: 2 passed, 17 failed (red confirmed).
- Answers 1–4: yes, with the same evidence as round 1 (`sectionBounds` cut at `/^## /m`; `### Rows` and `### Notes` tests; (a) reads `commands/feature-new.md` from `REPO_ROOT`; `feature-new.md` step 4 placement and the never-edit rule).
- `feature-file.js`: 49 insertions, no deletions; existing exports unchanged.

ADVISORY, not actioned: prefix heading match (as round 1); a `## Acceptance` line inside a fenced block in a record would be taken as the heading. Honest-mistake edge, not a gate gap.

TDD_GATE: PASS
