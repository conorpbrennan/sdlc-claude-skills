# Step 10 report (implementer round 1)

Status: DONE. Nothing staged or committed.

## FILES CHANGED
- src/hooks/agent-tier-gate.js: imports `stepStates`; `decide(toolInput, on)` and `decideTier(toolInput, on)` take `on = {tier, model, budget}` (default all on); new `stepsOn(cwd)` (one `stepStates` call for the three ids, warnings to stderr as `agent-tier-gate: <w>`, resolver failure = all on); stdin handler gets a `GATED_TYPES` check before the resolver. Fail-open catch kept.
- src/hooks/read-trim.js: `stepIsOff(cwd)` using `stepState('read-trim')`, warnings to stderr as `read-trim: <w>`; called in `decide` after the offset/limit exit, before `trimRead`.
- src/hooks/test-agent-tier-gate.js: scratch env exports at top; `STEP_CASES` table (16 rows `{ name, steps, input, expect }`) plus a non-gated-type row.
- src/hooks/test-read-trim.js: scratch env exports at top; `STEP_CASES` table (5 rows) on a long whole-file sub-agent read.

## RED RUNS (quoted)
Before the implementation:
```
node src/hooks/test-agent-tier-gate.js
  FAIL: agent-default-model off: no rewrite, budget stays
  FAIL: agent-tier-gate off: opus without a reason passes with budget
  FAIL: context-budget off: rewrite without budget
  FAIL: context-budget off: allowed opus prints nothing
  FAIL: all three off: no model prints nothing
  FAIL: all three off: opus without a reason prints nothing
  FAIL: area off in the user file: nothing
  FAIL: area off in the user file: opus without a reason, nothing
  FAIL: repo file off beats user on
  FAIL: repo file area off: nothing
135 passed, 10 failed
node src/hooks/test-read-trim.js
  FAIL: area off in the user file: untouched
  FAIL: step off inside an on area: untouched
  FAIL: repo file off beats user on: untouched
26 passed, 3 failed
```

## GATE OUTPUT (tails)
- `node src/hooks/test-agent-tier-gate.js`: `145 passed, 0 failed`, exit 0
- `node src/hooks/test-read-trim.js`: `29 passed, 0 failed`, exit 0
- `node src/test-plugin-layout.js`: exit 0
- `node src/test-suite-isolation.js`: exit 0
- `claude plugin validate .`: exit 0
- `bash tools/run-tests.sh`: `Files: 45  failed: 0  elapsed: 20160 ms (-j 16)`, exit 0

## DISAGREEMENTS
None.

## DECISIONS
Combinations (model = agent-default-model, tier = agent-tier-gate, budget = context-budget):
- all on: no-model -> rewrite to Sonnet (allow) + budget; Opus without reason -> deny; Opus with reason -> budget only.
- model off only: no-model -> no rewrite, budget still appended (updatedInput only); Opus unchanged.
- tier off only: Opus without reason -> passes, budget appended; Opus/Fable never asks or denies (user asked and plan-edit deny also off, since the whole Opus branch returns null); no-model rewrite still acts.
- budget off only: rewrites and denies unchanged; allowed Opus prints nothing; no `withBudget` append.
- model + budget off: no-model prints nothing. tier + budget off: Opus prints nothing. All three off: nothing printed for any gated call.
- Interaction: `decide` returns the tier deny before the budget check, so a deny is unchanged by `budget`. With tier null and budget on, the budget-only `updateOnly` path is used as before.
- Non-gated types exit in the stdin handler before the resolver, so they never read config.
- `agent-tier-gate` off also disables the plan-edit deny and the ask (they live in the Opus branch). Default path unchanged (all 128 old tests pass).
- read-trim: the resolver is read for any sub-agent whole-file Read (per the spec, after the offset/limit exit, before `trimRead`), including small ones that `trimRead` would then ignore. Main-session reads and ranged reads never read config.

## UNRELATED FINDINGS
None.
