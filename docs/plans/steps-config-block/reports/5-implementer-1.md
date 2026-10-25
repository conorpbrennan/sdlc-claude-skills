# Step 5 report (implementer 1)

Status: DONE. Nothing staged or committed.

## FILES CHANGED
- src/hooks/pre-commit-review.js
- src/hooks/test-pre-commit-review.js (STEP_CASES table, and the three `mod.evaluateTddOrderGate` calls now pass `false, { on: true, source: 'default' }`)

Hook changes:
- `require('./lib/steps')`; in `main`, right after the not-a-commit exit, one `stepStates(['tdd-mandate','review-gate'], { cwd: process.cwd() })`. Warnings go to stderr, one line each, prefixed `pre-commit-review: `.
- Both off: `endHook('approve', { via: 'step-off' })` and `approve()`, before the shape check. It is the only exit that skips the shape check.
- `evaluateTddOrderGate(toplevel, transcriptPath, isAmend, tddState)`: no `mandateInForce` call (grep count 0); off gives `{ action: 'continue', reason: 'step-off:' + source }`. JSDoc added.
- Review off: marker block guarded by `reviewOn`; lock is `reviewOn ? readLock(...) : null` (never read, removed or written); the TDD BLOCK marker write needs `reviewOn`. After the TDD gate returns `continue`, approve `via: 'step-off'`. Every later write (marker, lock, BLOCK marker) sits after that approve.
- Fail-closed reads (shape, repo, staged-index, TDD staged paths and test diff) are untouched and run before either approve with TDD on.

## RED RUNS
Before the hook change (`node src/hooks/test-pre-commit-review.js`):
```
FAIL: steps: review off, code without test: TDD block, no marker (no marker) -- expected "false", got "true"
FAIL: steps: review off, code with test: approve, no marker, no lock (decision) -- expected "approve", got "block-review"
FAIL: steps: review off, code with test: approve, no marker, no lock (no marker) -- expected "false", got "true"
FAIL: steps: review off, code with test: approve, no marker, no lock (no lock) -- expected "false", got "true"
FAIL: steps: tdd off: review-required block, no TDD block (decision) -- expected "block-review", got "block-tdd"
FAIL: steps: both off: approve (decision) -- expected "approve", got "block-tdd"
FAIL: steps: both off: approve (no marker) -- expected "false", got "true"
FAIL: steps: repo review off: still blocks, stderr warning (stderr) -- expected to contain "pre-commit-review: ", got ""
Results: 526 passed, 8 failed
```

## GATE OUTPUT
- `node src/hooks/test-pre-commit-review.js`: `Results: 534 passed, 0 failed`, exit 0
- `node src/hooks/test-tdd-mandate.js`: exit 0
- `grep -c "mandateInForce(" src/hooks/pre-commit-review.js`: `0`
- `bash tools/run-tests.sh`: `Files: 42  failed: 0`
- `node src/test-plugin-layout.js`: 0; `node src/test-suite-isolation.js`: 0; `claude plugin validate .`: 0

## DISAGREEMENTS
None. `grep -rn evaluateTddOrderGate src`: callers only in the hook (one) and its own test (three, updated; they pass `isAmend=false` explicitly, as before they omitted it).

## DECISIONS
- STEP_CASES uses scratch repos built with plumbing; each case sets `SDLC_REVIEW_CONFIG_USER`, `CLAUDE_CONFIG_DIR`, `TDD_MANDATE_CONFIG` (missing file) under the scratch dir. Extra optional columns `alias` and `stderr`. Each case also checks stdout carries no warning text, and no stderr when no warning is expected.
- Review-required block versus TDD block is told apart by the "TDD gate" text in reason/systemMessage.
- `pre-commit-review.js` still reads `reviewConfig` for round policy; that is not the `steps` key.

## UNRELATED FINDINGS
- The header comments in the hook (around the TDD mandate block) still point at `lib/tdd-order.js mandateInForce` and the exempt-repo remedy text; the remedy message does not mention the new `steps.tdd` switch. Left as is.
