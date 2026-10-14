# Step 0 — review round 1 (by hand, docs-only)

Reviewer: orchestrator (Opus), §21.2 by hand. The hook does not review a `.md`-only diff.

Staged diff: `features/verification-stage.md` (new), `.claude-plugin/plugin.json` (1.0.5 -> 1.0.6).

## GATE

- `grep -c '^[1-5]\. ' features/verification-stage.md` -> `5`
- `git diff --cached --name-only` -> `.claude-plugin/plugin.json`, `features/verification-stage.md`
- GUARDS: test-suite-isolation 30/0, test-plugin-layout 125/0, test-source-files 67/0, test-hook-output 19/0, test-session-start-instructions 73/0

## REVIEW

1. Each criterion settles by running something. 1, 3 and 4 run the hook's stdin/stdout. 4's "spawns no git" uses step 6 (a)'s failing-git PATH shim. 2 runs the recorder CLI. 5 runs `parseAcceptance` on the extracted block.
2. Only criterion 5 names an internal (`parseAcceptance`), as the step allows. The others name interfaces.
3. D1: criterion 1 (advisory `systemMessage`). D2: criteria 1 and 4 (`verify-repos.json`, both modes). D4: criterion 3. D3, D5 and D6: reasons recorded in §8, round 2, finding 1.

Below the bar, not actioned: criterion 5 says "template". Step 1 (a) reads the fenced example in `commands/feature-new.md`. Step 1 adds both the stub template section and the example, so either reading is runnable.

TDD_GATE: PASS
