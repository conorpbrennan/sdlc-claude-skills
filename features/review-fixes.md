# Review Fixes

**Requirement**: Fix the external review findings: hook timeouts in seconds, valid skill frontmatter keys, mainModel opt-in, smaller install payload, git identity in two test suites, and only wired hooks in src/hooks.

**Started**: 2026-10-29
**Last updated**: 2026-10-29
**Branch**: review-fixes

## Acceptance

1. Running `bash tools/run-tests.sh` exits 0.
2. Running `node src/test-plugin-layout.js` exits 0, which checks every hook timeout is 1 to 300 seconds and every script in `src/hooks/` is wired.
3. Running `bash src/unwired/test-stop-hook.sh` with `HOME=/nonexistent` and no git identity exits 0.
4. `node src/hooks/review-config-cli.js main-model show` with no user file reports no effective model.

## Files involved

- .claude-plugin/plugin.json
- .gitignore
- README.md
- commands/main-model.md
- defaults/sdlc-review.json
- hooks/hooks.json
- skills/code-review-implementer/SKILL.md
- skills/code-review-pre-commit/SKILL.md
- skills/plan-spec/SKILL.md
- src/hooks/test-review-config.js
- src/hooks/test-session-start-instructions.js
- src/test-plugin-layout.js
- src/unwired/post-commit-review.js
- src/unwired/protect-user-dir.js
- src/unwired/stop-review-trigger.js
- src/unwired/test-post-commit-hook.sh
- src/unwired/test-protect-user-dir.js
- src/unwired/test-stop-hook.sh
- tools/run-tests.sh

## History

<!-- populated on commit -->
