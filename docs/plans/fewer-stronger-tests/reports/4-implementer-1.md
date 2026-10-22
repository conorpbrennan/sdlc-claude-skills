STEP: 4

GATE:
- `node src/hooks/test-session-start-instructions.js`: exit 0, "Results: 73 passed, 0 failed".
- `wc -c instructions/*.md`: total 8242 (limit 8250).
- `grep -c "no uncovered line" skills/plan-spec/reference.md`: 0.
- `grep -c "2.2-2.7" agents/implementer.md skills/plan-spec/reference.md`: 1 and 1.
- `python3 skills/plan-spec/check_citations.py skills/plan-spec/fixtures/tests-first-plan.md main`: before edits exit 1; after edits exit 1 (as at HEAD).
- `bash tools/run-tests.sh`: "Files: 39  failed: 0", exit 0.
- `node src/test-plugin-layout.js`: 154 passed, 0 failed. `node src/test-suite-isolation.js`: 43 passed, 0 failed. `claude plugin validate .`: exit 0 (passed with warnings).

RED FIRST: `node src/hooks/test-session-start-instructions.js` before changes:
"FAIL: at least 1500 characters of headroom -- expected true, got false"; "Results: 72 passed, 1 failed".

FILES: touched README.md, agents/implementer.md, instructions/tdd-mandate-snippet.md, skills/plan-spec/SKILL.md, skills/plan-spec/reference.md. All in the declared set. Nothing else touched (the report is always permitted).

DISAGREEMENTS: none. No test pins text in the moved paragraphs (grepped src/test-*.js and src/hooks/test-*.js).

DECISIONS THE PLAN LEFT OPEN:
- Moving both paragraphs plus the two new sentences left the total at 8531, not about 8200. I also tightened three other sentences in the snippet (the "no exempt-directory list" paragraph, the order-undetermined sentence, the `exempt_paths` sentence). Conservative: no rule dropped, wording only. Result 8242.
- The "features/" Cucumber paragraph moved to README with the path-convention paragraph; the snippet keeps one pointer sentence naming the README's TDD section.
- §17 now lists six tests; the new bullet sits before the 40-call bullet. §17's intro and SKILL.md item 4 still say "four tests" (SKILL.md) or give no count; I did not change SKILL.md item 4 (outside the step's stated edits). It was already stale (five bullets).
- GATE example in §16 now reads: "the named table tests pass and the hook's branch threshold holds on the step's files".
- SKILL.md Section 2 item 1 clause: "Its tests follow the §21.1 rule." Section 1 item 3: "TESTS FIRST follows the test rule in §16 and §21.1."

MEASUREMENTS:
- `wc -c instructions/*.md` total: 9049 at HEAD, 8531 after the first pass, 8242 final.
- Headroom test: 72 passed 1 failed before, 73 passed 0 failed after (`node src/hooks/test-session-start-instructions.js`).

BUDGET USED: about 12 tool calls of 30; one round.

NEXT: SKILL.md item 4 says "§17's four tests" while §17 now has six size tests (five before). A later step touching SKILL.md may fix the count. Criteria text in code-reviewer.md was cited, not copied.

Test command: `node src/hooks/test-session-start-instructions.js` -> "Results: 73 passed, 0 failed". Full: `bash tools/run-tests.sh` -> "Files: 39  failed: 0".

git diff --stat (final): 5 files changed, 39 insertions(+), 28 deletions(-)
 README.md, agents/implementer.md, instructions/tdd-mandate-snippet.md, skills/plan-spec/SKILL.md, skills/plan-spec/reference.md
