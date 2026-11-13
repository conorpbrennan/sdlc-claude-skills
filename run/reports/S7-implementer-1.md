STEP: S7. The /sdlc:branch-review skill, command and reviewer prompt. Status: done.

GATE:
- `node src/test-branch-review-skill.js`: exit 0, "Results: 28 passed, 0 failed".
- `node src/test-plugin-layout.js`: exit 0, "Results: 172 passed, 0 failed".
- `node src/test-suite-isolation.js`: "Results: 57 passed, 0 failed".
- `claude plugin validate .`: rc=0 ("Validation passed with warnings").
- `grep -c "BRANCH_GATE" skills/branch-review/reviewer-prompt.md`: prints 2 (the check wants at least 2).

RED FIRST: `node src/test-branch-review-skill.js` before the three files existed: "Results: 7 passed, 21 failed" (the 7 passes were negative checks on empty text; every positive check failed, e.g. "FAIL: names branch-review-cli.js", "FAIL: has description and Arguments line"). Test file was written first and run before any other file. The first draft of the in-order heading check passed an array to `ok` (always truthy); fixed to compare JSON before the green run.

FILES: touched exactly the declared set: skills/branch-review/SKILL.md, skills/branch-review/reviewer-prompt.md, commands/branch-review.md, src/test-branch-review-skill.js (new); src/test-plugin-layout.js (extended). No difference. features/statusline-windows-datadir.md left alone.

DISAGREEMENTS: none. The test calls isolateGitEnv() though it spawns no git, because test-suite-isolation.js requires the literal for every src/test-*.js.

DECISIONS THE PLAN LEFT OPEN:
- Test blocks: four console blocks (prompt headings/trailer, sample report, SKILL.md, command), within the five-block cap; each case is a row-like `ok` line. Under the eight-function cap.
- Sample-report test builds the report from the prompt's own `## Q` headings, one `file:line` line each, plus one `### F1 CONFIRMED ADVISORY` finding and the PASS trailer.
- Prompt test "never mentions a round number" uses /round\s*\d/i. The prompt has no such text.
- Prompt's `<pass scope>` for the non-over-cap case in SKILL.md is "all files" (plan did not state it).
- SKILL.md fills `<repo>`, `<base>`, `<head>` from plan fields `toplevel`, `base`, `head` (confirmed in branch-review-cli.js plan output).
- SKILL.md uses the plan field `overCap` for the cap test.
- The skill has a short threat-model note; the command's `ok: false` relay for enable/disable follows S6c's NEXT.
- The prompt mentions `TDD_GATE` inline only (no line starting with it).

MEASUREMENTS: 28 test cases (node src/test-branch-review-skill.js); layout 172; isolation 57; BRANCH_GATE count 2 (grep -c counts lines: the trailer line and the "End the report" paragraph... actually 2 lines carry it). `git diff --stat src/test-plugin-layout.js`: 1 file changed, 3 insertions(+), 3 deletions(-).

BUDGET USED: about 14 tool calls, no review round run by me.

NEXT: `claude plugin validate .` prints warnings only (rc 0). The README and CLAUDE.md "What ships here" table do not list branch-review yet; that is outside this file set (S8 presumably). `BARE_INVOCATION` now includes `branch-review`, so any bare `/branch-review` in docs will fail the layout test: write `/sdlc:branch-review`.

Test command run: `node src/test-branch-review-skill.js` -> Results: 28 passed, 0 failed.
git diff --stat (tracked): src/test-plugin-layout.js | 6 +++---; untracked new: commands/branch-review.md, skills/branch-review/{SKILL.md,reviewer-prompt.md}, src/test-branch-review-skill.js.
