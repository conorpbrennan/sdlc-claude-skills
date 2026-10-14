# Step 7 — review round 1

Reviewer: sdlc:code-reviewer (Sonnet), throwaway worktree at HEAD 4d5dab1 with the staged diff applied. Under 1 minute.

Verdict: PASS.

- `tools/test-plugin-version.js`: 27/0 on the staged tree.
- Red confirmed: the staged test against `git show HEAD:tools/plugin-version.js` in a scratch copy with `src/` alongside gave 26 passed, 1 failed, the features-only exit-0 case, "not above HEAD's 1.0.0".
- Status hash identical before and after (one stray probe file created and removed in the worktree, never in the index).

Answers:
1. Only `isFeatureFile` paths reach the exemption: `files.length > 0 && files.every(isFeatureFile)`; `features/x.txt`, `a.js` and `docs/y.md` mixed with a record all exit 1.
2. A failed read never exempts: `gitRead` gives `out: null`, and `checkStaged` returns `{ ok: false }` first. Readable without a test.
3. `isFeatureFile`, `gitRead`, `splitNul` imported; `versionAt` unchanged.

ADVISORY, not actioned:
- `feature-file.js` already exports `onlyFeatureFiles` (non-empty and all feature files); using it would keep the empty-list rule in one place. The brief named `isFeatureFile`.
- No test forces the staged-path read to fail (e.g. a non-repo cwd). Not a FAIL; the branch fails closed by inspection.
- `features/../src/a.md` passes the prefix test; adversarial, out of the threat model.

TDD_GATE: PASS
