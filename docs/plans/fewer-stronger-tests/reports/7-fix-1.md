STEP: 7 (fix round 1). Status: fixed. The no_tests cases no longer read the real repo's HEAD.

GATE:
- `node src/hooks/test-pre-commit-review.js`: exit 0, "Results: 507 passed, 0 failed".
- Hook decision on the review-required fixture unchanged: assertion `policy ceiling leaves the review-required decision unchanged` PASS.
- `node src/hooks/test-added-tests.js`: exit 0.
- `bash tools/run-tests.sh`: "Files: 39  failed: 0  elapsed: 18088 ms (-j 16)".
- `node src/test-plugin-layout.js`: exit 0. `node src/test-suite-isolation.js`: exit 0. `claude plugin validate .`: exit 0.
- Proof against a non-test-only HEAD: fresh worktree of 833e5d0 with the fixed test file and step-7 hook copied in, `node src/hooks/test-pre-commit-review.js` -> "Results: 507 passed, 0 failed". The current real HEAD (b274715, test-only) also passes (above). Worktree removed.

RED FIRST: the failing cases before the fix, from `node src/hooks/test-pre-commit-review.js`: "FAIL: comment-only, no test, mandate on: blocked -- expected "block", got "approve"", "...by the TDD gate -- expected to contain "no_tests", got """, "presentational-eligible, no test, mandate on: blocked", "staged café.py with no test: TDD gate blocks no_tests", "...as no_tests" (billing and test-commit-command cases). 10 FAIL lines (the 833e5d0 and 57e7e36 worktrees pass them; HEAD b274715 is test-only so the hook approved via classifier-trivial-diff).

FIX: in `src/hooks/test-pre-commit-review.js` a new `buildTddScratch()` makes a throwaway repo under os.tmpdir() (plumbing, no commits in this checkout). Its HEAD changes `src/app.py`, so it is never test-only. It holds copies of the two tracked files the cases use. Five cases (comment-only, presentational, café second half, 0-byte test, blank-line-in-unrelated-test) stage and run there (`cwd: tddScratch.dir`); the marker is read from the scratch `.git`, so the "no PASS marker" assertions still look at the right file (not weakened). The presentational case writes its policy keyed to the scratch path, then restores the original policy line. Scratch removed on process exit. Expected decisions and assertion names unchanged; `OTHER_TEST_REL` moved up to the helper. No change to the hook.

FILES: only `src/hooks/test-pre-commit-review.js` (inside the declared set). Nothing staged or committed; the index is untouched.

DISAGREEMENTS: none.

DECISIONS THE PLAN LEFT OPEN:
- Scratch repo over a test-only switch in the hook: no switch exists, and the file already builds temp repos with plumbing (`buildRepo`, `withScratchRepo`). Conservative.
- Only the failing cases were moved; the café "not approved" first half and other mandate-exempt cases still run in the real repo, since they do not depend on HEAD.
- The blank-line case stages `show HEAD:` output plus blank lines (git's trimmed output + "\n\n") instead of head + "\n"; still adds only blank lines.

MEASUREMENTS: 10 FAIL before (`node src/hooks/test-pre-commit-review.js 2>&1 | grep FAIL:`), 0 after; 507 passed, 0 failed; run-tests Files: 39 failed: 0.

BUDGET USED: 7 calls of about 25.

NEXT: The hook cases that run under the mandate and stage in the real repo and need a HEAD-independent verdict are all moved; any future no_tests case should use `tddScratch`. The scratch repo's marker is `tddScratch.readMarker()`, not `readMarker()`.

Test command: `node src/hooks/test-pre-commit-review.js` -> exit 0, "Results: 507 passed, 0 failed"
git diff --stat:
 .claude/review-policy.json.example  |   5 +-
 README.md                           |  10 ++-
 src/hooks/pre-commit-review.js      |  27 ++++++++-
 src/hooks/test-pre-commit-review.js | 118 +++++++++++++++++++++++++++---------
 4 files changed, 129 insertions(+), 31 deletions(-)
