STEP: 3. The reviewer's TESTED pillar says what a good test is, what a padded one is, and asks for rows before tests.

GATE:
- `grep -cE "^ *- 2\.[1-7] " agents/code-reviewer.md` -> 7
- `grep -c "2.1-2.7" agents/code-reviewer-deep.md` -> 1
- `claude plugin validate .` -> exit 0
- `node src/test-plugin-layout.js` -> 154 passed, 0 failed
- `node src/test-suite-isolation.js` -> 43 passed, 0 failed
- `bash tools/run-tests.sh` -> Files: 39 failed: 1; the one failing file is src/hooks/test-session-start-instructions.js (the known headroom failure). I did not inspect that its only FAIL is the headroom assertion; I confirmed only the file name.

RED FIRST: n/a, documentation step.

FILES: agents/code-reviewer.md, agents/code-reviewer-deep.md. Both in the declared set. Frontmatter unchanged.

DISAGREEMENTS: none.

DECISIONS THE PLAN LEFT OPEN:
- Pillar 2 keeps a one-line lead ("Criteria 2.1-2.7, cited by number") plus the probe-only sentence, now pointing at 2.7. Conservative: the old closing sentence is kept, not dropped.
- 2.1-2.7 are nested bullets (3-space indent) under list item 2 so the outer numbering is intact and the gate regex matches.
- The deep line is appended to item 5 of its procedure list, not a new paragraph, to leave list structure alone.

MEASUREMENTS: grep counts above (7, 1); plugin-layout 154 passed; suite-isolation 43 passed; runner 39 files, 1 failed.

BUDGET USED: about 9 calls of 15, one round.

NEXT: The old text "exercise the invariant from step 1 with inputs a reader would think of, including the failing direction" is gone; 2.4 carries the failing-direction idea. Step 4+ files should cite criteria as "2.x" in code-reviewer.md rather than restating them. Criterion 2.6 refers to "tests added: N" and the "policy ceiling"; those must exist from step 1 and the review-config.

Test command: `bash tools/run-tests.sh` -> "Files: 39  failed: 1" (only src/hooks/test-session-start-instructions.js).

git diff --stat (my changes):
 agents/code-reviewer-deep.md |  2 +-
 agents/code-reviewer.md      | 36 +++++++++++++++++++++++++++++-------
 2 files changed, 30 insertions(+), 8 deletions(-)
