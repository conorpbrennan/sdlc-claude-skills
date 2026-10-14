# Step 1 — review round 1

Reviewer: sdlc:code-reviewer (Sonnet), in a throwaway worktree at HEAD 1778c08 with the staged diff applied (`git apply --index`). About 1 minute.

Verdict: PASS.

- `node src/hooks/test-feature-file.js` in the worktree: 19 passed, 0 failed.
- Red confirmed by mutation: tests and `commands/feature-new.md` copied to a scratch dir with `git show HEAD:src/hooks/lib/feature-file.js` swapped in: 2 passed, 17 failed.
- Edge probes: CRLF parses to `["a","b"]`; heading at EOF with no newline gives `[]`; a `## Verification` block at EOF with no trailing newline is replaced cleanly. Worktree status hash unchanged before and after.

Answers:
1. Yes. `parseAcceptance` slices to `sectionBounds`; tests assert a numbered line in `## History` and a `9. leaked` line under `## Files involved` stay out.
2. Yes. End regex `/^## /m`; tests cover `### Rows` inside Verification and `### Notes` inside Acceptance.
3. Yes. Test (a) reads `commands/feature-new.md` with `fs.readFileSync`, requires exactly one column-0 fenced block starting `## Acceptance`, and derives the expected list from it.
4. Yes. `feature-new.md` step 4 places the section immediately above `## Files involved` and says never to edit an existing `## Verification` section; the step 5 template matches.

No existing export changed behaviour.

ADVISORY, not actioned:
- Prefix heading match (the §9 decision) also matches `## Verification-old` or `## Acceptance criteria`. The recorder's own heading is `## Verification — <date> @ <sha>`, so prefix matching is needed. Tighten to `^## Verification(\s|$)` later if a record ever holds such a heading.
- `replaceVerification("", s)` returns `"\n\n" + s`. Real records are never empty.

TDD_GATE: PASS
