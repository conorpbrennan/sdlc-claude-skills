# sdlc enhancement, Phase 0: measurement

Revision 2, 21 Nov 2026. Tier T1, six steps.
Branch `sdlc-enhancement-phase0`, cut from origin/main at 731f461.
Source: Phase 0 of `tmp/sdlc-enhancement-plan.md` (condensed) and of the full Fable plan it was rebuilt
from, recovered from the session transcript to `tmp/recovered/sdlc-enhancement-plan.md`. Phase 1 and later
are out of scope: they are judged on this phase's numbers.

## 1. What this delivers, and what it does not

Delivers:
- Correct list prices in `tools/model-spend.js`, priced per model id, with the Haiku 5.5 long-prompt tier.
  Checked on 21 Nov 2026 against https://platform.claude.com/docs/en/about-claude/pricing.md.
- `tools/lib/orch-signals.js`: a tested port of the lost session-analysis scripts (recovered verbatim
  from the transcript, see section 4), plus the new signals the source asks for.
- Section 9 (orchestration signals per 10 implementer dispatches, cost per commit, by main-session model
  and tier) and section 10 (PARTIAL anatomy) in `/sdlc:model-spend`, with `--since`, `--until`, `--split`.
- A reproduction of report 2's count columns within tolerance on report 2's window (S5 GATE).

Does not:
- Plan or build Phase 1 or later. No hook, gate or config change. `src/hooks/**` is untouched.
- Fix `src/hooks/lib/review-config.js:127` (any staged path matching a rule wins). The source puts it in
  Phase 2 step 1, before any Haiku path rule. It is latent today: the only configured rule
  (`.claude/sdlc-review.json`) raises round 2 to Opus for `src/hooks/**`; no rule lowers a model.
- Port the correction regex, redispatch, inserted-id, abandoned or restarted signals. The source's
  Phase 0 list omits them and its do-not list calls the correction regex and redispatch counts noisy.
- Measure "reviewer dispatches per staged path set" literally. Transcripts do not record the staged set.
  It is measured as reviewer dispatches per commit cycle (between successful commits), which is what the
  Phase 1 ledger counts.
- Parse TESTS FIRST counts from prompts. Real implementer prompts do not keep the §16 field lines. The
  proxy is test files named in the dispatch prompt.
- Price model ids not seen in transcripts over the last 35 days (seen: `claude-sonnet-5-5`,
  `claude-opus-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`, `claude-fable-5-2`). Others take their
  family's default. Fast mode and US-only pricing are not modelled: no transcript records either.
- Touch `src/lib/day-cost.js`. It is the status line's gateway-probed table, deliberately different.
- Ship the reference scripts or the reproduction checker. They stay in `tmp/sdlc-phase0/`.
- Commit fixture transcripts under `tools/fixtures/` (the source's form). Tests build synthetic trees in
  `os.tmpdir()`, the repo's convention (`tools/test-model-spend.js`).

## 2. Working constraints

Apply to every step. A step does not repeat them.

- Plugin repo rules (`CLAUDE.md`): work in this directory only; never `~/.claude/plugins/`. No worktree
  except the orchestrator's review worktree, no `git stash`. Tests sit at `tools/test-*.js`, the glob
  `bash tools/run-tests.sh` runs; `tools/lib/` modules are tested from there.
- Every commit raises the plugin version. The orchestrator runs `node tools/plugin-version.js bump` before
  staging and stages `.claude-plugin/plugin.json` with the step. Implementers never run it.
- Baseline gate, part of every step's GATE: `node src/test-plugin-layout.js`,
  `node src/test-suite-isolation.js`, `node tools/test-model-spend.js` and `node tools/test-usage-fit.js`
  each exit 0, and `claude plugin validate .` exits 0.
  Class-level guards: `src/test-plugin-layout.js` (layout, stale paths),
  `src/test-suite-isolation.js` (every suite calls `isolateGitEnv` first, as `tools/test-model-spend.js:13`).
- Suite baseline at HEAD 731f461: `bash tools/run-tests.sh` printed `Files: 58  failed: 0`. The one full-suite
  run is in S6's GATE and section 7.
- Single owners (import, never reimplement):
  - `tools/lib/prices.js` (from S1): `family`, `cost`, `cacheWriteCost`, `priceFor`, the price tables.
  - `tools/lib/orch-signals.js` (from S2): transcript reading for sessions, every signal, grouping.
  - `tools/model-spend.js`: `listTranscripts`, `readTranscript`, `classifyTurn`, rendering helpers
    `table`, `famRows`, `usd`. It re-exports `family` and `cost`; `tools/usage-fit.js` imports them there.
- Reference implementation: `extract.js`, `classify.js`, `analyze.js`, `report2.js` and `report2.md`
  in `tmp/sdlc-phase0/reference/`. Read-only.
  "Port" means the same rule with the same constants, rewritten to this repo's
  style. Where a step pins a rule, the step wins.
- Code style (QDS): no in-line or lazy `require`; module constants for every key, label, regex and
  threshold; an Args/Returns comment on every function (as `tools/model-spend.js:76-86`). Flag
  pre-existing violations, do not refactor them.
- No client data. Records hold paths and prompt hashes in memory only. The text report and `--json` print
  aggregates and fixed labels: never a path, project name, session id, prompt or user text. Reports and
  the tracker quote counts only. Test fixtures are synthetic.
- Harness facts. The gates read every Bash command, a sub-agent's included: write files with the Write or
  Edit tool, never a heredoc; keep `$(` out of any command that names a commit. A sub-agent's cwd resets:
  every command carries `cd /home/coder/dev/sdlc-claude-skills &&`. The gates see `.js`, `.md`, `.json`;
  every step's diff is visible to them. Multi-edit document changes use `skills/plan-spec/edit_doc.py`.
- Commit protocol (orchestrator). Separate Bash commands: (1) the version bump; (2) `git add` the step's
  files, `.claude-plugin/plugin.json`, the tracker and the previous step's tracker block; (3)
  `git commit -F tmp/sdlc-phase0/msg-<step>.txt` once, expecting the PRE_COMMIT_REVIEW block. The message
  file is written with the Write tool and ends with the co-author line the session's attribution
  reminder gives. On PASS run the block's printf recipe verbatim, then retry the commit once.
- Always-permitted paths, never listed in a step and never counted: this plan, the run directory
  docs/plans/sdlc-phase0/ (the tracker, tracker.md, is committed; its reports/ folder is gitignored),
  `features/sdlc-enhancement-phase0.md`, `.claude-plugin/plugin.json`, and `tmp/sdlc-phase0/`.
- Implementer tier: Sonnet, `subagent_type: "sdlc:implementer"`, `model: "sonnet"`. Reviewer round 1
  `sdlc:code-reviewer`, round 2 `sdlc:code-reviewer-deep`, models from `sdlc-review.json`. Cap 2 rounds.
- Handoff rule. Work from a handoff runs in sub-agents, never in the main session. The main session reads
  the handoff, writes the step brief, dispatches the implementer, runs the review and commits. It never
  edits source. A fix found mid-run goes to a fresh fix agent; an investigation goes to an agent. One
  fresh agent per role per round. Every handoff says this.
- TESTS FIRST: run the named test file once and see it fail before writing code; quote that run.
- Threat model: these are report tools reading local files. Malformed transcript lines are skipped, never
  fatal. A shape Claude Code does not write is ADVISORY, not CRITICAL.
- Rollback for every step: one `git revert` of its commit, newest first.

## 3. Owner decisions

Answer before dispatch. Recommendation first.

1. **Standing authorisation.** Stage, commit and dispatch fix agents unattended for S1-S6, overriding the
   harness rule "commit only when the user asks" for this run. Any hook block other than the expected
   first PRE_COMMIT_REVIEW still stops the run (CLAUDE.md: "If a hook blocks a command, stop and say so").
   No push, no PR. Blocks S1. Recommendation: yes.
2. **Reproduction rule.** The source says "reproduces report 2's table within 5%". This plan reads it as:
   every count cell in `tmp/sdlc-phase0/repro-check.js` within max(ceil(5% of the reference), 1 event),
   on four groups; cost cells excluded because S1 changes the prices. A miss is an S5 fix round inside the
   cap of two, then the owner. Blocks S5. Recommendation: accept. Alternative: a strict 5% with no
   one-event floor fails on any cell under 20 (11 of 48 cells), for one event of noise.
3. **Plan home.** This plan is in `tmp/` (gitignored); the tracker is committed. Copy the plan into
   docs/plans/ as sdlc-phase0 (markdown) in S1's commit, as earlier plans did. Blocks S1. Recommendation: yes.
4. **Scope as in section 1.** Six steps, not the source's four (sizing, §17); the measurement
   substitutions in section 1. Blocks S3 and S6. Recommendation: accept.

Named-reader conditions: none. Every GATE is mechanical. Review loop: cap 2, not an owner question.

## 4. Order and seams

Before S1 (orchestrator): the owner answers section 3; `/sdlc:feature-new sdlc-enhancement-phase0` with
section 7's commands as acceptance criteria; the tracker created with its header block.

Frozen target: report 2 (`tmp/sdlc-phase0/reference/report2.md`), the analysis the source's Phase 0 must
reproduce. Its scripts were recovered from the Write calls and heredocs in the sub-agent transcripts of
session 466cbb12 and re-run on 21 Nov 2026 with one change, a message end bound (`UNTIL`). With
`since 2026-10-19T00:00:00Z`, `until 2026-11-21T15:39:24Z`, split `2026-10-25T00:00:00Z`, every count and
rate cell of report 2's first table matched exactly for all four groups. Those counts are frozen in
`tmp/sdlc-phase0/repro-check.js` (`REF`) and `tmp/sdlc-phase0/reference/reference-counts.json`. The
checker was tested: an exact copy prints `REPRO OK`, exit 0; a 3-event and a 23-step change and a missing
group print one line each and `REPRO FAIL`, exit 1. Transcript retention is `cleanupPeriodDays: 999`.

Order: S1 first (S2 imports prices). S2, S3, S4 build the lib bottom up. S5 wires it into the report and
runs the reproduction. S6 adds PARTIAL anatomy. Strictly sequential; no overlap.

| artefact | producer | consumer | shape |
|---|---|---|---|
| `tools/lib/prices.js` | S1 | S1 (`model-spend.js`), S2 | `family(model)` -> `'opus'\|'sonnet'\|'haiku'\|'fable'\|'other'`; `priceFor(model, promptTokens)` -> `{input, output, cacheRead}` USD/MTok or `null`; `cost(model, usage)` -> USD; `cacheWriteCost(model, usage)` -> `{w5m, w1h}` USD; consts `PRICES`, `MODEL_PRICES`, `PRICING_DATE`, `PRICING_SOURCE` |
| `model-spend.js` exports | S1 | `tools/usage-fit.js` | unchanged: `{family, cost, classifyTurn, buildReport}`; `family`, `cost` re-exported from prices |
| `readSessions(root, {since, until})` | S2 | S5 | `Promise<SessionRecord[]>`; `since`, `until` epoch ms; `since` filters main files by mtime, `until` drops messages with a later timestamp |
| `SessionRecord` | S2 | S3, S6 | `{first, last, famTurns, famCost, mainCost, turns, peakCtx, firstUserText, interrupts, agents[], events[], commits, mainEdits[], subs[]}`, field rules in S2 |
| `classify(rec)` | S3 | S4, S6 | `{main, mixed, orch, tier, sigN, nImpl, nRev}` |
| `signals(rec)` | S3 | S4 | `{steps, partial, tddFail, tddPass, interrupts, mainSrcEdits, blockLoops, commits, reviews, peakCtx, mainCost, subCost, reviewCycles, denyRetryPairs, identicalPromptPairs}` |
| `isImplementer(agent)`, `isPartial(text)` | S3 | S6 | boolean |
| `summarise(records, {splitAt})` | S4 | S5 | `{groups: Row[]}`, rows sorted by `group` |
| `Row` | S4 | S5 render, `repro-check.js` | `{group, sessions, steps, commits, reviews, counts{partial, tddFail, interrupts, mainSrcEdits, blockLoops, denyRetryPairs, identicalPromptPairs}, sessionsWith{partial, tddFail, interrupts, mainSrcEdits, blockLoops}, per10{same keys as counts}, share{same keys as sessionsWith}, cost{main, sub, perCommit, mainPerCommit}, reviewsPerCommit, reviewCycles{'1','2','3','4+',open}, peakCtx{p50, max}}` |
| CLI `--since ISO --until ISO --split ISO` | S5 | S5 GATE, `commands/model-spend.md` | ISO 8601; `--since` with an explicit `--days` exits 2 |
| JSON key `orchestration` | S5 | `repro-check.js`, S6 | `{window{since, until, split}, groups: Row[]}`; S6 adds `anatomy` |
| `partialAnatomy(records)` | S6 | S6 render | `{dispatches, partial, bands{promptBytes, toolCalls, filesEdited, testFilesNamed}: [{band, dispatches, partial, rate}]}` |

## 5. The steps

**S1. Prices are priced per model id from the live price page, in `tools/lib/prices.js`.**
NEW `tools/lib/prices.js`, `tools/test-prices.js`. EXTEND `tools/model-spend.js`, `tools/test-model-spend.js`,
`tools/test-usage-fit.js` (expected values only).

WHY NOW: `tools/model-spend.js:26-31` prices Sonnet cache reads at $0.20 (page: $0.10), all Fable at
$10/$50/$0.25 (page: 5.2 is $8/$40/$0.20; 5.1 is $10/$50/$0.25), and has no Haiku tier (page: over
100,000 prompt tokens, $0.50/$2.50/$0.05). Page fetched 21 Nov 2026; Opus 5.5 ($4/$20/$0.20) and Haiku 5.5
up to 100K ($0.10/$0.50/$0.01) already match. Cache writes are 1.25x (5m) and 2x (1h) input on all.

WHAT TO BUILD:
- `PRICES` = family defaults, each the newest model of the family: opus 4/20/0.20, sonnet 2/10/0.10,
  haiku 0.10/0.50/0.01 with `longPrompt: {over: 100000, input: 0.50, output: 2.50, cacheRead: 0.05}`,
  fable 8/40/0.20. `MODEL_PRICES` = exact-id overrides: `'claude-fable-5-1'`: 10/50/0.25.
- `priceFor(model, promptTokens)`: exact id in `MODEL_PRICES` first, else `PRICES[family(model)]`, else
  `null`. A family with `longPrompt` and `promptTokens > longPrompt.over` uses the long-prompt rates.
  Exactly 100,000 is the low tier. `promptTokens` = input + cache read + cache creation tokens of that one
  usage object (the page: "counts all of its input tokens, including cache reads and cache writes").
  `cacheWriteCost` takes its input rate from the same tier. `cost` and `cacheWriteCost` return 0 when
  `priceFor` is `null`; neither throws.
- Move `family`, `cost`, `cacheWriteCost` from `model-spend.js` into `prices.js`, unchanged except that
  they price through `priceFor`. `model-spend.js` requires them and keeps exporting `family`, `cost`.
- `PRICING_DATE = '21 Nov 2026'`, `PRICING_SOURCE` = the page URL. `rep.pricing` becomes
  `{date, source, perMTok: PRICES, perModel: MODEL_PRICES}`. The render line keeps the words "list
  prices" and "estimate" and names the date.
- `tools/test-usage-fit.js`: re-derive by hand only the expected values that the new prices move, with
  the arithmetic in a comment. No assertion removed or loosened.

IMPORTS: none.
ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `tools/usage-fit.js`, `src/lib/day-cost.js`, `tools/lib/orch-signals.js` (S2).

TESTS FIRST: `tools/test-prices.js`, red before `prices.js` exists. One table test, columns `model, usage,
expected USD`, rows: opus-5-5 mixed usage; sonnet-5-5 1M cache read = $0.10; sonnet-5-5 1M 5m write =
$2.50 and 1M 1h write = $4; haiku-5-5 prompt exactly 100,000 (low tier); haiku-5-5 100,001 where 60,000
are cache reads (long tier on every token); fable-5-1 and fable-5-2 1M input and 1M output; an unknown
family = 0. Plus: `family` of each id; `priceFor` returns `null` for `claude-mystery-1`.

GATE: `node tools/test-prices.js` exits 0 and the baseline gate and
`grep -n "PRICES = " tools/model-spend.js` prints nothing.

REVIEW:
1. Does each rate equal the page values quoted in WHY NOW, including the 5.1 override and the Haiku tier?
2. Is the tier decided on input + cache read + cache creation, with 100,000 in the low tier?
3. Do `usage-fit.js` and `model-spend.js` both still price through the one `cost`?
4. Is every changed expected value in `test-usage-fit.js` backed by a written calculation?
FAIL if: a rate differs from WHY NOW; a second price table or `cost` exists; an assertion in either old
test is removed or loosened; `model-spend.js` stops exporting `family` or `cost`.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 25 tool calls, 15 minutes, one or two review rounds.

**S2. `readSessions` turns the transcript tree into one in-memory record per main session.**
NEW `tools/lib/orch-signals.js`, `tools/test-orch-signals.js`.

WHAT TO BUILD (port of `tmp/sdlc-phase0/reference/extract.js`; its `UNTIL` lines included):
- `readSessions(root, {since, until})` -> `Promise<SessionRecord[]>`. Main files are `root/<dir>/*.jsonl`
  (one level, not recursive) with mtime >= `since`, read in ascending mtime order. Sub-agents are
  `root/<dir>/<sessionId>/subagents/*.jsonl` with the sibling `.meta.json`. Lines that fail to parse are
  skipped. A line whose `timestamp` is after `until` is skipped; `since` never filters messages.
- One dedupe set per call, shared by main and sub files: an API message counts once, keyed
  `message.id + '|' + requestId`, in the first file read. Agent `tool_use` ids also dedupe per call.
- Main lines: keep parsed objects that own a `parentUuid` key, skip `isSidechain`. Sub lines: any line
  with a `message`.
- Record fields, all computed as in the reference: `first`, `last` (ISO); `famTurns`, `famCost`,
  `mainCost`, `turns`; `peakCtx` (max of input + cache read + cache creation); `firstUserText` (first
  user entry, 400 chars, `''` when none; user entries and queued commands as the reference collects them);
  `interrupts` (entries `users[1..]`, the first excluded, whose text matches `/\[Request interrupted by
  user/`);
  `agents[]` `{id, ts, type, model, desc, step, tier, promptLen, promptBytes, promptHash,
  testFilesNamed, isError}`; `events[]` `{ts, k}` in file order, `k` from the reference `denialKind` on an
  `is_error` tool_result, or `'COMMIT_OK'` (a pending Bash matching `/\bgit\s+commit\b/`, a non-error
  result, `/\[[^\]\s]+ [0-9a-f]{7,}\]/` on its text); `commits` = COMMIT_OK count; `mainEdits[]`; `subs[]`
  `{toolUseId, agentType, cost, files[], final, turns, toolCalls}`.
- Agent fields as reference: `type` defaults to `'general-purpose'`, `desc` 120 chars, `step` by `STEP_RE`
  on desc then the prompt's first 400 chars, `tier` the `TIER_RE` capture cut to 80 chars or `null`,
  `promptLen` = `prompt.length`, `isError` `false` when no result arrives. `mainEdits` and `files` take
  Edit, Write, NotebookEdit `file_path` or `notebook_path`; `files` distinct; a missing main path is `''`.
- New fields: `promptBytes` = UTF-8 byte length of the prompt; `promptHash` = sha1 hex of the prompt;
  `testFilesNamed` = the number of distinct lowercased matches of
  `/\b(?:test[_-][\w.-]*|[\w.-]+[._-]test)\.(?:py|js|ts|sh|cs)\b/gi` in the prompt; `isError` = the Agent
  call's `tool_result.is_error`; `toolCalls` = distinct `tool_use` ids over all sub lines. `turns` and
  `cost` count deduped messages only. `final` = the last `SubagentHandback` message, else the last
  assistant text blocks joined by `'\n'`; over 2,200 chars it keeps the first 1,400 and last 800 joined by
  `' ... '`.
- Not ported: `SRC_EXT` and `SENSITIVE` (`extract.js:8-9`). They are unused; S3 names the live rules.

IMPORTS: `tools/lib/prices.js`: `family`, `cost`. Node `crypto` for sha1.
ASSUMES LANDED: S1.
MUST NOT TOUCH: `tools/model-spend.js`, `tools/test-model-spend.js` (S5).

TESTS FIRST: `tools/test-orch-signals.js`, red before the lib exists. It builds a synthetic tree in
`os.tmpdir()` (as `tools/test-model-spend.js` does). Seven tests: sub-agents attach by `toolUseId`; a
resumed copy of a message in a later-mtime file is counted once, in the earlier, and a repeated Agent
`tool_use` gives one dispatch; `until` drops a later
message and `since` drops an old file but not old messages in a new file; events order with a denial
kind per reference rule and `COMMIT_OK`; a repeated Agent `tool_use` line gives one dispatch; `final`
truncation at 2,201 chars; agent fields (`tier`,
`promptBytes` with a multi-byte character, `testFilesNamed`, `isError`); `interrupts` skips the first
user entry and `peakCtx` is the maximum.

GATE: `node tools/test-orch-signals.js` exits 0 and the baseline gate.

REVIEW:
1. Does each field follow the reference rule, constant for constant, where this step does not pin one?
2. Is dedupe per call (not module-global), shared by main and sub files?
3. Is `until` applied to main and sub lines, and `since` only to main file mtimes?
4. Does anything keep prompt or user text beyond `firstUserText`?
FAIL if: a reference constant changes without this step saying so; a malformed line throws; a record
keeps prompt text; a module-level mutable dedupe set.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 35 tool calls, 25 minutes, one or two review rounds. The largest port.

**S3. `classify` and `signals` score one session record.**
EXTEND `tools/lib/orch-signals.js`, `tools/test-orch-signals.js`.

WHAT TO BUILD (port of `tmp/sdlc-phase0/reference/classify.js` and the per-session loop of
`tmp/sdlc-phase0/reference/analyze.js`):
- `isImplementer(agent)`: `type === 'sdlc:implementer'`, or `'general-purpose'` with the reference
  `IMPL_LIKE` description regex and `promptLen > 1500`. Reviewer: type matches `/^sdlc:code-reviewer/`.
- `isPartial(text)`: `/\bPARTIAL\b/` and not the reference `NEG` regex.
- `classify(rec)`: `main` = family with most main turns, `'none'` when none; `mixed` as reference;
  `orch` = the reference's final rule (`nImpl + nRev >= 2`, or the `ORCH_FIRST` match on `firstUserText`
  with `nImpl + nRev >= 1`); `tier` `'high'` when 2+ of six fire: `nImpl >= 11`, distinct sub-edited
  files `>= 21`, `nRev >= 6`, a sensitive path, repos `>= 2`, `peakCtx >= 250000`. Sensitive and repos
  use sub files plus `mainEdits`. Sensitive = `classify.js:26`'s regex (no `.env`). Repos are distinct
  first directories under `path.join(os.homedir(), 'dev')`.
- `signals(rec)`: `steps` = implementer dispatches; `partial`, `tddFail` (`/TDD_GATE:\s*FAIL/`), `tddPass`
  (else `/TDD_GATE:\s*PASS/`) over dispatches with a sub matched by `toolUseId`; `mainSrcEdits` =
  `analyze.js:10` `SRC` (no yml, yaml, toml) minus the `:28` exclusion; `blockLoops` +1 each time a run of
  one non-COMMIT_OK kind reaches exactly 3, reset by COMMIT_OK; `reviews` = reviewer dispatches including
  denied ones (reference `nRev`);
  `subCost` = sum of sub costs.
- New: `reviewCycles` walks reviewer dispatches with `isError` false and `COMMIT_OK` events in time
  order into `{'1','2','3','4+',open}` (all keys, 0 default); a commit with a non-zero count closes a
  cycle into its bucket, a commit with 0 closes none; a non-zero count at the end adds 1 to `open`.
  `denyRetryPairs`: an `isError` Agent call whose next Agent call in file order (any `isError`) has the
  same `type`, `<= 120000` ms later. `identicalPromptPairs`: a non-error call whose `promptHash` equals
  any earlier non-error call's `<= 60000` ms earlier, each later call counted once.

IMPORTS: none.
ASSUMES LANDED: S2.
MUST NOT TOUCH: `tools/model-spend.js`, `tools/test-model-spend.js` (S5).

TESTS FIRST: in `tools/test-orch-signals.js`, red before the functions exist. Four tests: one table of
records -> `classify` rows (implementer by type, general-purpose by description and length, mixed,
orch by count and by first message, high vs low tier); `isPartial` table with three negated forms;
a block-loop table (three same kind, a commit between, two kinds alternating); one record checking
`reviewCycles` with a denied reviewer, `denyRetryPairs` at 119 and 121 s, `identicalPromptPairs` at 59
and 61 s.

GATE: `node tools/test-orch-signals.js` exits 0 and the baseline gate.

REVIEW:
1. Do `classify` and `signals` reproduce the reference rules, including `reviews` counting denied calls?
2. Are the three new signals exactly as pinned (bounds inclusive, `isError` excluded where stated)?
3. Is any threshold or regex inline rather than a module constant?
FAIL if: a reference rule changes without this step saying so; a new signal differs from its pin; a
correction or redispatch signal is added.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls, 20 minutes, one or two review rounds.

**S4. `summarise` groups scored sessions into report rows.**
EXTEND `tools/lib/orch-signals.js`, `tools/test-orch-signals.js`.

WHAT TO BUILD:
- `summarise(records, {splitAt})` -> `{groups: Row[]}`, `Row` as the seam table. Only `orch` sessions.
  Group name `'<main> <tier>'`; `'mixed'` for mixed sessions; with `splitAt` (epoch ms) either is prefixed
  `'before '` when `Date.parse(last) < splitAt`, else `'after '`. Rows sorted by `group`.
- `counts` are sums of `signals`; `sessionsWith` counts sessions with a value over 0. `per10[k]` =
  `10 * counts[k] / steps`, `share[k]` = `sessionsWith[k] / sessions`, `null` on a zero denominator.
  `reviews` = sum of `signals.reviews`; `reviewCycles` sums key by key. `cost` = `{main, sub}` sums;
  `perCommit` = (main + sub) / commits, `mainPerCommit` and `reviewsPerCommit` likewise, all `null` at 0
  commits. `peakCtx` = `{p50, max}` of session `peakCtx`, p50 the sorted value at
  `Math.floor(0.5 * (n - 1))`. Every value is unrounded; only S5's render rounds.

IMPORTS: none.
ASSUMES LANDED: S3.
MUST NOT TOUCH: `tools/model-spend.js`, `tools/test-model-spend.js` (S5).

TESTS FIRST: in `tools/test-orch-signals.js`, red before `summarise` exists. Three tests: four synthetic
records give the expected group names with and without `splitAt` (a session ending exactly at
`splitAt` is `after`); one row's every field by hand; zero steps and zero commits give `null`.

GATE: `node tools/test-orch-signals.js` exits 0 and the baseline gate.

REVIEW:
1. Does every `Row` key match the seam table, so `repro-check.js` and S5 can read it unchanged?
FAIL if: a seam key is renamed or missing; non-orch sessions are counted.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 20 tool calls, 15 minutes, one round.

**S5. `/sdlc:model-spend` prints section 9 and reproduces report 2.**
EXTEND `tools/model-spend.js`, `tools/test-model-spend.js`, `commands/model-spend.md`, `README.md`,
`CLAUDE.md`; and `tools/lib/orch-signals.js`, `tools/test-orch-signals.js` only to fix a rule the
reproduction shows differs from the reference.

WHAT TO BUILD:
- Flags `--since ISO`, `--until ISO`, `--split ISO`; an unparseable value, or `--since` with an explicit
  `--days`, exits 2 with a usage line. `--since` replaces the `--days` window start. `--until` drops every
  message after it in every section (`readTranscript` skips them). Default `until` is now.
- `buildReport(root, days, now, opts)`; `opts = {since, until, splitAt}` epoch ms, all optional; the
  three-argument call keeps today's behaviour. It calls `readSessions(root, {since, until})` and
  `summarise(..., {splitAt})` and sets `rep.orchestration = {window: {since, until, split}, groups}`
  (ISO strings, `null` for a flag not given). It is always present; `groups` is `[]` when there are none.
  Without `--since`, `readSessions` gets `since = now - days * 86400000` (0 for `--days 0`).
  `readTranscript` takes `until` as an added last argument.
- Section 9, heading exactly `9. Orchestration signals per 10 implementer dispatches`: a line saying sessions
  are those
  active since the window start; one line per row: sessions, steps, commits, per10 for each count key,
  share for each sessionsWith key as a percentage, perCommit and mainPerCommit, reviewsPerCommit,
  reviewCycles, peakCtx p50/max. Rates and costs 2 decimals, shares whole percent. Labels are constants. No
  row prints when there are none:
  print `none`.
- `commands/model-spend.md`: how to read section 9, what each signal means in one line each, and that
  rates under about 2x apart are noise at these sample sizes. `README.md` lines for `/sdlc:model-spend`
  (`:246`, `:456`) name the new section and flags. `CLAUDE.md` "What ships here" row for
  `/sdlc:model-spend` adds `tools/lib/prices.js` and `tools/lib/orch-signals.js`.

IMPORTS: `tools/lib/orch-signals.js`: `readSessions`, `summarise`. `tools/lib/prices.js` as S1.
ASSUMES LANDED: S1, S4.
MUST NOT TOUCH: `tools/lib/prices.js` (S1), `tools/usage-fit.js`.

TESTS FIRST: in `tools/test-model-spend.js`, red before the flags exist. Four tests: one orchestration
session (an implementer and a reviewer dispatch, a commit) in its own projects tree, as the prompt-cache
test does (`tools/test-model-spend.js:198-214`), so no existing expected value moves, gives one
`orchestration.groups` row with the expected counts; `--until` before the newest message lowers
`total.cost` by that message; `--since` with `--days`, and `--until notadate`, exit 2; the text report
has the section 9 heading.

GATE: the baseline gate and, from the repo root, the reproduction below exits 0 and prints `REPRO OK`.

```
node tools/model-spend.js --json --since 2026-10-19T00:00:00Z --until 2026-11-21T15:39:24Z \
  --split 2026-10-25T00:00:00Z > tmp/sdlc-phase0/repro.json
node tmp/sdlc-phase0/repro-check.js tmp/sdlc-phase0/repro.json
```


REVIEW:
1. Does the three-argument `buildReport` and the no-flag CLI give the same sections 1-8 as before?
2. Is `--until` applied to every section, not only section 9?
3. Do the text and `--json` outputs carry only aggregates and fixed labels?
4. Do the three doc edits match the flags and section as built?
FAIL if: `REPRO OK` is not quoted from a run at the staged tree; any path, session id or prompt text can
reach the output; an existing section's numbers change for a run without the new flags.

ROLLBACK: a single `git revert` of this step's commit. S6 first if it has landed.
BUDGET: about 35 tool calls, 25 minutes, one or two rounds. Each reproduction run reads about 2 GB of
transcripts and takes one to two minutes. A porting bug the checker finds is a fix round on this step's
commit, inside the file set above.

**S6. Section 10 shows PARTIAL rate by step size.**
EXTEND `tools/lib/orch-signals.js`, `tools/test-orch-signals.js`, `tools/model-spend.js`,
`tools/test-model-spend.js`, `commands/model-spend.md`.

WHAT TO BUILD:
- `partialAnatomy(records)`: over implementer dispatches in `orch` sessions that have a matching sub (by
  `toolUseId`), `partial` by `isPartial(sub.final)`. Bands (lower bound inclusive): `promptBytes` `<4K`
  `4-8K` `8-16K` `16K+` (bytes 4000, 8000, 16000); `toolCalls` `<=40` `41-80` `81+`; `filesEdited`
  (`sub.files.length`) `0-2` `3-5` `6-10` `11+`; `testFilesNamed` `0` `1` `2-3` `4+`. Each band:
  `{band, dispatches, partial, rate}`, labels exactly as written, every band kept in that order, `rate`
  unrounded and `null` at 0. `bands` is an object keyed by the four dimension names.
- `rep.orchestration.anatomy`; section 10, heading exactly `10. PARTIAL anatomy`, one block per dimension. One
  line in
  `commands/model-spend.md`: Phase 4 acts only if the rate rises with size.

IMPORTS: none.
ASSUMES LANDED: S5.
MUST NOT TOUCH: `tools/lib/prices.js` (S1), `README.md`, `CLAUDE.md` (S5).

TESTS FIRST: two tests in `tools/test-orch-signals.js` (band edges at 3,999/4,000, 40/41 and 2/3; a
dispatch with no sub is skipped) and one in `tools/test-model-spend.js` (section 10 heading and the
`anatomy` key), red first.

GATE: the baseline gate and `node tools/test-orch-signals.js` exits 0 and `bash tools/run-tests.sh`
prints `failed: 0` and `node tools/model-spend.js --days 7 > /dev/null` exits 0.

REVIEW:
1. Are the band edges exactly as pinned, lower bound inclusive?
2. Is a dispatch with no matching sub skipped rather than counted as not PARTIAL?
FAIL if: an edge differs from its pin; anatomy counts non-orch sessions.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 20 tool calls, 15 minutes, one round.

## 6. What NOT to do

- Do not tune a rule to hit the reference. A reproduction miss is a porting bug: find the rule that
  differs from the scripts in `tmp/sdlc-phase0/reference/`.
- Do not compare cost cells against report 2. S1 changed the prices.
- Do not commit anything under `tmp/`, or a transcript excerpt, as a fixture.
- Do not import `src/lib/day-cost.js` rates or merge the two tables.
- Do not add a duplicate-dispatch guard or any trigger. Phase 0 measures only.

## 7. Definition of done

At HEAD after S6, from the repo root:
1. `bash tools/run-tests.sh` prints `failed: 0` (the one full-suite run; also S6's GATE).
2. `claude plugin validate .` exits 0.
3. The S5 reproduction commands, run again at HEAD, exit 0 and print `REPRO OK`.
4. `node tools/model-spend.js --days 7` exits 0 and prints sections 1 to 10.
5. `git log --oneline origin/main..HEAD` shows the six step commits, each raising `.claude-plugin/plugin.json`
   (feature-record-only commits are exempt, CLAUDE.md).

Sections 8-10 (dispositions, DECISIONS-OPEN, as built) live in the tracker.
