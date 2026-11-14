# Rule Stop Hook

**Requirement**: Make the owner's two rules (never give up; do it to the best of your ability) hold without the model remembering them: a Stop hook that blocks option questions to the owner outside the gates, and a UserPromptSubmit end-of-turn check, both switchable through /sdlc:steps.

**Started**: 2026-11-14
**Last updated**: 2026-11-14
**Branch**: rule-stop-hook

## Acceptance

1. Running `node src/hooks/test-rule-stop-hook.js` exits 0.
2. Running `node src/hooks/test-rule-reminder.js` exits 0.
3. `/sdlc:steps` lists `rule-stop-hook` and `rule-reminder` under `conduct`.
4. Running `bash tools/run-tests.sh` shows 0 failed.

## Files involved

- .claude-plugin/plugin.json
- README.md
- docs/plans/rule-stop-hook.md
- hooks/hooks.json
- run/reports/S1-implementer-1.md
- src/hooks/lib/steps.js
- src/hooks/rule-stop-hook.js
- src/hooks/test-rule-stop-hook.js
- src/hooks/test-steps.js
- src/test-plugin-layout.js

## History

<!-- populated on commit -->
