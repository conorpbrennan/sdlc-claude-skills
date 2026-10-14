# Verification Stage

**Requirement**: Add a per-branch verification stage: acceptance criteria in the feature record, a read-only verifier agent, a recorder, and a gh pr create gate that is advisory by default.

**Started**: 2026-10-14
**Last updated**: 2026-10-14
**Branch**: verification-stage

## Acceptance

1. In a scratch repo listed in verify-repos.json with mode enforce, `gh pr create` with no verification marker is denied, and the deny reason names /sdlc:verify; with mode advisory the same command is allowed and a systemMessage names /sdlc:verify.
2. A verifier report whose trailer is VERIFY_GATE: PASS but which has an UNVERIFIED or FAIL row is recorded as FAIL, exits 1, and leaves no marker.
3. After a recorded PASS, committing only the feature record keeps the hook silent; committing a change to any other tracked file makes the hook report the verification as stale.
4. In a repo not listed in verify-repos.json, the hook's whole output for `gh pr create` is `{"decision":"approve"}`, with no systemMessage and no permissionDecision, and it spawns no git process.
5. The `## Acceptance` block written by /sdlc:feature-new's template is read back by parseAcceptance as the same criteria, in order.

## Files involved

- .claude-plugin/plugin.json
- commands/feature-new.md
- commands/feature.md
- docs/plans/verification-stage-tracker.md
- docs/plans/verification-stage.md
- docs/plans/verification-stage/reports/0-review-1.md
- docs/plans/verification-stage/reports/1-implementer-1.md
- src/hooks/lib/feature-file.js
- src/hooks/test-feature-file.js

## History

<!-- populated on commit -->
