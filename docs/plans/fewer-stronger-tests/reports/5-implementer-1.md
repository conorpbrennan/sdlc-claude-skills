STEP: 5. Gap-patching prompt adds rows, runs pytest in parallel, reports dead lines.
GATE:
- `grep -c UNCOVERABLE skills/code-review-pre-commit/SKILL.md` -> 2 (need >=2) OK
- `grep -c pragma ...` -> 1 (the prohibition) OK
- `grep -c "import xdist" ...` -> 1 OK
- COPY CHECK (R from plan, grep -cF on the SKILL.md) -> 1 OK
- `node src/test-plugin-layout.js` -> 154 passed, 0 failed
- `node src/test-suite-isolation.js` -> 43 passed, 0 failed
- `claude plugin validate .` -> exit 0
- `bash tools/run-tests.sh` -> exit 0; "Files: 39  failed: 0"
RED FIRST: n/a, docs step (prompt text).
FILES: only skills/code-review-pre-commit/SKILL.md (declared set). Nothing staged or committed.
DISAGREEMENTS: none.
DECISIONS THE PLAN LEFT OPEN:
- Inserted the UNCOVERABLE step as new step 3, so the prompt now has 7 steps (was 6). Step numbers are not referenced elsewhere in the file.
- Recipe sits on one physical line inside the existing code fence.
- Report line "N functions, M rows" put in step 6 (the file-listing step).
- `git check-ignore`, `GAP_PATCH: PASS` / `GAP_PATCH: FAIL` strings and trailer prose kept unchanged.
REVIEW ANSWERS:
1. No. If every remaining uncovered line is UNCOVERABLE, diff-cover still exits non-zero, so the PASS conditions fail. The patcher prints `GAP_PATCH: FAIL` with reason `N UNCOVERABLE lines` plus the list. PASS is not loosened; step 7 says so.
2. Trailer contract untouched. The prompt asks for at most one new test function per uncovered function, never per line. The "Do NOT add tests for already-covered code" rule is unchanged.
MEASUREMENTS: grep counts and test counts above, from the quoted commands. `git diff --stat -- skills/code-review-pre-commit/SKILL.md`: 1 file, 23 insertions, 12 deletions.
BUDGET USED: 5 calls of about 15; one round.
NEXT: Step 6 copies the recipe the same way. The `Do NOT` list at the end of the prompt is unchanged. After two UNCOVERABLE-only FAILs the existing "stop and ask the user" rule applies.

Test command: `bash tools/run-tests.sh` -> exit 0, "Files: 39  failed: 0".
git diff --stat (this file): 1 file changed, 23 insertions(+), 12 deletions(-)
