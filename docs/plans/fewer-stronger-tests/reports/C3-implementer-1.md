STEP: C3. Close-out (docs): criterion wording and stale counts.
GATE:
- `grep -cE "^ *- 2\.[1-7] " agents/code-reviewer.md` -> 7
- `grep -c "max_tests_per_commit" agents/code-reviewer.md` -> 1
- `grep -c "four tests" skills/plan-spec/SKILL.md` -> 0
- `claude plugin validate .` -> exit 0
- `bash tools/run-tests.sh` -> exit 0 ("Files: 39  failed: 0")
- `node src/test-plugin-layout.js` -> Results: 154 passed, 0 failed
- `node src/test-suite-isolation.js` -> Results: 43 passed, 0 failed
RED FIRST: n/a, docs step.
FILES: agents/code-reviewer.md, skills/plan-spec/SKILL.md. Both declared. Nothing staged.
DISAGREEMENTS: none.
DECISIONS THE PLAN LEFT OPEN:
- Lead-in sentence placed right after "cited by number.": "New behaviour is exercised against the change's invariant, with the inputs a reader would think of, including the failing direction." Kept to one sentence, 2.1 untouched.
- 2.6 sentence appended: "The ceiling is `max_tests_per_commit` in `~/.claude/review-policy.json`, default 8."
- plan-spec item 4: "four tests" -> "six tests". §17 lists six: file set, GATE, reviewer holds the diff, ROLLBACK, TESTS FIRST <= 8 functions, ~40 tool calls. Counted from reference.md lines 1028-1075.
MEASUREMENTS: the counts above, from the commands quoted. Six from reading §17 bullets.
BUDGET USED: 6 calls of about 10.
NEXT: none. Note §17's own prose still says "The other three tests decide more often than this one" (reference.md, outside the declared set); it is stale against six tests.

Test command: `bash tools/run-tests.sh` -> Files: 39  failed: 0
git diff --stat:
 agents/code-reviewer.md   | 7 +++++--
 skills/plan-spec/SKILL.md | 2 +-
 2 files changed, 6 insertions(+), 3 deletions(-)
