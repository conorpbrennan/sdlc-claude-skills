# Merge origin/main into branch-review-pre-pr-1 (implementer 1)

Status: DONE. Merge staged, not committed.

## Conflicts resolved
- `.claude-plugin/plugin.json`: kept 1.0.102, ran `node tools/plugin-version.js bump` -> 1.0.103.
- `run/reports/S1-implementer-1.md`, `S2-implementer-1.md`: kept the branch-review versions under their names. Main's versions saved as `run/reports/rule-stop-hook-S1-implementer-1.md` and `-S2-`. `run/tracker.md` (branch-review only; main has no tracker) points at the unchanged names, so no edit.
- `src/hooks/test-steps.js`: step count set to 25. Counted from `AREAS` after the merge (this branch 23 + main's 2 = 25; main alone said 24).
- `src/test-plugin-layout.js`: skills list now branch-review, code-review-implementer, code-review-pre-commit, english-prose, plan-spec (title says five). Frozen hook wiring already held UserPromptSubmit (3 hooks incl. rule-reminder.js), Stop (rule-stop-hook.js) and pre-pr-branch-review.js; it matches the merged `hooks/hooks.json`.

## Auto-merged files checked
- hooks.json: valid JSON, one UserPromptSubmit entry, one Stop entry, pre-pr-branch-review present.
- README.md and CLAUDE.md carry rows from both sides (rule-stop-hook/rule-reminder and branch-review).

## Gate
- `git grep -n '^<<<<<<<'`: empty.
- hooks.json JSON.parse: ok.
- `bash tools/run-tests.sh`: Files 58, failed 0 (pytest absent, plan-spec python tests skipped, as before).
- `claude plugin validate .`: rc 0.

## Notes
- Surprise: the expected count was 24 in main's test; the true merged total is 25.
- `features/statusline-windows-datadir.md` untouched and not staged.
