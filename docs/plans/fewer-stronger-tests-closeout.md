# Close-out: fewer, stronger tests

Phase 2 of `docs/plans/fewer-stronger-tests.md` (revision 5), split out on
22 Oct 2026 to keep the main plan under the size cap. Branch
`fewer-stronger-tests`. Three steps built from review advisories batched in
`docs/plans/fewer-stronger-tests/tracker.md`. Working constraints, the
pytest recipe (Section 2) and criteria 2.1-2.7 are the main plan's. Reports
go to `docs/plans/fewer-stronger-tests/reports/`.

Dropped from the close-out list, with reasons: wrapping the two long snippet
lines and restoring `.sqlite` in `hygiene-snippet.md` (both cost bytes the
snippet budget does not have; the README carries both); an opt-in test that
runs real xdist and checks one merged `coverage.xml` (no xdist here; owner
task in a repo that has it); the `+++` header row tweak (the case already
bites, per review 1).

**C1. Close-out (code): the counter's patterns, the runner's empty-root case, the smoke fallback.** INSERTED 22 Oct 2026 from review advisories; this block is unreviewed: a disagreement with it is a DISAGREEMENTS entry, not an error to work around.
EXTEND `src/hooks/lib/added-tests.js`, `src/hooks/test-added-tests.js`,
`tools/run-tests.sh`, `tools/test-run-tests.sh`,
`.claude/hygiene-repos.json.example`, `src/hooks/test-pre-commit-hygiene.sh`.

WHAT TO BUILD:
- `added-tests.js`: Go pattern matches `func Test[A-Z0-9_]\w*(` and not
  `TestMain` or `Testing`; JS counts `test.each(...)` / `it.each(...)` as one
  function and one parametrised.
- `run-tests.sh`: zero files found under ROOT prints `no test files under
  <ROOT>` and exits 2 (fail closed).
- `hygiene-repos.json.example`: the `pytest -m smoke` fallback uses the
  Section 2 recipe (byte-identical) in place of its bare `pytest`.

TESTS FIRST: rows only, no new functions: three rows in the existing
`test-added-tests.js` table (Go `TestMain` not counted; Go `TestFoo`
counted; JS `test.each` counted as 1 function, 1 parametrised); one row in
`tools/test-run-tests.sh` (empty ROOT: exit 2, the message); the existing
case 15 in `test-pre-commit-hygiene.sh` gains one expected substring
(`-n auto` with fake xdist present, if case 16's fake-python harness
reaches it; otherwise one row in case 16's table for the smoke command).
Red first, quoted.

GATE: `node src/hooks/test-added-tests.js` exits 0; `bash tools/test-run-tests.sh`
exits 0; `bash src/hooks/test-pre-commit-hygiene.sh` exits 0; COPY CHECK on
`.claude/hygiene-repos.json.example` prints 2; `bash tools/run-tests.sh`
exits 0; guards pass.

REVIEW: 1. Are the new cases rows, not functions? 2. Does an empty ROOT now
fail? FAIL on: a new test function where a row would do; a recipe copy that
differs.
BUDGET: about 25 calls; one round.

**C2. Close-out (test isolation): `test-pre-commit-feature.sh` "amend -> approve" fails inside a git worktree.** INSERTED 22 Oct 2026; unreviewed block, as C1.
EXTEND `src/hooks/test-pre-commit-feature.sh`.

WHAT TO BUILD: find why "amend -> approve" fails when the suite runs in a
`git worktree add` checkout and passes in the main tree; fix the test so it
is independent of the checkout it runs in (criterion 2.5), changing no
expected decision. If the cause is in the hook, stop and report (§18.6).

TESTS FIRST: the failing case itself, red in a fresh worktree of HEAD, quoted.

GATE: in a fresh `git worktree add --detach` of HEAD with the fix copied in,
`bash src/hooks/test-pre-commit-feature.sh` reports 0 failed; in the main
tree, the same; `bash tools/run-tests.sh` exits 0; guards pass.

REVIEW: 1. Is any assertion weakened or removed? 2. Does the case still
read nothing outside its own temp repo? FAIL on: a changed expected
decision; a retry or sleep.
BUDGET: about 20 calls; one round.

**C3. Close-out (docs): criterion wording and stale counts.** INSERTED 22 Oct 2026; unreviewed block, as C1.
EXTEND `agents/code-reviewer.md`, `skills/plan-spec/SKILL.md`.

WHAT TO BUILD:
- `agents/code-reviewer.md` TESTED lead-in: restore "new behaviour is
  exercised against the change's invariant, with the inputs a reader would
  think of, including the failing direction". 2.6 names the ceiling's
  source: `max_tests_per_commit` in `~/.claude/review-policy.json`,
  default 8.
- `skills/plan-spec/SKILL.md` item 4: "§17's four tests" becomes the
  count §17 now carries (six).

TESTS FIRST: none; docs.

GATE: `grep -cE "^ *- 2\.[1-7] " agents/code-reviewer.md` prints 7;
`grep -c "max_tests_per_commit" agents/code-reviewer.md` prints at least 1;
`grep -c "four tests" skills/plan-spec/SKILL.md` prints 0;
`claude plugin validate .` exits 0; `bash tools/run-tests.sh` exits 0.

REVIEW: 1. Is any criterion restated outside `agents/code-reviewer.md`?
FAIL on: 2.1 weakened.
BUDGET: about 10 calls; one round.

