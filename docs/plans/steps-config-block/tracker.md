# Tracker: steps config block

Plan: docs/plans/steps-config-block.md. Branch: steps-config-block. Started 25 Oct 2026.
Owner authorisation D1 (plan Section 3): stage, commit and dispatch fix agents per step, this branch only. No push, no merge.

## RESUME

Next action: dispatch the step 1 reviewer on the staged diff (throwaway worktree); on PASS write the marker and retry the commit.
Last committed: commit 0 `81d7c19` (plan, feature record, tracker). Step 1 built, GATE green (test-steps 56/0, run-tests 41 files 0 failed), staged, commit attempt pending review.
Reviewer to check specifically: `mandateInForce(repoRoot)` is called with no `configPath`, so it reads the real `~/.claude/tdd-mandate.json`; do the tests depend on that file?

## Step state

| Step | Status | Commit | Review rounds | Notes |
|---|---|---|---|---|
| 1 | not started | | | |
| 2 | not started | | | |
| 3 | not started | | | |
| 4 | not started | | | |
| 5 | not started | | | |
| 6 | not started | | | |
| 7 | not started | | | |
| 8 | not started | | | |
| 9 | not started | | | |
| 10 | not started | | | |
| 11 | not started | | | |
| 12 | not started | | | |
| 13 | not started | | | |

## DISAGREEMENTS

- Step 1: the brief put `marketplace-autoupdate` before `session-instructions`; the implementer built the plan's order (`session-instructions` first). Plan is authoritative. No action.

## DECISIONS

- Step 1 brief: the area and step table was written into the brief from the Section 1 table; one difference to check on return: the plan lists `session-instructions` before `marketplace-autoupdate` in `standalone`, the brief had them the other way round. `listSteps` order follows `AREAS`, so if the implementer followed the brief, the reviewer checks the order against the plan.

## Advisories outside a step's file set (batched into step 13)

None yet.
