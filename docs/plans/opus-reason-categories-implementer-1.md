STEP: opus-reason-categories
GATE:
- `node src/hooks/test-agent-tier-gate.js`: exit 0, "100 passed, 0 failed".
- `node tools/test-model-spend.js`: exit 0, "Results: 34 passed, 0 failed".
- `grep -rn "TIER: opus: <reason>" skills/ README.md commands/`: prints nothing (grep exit 1).
- `bash tools/run-tests.sh`: exit 0, "Files: 39  failed: 0".
- `node src/test-plugin-layout.js`, `node src/test-suite-isolation.js`, `claude plugin validate .`: all exit 0.
- Manual run, description "Map workbook", model opus: `design judgement` prints permissionDecision deny naming the four categories; `user asked` prints permissionDecision ask, reason `Sub-agent "Map workbook" wants opus, stated as owner-requested...`, with updatedInput; `plan source review` prints budget-append updatedInput only, no permissionDecision.
RED FIRST: ran the extended test file before editing the hook. Failures: "deny reason names the categories" (expected true, actual false) for all 7 gated types; "allow: TIER: opus: plan writing" failed on the first run (my row compared '' to undefined, a test bug, fixed after). The run then crashed on the first ask row: `TypeError: Cannot read properties of undefined (reading 'permissionDecisionReason')` at test-agent-tier-gate.js:81, because the old hook allowed `user asked` silently.
FILES: touched src/hooks/agent-tier-gate.js, src/hooks/test-agent-tier-gate.js, README.md, skills/plan-spec/SKILL.md, skills/plan-spec/reference.md, commands/model-spend.md. All in the declared set. Nothing else.
DISAGREEMENTS: none. hook-output.js has no ask helper, so I added a local `askWith` in the hook (deny still uses lib deny). I did not touch hook-output.js (not in the file set).
DECISIONS THE PLAN LEFT OPEN:
- Category match is prefix on a word boundary (name, then end, space or colon), so "plan writing: x" and "plan source review round 2" pass but "plan writings" and "needs plan writing" deny. Conservative: no loose substring match.
- Hyphen/underscore normalised to space, so `plan-source-review` and `plan_writing` pass.
- An "ask" with no string description drops the quoted label ("Sub-agent wants opus...").
- Budget append on an ask keeps the ask decision and swaps in the budgeted prompt in updatedInput.
- TIER_LINE regex now captures the rest of the line; an empty reason still denies.
- The DENY_REASON test constant became a CATEGORIES check (reason includes all four names) rather than exact text.
MEASUREMENTS: 100 tests pass in test-agent-tier-gate.js (was 63 before? not measured); 34 in test-model-spend.js; 39 files in run-tests.sh. Commands as in GATE.
BUDGET USED: about 9 tool calls against about 30.
NEXT: the doc wording in reference.md:778 and :1496 and SKILL.md:149 now says Opus implementer uses `user asked`. Staging, version bump and commit are the orchestrator's. Test command: `node src/hooks/test-agent-tier-gate.js` -> "100 passed, 0 failed".
git diff --stat:
 README.md                         |  2 +-
 commands/model-spend.md           |  2 +-
 skills/plan-spec/SKILL.md         |  5 +--
 skills/plan-spec/reference.md     |  9 ++---
 src/hooks/agent-tier-gate.js      | 76 +++++++++++++++++++++++++++++++++++----
 src/hooks/test-agent-tier-gate.js | 52 ++++++++++++++++++++-------
 6 files changed, 120 insertions(+), 26 deletions(-)
