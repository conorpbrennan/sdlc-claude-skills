# Tracker draft: sdlc Phase 0

Copy to the run directory as tracker.md at run start (owner decision 3). Pre-run state only.

RUN: tmp/sdlc-phase0-plan.md, revision 2. Branch: sdlc-enhancement-phase0. Started: 2026-11-21.
BUDGET: six steps, about 165 implementer tool calls, 6-9 review rounds. Spent: plan writing only.
OWNER DECISIONS (21 Nov 2026): all four answered yes: standing authorisation (stage, commit, fix agents
  unattended S1-S6; no push, no PR), reproduction rule max(5%, 1 event), plan copied to docs/plans/, scope.
IN FLIGHT: nothing (S1-S6 committed; definition of done run at HEAD 6c95555)
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
DECISIONS-OPEN:
  1. S6 carries two S5 review advisories (the two missing-space slips in tools/model-spend.js and one sentence in
     commands/model-spend.md that wide windows read the tree twice, about 30 s). Both files are in S6's declared set,
     so the S5 commit was not reopened. Conservative: no behaviour change.
  2. S6's MUST NOT TOUCH lists README.md and CLAUDE.md, but S5's doc lines name section 9 only. Section 10 is then
     undocumented in README.md and CLAUDE.md. Left for the as-built close-out, not a step.
  3. Orchestrator ran no review worktree (owner's global rule: no worktree unless asked); reviewers read the staged
     diff in place and built any scratch trees outside the repo.
AS BUILT (from the STEP blocks below):
  S1 tools/lib/prices.js: prices per model id (family defaults, fable-5-1 override, Haiku long-prompt tier above
     100,000 prompt tokens). model-spend.js re-exports family and cost; usage-fit.js untouched.
  S2 tools/lib/orch-signals.js readSessions: one record per main session, shared per-call dedupe, until/since rules.
  S3 classify, signals, isImplementer, isPartial, plus reviewCycles, denyRetryPairs, identicalPromptPairs.
  S4 summarise: rows by main model and tier ("before"/"after" with --split).
  S5 /sdlc:model-spend section 9 and --since, --until, --split; reproduction of report 2 prints REPRO OK.
  S6 partialAnatomy and section 10; two S5 advisories folded in (spacing slips, one doc sentence).
  No hook, gate or config file changed. src/hooks/** untouched.
DEFINITION OF DONE at HEAD 6c95555, 21 Nov 2026:
  1. bash tools/run-tests.sh: Files: 60  failed: 0
  2. claude plugin validate . exit 0
  3. reproduction re-run at HEAD: REPRO OK, exit 0
  4. node tools/model-spend.js --days 7: exit 0, prints sections 1 to 10
  5. git log origin/main..HEAD: six step commits, plugin.json version 1.0.106 to 1.0.111, one raise each
  Not run: `node tools/plugin-version.js check` (the plan dropped it: it exits 1 at HEAD with nothing staged).
PROCESS NOTES:
  - Reviews ran on the staged diff in place; no review worktree (owner's global rule).
  - S2's implementer wrote the lib before the test and faked the red run; S3-S6 had a real red run (briefs made it
    binding). S3 and S6 implementers each used a heredoc once against the harness rule; the gates did not block it.
  - All six steps passed round 1 of review; no fix round, no round 2.
  - Cost of the run was not measured here.

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

STEP S2: committed
  commit:  93d6762
  gate:    test-orch-signals 18 assertions passed (7 test functions); layout, isolation, model-spend, usage-fit tests
           and `claude plugin validate .` exit 0
  reviews: sdlc:code-reviewer round 1, PASS, 0/0/2
  reports: docs/plans/sdlc-phase0/reports/S2-implementer-1.md, S2-review-1.md (gitignored)
  stage:   the step's two files, plugin.json (1.0.107), the S1 tracker block, the feature record
  files:   as declared
  notes:   implementer wrote the lib before the test, moved it aside for the red run (red shows only a missing
           module). The TDD gate did not block. Step text says "seven tests" and lists eight items; seven test
           functions written, the repeated-Agent check sits in the resume test. Advisories (NaN since/until at a
           direct caller; 18 assertions vs ceiling 8) noted not actioned. Sorted sub-file read order is a
           deliberate change from the reference's readdir order.

STEP S3: committed
  commit:  587c363
  gate:    test-orch-signals 53 assertions passed; layout, isolation, model-spend, usage-fit tests and
           `claude plugin validate .` exit 0
  reviews: sdlc:code-reviewer round 1, PASS, 0/0/2
  reports: docs/plans/sdlc-phase0/reports/S3-implementer-1.md, S3-review-1.md (gitignored)
  stage:   the step's two files, plugin.json (1.0.108), the S2 tracker block, the feature record
  files:   as declared
  notes:   red first was real ("classify is not a function"). At equal timestamps reviewCycles counts reviewer
           dispatches before commits (step does not pin ties; implementer's choice, recorded in its docblock).
           Advisories (O(n^2) identical-prompt scan; DEV_DIR fixed at load) noted not actioned.

STEP S4: committed
  commit:  35ebb68
  gate:    test-orch-signals 59 assertions passed; layout, isolation, model-spend, usage-fit tests and
           `claude plugin validate .` exit 0
  reviews: sdlc:code-reviewer round 1, PASS, 0/0/2
  reports: docs/plans/sdlc-phase0/reports/S4-implementer-1.md, S4-review-1.md (gitignored)
  stage:   the step's two files, plugin.json (1.0.109), the S3 tracker block, the feature record
  files:   as declared
  notes:   a missing or unparseable `last` counts as `after` under splitAt (implementer's choice). Per-commit values
           are null at 0 commits; S5's render must handle null. repro-check.js reads rows through
           rep.orchestration.groups. Advisories (double division in per10; three ok calls in one test) noted not
           actioned.

STEP S5: committed
  commit:  7b07c0b
  gate:    test-model-spend 54 passed; test-usage-fit 74; test-orch-signals 59; layout, isolation, plugin validate
           exit 0. `REPRO OK`, rc 0: quoted from the implementer's run, from the orchestrator's own re-run at the
           working tree, and from the reviewer's re-run at the staged tree (34 s)
  reviews: sdlc:code-reviewer round 1, PASS, 0/0/4
  reports: docs/plans/sdlc-phase0/reports/S5-implementer-1.md, S5-review-1.md (gitignored)
  stage:   model-spend.js, test-model-spend.js, commands/model-spend.md, README.md, CLAUDE.md, plugin.json (1.0.110),
           the S4 tracker block, the feature record
  files:   as declared; no orch-signals.js change (no porting bug found)
  notes:   sections 1-8 proven unchanged by the reviewer (HEAD vs working copy, synthetic tree, byte-identical JSON
           minus `orchestration`). Advisories 1 and 2 (two missing-space slips; one doc sentence on the double tree
           read) folded into S6 as a DECISION below; 3 and 4 noted not actioned.

STEP S6: committed
  commit:  6c95555
  gate:    bash tools/run-tests.sh Files: 60  failed: 0 (the one full-suite run); test-orch-signals 68, test-model-spend
           56, test-usage-fit 74 passed; plugin validate exit 0; --days 7 exit 0; REPRO OK at the working tree
  reviews: sdlc:code-reviewer round 1, PASS, 0/0/3
  reports: docs/plans/sdlc-phase0/reports/S6-implementer-1.md, S6-review-1.md (gitignored)
  stage:   the four code files, commands/model-spend.md, plugin.json (1.0.111), the S5 tracker block, the feature record
  files:   as declared
  notes:   band edges probed by the reviewer on both sides of every pin. The implementer appended the partialAnatomy
           block with a shell heredoc (harness rule); result correct, temp file removed. Advisories (double blank
           line; `sub.files.length` throws on a missing field, as classify already does; padEnd(6)) noted not actioned.
