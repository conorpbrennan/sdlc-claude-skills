# Step 2 — review round 1

Reviewer: sdlc:code-reviewer (Sonnet), throwaway worktree at HEAD e3cda69 with the staged diff applied. Brief stated the bounded threat model (honest verifier output, ordinary repos). Under 1 minute.

Verdict: PASS.

- Both suites in the worktree: 104/0 and 33/0.
- Six mutations in a scratch copy, each red: verdict ignores row problems (4 failures); invalid trailer ignored (9); row-set check dropped (9); empty-evidence rule dropped (4); empty-tree null dropped (1); `dirtyPaths` returns `[]` on read error (6).
- Worktree status hash unchanged before and after.

Answers:
1. Yes. `codeTreeHash` and `dirtyPaths` return null when `gitRead` gives `out === null`; an empty filtered tree also gives null.
2. Yes. PASS only when `problems` is empty; each of the four conditions pushes a problem; mutations confirm.
3. No. Criterion text comes from `criteria[i]`; the report supplies only result and evidence; an unrecognised result renders UNVERIFIED.
4. Yes. Imported `isFeatureFile` on each `ls-tree -z` path; no regex.
5. No. `fresh` only after both hashes are computed and compared.

Red confirmed from the test bodies and mutations.

ADVISORY, not actioned:
- `verification.js:23` `path.join(__dirname, 'feature-file')` works around the `BARE_INVOCATION` false positive; remove when the guard is fixed.
- A table row whose first cell is not a number (`| one | PASS | x |`) is ignored; the row-set check then fails it as missing, so it fails closed.

TDD_GATE: PASS
