STEP: S3. Parser that settles a branch-review report's verdict.

GATE:
- `node src/hooks/test-branch-report.js`: exit 0, "26 passed, 0 failed".
- `node src/test-plugin-layout.js`: exit 0.
- `node src/test-suite-isolation.js`: exit 0.
- `claude plugin validate .`: exit 0.

RED FIRST: test written first. `node src/hooks/test-branch-report.js` failed with `Error: Cannot find module './lib/branch-report.js'`. First green run had one failure, my own test row: "None found, checked: a.js, b.js" has two items of 4 characters, so it correctly passed. I changed the row to `ab, cd` (items under 3 characters).

FILES: touched `src/hooks/lib/branch-report.js` (new), `src/hooks/test-branch-report.js` (new). Both in the declared set. Nothing else touched. Nothing staged.

DISAGREEMENTS: none.

DECISIONS THE PLAN LEFT OPEN:
- Repeated Q: the first occurrence's body is kept, the section is marked bad, and one problem is added. Conservative.
- A finding heading is not added to any section body (it ends the section). Spec-consistent.
- A line with `file:line` evidence wins over a `None found` line in the same section.
- Bad finding heading adds one problem per line and forces FAIL.
- Test table also covers bare `None`, `none.`, `N/A`, `- none`, `None found.`, empty (review question 1), a `file:line` above the first Q (question 2), no trailer, and bulleted/semicolon none-found. All are rows in one table; the file has one test table plus a few direct checks.

MEASUREMENTS: 26 checks, from `node src/hooks/test-branch-report.js`.

BUDGET USED: about 8 tool calls, one round.

NEXT: `parseReport` is the only export. Problem text names `Q<n>`, `trailer`, `BRANCH_GATE: FAIL`, `F<n>` malformed heading, and "CONFIRMED CRITICAL". Callers should use `verdict`, not the trailer.

TEST COMMAND: `node src/hooks/test-branch-report.js` -> `26 passed, 0 failed`.

git diff --stat (tracked files only; my two files are untracked, so they are absent): the stat shows only the pre-existing `features/statusline-windows-datadir.md` and `run/tracker.md` edits. Untracked: `src/hooks/lib/branch-report.js`, `src/hooks/test-branch-report.js`.
