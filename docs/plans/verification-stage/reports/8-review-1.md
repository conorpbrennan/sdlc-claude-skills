# Step 8 — review round 1 (by hand, docs-only)

Reviewer: orchestrator (Opus), §21.2 by hand. The hook does not review a `.md`-only diff.

Diff: `README.md`, `CLAUDE.md` (What ships here), `instructions/feature-workflow-snippet.md` (one bullet), plus the always-permitted plan §10, tracker and reports.

## GATE (docs commit)

- `node src/hooks/test-session-start-instructions.js`: 73 passed, 0 failed. Context 8,442 characters (was 8,347; limit 8,500).
- `node src/test-plugin-layout.js`: 133 passed, 0 failed (the snippet's `/sdlc:verify` is namespaced; `~/.claude/verify-repos.json` does not match `BARE_INVOCATION`).
- The dogfood conditions (recorder exit 0, `**Verdict**: PASS` naming the docs commit's short sha, hook output after the feature-record commit) are run after this commit and reported in the PR.

## REVIEW

1. Every path named in the new text resolves: `agents/verifier.md`, `commands/verify.md`, `src/hooks/pre-pr-verify.js`, `src/hooks/record-verification.js`, `.claude/verify-repos.json.example`, `src/hooks/lib/verification.js`, `src/test-plugin-layout.js`, `instructions/feature-workflow-snippet.md`, `src/hooks/test-pre-commit-review.js` (checked with `test -e`).
2. README calls `advisory` the default and what a missing `mode` means, and says the notice is seen by the user, not Claude, who learns the rule from the session instructions (D1). D2 shape quoted. D4 stated (code tree without `features/*.md`, plus criteria). D5 stated (only `gh pr create`). D6 is covered by "missing or stale", plus the config-error block in enforce.
3. The verification table is written by the dogfood run after this commit; checked then.

No doc contradicts D1–D6. The snippet line is shorter than the plan's example (drops the `## Acceptance` clause) to keep 58 characters of headroom; recorded in §10.

Verdict (docs): PASS.
