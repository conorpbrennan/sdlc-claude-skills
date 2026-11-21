# Tracker draft: sdlc Phase 0

Copy to the run directory as tracker.md at run start (owner decision 3). Pre-run state only.

RUN: tmp/sdlc-phase0-plan.md, revision 2. Branch: sdlc-enhancement-phase0. Started: 2026-11-21.
BUDGET: six steps, about 165 implementer tool calls, 6-9 review rounds. Spent: plan writing only.
OWNER DECISIONS (21 Nov 2026): all four answered yes: standing authorisation (stage, commit, fix agents
  unattended S1-S6; no push, no PR), reproduction rule max(5%, 1 event), plan copied to docs/plans/, scope.
IN FLIGHT: S2 implementer (round 1)
TREE: staged nothing; unstaged clean (tmp/ is gitignored). Worktrees open: none
DISPOSITIONS:
  source round 1 (Opus, whole document vs HEAD + reference scripts), verdict NOT YET, 4 findings:
  1. S2/S3 could port the unused SRC_EXT / SENSITIVE (extract.js:8-9) and miss REF. Verified by grep.
     Accepted: S2 says not ported; S3 pins analyze.js:10 SRC + :28 exclusion and classify.js:26 regex.
  2. Section 7 `plugin-version.js check` exits 1 at HEAD with nothing staged. Accepted: clause dropped;
     item 5 reworded with the feature-record exemption.
  3. S5 test fixture in the shared tree would move pinned numbers. Accepted: own projects tree, as the
     prompt-cache test does.
  4. Source asked for tools/fixtures/; S2 had no Agent-dedupe test. Accepted: section 1 line; S2 test.
  Below the bar, noted not actioned: parentUuid-key filter (0 files cross the split), agent-id dedupe
  (0 duplicates), first vs last line usage (same total), main tie-break.
  cut job (Sonnet), pins folded into S1-S6: tier comparisons and file sets, reviewCycles object and
  zero-count commits, inclusive bounds and next-call rule, tdd regexes, block-loop counting, agent field
  defaults, commit and denial event rules, interrupts users[1..], testFilesNamed as a number, final and
  toolCalls rules, cacheWriteCost tier and null price, unrounded rows, reviewsPerCommit null, mixed
  prefix, orchestration always present, since from --days, exact section headings and band labels.
  Cuts taken: S2 repeated privacy sentence, S4 REVIEW item 2, S5 repeated quote sentence; IMPORTS
  fields shortened to "none". Rejected: removing ROLLBACK and IMPORTS fields (§16 template fields);
  switching the main-line filter to startsWith (round 1 measured the key rule as equivalent).
  round 2: not run. The fold-in changed no seam table row and no ASSUMES LANDED line (§2a).
DECISIONS-OPEN: none
AS BUILT: not started

STEP S1: committed
  commit:  57e4cf9
  gate:    test-prices 19 passed; test-model-spend 47 passed; test-usage-fit 74 passed; src/test-plugin-layout.js,
           src/test-suite-isolation.js and `claude plugin validate .` exit 0; grep "PRICES = " tools/model-spend.js empty
  reviews: sdlc:code-reviewer round 1, PASS, 0/0/2 (critical/important/advisory)
  reports: docs/plans/sdlc-phase0/reports/S1-implementer-1.md, S1-review-1.md (gitignored)
  stage:   the step's four files, plugin.json (1.0.106), the plan copy, tracker, feature record
  files:   as declared; test-model-spend.js needed no edit
  notes:   advisories above noted not actioned: usage-fit.js:330-340 prices cache-write parts with a partial usage
           object, so a Haiku message over 100000 prompt tokens can price its write split at the low tier (estimate
           only; usage-fit.js is MUST NOT TOUCH). Review ran on the staged diff in place, no review worktree
           (owner's global rule: no worktree unless asked).
