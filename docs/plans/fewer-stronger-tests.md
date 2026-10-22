# Fewer, faster, stronger tests from the sdlc toolchain

Plan for `/sdlc:plan-spec run`. Written 22 Oct 2026 against `main` at a9a685e.
Revision 3. Copied into the repo on branch `fewer-stronger-tests` on 22 Oct 2026.

## Findings

Lead finding: **the coverage gate is not the driver.** Gap-patching fired 10
times in 285 review blocks (3.5%; `~/.claude/code-review-timing.jsonl`,
`review.requested` by `via`: review-required 223, tdd-order 36,
coverage-gap-patch 10, coverage-stale 10). Hygiene blocks in four target-repo
transcript sets: 31, of which 24 were failing tests and 3 were diff-cover. The
one gap-patch sub-agent found in the barra transcripts wrote 3 tests in 101
lines. The volume comes from the implementer step and the review loop, and
from nothing telling anyone to stop.

Measured drivers, in order of weight:

- **Driver 1: The implementer brief has no ceiling and no form for tests.**
   `agents/implementer.md:18` ("Build the step verbatim: its WHAT TO BUILD,
   its TESTS FIRST"), `skills/plan-spec/reference.md:962-964` (TESTS FIRST
   names assertions that must be red, nothing about how many or what shape),
   `skills/plan-spec/reference.md:1523-1524` (the dispatch prompt). In the
   barra transcripts 31 implementer agents wrote 695 `def test_` (22 per
   step), 12,916 test lines against 9,660 source lines (1.34:1), while the
   TESTS FIRST fields they were handed named 0-3 tests (median 0 over 15
   steps). ConstraintsSystem general sub-agents: 1,081 tests, 21,849 test
   lines against 17,107 source. Nothing in the form says "table" or
   "parametrize"; parametrize appears in 49 of 695 barra test writes.
- **Driver 2: The reviewer's TESTED pillar only ever asks for more.**
   `agents/code-reviewer.md:102-108`: a bug fix without a failing test is
   IMPORTANT, new behaviour needs the invariant exercised "with inputs a
   reader would think of", and "say so, with the test you would add". It has
   no criterion against a test that restates the implementation, a test per
   trivial branch, a sibling test where a table row would do, or a mock-only
   test beyond `mock.called`. `skills/code-review-implementer/SKILL.md:62`
   then writes whatever was asked for. Measured result in the
   ConstraintsSystem suite (2,171 tests): 1,013 (47%) carry exactly one
   assertion, 776 sit in name-families of four or more siblings, 1,274 share a
   statement-shape seen ten or more times, 256 (12%) are parametrised.
   qdspy: 705 tests, 264 single-assert (37%), 27 mock-only, 52 parametrised.
- **Driver 3: The plan form's own GATE example is 100% line coverage of the step.**
   `skills/plan-spec/reference.md:995-996`: "diff-cover reports no uncovered
   line in the step's file set" is the worked example of a good gate. Plans
   copy it (3 of 31 barra step GATEs name diff-cover). `pre-commit-review.js`
   then holds the diff at 95% line and files at 90% branch
   (`src/hooks/pre-commit-review.js:213-214`). A 95% line target on a
   40-line fix is 2 lines of slack, which is one test per `except` and
   `log` branch. The threshold itself rarely fires (above), so this plan
   keeps the numbers and changes what the plan form tells people to aim at.
- **Driver 4: The TDD mandate is met per commit by adding a test, never a row.**
   `instructions/tdd-mandate-snippet.md:1-18`: every code commit needs a
   test file in the diff (`no_tests`), including every fix round. The gate is
   satisfied by any added non-comment line in a test file
   (`src/hooks/lib/tdd-order.js:260-271`), so a new case in an existing
   parametrised table already passes, but no text says so, and
   36 tdd-order blocks in the timing log each ended in a new test function.
- **Driver 5: Nothing says "run tests in parallel".** `commands/commit-prep.md:17`,
   `commands/verify.md:41`, `.claude/hygiene-repos.json.example` (the
   pytest-cov check), `skills/code-review-pre-commit/SKILL.md:158` (gap
   prompt), `skills/code-review-implementer/SKILL.md:63-64`, `CLAUDE.md:41-42`
   all name a serial command. Live `~/.claude/hygiene-repos.json`: 20 of 26
   pytest checks are serial; the 6 with `-n auto` are barra-risk-reports and
   reporting-data-services, which already ship `addopts = "-n auto"` and
   pytest-xdist 3.8. Timing log medians: agg_poc (serial) 86.5 s, max 639 s;
   barra-risk-reports (`-n auto`) 50.9 s. This repo: 36 suites run one
   process at a time, 87.4 s; the same files under `xargs -P 16` 25.0 s
   (3.5x), `-P 4` 37.6 s; `node --test` over four files 1.73 s to 0.87 s.
- **Driver 6: This repo practises what it preaches.** 11,097 test lines against
   9,219 source (1.20:1), 2,590 PASS assertions; `src/hooks/test-pre-commit-review.js`
   is 2,556 lines and 504 assertions for a 1,323-line hook. Since 15 Sep,
   53 code commits added 13,837 test lines against 11,109 source; 24 of
   them added at least twice as much test as source. 28 assertion names are
   duplicated across suites. 22 of 29 js/sh suites do not override
   `TIMING_LOG_PATH`, and 78 fixture rows now sit in the real timing log.

Not a driver: qdspy's main session (109 tests, 3,796 test lines against
5,998 source, 20 parametrize) is below the ratio; the pattern is a sub-agent
pattern.

## Targets and how they are measured

`tools/measure-tests.js` (step 1) reports, over a git range: test functions
added per code commit (median), test lines added per source line added,
share of added test functions that are parametrised or table-driven, share
with one assertion, mock-only count. Baseline it on this repo (`a9a685e~40..a9a685e`)
and on the two target repos before step 3 lands; rerun after two weeks of
use.

| Measure | Baseline | Target |
|---|---|---|
| Test functions added per implementer step (barra transcripts) | 22 | at most 8 (table rows do not count) |
| Test lines per source line added (this repo; barra steps) | 1.20; 1.34 | at most 0.8 |
| Single-assertion share of new tests (ConstraintsSystem) | 47% | at most 25% |
| Parametrised/table share of new test functions | 12% | at least 30% |
| Mock-only tests in a new diff | 27 in qdspy | 0 |
| This repo full suite wall-clock | 87.4 s serial | at most 40% of the serial figure measured in the same session |
| Hygiene pytest median, agg_poc and ConstraintsSystem | 86.5 s; targeted run | at least 40% lower with `-n auto` (`/sdlc:review-timing`) |
| Branch coverage on changed files | 90% gate | unchanged |

## Risks and where each is handled

- **Coverage loss.** The 95/90 thresholds stay (step 7 documents why). The
  reviewer still fails a bug fix with no failing test. Fewer tests must mean
  broader tests; the single-assert and table shares are the check.
- **Flaky parallel runs.** This repo: every suite uses `mkdtemp` (24 sites);
  `src/hooks/test-pre-commit-hygiene.sh` failed once in 9 parallel runs;
  step 2 pins any case that fails under `-P N` during its gate runs, and
  isolates the timing log per run. Python repos:
  `--dist loadfile` keeps module fixtures on one worker; 8 ConstraintsSystem
  and 4 qdspy test hits name a fixed `.db`/`.sqlite` path and need
  `tmp_path_factory` before `-n auto` is switched on there (owner task, Section 6).
- **xdist missing.** The recipe (Section 2) detects `import xdist` and falls
  back to the serial command with a printed `WARNING`. pytest-cov 7.1 combines
  worker data itself; diff-cover reads the combined `coverage.xml` and needs no
  change.
- **Instruction budget.** `src/hooks/test-session-start-instructions.js` is
  already red at HEAD on "at least 1500 characters of headroom" (snippets
  9,049 bytes, context 9,061 chars; the assertion needs at most 8,500
  chars). Step 4 lands the snippets at or below 8,250 bytes.
- **A cap that blocks honest work.** The per-commit test count ships as an
  advisory line in the block message, measured for two weeks, before anyone
  proposes enforcing it.

---

## Section 1: What this delivers, and what it does not

Delivers: one measurement tool; a parallel runner for this repo's suites;
test-quality criteria in the single-source reviewer file with every other
file pointing at it; a step form and implementer brief with a test ceiling
and a table-first rule; a gap-patching prompt that adds rows, not tests;
`-n auto` with a fallback in every pytest recipe the toolchain emits; an
advisory tests-added line in the review block message.

Does NOT: change the 95/90 thresholds; remove or weaken the TDD mandate;
edit any target repo (ConstraintsSystem, qdspy, agg_poc) — those are owner
tasks listed in Section 6; add mutation testing (dropped on 19 Oct 2026 evidence,
`skills/plan-spec/reference.md:818-820`).

## Section 2: Working constraints

- Branch `fewer-stronger-tests`; feature record created with
  `/sdlc:feature-new fewer-stronger-tests "<requirement>"` before step 1.
- Handoff work runs in sub-agents: the main session writes briefs,
  dispatches `sdlc:implementer` (Sonnet), reviews, stages, commits. One fresh
  agent per role per round; never reuse an agent via SendMessage.
- Commit protocol, two commands, always: `node tools/plugin-version.js bump`
  then `git add <files> .claude-plugin/plugin.json`; then, as its own
  command, `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  Never `git add && git commit`, never `-a`, never a heredoc with the
  two-word commit phrase. The post-commit hook stages the feature record for
  the next commit.
- Class-level guards, in every GATE: `node src/test-plugin-layout.js`,
  `node src/test-suite-isolation.js`, `claude plugin validate .`.
- Single owners: diff reading `src/hooks/lib/git-read.js`; test-path
  convention `src/hooks/lib/tdd-order.js`; source extensions
  `src/hooks/lib/source-files.js`; review policy `src/hooks/lib/review-config.js`.
  Nothing reimplements these.
- A file whose name starts `test-` or `test_` is a test to the TDD gate
  (`src/hooks/lib/tdd-order.js`). New library code is never named that way:
  the counting lib is `added-tests.js`, the CLI `measure-tests.js`.
- Gates see `SOURCE_EXTENSIONS` only; `.md` and `.json` steps carry no test
  and are reviewed as docs. Agents write files with the file tool, keep `$(`
  out of commands that name a commit, and `cd` in every command outside the
  repo root.
- Always permitted, never counted: the plan, `features/fewer-stronger-tests.md`,
  the tracker `docs/plans/fewer-stronger-tests/tracker.md`, and
  `docs/plans/fewer-stronger-tests/reports/`.
- Threat model for hook steps: honest mistakes in commands Claude writes,
  not adversarial shell. Two review rounds, then commit with gaps named.
- The pytest recipe, defined here only. Every copy (steps 5 and 6) is
  byte-identical to this line, then appends its own arguments:
  `XD=$(python -c 'import xdist' 2>/dev/null && printf -- '-n auto --dist loadfile' || echo 'WARNING: pytest-xdist missing; serial run' >&2); pytest $XD`
  Each copy stays on one line. COPY CHECK, used by steps 5-6 and DoD 6
  (prints 1 or more per file; an empty `R` is a failure):
  `R=$(grep -m1 -o 'XD=.*pytest [$]XD' docs/plans/fewer-stronger-tests.md); test -n "$R" && grep -cF -- "$R" <file>...`

## Section 3: Owner decisions

- **Decision 1: Standing authorisation. GRANTED by the owner, 22 Oct 2026.** To stage, commit and dispatch fix rounds
   unattended under the protocol above. Overrides the "wait for the user
   after the marker" rule in `instructions/claude-md-snippet.md`.
- **Decision 2: The ceiling.** 8 test functions per step/commit, table rows uncounted
   (from 22 measured). Options: 6 (tighter, more FAILs on hook steps with
   many shapes), 8 (chosen), 12 (barely moves the median). Bites in steps 4
   and 7.
- **Decision 3: Thresholds stay at 95/90.** Evidence: 3 of 31 hygiene blocks and 10 of
   285 review blocks were coverage. Changing them has no measured payoff.
   Bites in step 7's documentation only.
- **Decision 4: Target-repo rollout.** (`-n auto`, `--dist loadfile`, fixed-path sqlite
   fixtures) is done in those repos by their owners; this plan ships the
   recipe. Bites nowhere here; listed in Section 6.
- Follow-on: a second plan slims this repo's own test suite under criteria
  2.1-2.7 after this plan lands (owner asked, 22 Oct 2026).

## Section 4: Prerequisites, ordering and suite baseline

Order: 1 (measure) before everything so before/after exists; 2 (runner)
before 3-7 so every later GATE runs the parallel runner; 3 (reviewer file)
before 4 and 5, which point at it; 6 and 7 independent of each other.

Suite baseline at HEAD a9a685e, measured 22 Oct 2026:
- `src/hooks/test-session-start-instructions.js`: red, 6 FAILs. One is
  the 1500-char headroom (turned green by step 4). Five are "no warning ..."
  cases asserting `ctx.includes('WARNING')` is false, while
  `instructions/hygiene-snippet.md:10` contains `WARNING`; step 2 fixes them.
- `skills/plan-spec/test_check_size.py`: cannot run here (`.venv` has no
  pytest). Out of scope; Section 7 runs it with `python3 -m pytest` only where
  pytest is importable.
- Everything else green serially; `src/hooks/test-pre-commit-hygiene.sh`
  failed once in 9 parallel runs (step 2).

## Section 5: The steps

**1. A measurement tool exists that reports test shape over a git range, and the baseline is recorded.**
NEW `src/hooks/lib/added-tests.js`, `tools/measure-tests.js`,
`src/hooks/test-added-tests.js`.

WHY NOW: every target above needs a number before and after. The figures in
Findings came from ad-hoc scripts in a scratchpad; nothing in the repo can
reproduce them.

WHAT TO BUILD:
- `src/hooks/lib/added-tests.js` exports `countAddedTests(unifiedDiff)` returning
  `{ testFunctions, testLines, sourceLines, parametrised, singleAssert, mockOnly, byFile }`.
  Added lines only (`+` hunk lines, never `+++`). Test files are decided by
  `src/hooks/lib/tdd-order.js`'s convention (import it; do not restate).
  Patterns, one table in the module: Python `def test_`, `parametrize(`;
  JS/TS `test(`/`it(`; Java `@Test`; C# `[Fact]`/`[Theory]`; Go `func Test`;
  Rust `#[test]`. `singleAssert` and `mockOnly` are Python-only (count
  `assert` and `assert_called`/`call_count` per added `def test_` body);
  other languages report null for those two.
- `tools/measure-tests.js --range A..B [--repo PATH] [--json]`: for each
  commit `git rev-list --no-merges A..B` lists that touches a source extension, run
  `git show --format= --unified=0 <sha>` and fold `countAddedTests` over it;
  print median test functions per code commit, test lines per source line,
  parametrised share, single-assert share, mock-only total, and the five
  commits with the highest test:source ratio. `--repo` runs it elsewhere.
- No in-line requires; constants at module top; docstring-style header
  comment with a usage example.

IMPORTS (single owners): `src/hooks/lib/tdd-order.js` (what is a test path);
`src/hooks/lib/source-files.js` (what is source).

ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `src/hooks/pre-commit-review.js` (step 7's), `tools/run-tests.sh` (step 2's).

TESTS FIRST: `src/hooks/test-added-tests.js` — one table of eight unified
diffs (py single test, py parametrised with three rows, py mock-only, js
`test(`, java `@Test`, source-only diff, test file with only a comment added,
a `+++` header that mentions `def test_`) with expected counts, one loop, one
`assert` per field; it calls `isolateGitEnv()` as `src/test-suite-isolation.js`
requires. Red before the lib exists.

GATE: `node src/hooks/test-added-tests.js` exits 0 and
`node tools/measure-tests.js --range a9a685e~40..a9a685e` prints a
test-lines-per-source-line figure, which the report quotes beside the 1.20
measured here, and the class-level guards pass.

REVIEW: 1. Does the `+++` header case prove headers are not counted?
2. Is the test-path decision imported from tdd-order, not re-stated?
3. Is any pattern in the table wrong for the language it names? FAIL on:
a second copy of the test-path convention; a language whose pattern matches
production code (the `*Spec.java` incident in the TDD snippet).

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 calls; one round.

**2. This repo's suites run in parallel through one runner, isolated from the real timing log, and any parallel-only failure is pinned.**
NEW `tools/run-tests.sh`, `tools/test-run-tests.sh`. EXTEND `CLAUDE.md`, `README.md`,
`skills/code-review-implementer/SKILL.md`, `src/hooks/test-pre-commit-feature.sh`,
`src/hooks/test-pre-commit-hygiene.sh`, `src/hooks/test-session-start-instructions.js`.

WHY NOW: serial 87.4 s, `-P 16` 25.0 s, measured 22 Oct 2026 with
`date +%s%N` around each file. `node --test` already runs each file as its
own subprocess and reads the exit code, so the custom harness needs no
change (probe: four files 1.73 s to 0.87 s). 78 fixture rows in
`~/.claude/code-review-timing.jsonl` come from suites that never set
`TIMING_LOG_PATH`.

WHAT TO BUILD:
- `tools/run-tests.sh [-j N] [ROOT]`: `ROOT` (default the repo root) is
  where the globs below resolve; a glob matching nothing is skipped. Exports
  `TIMING_LOG_PATH` to a `mktemp` file for the whole run; runs
  `node --test --test-concurrency=N src/hooks/test-*.js src/test-*.js tools/test-*.js`
  and, in the same wall-clock window, `xargs -P N -n1 bash` over
  `src/hooks/test-*.sh src/test-*.sh tools/test-*.sh`; runs `python3 -m pytest -q skills/plan-spec`
  only if `python3 -c "import pytest"` succeeds, else prints one WARNING
  line; prints per-file rc and total elapsed; exits non-zero if any file
  did. `N` defaults to `nproc`.
- Any case that fails under `-P N` during the gate runs: find the cause and
  fix it in the test or, if the cause is in the hook, report it as a step
  the plan owes (§18.6) rather than fixing inline.
- `src/hooks/test-session-start-instructions.js`: the five
  `ctx.includes('WARNING')` assertions become `ctx.includes(WARNING_HEAD)`.
- `CLAUDE.md:41-42`, `README.md` (the tests paragraph) and
  `skills/code-review-implementer/SKILL.md:63-64` name `tools/run-tests.sh`
  as the way to run the suites; the per-file commands stay as the way to
  run one.

IMPORTS: none.
ASSUMES LANDED: step 1.
MUST NOT TOUCH: `src/hooks/lib/added-tests.js`, `tools/measure-tests.js`.

TESTS FIRST: `tools/test-run-tests.sh` — one table over two fixture roots
under `mktemp -d` (one passing suite, one failing suite); per row it asserts
the runner's exit code, the per-file rc line, and that the suite saw
`TIMING_LOG_PATH` exported. Red before the runner exists.

GATE: `bash tools/test-run-tests.sh` exits 0; `bash tools/run-tests.sh`
reports no failing file except `src/hooks/test-session-start-instructions.js`,
whose only FAIL is the headroom assertion, three consecutive times; its
elapsed total is at most 40% of a serial loop over the same files measured
in the same session (both figures quoted); `grep -c "repo[0-9]\|targeted-"
~/.claude/code-review-timing.jsonl` is unchanged before and after a run;
`node src/hooks/test-added-tests.js` exits 0; guards pass.

REVIEW: 1. Does a failing file make the runner exit non-zero (prove it
with a deliberately broken copy under `mktemp -d`)? 2. Is any
parallel-only failure's fix a cause, not a retry or a sleep? FAIL on: a `sleep` or retry
loop added to a test; the runner swallowing a non-zero rc.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 35 calls; one or two rounds (the flaky case may need a probe).

**3. The reviewer's TESTED pillar says what a good test is, what a padded one is, and asks for rows before tests.**
EXTEND `agents/code-reviewer.md`, `agents/code-reviewer-deep.md`.

WHAT TO BUILD, replacing `agents/code-reviewer.md:102-108` with these
criteria, numbered 2.1-2.7 so other files can cite them:
- 2.1 A bug fix names the staged test that fails without it; none is
  IMPORTANT (unchanged).
- 2.2 A test states a contract: given input, observable output (return
  value, stored state, visible side effect). Three or more cases of one
  shape are one parametrised or table-driven test, not siblings; a sibling
  family where a table would do is IMPORTANT, and the finding carries the
  table it would collapse into.
- 2.3 One test per behaviour, not per branch. A branch that only logs,
  re-raises, or returns a default gets no test of its own unless the
  default is the contract. A test whose expected value is computed by the
  same expression as the implementation restates it and is IMPORTANT.
- 2.4 Boundaries over bulk: the failing direction and the edges (empty,
  one, largest, malformed) are rows in the same table.
- 2.5 Mocks only at the process boundary (`SfmEnvironment`, subprocess,
  network, clock). A test whose only assertion is that a mock was called is
  not a test: IMPORTANT, with the observable effect it should assert.
- 2.6 Count against behaviours. The block message carries "tests added: N";
  more test functions than behaviours the diff introduces, or more than
  the policy ceiling, is IMPORTANT.
- 2.7 Asking for a test: name the behaviour, prefer a row in an existing
  table, never ask for a test whose only effect is a covered line.
- `agents/code-reviewer-deep.md`: add one line that 2.1-2.7 apply unchanged.

IMPORTS: none. ASSUMES LANDED: step 1 (the "tests added" line's meaning).
MUST NOT TOUCH: `skills/*`, `instructions/*` (steps 4-6).

TESTS FIRST: none; a documentation step outside the gates' extensions.

GATE: `grep -cE "^ *- 2\.[1-7] " agents/code-reviewer.md` prints 7;
`grep -c "2.1-2.7" agents/code-reviewer-deep.md` prints at least 1;
`claude plugin validate .` exits 0; `bash tools/run-tests.sh` reports no failing file except
`src/hooks/test-session-start-instructions.js`, whose only FAIL is the headroom assertion.

REVIEW: 1. Could a reviewer apply each of 2.2-2.6 to a diff and reach the
same verdict twice? 2. Does any criterion weaken 2.1? 3. Is the file still
the single source (no criteria restated elsewhere)? FAIL on: a criterion
that cannot be settled from the diff; 2.1 weakened.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 15 calls; one round.

**4. The step form, the implementer brief and the TDD snippet carry the ceiling and the table-first rule, and the snippets fit the budget.**
EXTEND `skills/plan-spec/reference.md`, `skills/plan-spec/SKILL.md`,
`agents/implementer.md`, `instructions/tdd-mandate-snippet.md`,
`README.md`.

WHY NOW: 22 tests per step measured; TESTS FIRST median 0 named tests;
the GATE example at `skills/plan-spec/reference.md:995-996` is "no
uncovered line"; the snippets are over the headroom the hook test
demands.

WHAT TO BUILD:
- `skills/plan-spec/reference.md`: §16 TESTS FIRST field gains "at most
  eight test functions for the step, table-driven where three or more cases
  share a shape; name the table, its columns and its rows". §16's GATE
  example line swaps "no uncovered line in the step's file set" for "the
  named table tests pass and the hook's branch threshold holds on the
  step's files". §17 adds a fifth size signal: a step whose TESTS FIRST
  needs more than eight functions is two steps. §21.1 adds one rule line:
  "Tests follow `agents/code-reviewer.md` 2.2-2.7; at most eight functions;
  a case is a row." §11 unchanged.
- `skills/plan-spec/SKILL.md` Section 1 item 3 and Section 2 item 1: one clause each
  pointing at the same rule; no restatement.
- `agents/implementer.md`: contract bullet "Tests follow
  `agents/code-reviewer.md` 2.2-2.7: tables over siblings, at most eight
  functions per step, no mock-only tests."
- `instructions/tdd-mandate-snippet.md`: add two sentences — a test is a
  behaviour not a branch, and a new row in an existing table satisfies the
  mandate (`src/hooks/lib/tdd-order.js::testDiffAddsTestCode` counts any
  added non-comment line) — and move the Robot/Cucumber/Java/.NET
  path-convention paragraph to `README.md`'s TDD section, leaving one
  sentence that points there. `instructions/*.md` lands at or below 8,250
  bytes (9,049 at HEAD).

IMPORTS: `agents/code-reviewer.md` owns the criteria; cite, never copy.
ASSUMES LANDED: steps 2, 3.
MUST NOT TOUCH: `skills/code-review-pre-commit/SKILL.md` (step 5),
`commands/*` (step 6), `src/hooks/pre-commit-review.js` (step 7).

TESTS FIRST: `src/hooks/test-session-start-instructions.js` "at least 1500
characters of headroom" is red at HEAD and must be green after; quote the
red run.

GATE: `node src/hooks/test-session-start-instructions.js` exits 0;
`wc -c instructions/*.md` total is at most 8,250;
`grep -c "no uncovered line" skills/plan-spec/reference.md` prints 0;
`grep -c "2.2-2.7" agents/implementer.md skills/plan-spec/reference.md`
prints at least 1 each; `python3 skills/plan-spec/check_citations.py
skills/plan-spec/fixtures/tests-first-plan.md main` exits as it did at HEAD;
`bash tools/run-tests.sh` exits 0.

REVIEW: 1. Does any new sentence restate a criterion instead of citing it?
2. Does the moved paragraph lose a rule the gate still enforces? 3. Would an
implementer reading the §21.1 rule know what to do with a tenth case?
FAIL on: a criterion copied; the headroom assertion still red.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 calls; one round.

**5. The gap-patching prompt adds rows, not tests, runs pytest in parallel, and reports dead lines instead of testing them.**
EXTEND `skills/code-review-pre-commit/SKILL.md`.

WHAT TO BUILD, in the `<gap-patching-mode>` block
(`skills/code-review-pre-commit/SKILL.md:138-196`):
- Step 2 becomes: for each uncovered function, first look for an existing
  test of that function; add a row to its table, or a case to it, before
  writing a new function. At most one new test function per uncovered
  function. The test follows `agents/code-reviewer.md` 2.2-2.7.
- New step: an uncovered line that is defensive (re-raise, log-and-return,
  an `else` that cannot be reached through the public interface) is listed
  in the report as `UNCOVERABLE: <file:line> <reason>` and left alone; no
  `pragma: no cover` is added.
- Step 3's command becomes the Section 2 recipe, byte-identical, followed
  by `--cov=<pkg> --cov-branch --cov-report=xml -q`.
- Gap-patch PASS conditions are unchanged. When only UNCOVERABLE lines
  remain, the patcher prints `GAP_PATCH: FAIL` with reason
  `N UNCOVERABLE lines` and the list. It never loosens PASS.
- The report lists tests added as "N functions, M rows".

IMPORTS: `agents/code-reviewer.md` 2.2-2.7. ASSUMES LANDED: step 3.
MUST NOT TOUCH: `src/hooks/pre-commit-review.js`, `commands/*`.

TESTS FIRST: none; prompt text, outside the gates' extensions.

GATE: `grep -c "UNCOVERABLE" skills/code-review-pre-commit/SKILL.md`
prints at least 2; `grep -c "pragma" skills/code-review-pre-commit/SKILL.md`
prints at least 1 (the prohibition); `grep -c "import xdist"
skills/code-review-pre-commit/SKILL.md` prints at least 1; the Section 2
COPY CHECK on `skills/code-review-pre-commit/SKILL.md` prints at least 1;
`claude plugin validate .` exits 0; `bash tools/run-tests.sh` exits 0.

REVIEW: 1. Can the gap-patcher still reach `GAP_PATCH: PASS` when every
uncovered line is UNCOVERABLE and diff-cover therefore still fails? State
what it prints. 2. Is the trailer contract untouched? FAIL on: a changed
trailer; the prompt asking for a test per uncovered line anywhere.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 15 calls; one round.

**6. Every pytest the toolchain tells anyone to run is parallel when xdist is present and serial with a WARNING when it is not.**
EXTEND `.claude/hygiene-repos.json.example`, `instructions/hygiene-snippet.md`,
`commands/commit-prep.md`, `commands/verify.md`, `README.md`,
`src/hooks/test-pre-commit-hygiene.sh`.

WHY NOW: 20 of 26 live pytest checks are serial; agg_poc median 86.5 s,
max 639 s; the one repo on `-n auto` has pytest-xdist 3.8, pytest-cov 7.1
and diff-cover 10.6 working together today.

WHAT TO BUILD:
- `.claude/hygiene-repos.json.example`'s `pytest-cov` check: its `pytest`
  call becomes the Section 2 recipe, inline at the head of that command,
  byte-identical; no `setup` function (one breaks `targeted_case`, which
  sets `entry.setup = []`, and case 15's `SMOKE_CMD`). `--dist loadfile`
  keeps a module's tests on one worker so module-scoped fixtures hold. The
  diff-cover check is unchanged.
- `commands/commit-prep.md:17-21` and `commands/verify.md:41`: the full
  suite line is the Section 2 recipe, byte-identical, plus its own arguments.
- `instructions/hygiene-snippet.md` and `README.md`'s hygiene section: one
  sentence each: the recipe runs `-n auto --dist loadfile` when xdist
  imports and warns otherwise; a fixed-path fixture (`.db`, `.sqlite`,
  `/tmp/<name>`) must move to `tmp_path_factory` before a repo opts in.
  The `hygiene-snippet.md` sentence is net-zero bytes within that file and
  adds no literal `WARNING`.
- `src/hooks/test-pre-commit-hygiene.sh`: one new targeted case that runs
  the example config's `pytest-cov` command against the existing fake
  `pytest` with a fake `python` on PATH that exits 0 for `import xdist`,
  and once with one that exits 1; asserts `-n auto` appears in the pytest
  log in the first run only and `WARNING` on stderr in the second. One
  case, two runs, one table of expected substrings.

IMPORTS: the fake-binary harness already in
`src/hooks/test-pre-commit-hygiene.sh` (`targeted_case`); reuse it.
ASSUMES LANDED: steps 2, 4, 5.
MUST NOT TOUCH: `skills/code-review-pre-commit/SKILL.md` (step 5's copy),
`src/hooks/pre-commit-hygiene.js`.

TESTS FIRST: the new case in `src/hooks/test-pre-commit-hygiene.sh`, red
against the old example config (no `-n auto` in the log).

GATE: `bash src/hooks/test-pre-commit-hygiene.sh` exits 0 and its output
contains the new case's PASS line; `grep -c "dist loadfile"
.claude/hygiene-repos.json.example commands/commit-prep.md commands/verify.md`
prints at least 1 each; the Section 2 COPY CHECK on those three files and
`skills/code-review-pre-commit/SKILL.md` prints at least 1 each;
`wc -c instructions/hygiene-snippet.md` is unchanged
from step 4; `node src/hooks/test-session-start-instructions.js` exits 0;
`bash tools/run-tests.sh` exits 0.

REVIEW: 1. Does the recipe degrade to exactly the old command when xdist is
absent? 2. Does `--cov` under xdist still write one `coverage.xml` at the
repo root (pytest-cov 7 does; say where that is checked)? 3. Is the copy in
the gap prompt, `hygiene-repos.json.example`, `commit-prep.md` and
`verify.md` byte-identical to the Section 2 line (`grep -cF` it in each)? FAIL on: a copy that differs
from the definition; a recipe that errors when xdist is missing.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 35 calls; one or two rounds.

**7. The review block message carries an advisory tests-added line against a policy ceiling, and the thresholds are documented as kept.**
EXTEND `src/hooks/pre-commit-review.js`, `src/hooks/test-pre-commit-review.js`,
`.claude/review-policy.json.example`, `README.md`.

WHAT TO BUILD:
- `src/hooks/pre-commit-review.js`: in the review-required block message
  (the one that carries `semanticNote`), append
  `Tests added: <functions> functions, <rows> parametrised rows, <testLines>/<sourceLines> test/source lines (ceiling <max_tests_per_commit>).`
  computed with `src/hooks/lib/added-tests.js` over the staged diff the hook
  already read (`src/hooks/lib/git-read.js`; no second `git diff`). A read
  failure prints `Tests added: unreadable` and changes no decision.
  Advisory only: no block, no marker effect.
- `max_tests_per_commit` read with the other policy fields
  (`src/hooks/pre-commit-review.js:212-214`), default 8.
- `.claude/review-policy.json.example`: the new key, and a `_comment` that
  `diff_cover_threshold` 95 and `branch_cover_threshold` 90 are kept on
  22 Oct 2026 evidence (3 of 31 hygiene blocks, 10 of 285 review blocks
  were coverage) and that the ceiling is advisory until two weeks of
  `tools/measure-tests.js` figures say otherwise.
- `README.md` fast-path section: one paragraph on the line and the ceiling.

IMPORTS: `src/hooks/lib/added-tests.js` (step 1); `src/hooks/lib/git-read.js`.
ASSUMES LANDED: steps 1, 2, 3.
MUST NOT TOUCH: `src/hooks/pre-commit-hygiene.js`, `skills/*`, `instructions/*`.

TESTS FIRST: in `src/hooks/test-pre-commit-review.js`, inside the existing
review-required case, two assertions: the message contains `Tests added:`
with the counts the fixture diff implies, and a policy file setting
`max_tests_per_commit` to 3 changes only the `(ceiling 3)` text and not
the decision. Red before the hook change.

GATE: `node src/hooks/test-pre-commit-review.js` exits 0; the hook's
decision on the existing review-required fixture is unchanged (quote the
assertion name); `node src/hooks/test-added-tests.js` exits 0;
`bash tools/run-tests.sh` exits 0; guards pass.

REVIEW: 1. Can the new line ever turn an approve into a block, or touch a
marker? Trace it. 2. Does a thrown error in counting fail closed into the
existing block path, never into silence? 3. Is the diff read once? FAIL on:
a second `git diff` spawn; a path where counting changes `decision`.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 calls; one or two rounds (hook steps take round 2 on Opus per `.claude/sdlc-review.json`).

## Section 6: What NOT to do

- Do not lower `diff_cover_threshold`: the gate fires in 3.5% of blocks;
  the saving is unmeasurable and the loss is real.
- Do not enforce the ceiling in this plan; ship it advisory and measure.
- Do not delete existing tests in this repo to hit the ratio; the targets
  are on tests *added*.
- Do not add `pragma: no cover` anywhere; UNCOVERABLE lines are reported.
- Do not flip target-repo hygiene checks to `-n auto` from this repo.
  Owner tasks, in the target repos, in this order: add `pytest-xdist>=3.8`
  to ConstraintsSystem, qdspy and agg_poc; move the 8 and 4 fixed-path
  `.db`/`.sqlite` fixtures to `tmp_path_factory`; run the suite three times
  with `-n auto --dist loadfile`; then edit `~/.claude/hygiene-repos.json`
  to call the step-6 recipe.
- Do not name a new library file `test-*`/`test_*`.

## Section 7: Definition of done

Run in this order at the final HEAD:
1. `bash tools/run-tests.sh` exits 0 three times; elapsed at most 40% of
   the serial loop quoted in step 2's report.
2. `node tools/measure-tests.js --range a9a685e..HEAD` prints a
   test-lines-per-source-line figure at or below 0.8 for this plan's own
   commits.
3. `node src/hooks/test-session-start-instructions.js` exits 0.
4. `claude plugin validate .` exits 0; every commit in `a9a685e..HEAD` that
   is not features-only has a `.claude-plugin/plugin.json` version above its
   parent's.
5. `grep -rn "2.2-2.7" agents/implementer.md skills/plan-spec/reference.md skills/code-review-pre-commit/SKILL.md`
   finds at least one hit in each file, and `agents/code-reviewer.md` is the
   only file that defines 2.1-2.7.
6. The Section 2 COPY CHECK on `skills/code-review-pre-commit/SKILL.md`,
   `.claude/hygiene-repos.json.example`, `commands/commit-prep.md` and
   `commands/verify.md` prints at least 1 for each file.
7. Two weeks after merge: `node tools/measure-tests.js --range <merge>..HEAD --repo <each target repo>`
   and `/sdlc:review-timing` against the Targets table; the owner then
   decides on enforcement.

## Section 8: Review findings — disposition

Round 1 (source, against HEAD; NOT YET). All 11 folded in:
1. "No warning" FAILs misattributed: step 2 switches them to `WARNING_HEAD`;
   steps 2-3 allow only the headroom FAIL, step 4 on requires exit 0; the
   legacy-wiring wording is gone from Section 4, steps 4 and 6, DoD 3.
2. Range `a9a685e~60` does not resolve: now `~40` in Targets and step 1;
   step 1 names `git rev-list --no-merges`.
3. Runner had no test: step 2 adds `tools/test-run-tests.sh` and a `ROOT`
   argument; flake bullet now covers any `-P N` failure; hygiene suite added.
4. Runner globs now include `tools/test-*`.
5. `pyx` setup function dropped; the detection sits inline in the check.
6. Recipe defined once in Section 2; steps 5-6 copy it byte-identical;
   step 6 REVIEW Q3 checks that. Chosen over "cite, never copy" because a
   prompt and a JSON command cannot cite.
7. Step 4 lands snippets at or below 8,250 bytes; step 6's sentence is
   net-zero in `hygiene-snippet.md`, no new `WARNING`, and gated on it.
8. Step 5 states gap-patch PASS is unchanged; UNCOVERABLE-only prints FAIL.
9. Step 5 cites 2.2-2.7.
10. DoD 4 is a per-commit version check over `a9a685e..HEAD`.
11. Step 3 GATE regex fixed.
Strict options taken throughout: no gate was loosened.

Round 2 (consistency, fold-in sections; NOT YET, one finding). Folded in:
1. Recipe byte-identity was only a REVIEW question: Section 2 now carries a
   COPY CHECK command (run against this plan at revision 3: it extracts the
   line and matches it); steps 5 and 6 GATE on it and DoD 6 runs it over all
   four copies. Below the bar, noted: step 4's "exits as at HEAD" wording;
   step 2 EXTEND lists the flake-pin targets without a named edit; step 5
   REVIEW Q1 is answered by the plan.

Below the bar: baseline ratio fixed to 1.20 (barra 1.34); `isolateGitEnv()`
added to step 1; `commands/verify.md` cited at 41. Noted, not actioned: §17's
new size test is the sixth, not fifth; step 7's diff reader is
`readStagedDiff` in `pre-commit-review.js`; README has no "fast-path
section"; criterion 2.6 cites a line step 7 builds. None changes what a
step builds or gates.

## Section 9: DECISIONS-OPEN

(empty)

## Section 10: As built

(written last, from the tracker)
