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
- .claude/verify-repos.json.example
- .gitignore
- CLAUDE.md
- agents/verifier.md
- commands/feature-new.md
- commands/feature.md
- commands/verify.md
- docs/plans/verification-stage-tracker.md
- docs/plans/verification-stage.md
- docs/plans/verification-stage/reports/0-review-1.md
- docs/plans/verification-stage/reports/1-implementer-1.md
- docs/plans/verification-stage/reports/1-review-1.md
- docs/plans/verification-stage/reports/1-review-1b.md
- docs/plans/verification-stage/reports/2-implementer-1.md
- docs/plans/verification-stage/reports/2-review-1.md
- docs/plans/verification-stage/reports/3-implementer-1.md
- docs/plans/verification-stage/reports/3-review-1.md
- docs/plans/verification-stage/reports/4-implementer-1.md
- docs/plans/verification-stage/reports/4-review-1.md
- docs/plans/verification-stage/reports/5-implementer-1.md
- docs/plans/verification-stage/reports/5-review-1.md
- docs/plans/verification-stage/reports/6-implementer-1.md
- docs/plans/verification-stage/reports/6-review-1.md
- docs/plans/verification-stage/reports/7-implementer-1.md
- hooks/hooks.json
- src/hooks/lib/commit-command.js
- src/hooks/lib/feature-file.js
- src/hooks/lib/hook-output.js
- src/hooks/lib/pr-command.js
- src/hooks/lib/review-markers.js
- src/hooks/lib/verification.js
- src/hooks/pre-pr-verify.js
- src/hooks/record-verification.js
- src/hooks/test-feature-file.js
- src/hooks/test-hook-output.js
- src/hooks/test-pr-command.js
- src/hooks/test-pre-pr-verify.js
- src/hooks/test-record-verification.js
- src/hooks/test-review-markers.js
- src/hooks/test-verification.js
- src/test-plugin-layout.js
- tools/plugin-version.js
- tools/test-plugin-version.js

## History

- 2026-10-14 `b7301b5` — Let a features-only commit pass the plugin-version check
  - .claude-plugin/plugin.json
  - CLAUDE.md
  - docs/plans/verification-stage-tracker.md
  - docs/plans/verification-stage.md
  - docs/plans/verification-stage/reports/6-review-1.md
  - docs/plans/verification-stage/reports/7-implementer-1.md
  - tools/plugin-version.js
  - tools/test-plugin-version.js

- 2026-10-14 `4d5dab1` — Check verification before gh pr create, advisory by default
  - .claude-plugin/plugin.json
  - .claude/verify-repos.json.example
  - .gitignore
  - docs/plans/verification-stage-tracker.md
  - docs/plans/verification-stage.md
  - docs/plans/verification-stage/reports/4-review-1.md
  - docs/plans/verification-stage/reports/6-implementer-1.md
  - hooks/hooks.json
  - src/hooks/lib/hook-output.js
  - src/hooks/pre-pr-verify.js
  - src/hooks/test-hook-output.js
  - src/hooks/test-pre-pr-verify.js
  - src/test-plugin-layout.js

- 2026-10-14 `91c6468` — Add the verifier agent and the /sdlc:verify command
  - .claude-plugin/plugin.json
  - agents/verifier.md
  - commands/verify.md
  - docs/plans/verification-stage-tracker.md
  - docs/plans/verification-stage.md
  - docs/plans/verification-stage/reports/4-implementer-1.md
  - docs/plans/verification-stage/reports/5-review-1.md
  - src/hooks/test-verification.js
  - src/test-plugin-layout.js

- 2026-10-14 `3dbf51d` — Detect gh pr create in a Bash command
  - .claude-plugin/plugin.json
  - docs/plans/verification-stage-tracker.md
  - docs/plans/verification-stage.md
  - docs/plans/verification-stage/reports/3-review-1.md
  - docs/plans/verification-stage/reports/5-implementer-1.md
  - src/hooks/lib/commit-command.js
  - src/hooks/lib/pr-command.js
  - src/hooks/test-pr-command.js

- 2026-10-14 `b22aced` — Record a verifier report into the feature record and the verify marker
  - .claude-plugin/plugin.json
  - docs/plans/verification-stage-tracker.md
  - docs/plans/verification-stage.md
  - docs/plans/verification-stage/reports/2-review-1.md
  - docs/plans/verification-stage/reports/3-implementer-1.md
  - src/hooks/record-verification.js
  - src/hooks/test-record-verification.js

- 2026-10-14 `98b7973` — Own the verification marker, hashes, report parsing and section rendering in one module
  - .claude-plugin/plugin.json
  - docs/plans/verification-stage-tracker.md
  - docs/plans/verification-stage.md
  - docs/plans/verification-stage/reports/1-review-1.md
  - docs/plans/verification-stage/reports/1-review-1b.md
  - docs/plans/verification-stage/reports/2-implementer-1.md
  - src/hooks/lib/review-markers.js
  - src/hooks/lib/verification.js
  - src/hooks/test-review-markers.js
  - src/hooks/test-verification.js

- 2026-10-14 `e3cda69` — Parse the feature record's Acceptance section and replace its Verification section
  - .claude-plugin/plugin.json
  - commands/feature-new.md
  - commands/feature.md
  - docs/plans/verification-stage-tracker.md
  - docs/plans/verification-stage.md
  - docs/plans/verification-stage/reports/0-review-1.md
  - docs/plans/verification-stage/reports/1-implementer-1.md
  - src/hooks/lib/feature-file.js
  - src/hooks/test-feature-file.js

## Verification — 2026-10-14 @ 2710d9b

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | In a scratch repo listed in verify-repos.json with mode enforce, `gh pr create` with no verification marker is denied, and the deny reason names /sdlc:verify; with mode advisory the same command is allowed and a systemMessage names /sdlc:verify. | PASS | Hook run with cwd in a scratch repo and no marker. Enforce printed `permissionDecision":"deny"` with reason `...No PASS verification marker. ... Fix: run /sdlc:verify.` Advisory printed only `{"systemMessage":"PRE_PR_VERIFY: verification is missing. ... Fix: run /sdlc:verify. The PR is allowed anyway (advisory mode)."}`, with no deny. |
| 2 | A verifier report whose trailer is VERIFY_GATE: PASS but which has an UNVERIFIED or FAIL row is recorded as FAIL, exits 1, and leaves no marker. | PASS | Reports with `VERIFY_GATE: PASS` and a FAIL row, then an UNVERIFIED row, fed to `record-verification.js --report`. Each gave `exit=1`. Output ended `**Verdict**: FAIL` / `VERIFY_GATE: FAIL`. `.git/.claude-last-verify` did not exist after either run. |
| 3 | After a recorded PASS, committing only the feature record keeps the hook silent; committing a change to any other tracked file makes the hook report the verification as stale. | PASS | An all-PASS report gave `exit=0` and the marker existed. After committing only `features/feat-x.md` (enforce mode) the hook printed `{"decision":"approve"}`. After committing a change to `code.js` it printed a deny with `verification is stale. Changed since the last verification: the code tree.` |
| 4 | In a repo not listed in verify-repos.json, the hook's whole output for `gh pr create` is `{"decision":"approve"}`, with no systemMessage and no permissionDecision, and it spawns no git process. | PASS | Unlisted scratch repo, enforce config for another repo, `git` shim first on PATH. The hook printed exactly `{"decision":"approve"}`. The sentinel file the shim creates did not exist. |
| 5 | The `## Acceptance` block written by /sdlc:feature-new's template is read back by parseAcceptance as the same criteria, in order. | PASS | I extracted the `## Acceptance` block from the `commands/feature-new.md` template. `parseAcceptance` returned `["<criterion>","<criterion>"]`. With the two placeholders filled in, it returned `["Alpha works.","Beta works."]`. |

**Verdict**: PASS
