# Fix round 1: opus-reason-categories

STEP: close review findings 1 (near-miss rows) and 2 (category boundary) in agent-tier-gate.

GATE (all exit 0):
- `node src/hooks/test-agent-tier-gate.js`: 111 passed, 0 failed
- `node tools/test-model-spend.js`, `bash tools/run-tests.sh`, `node src/test-plugin-layout.js`, `node src/test-suite-isolation.js`, `claude plugin validate .`: exit 0
- Manual: `plan writing.` returns updatedInput, no deny. `plan writingfoo` returns deny.

RED FIRST: seven rows added, run against the old hook: 108 passed, 3 failed. The failures were `allow: TIER: opus: plan writing.`, `allow: ... plan source review, round 2`, `allow: ... fail triage; two unexplained results`. Finding 1 rows (`plan writer`, `plan writingfoo`, `plan writing2`, empty reason) already passed, as expected.

FILES:
- `src/hooks/agent-tier-gate.js`: `categoryKind` now requires the text to start with the category and rejects only when the next character is a letter or digit.
- `src/hooks/test-agent-tier-gate.js`: seven rows in the category table.

DISAGREEMENTS: none.

DECISIONS THE PLAN LEFT OPEN: added one extra row, `plan writing2`, to cover the digit side of the boundary.

MEASUREMENTS: test count 104 -> 111 passed (seven new rows; each deny row also adds a names-categories check only counted within the same loop).

BUDGET USED: 5 tool calls.

NEXT: re-review; nothing open.

Test command: `node src/hooks/test-agent-tier-gate.js` -> `111 passed, 0 failed`

`git diff --stat` (working tree vs index):
```
 src/hooks/agent-tier-gate.js      | 4 +++-
 src/hooks/test-agent-tier-gate.js | 7 +++++++
 2 files changed, 10 insertions(+), 1 deletion(-)
```
