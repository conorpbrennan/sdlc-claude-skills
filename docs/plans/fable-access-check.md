# Fable access check

Revision 3, 22 Nov 2026 (rounds 1 and 2 folded; see the Review rounds note). Tier T1, six steps
(S1-S6).
Branch `fable-access-check`, cut from origin/main at c566c28. Plugin version at HEAD: 1.0.115.
Feature record: `features/fable-access-check.md` (staged, five acceptance criteria, AC1-AC5 below).

Evidence tags: CONFIRMED (seen in source, a command run for this plan, or the 21 Nov routing
review's own CONFIRMED tag), INFERRED (follows from confirmed facts, not observed), GUESSED.

## 1. What this delivers, and what it does not

Delivers:
- A Fable access check in `agent-tier-gate.js`. Any Agent dispatch with an explicit Fable model is
  denied when the session cannot reach Fable. The reason names Opus as the fallback (AC1). A
  reachable session sees today's behaviour, unchanged (AC2).
- `src/hooks/lib/fable-access.js`: the access signal read from the session transcript, and a
  per-session cached verdict with a time limit (AC3). An undecidable check is a deny (AC4).
- One config key, `fableAccess` (`auto`, `on`, `off`; default `auto`), read from the user file
  `~/.claude/sdlc-review.json`, resolved in `src/hooks/lib/review-config.js`.
- A pinned invariant: `MODELS` and every model-valued config key reject `fable`, so config can never
  route to Fable (CONFIRMED true at HEAD: `MODELS = ['haiku', 'sonnet', 'opus']`). Today it holds
  by accident; after this plan a test holds it.
- Docs in `README.md` and `CLAUDE.md` (S6). The full suite green (AC5).

Does not:
- Hand Fable work from a gateway session to a direct session. Multi-session coordination is
  deferred (see the closing section). No step builds any part of it.
- Rewrite a Fable dispatch to Opus. AC1 asks for a deny whose reason names Opus.
- Change the main session's own model. A main session on `/model fable` is outside any hook.
- Catch a Fable model set by an agent's frontmatter when the dispatch carries no `model`. The hook
  sees only `tool_input`.
- Add a workflow step id to `src/hooks/lib/steps.js`. The check is part of the existing
  `agent-tier-gate` step: with that step off, the hook does nothing to Fable dispatches, as today.
- Make a paid probe dispatch. No paid probe dispatch in this plan (a later plan; see the closing
  section).

## 2. Working constraints

Apply to every step. A step does not repeat them.

- Plugin repo rules (`CLAUDE.md`): work in this directory only; never `~/.claude/plugins/`. No
  worktree except the orchestrator's review worktree, no `git stash`.
- Every commit raises the plugin version. The orchestrator runs `node tools/plugin-version.js bump`
  before staging and stages `.claude-plugin/plugin.json` with the step. Implementers never run it.
- Baseline gate, part of every step's GATE: `node src/test-plugin-layout.js`,
  `node src/test-suite-isolation.js`, `node src/hooks/test-agent-tier-gate.js` and
  `node src/hooks/test-review-config.js` each exit 0, and `claude plugin validate .` exits 0.
  Class-level guards: `src/test-plugin-layout.js` (layout, stale paths), `src/test-suite-isolation.js`
  (every suite calls `isolateGitEnv` first, as line 4 of `src/hooks/test-agent-tier-gate.js`).
- Suite baseline at c566c28: `bash tools/run-tests.sh` printed `Files: 60  failed: 0` (run 22 Nov 2026
  for this plan). Nothing is red at HEAD. The one full-suite run is in S6's GATE and section 7.
- Single owners (import, never reimplement):
  - `src/hooks/lib/hook-output.js`: `deny`.
  - `src/hooks/lib/review-config.js`: `loadFile`, `userConfigPath`, `repoConfigPath`, `MODELS`.
  - `src/hooks/lib/steps.js`: `stepStates` (the hook's step switch).
  - `src/hooks/lib/fable-access.js` (from S2, S3): transcript signal, cache (`writeCache` has one
    consumer, `checkAccess`), `checkAccess`.
  - Atomic state write: copy the pattern of `writeState` in `src/hooks/orchestrator-mode.js` (temp
    file in the same directory, then rename). It is not exported; do not export it from there.
- Code style: no in-line or lazy `require`; a named module constant for every key, label, regex,
  path and threshold; an Args/Returns comment on every function, private ones included (as
  `normaliseReason` in `src/hooks/agent-tier-gate.js`); comments state intent. Flag pre-existing
  violations, do not refactor them.
- TDD: run the named test file once and see it fail before writing code; quote that run in the report.
  Test and code are staged together; the pre-commit TDD gate blocks otherwise.
- Test isolation: every test that reaches the hook or the lib sets `SDLC_REVIEW_CONFIG_USER`,
  `CLAUDE_CONFIG_DIR` and (from S3) `SDLC_FABLE_ACCESS_DIR` to a `fs.mkdtempSync` sandbox. No test
  reads the owner's real `~/.claude`, transcripts or tmp cache. Transcripts in tests are synthetic.
- No client data. Reports, the tracker and the S1 findings quote counts, field names and fixed
  labels only: never a session id, transcript path, project name, prompt text or env value.
- Harness facts. The gates read every Bash command, a sub-agent's included: write files with the Write
  or Edit tool, never a heredoc; keep `$(` out of any command that names a commit. A sub-agent's cwd
  resets: every command carries `cd /home/coder/dev/sdlc-claude-skills &&`. The gates see `.js`,
  `.md`, `.json`; every step's diff is visible to them. Multi-edit document changes use `edit_doc.py`
  from the plan-spec skill directory.
- Commit protocol (orchestrator). Separate Bash commands: (1) the version bump; (2) `git add` the
  step's files, `.claude-plugin/plugin.json`, the tracker and the previous step's tracker block; (3)
  `git commit -F tmp/fable-access-check/msg-<step>.txt` once, expecting the PRE_COMMIT_REVIEW
  block. The message file is written with the Write tool and ends with the co-author line the
  session's attribution reminder gives. On PASS run the block's printf recipe verbatim, then retry
  the commit once. The staged feature record goes in with S1.
- Always-permitted paths, never listed in a step and never counted: this plan, the run directory
  docs/plans/fable-access-check/ (tracker.md committed; its reports/ folder is gitignored; S1's
  probe-findings.md, called the findings file below, is committed there),
  `features/fable-access-check.md`, `.claude-plugin/plugin.json`, and tmp/fable-access-check/.
- Implementer tier: Sonnet, `subagent_type: "sdlc:implementer"`, `model: "sonnet"`. Reviewer round 1
  `sdlc:code-reviewer`, round 2 `sdlc:code-reviewer-deep` (the repo rule puts `src/hooks/**`
  round 2 on Opus). Cap two rounds.
- Handoff rule. Work from a handoff runs in sub-agents, never in the main session. The main session
  reads the handoff, writes the step brief, dispatches the implementer, runs the review and commits.
  It never edits source. A fix found mid-run goes to a fresh fix agent; an investigation goes to an
  agent. One fresh agent per role per round. Every handoff says this.
- Rollback for every step: one `git revert` of its commit, newest first.

### Reviewer briefs

Every reviewer of S2-S5 gets this paragraph verbatim, before the step's REVIEW field:

> Threat model (CLAUDE.md, "Reviewing this project's own gates"): the hooks guard against honest
> mistakes in the ordinary commands and dispatches Claude writes. They do not guard against
> adversarial input. Genuine findings get fixed: a bug in a dispatch shape Claude writes, a wrong
> verdict on a transcript Claude Code writes, or a regression in the existing tier gate. Non-goals
> for this feature, ADVISORY at most, named as gaps and not chased: adversarial shell or a crafted
> `tool_input`; a user who edits or plants the cache file by hand; a forged or hand-edited
> transcript; a gateway that lies about the model or about `inference_geo`; a Fable model set in
> agent frontmatter with no `model` in the dispatch; stdin that is not JSON (the hook stays silent,
> as today); two sessions sharing one session id. The review cap is two rounds. Do not offer a third.

After two rounds the orchestrator commits with the open gaps named in the commit message and stops.

## 3. Owner decisions

Answer before dispatch. Recommendation first.

1. **Standing authorisation.** Stage, commit and dispatch fix agents unattended for S1-S6,
   overriding the harness rule "commit only when the user asks" for this run. Any hook block
   other than the expected first PRE_COMMIT_REVIEW stops the run (CLAUDE.md: "If a hook blocks
   a command, stop and say so"). No push, no PR. Blocks S1. Recommendation: yes.
2. **S1 spend.** S1 runs two `claude -p` sessions with a throwaway probe hook: run A dispatches a
   Haiku agent (cents), run B a Fable agent that replies "ok" (about $0.39 on 21 Nov when it
   succeeds; a 403 costs nothing). Blocks S1. Recommendation: yes. Without run B, S1 cannot see what
   a Fable dispatch's 403 or success looks like to a hook on this backend.
3. **Cache TTL.** 10 minutes (recommended: the free signal costs milliseconds to recompute, so the TTL
   only bounds staleness after a backend switch; it matches the 10-minute PASS marker), 5 minutes,
   or 60 minutes. Worst case of any TTL: one wasted 403 per window after a mid-session switch to the
   gateway. The cache exists for AC3's wording; with a free signal it saves milliseconds and adds
   the staleness in Risk 2, so the owner may amend AC3 instead. Blocks S3.

Settled by the code, or the plan's default (no owner answer needed; the recommendation stands):
4. **Where `fableAccess` is read.** User file only: reachability belongs to the account and machine,
   and a committed repo file saying `on` would force Fable for every gateway clone. Settled:
   `resolveMainModel` reads the user file only (`review-config.js:244-250`); S4 adopts that precedent.
5. **Which dispatches are checked.** Every Agent dispatch with an explicit Fable model, whatever its
   `subagent_type`: the 403 does not care about the type. Settled: config cannot route any type to
   Fable, because `MODELS` excludes it (`review-config.js:25`, `:38`), so any explicit Fable is a
   hand-written dispatch and checking every type costs nothing.

6. **If S1 finds no free signal.** The plan's default, not an open question: build no automatic
   check in this plan. `auto` behaves as `off` and the owner sets `fableAccess: "on"` by hand. A
   paid probe is a later plan.

Named-reader condition: one. At the S1/S2 break the owner reads the S1 findings and confirms the
signal and the decision table (section 4). S2 is not dispatched before that. Every other GATE is
mechanical. Review loop: cap 2, not an owner question.

## 4. Order and seams

Before S1 (orchestrator): the owner answers section 3; the tracker created at
tracker.md in the run directory with its header block.

No frozen target. What plays that role: the S1 findings file, frozen at the S1 commit. S2-S5 cite it
for the signal rules. A later change to a rule is an amendment to the findings file and this plan,
recorded in the tracker, never a silent edit in a step.

Order: S1 (probe) -> owner break -> S2 (signal) -> S3 (cache, `checkAccess`) -> S4 (config key)
-> S5 (gate) -> S6 (docs, full suite). S4 does not depend on S2
or S3 and could run first, but sequencing keeps one implementer at a time. No overlap.

### The candidates S1 chooses between

The plan does not pick the mechanism. S1 picks from these, by evidence, and records the pick.

| Candidate | What it reads | Evidence today | Cost |
|---|---|---|---|
| A. Transcript `inference_geo` | `message.usage.inference_geo` of the newest main-session assistant record in `transcript_path` | Fable records always carry `"global"` (CONFIRMED: 815 of 815 Fable records in the owner's transcripts from the last 40 days, counted 22 Nov). Opus and Sonnet records carry both `"global"` and `""` (CONFIRMED counts). `""` means the gateway (INFERRED from the six 403 sessions; the field does not prove it). No `"not_available"` record turned up in the 40-day window (CONFIRMED by count, 22 Nov); `null` appears on 56 `<synthetic>` records. Both are skipped. Readable from a PreToolUse hook at dispatch time: NOT verified. | Free |
| B. Transcript 403 text | A main-transcript `user` record whose string content is a `<task-notification>` with `<status>failed</status>` and the 403 phrase naming Fable, whose summary starts `Agent "` (4 of 4 real refusals, 22 Nov), or a `tool_result` whose `tool_use_id` is an Agent `tool_use` (foreground dispatch; no example seen yet). Bash, Read and Grep results that quote the phrase never count (16 on the morning of 22 Nov; it grows as sessions quote it; 0 real). | CONFIRMED by counts, 22 Nov: 21 transcript files contain the phrase. Real refusal shapes: 4 main task-notifications and 6 sub-agent synthetic API-error records (`<synthetic>`, not read by this rule). No foreground Agent `tool_result` refusal seen yet. Only exists after a failed dispatch. | Free |
| C. Transcript Fable reply | An assistant record whose `message.model` starts `claude-fable` | A successful Fable reply proves reach (CONFIRMED by definition). Rare in a main transcript. | Free |
| D. Cached probe dispatch | A deliberate Fable dispatch replying "ok", its outcome recorded by a PostToolUse hook | Deferred: later plan, see the closing section. Cost $0.39 on 21 Nov (CONFIRMED). | Not built here |
| E. `ANTHROPIC_BASE_URL` | Env var set in the hook's env | Set implies gateway: NOT confirmed. `ANTHROPIC_*` were unset in a sub-agent's shell (CONFIRMED). Hint only: it never decides a verdict. | Free |

### Decision table (S2's default; S1 confirms or amends each row)

Scan the transcript tail newest record first. The first decisive record wins, because a session can
change backend part way (CONFIRMED: one session ran 128 Opus calls on claude.ai, then 14 Sonnet calls
on the gateway). No decisive record in the tail: `unknown`, which the gate treats as unreachable.

| Record | Verdict | Evidence label |
|---|---|---|
| assistant, `message.model` starts `claude-fable` (C) | reachable | `fable-reply` |
| user record: a `<task-notification>` with status failed and an `Agent "` summary, or the `tool_result` of an Agent `tool_use`, whose text matches the 403 and names Fable (B) | unreachable | `refused-403` |
| assistant, `message.usage.inference_geo === "global"` (A) | reachable | `geo-global` |
| assistant, `message.usage.inference_geo === ""` (A) | unreachable | `geo-empty` |
| assistant with `message.usage.inference_geo` missing, `null` or any other value; `<synthetic>` model | skip, read older | none |
| no decisive record in the tail; file missing or unreadable | unknown | `no-signal`, `unreadable` |

### Seam table

| artefact | producer | consumer | shape |
|---|---|---|---|
| the findings file (run directory, probe-findings) | S1 | S2, S3, S5, owner | headings `## Stdin`, `## Timing`, `## Signals`, `## Decision table`, `## Contingency`; the decision table has the columns of the one above; `## Contingency` ends with the line `Paid probe needed: yes` or `Paid probe needed: no` |
| `VERDICT` | S2 | S3, S5 | `Object.freeze({REACHABLE: 'reachable', UNREACHABLE: 'unreachable', UNKNOWN: 'unknown'})` |
| `EVIDENCE` | S2 | S3, S5, S6 | frozen object of the labels in the decision table, plus `CHECK_ERROR: 'check-error'` |
| `readAccessSignal(transcriptPath)` | S2 | S3 | `{verdict, evidence}`; never throws |
| `TAIL_BYTES` | S2 | S2 tests | `1024 * 1024`: bytes read from the end of the transcript |
| `TASK_NOTIFICATION_MARKER`, `STATUS_FAILED_MARKER`, `AGENT_SUMMARY_MARKER` | S2 | S2 tests | `'<task-notification>'` (string content of the user record starts with it), `'<status>failed</status>'` and `'<summary>Agent "'` (the content holds both) |
| `AGENT_TOOL_NAME` | S2 | S2 tests | `'Agent'`: the `tool_use` name the Agent shape matches |
| 403 rule, Agent shape | S2 | S2 tests | a `tool_result` counts only when its `tool_use_id` belongs to a `tool_use` named `AGENT_TOOL_NAME` in the scanned tail |
| cache file | S3 | S3 | `<dir>/<sessionId with [^\w.-] as _>.json`, `{verdict, evidence, at}` (`at` epoch ms); `<dir>` is `$SDLC_FABLE_ACCESS_DIR` or `path.join(os.tmpdir(), 'sdlc-fable-access')` |
| `CACHE_TTL_MS`, `CACHE_DIR_ENV` | S3 | S3 tests, S6 | `10 * 60 * 1000` (decision 3); `'SDLC_FABLE_ACCESS_DIR'` |
| `writeCache(sessionId, verdict, evidence, now)` | S3 | S3 (`checkAccess`) | returns boolean (written or not); never throws |
| `checkAccess({sessionId, transcriptPath, now})` | S3 | S5 | `{reachable: boolean, verdict, evidence, cached: boolean}`; never throws |
| `resolveFableAccess({repoRoot})` | S4 | S5 | `{mode, source: 'user config' or 'default', warnings}` |
| `FABLE_ACCESS_KEY`, `FABLE_MODES` | S4 | S5, S6 | `'fableAccess'`; `Object.freeze({AUTO: 'auto', ON: 'on', OFF: 'off'})`; default `auto` |
| deny reasons in `agent-tier-gate.js` | S5 | S6 | `FABLE_UNREACHABLE_REASON` and `FABLE_OFF_REASON`, both containing `model: "opus"` |

## 5. The steps

**S1. A findings file states what a PreToolUse hook on Agent can see, and which free signal decides.**
NEW the findings file: probe-findings, markdown, in the run directory docs/plans/fable-access-check/.

WHY NOW: every later step rests on three facts nobody has checked: that the hook gets
`transcript_path` and `session_id` on a dispatch, that the transcript already holds the dispatching
assistant record at that moment, and that `inference_geo` tracks the backend. Guessing them is how a
gate ships that denies Fable on every direct session.

WHAT TO BUILD (read-only on the repo; no feature code; throwaway files under tmp/fable-access-check/):
- Probe hook `tmp/fable-access-check/probe/dump-hook.js`, written with the Write tool. On stdin it
  writes one JSON file per call to `tmp/fable-access-check/probe/out/`: the stdin key names and
  `hook_event_name`; whether `transcript_path` is readable and its size; for the last five transcript
  records: `type`, `message.model`, `message.usage.inference_geo` (with its JSON type), and whether any
  content item is the `tool_use` this call is for (match on the stdin tool-use id if one exists,
  else on `name === 'Agent'`); for PostToolUse, whether `tool_response` holds the 403 text and its
  shape (string or object, key names); whether runs A and B ran in the background, and whether
  PostToolUse fired at launch or at completion (evidence for the later paid-probe
  plan); the names of env vars matching `^(ANTHROPIC|CLAUDE)_` and whether each is set.
  Never a value, never prompt text.
- Probe settings `tmp/fable-access-check/probe/settings.json`: PreToolUse and PostToolUse entries,
  matcher `Agent`, command `node <abs path>/dump-hook.js`. A scratch user config with the
  `agent-tier-gate` step off, passed by `SDLC_REVIEW_CONFIG_USER`, so the sdlc gate does not
  interfere. If the gate still interferes, record it and report PARTIAL; never mislabel a TIER line.
- Run A: `claude -p --settings <settings.json>` with a prompt asking for exactly one general-purpose
  dispatch on model haiku replying "ok". Run B: the same on model fable (decision 2).
- History script `tmp/fable-access-check/probe/geo-history.js` over `~/.claude/projects/**/*.jsonl`,
  last 40 days. Counts only: records by model and `message.usage.inference_geo` value; main sessions
  whose geo changes value part way; for each session with a real 403 refusal, the geo of the newest
  main assistant record before the first 403 (counts by value); for each session with a Fable reply,
  the same. The script classifies every 403 hit by shape before it counts "sessions with the 403
  text": task-notification failed, Agent `tool_result`, other `tool_result` by tool name, `<synthetic>`
  API error. A plain phrase grep counts 21 files, and only 4 main sessions among them are real
  refusals (CONFIRMED, 22 Nov). Only the first two shapes count as real refusals.
- Known gap: S1 probes main-session dispatches only. A sub-agent's Agent call may carry another
  `transcript_path` or `agent_id`. Name it in `## Stdin`; do not chase it.
- Write the findings file with the five headings of the seam table. Each claim tagged CONFIRMED,
  INFERRED or GUESSED. `## Decision table` confirms or amends each row of section 4's table, with the
  count that backs it. `## Contingency` states whether candidates A-C decide on both backends seen and
  ends with the `Paid probe needed:` line. Name the backend each run went through, from its geo.

IMPORTS: none.
ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: every path under `src/`, `hooks/`, `tools/`; `README.md`; `CLAUDE.md`.

TESTS FIRST: none; the step writes no code that ships.

GATE: on the findings file,
`grep -cE '^## (Stdin|Timing|Signals|Decision table|Contingency)$'` prints 5 and
`grep -cE '^Paid probe needed: (yes|no)$'` prints 1 and
`grep -E '[0-9a-f]{8}-[0-9a-f]{4}-'` prints nothing (no session ids) and
`git status --porcelain -- src hooks tools` prints nothing and the baseline gate.

REVIEW:
1. Does each decision-table row cite a count, run A or run B, and carry a tag?
2. Is the timing question answered from run A or B, not from history alone?
3. Does `## Stdin` say whether `transcript_path` and `session_id` arrive on PreToolUse for Agent?
4. Is any claim about the backend not observed in a run tagged INFERRED or GUESSED, not CONFIRMED?
5. Does the file hold any value that identifies a session, project, path or env value?
FAIL if: a row has no backing count or run; a claim about a backend no run went through is
CONFIRMED; an env value, session id, path or prompt text appears; feature code is added.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls, 30 minutes (two `claude -p` runs and a history scan over a large
transcript tree), one review round. Then the owner break.

**S2. `readAccessSignal` turns a transcript tail into a reachable, unreachable or unknown verdict.**
NEW `src/hooks/lib/fable-access.js`, `src/hooks/test-fable-access.js`.

WHAT TO BUILD:
- Constants `VERDICT`, `EVIDENCE`, `TAIL_BYTES` (seam table). `FABLE_REPLY_MODEL = /^claude-fable/i`.
  `REFUSED_403 = /team not allowed to access model/i` and `FABLE_NAME = /fable/i`, both required on
  the same text. `TASK_NOTIFICATION_MARKER`, `STATUS_FAILED_MARKER`, `AGENT_SUMMARY_MARKER =
  '<summary>Agent "'` and `AGENT_TOOL_NAME = 'Agent'` (seam table).
  `GEO_REACHABLE = 'global'`, `GEO_UNREACHABLE = ''`.
- `readAccessSignal(transcriptPath)` -> `{verdict, evidence}`. Read at most the last `TAIL_BYTES`
  with `fs.openSync` and `fs.readSync` (never the whole file); drop the first partial line when the
  read started mid-file. Parse lines newest first; skip lines that fail to parse. Apply the decision
  table as amended by S1's findings, row by row. The 403 rule reads two shapes
  only: a user record whose string content starts `<task-notification>` and holds
  `<status>failed</status>` and `<summary>Agent "` (all three markers; a failed background Bash
  notification starts `Background command "` and never counts), and a `tool_result` whose
  `tool_use_id` belongs to a `tool_use` named `AGENT_TOOL_NAME` in the tail.
  A Bash, Read or Grep result that quotes the 403, and assistant
  prose that quotes it, never count, because a session that reads about the 403
  must not lose Fable.
  A non-string or empty path, or any read
  error: `{verdict: unknown, evidence: unreadable}`. Never throws.
- Export `VERDICT`, `EVIDENCE`, `TAIL_BYTES`, `readAccessSignal`.

IF S1 SAYS OTHERWISE: if S1 amends a decision-table row, the step builds the amended row and its test
row; the function shape stays. If S1 finds `inference_geo` not usable (`Paid probe needed: yes`), the geo
rows are dropped from the table and the function keeps rows B and C only (see S5's paragraph for
the acceptance criteria that case leaves unmet).

IMPORTS: none beyond `fs`.
ASSUMES LANDED: S1, and the owner's confirmation at the S1 break.
MUST NOT TOUCH: `src/hooks/agent-tier-gate.js` (S5), `src/hooks/lib/review-config.js` (S4).

TESTS FIRST: `src/hooks/test-fable-access.js`, red before the lib exists. It calls `isolateGitEnv`
first. Synthetic transcripts in a `mkdtemp` sandbox. One table test, columns
`name, records (oldest first), expected verdict, expected evidence`, rows: Fable reply;
a failed task-notification quoting the 403 and Fable, newer than a `global` record (unreachable);
an Agent `tool_result` 403 newer than a `global` record (unreachable); `global` newer than a 403
(reachable, backend switch); `""` only (unreachable); `null` and `<synthetic>` only (unknown);
assistant text quoting the 403 above a `global` record (reachable); a 403 that does not name Fable
(skipped: a `global` record below it decides, reachable); a Read `tool_result` quoting the 403 and
Fable, above a `global` record (reachable); a completed task-notification whose summary quotes the
403 (skipped: a `global` record below it decides, reachable); a failed Background command
notification quoting the 403 and Fable (skipped: a `global` record below it decides, reachable); a
user prompt that quotes a failed task-notification mid-string (skipped: a `global` record below it
decides, reachable).
Plus: missing file and non-string path give `unreadable`; a decisive record placed before
the last `TAIL_BYTES` with only filler after it gives `no-signal`.

GATE: `node src/hooks/test-fable-access.js` exits 0 and `grep -n "readFileSync" src/hooks/lib/fable-access.js`
prints nothing and the baseline gate.

REVIEW:
1. Does every row of the findings file's decision table map to code and to one test row?
2. Is the newest decisive record the one that wins, with skipped records not ending the scan?
3. Is the 403 rule limited to the failed task-notification and the Agent `tool_result`, so a Bash,
   Read or Grep result that quotes the 403 never counts?
4. Is any path out of the function a throw (bad JSON, a directory as the path, a zero-length file)?
5. Is every regex, label and byte count a named constant?
FAIL if: the whole transcript is read; assistant prose or a Bash, Read or Grep result can yield
`refused-403`; a table row lacks a
test; the function can throw; a decision row differs from the findings file without a tracker entry.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 25 tool calls, 20 minutes, one or two review rounds.

**S3. `checkAccess` returns a cached verdict inside the TTL and fails closed on anything undecided.**
EXTEND `src/hooks/lib/fable-access.js`, `src/hooks/test-fable-access.js`.

WHAT TO BUILD:
- `CACHE_DIR_ENV`, `CACHE_DIR_NAME = 'sdlc-fable-access'`, `CACHE_TTL_MS` (decision 3). The cache
  lives in `os.tmpdir()` like the orchestrator-mode state (`stateDir` in
  `src/hooks/orchestrator-mode.js`), not under `~/.claude` or `.git/`: the verdict belongs to one
  session, not to a repo or the account, and a reboot clearing it costs one free recompute.
- `cachePath(sessionId)`, `readCache(sessionId, now)` -> `{verdict, evidence}` or null, and
  `writeCache(sessionId, verdict, evidence, now)` -> boolean. A cache entry is used only when it
  parses, its `verdict` is reachable or unreachable, `at` is a number, and `0 <= now - at < CACHE_TTL_MS`.
  Anything else is ignored. Writes are atomic (temp file, then rename, as `writeState`), create the
  directory, and swallow errors: the cache is an optimisation, never a reason to change a verdict.
- `checkAccess({sessionId, transcriptPath, now = Date.now()})` -> seam shape. A usable cache entry
  returns with `cached: true` and the transcript is not read. Otherwise `readAccessSignal`; a
  reachable or unreachable verdict is written to the cache when `sessionId` is a non-empty string;
  `unknown` is never cached, so a later record can decide at once. `reachable` is true only for
  `VERDICT.REACHABLE`. Any throw inside gives `{reachable: false, verdict: unknown, evidence:
  check-error, cached: false}`.

IF S1 SAYS OTHERWISE: if `session_id` is absent on PreToolUse, key the cache on `transcript_path`
instead (same sanitising) and say so in the step report. If neither is present, no cache: AC3 is then
unmet, and the tracker records it with the AC2 limit in S5's paragraph.

IMPORTS: `readAccessSignal`, `VERDICT`, `EVIDENCE` from the same module (S2).
ASSUMES LANDED: S2.
MUST NOT TOUCH: `src/hooks/agent-tier-gate.js` (S5), `src/hooks/lib/review-config.js` (S4),
`src/hooks/orchestrator-mode.js`.

TESTS FIRST: extend `src/hooks/test-fable-access.js` with `SDLC_FABLE_ACCESS_DIR` in the sandbox.
AC3: a reachable transcript, `checkAccess`, then the transcript rewritten to a 403 one, then
`checkAccess` at `now + 1000` returns reachable with `cached: true`; at `now + CACHE_TTL_MS` it
returns unreachable with `cached: false`. AC4: `unknown` is not cached (no file after the call) and
`reachable` is false. A corrupt cache file, a future `at` and an `unknown` cached verdict are each
ignored (table: `name, cache file text, expected cached`). No `sessionId`: verdict returned, no file
written. An unwritable cache directory: verdict still returned.

GATE: `node src/hooks/test-fable-access.js` exits 0 and the baseline gate.

REVIEW:
1. Does a fresh cache entry skip the transcript read entirely (AC3)?
2. Can `unknown`, an error or a malformed cache entry ever produce `reachable: true` (AC4)?
3. Is the TTL check closed on both sides (`at` in the future is not fresh)?
4. Is the write atomic and the directory created when missing?
5. Does a cache write failure change the returned verdict?
FAIL if: any undecided path returns `reachable: true`; `unknown` is cached; a cache failure throws
or changes the verdict; the TTL or directory is a literal outside a named constant.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 25 tool calls, 20 minutes, one or two review rounds.

**S4. `fableAccess` in the user config forces the check on or off, and config can never name Fable.**
EXTEND `src/hooks/lib/review-config.js`, `src/hooks/test-review-config.js`,
`.claude/sdlc-review.json.example`.

WHAT TO BUILD:
- `FABLE_ACCESS_KEY`, `FABLE_MODES` (seam table); `DEFAULTS.fableAccess = FABLE_MODES.AUTO`.
- `resolveFableAccess({repoRoot})` -> `{mode, source, warnings}`, shaped like `resolveMainModel`:
  read from the user layer only (decision 4); a repo-file value is ignored with the warning
  `<path>: fableAccess is read from the user file only; ignored`; an invalid value warns
  `... is not valid; ignored` and gives `auto` from `default`. Never throws.
- Export `resolveFableAccess`, `FABLE_ACCESS_KEY`, `FABLE_MODES`. `MODELS` is not changed.
- `.claude/sdlc-review.json.example`: add `"fableAccess": "auto"` and one sentence in `_comment`:
  auto checks per session, on and off force it, user file only.

IF S1 SAYS OTHERWISE: nothing here depends on S1.

IMPORTS: none new; the resolver uses `loadLayers` and `layerWarnings`, already in the module.
ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `src/hooks/lib/fable-access.js` (S2, S3), `src/hooks/agent-tier-gate.js` (S5).

TESTS FIRST: extend `src/hooks/test-review-config.js`. Table `resolveFableAccess`: columns
`user file, repo file, expected mode, expected source, warning contains`; rows: neither file (auto,
default); user `on`; user `off`; user `"maybe"` (auto, warning); user `true` (auto, warning); repo
`on` with no user value (auto, warning "user file only"). Pins: `MODELS` does not include `fable`;
`resolveReview` with user `round2: "fable"` returns the default model and a warning; a rule with
`round1: "fable"` is ignored with a warning; `setMainModel('fable')` returns `ok: false`;
`resolvePlanReview` and `resolveBranchReview` reject `fable` for their model keys.

GATE: `node src/hooks/test-review-config.js` exits 0 and
`node -e "JSON.parse(require('fs').readFileSync('.claude/sdlc-review.json.example','utf8'))"` exits 0
and the baseline gate.

REVIEW:
1. Is the key read from the user file only, with the repo value warned and ignored (decision 4)?
2. Does every invalid value fall back to `auto` with a warning, never a throw?
3. Do the pins cover every model-valued key the module resolves (`round1`, `round2`, rules,
   `planReview`, `branchReview`, `mainModel`)?
4. Are the mode strings constants, used by name in the resolver and tests?
FAIL if: `MODELS` gains `fable`; the repo layer can set the mode; an invalid value yields `on`; a
model-valued key is left without a pin.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 20 tool calls, 15 minutes, one review round.

**S5. The tier gate denies a Fable dispatch when access is off or unreachable, naming Opus.**
EXTEND `src/hooks/agent-tier-gate.js`, `src/hooks/test-agent-tier-gate.js`.

WHAT TO BUILD:
- `FABLE_MODEL = /fable/i`. `FABLE_UNREACHABLE_REASON`: Fable is not reachable from this session
  (evidence: <label>); re-dispatch with `model: "opus"` and add a `TIER: opus:` line if it has none
  (a `TIER: fable:` line already counts; only general-purpose, Explore, Plan and implementer are
  tier-checked; the Fable check runs before the tier check, so an Opus re-dispatch with no TIER line would be
  denied again by `DENY_REASON`, `agent-tier-gate.js:215`; the check order does not change).
  `FABLE_OFF_REASON`: Fable is switched off by `fableAccess` in the user `sdlc-review.json`;
  re-dispatch with `model: "opus"` and the same TIER-line instruction. Both are constants with the
  evidence label appended at the call. Neither constant, nor any other hook or lib string literal,
  may contain `sdlc:` (`src/test-plugin-layout.js:495`).
- `decideFable(toolInput, input)` -> deny output or null. Mode `off`: deny `FABLE_OFF_REASON`.
  Mode `on`: null. Mode is read with `resolveFableAccess({repoRoot: input.cwd})`, its warnings written
  to stderr the way `stepsOn` writes them (`agent-tier-gate.js:230`). Mode `auto`:
  `checkAccess({sessionId: input.session_id, transcriptPath: input.transcript_path})`; reachable: null;
  otherwise deny `FABLE_UNREACHABLE_REASON` with the
  evidence label. Any throw inside: deny with `EVIDENCE.CHECK_ERROR`. Args/Returns comment.
- Wiring in the stdin handler: when `tool_input.model` is a string matching `FABLE_MODEL`, for any
  `subagent_type` (decision 5), and the `agent-tier-gate` step is on, call `decideFable` first; a
  deny is printed and ends the call. A null falls through to today's code, unchanged, so a
  reachable Fable dispatch gets exactly today's output (AC2). The early return for non-gated types
  stays for every non-Fable model. Read `stepsOn` once per call.
- Header comment: the gate fails open on odd input, except the Fable branch, which fails closed,
  and why (a Fable dispatch that 403s wastes a turn; a denied one costs a re-dispatch on Opus).
- Every existing row with model `fable` (test lines 58, 77, 79, 83) runs with a reachable fixture,
  and keeps its expected values. Before line 52 of the test file, write `{"fableAccess": "on"}` to
  `userCfg`; remove it before the new `fable access` table. Do not move, wrap or edit any existing
  line. Without it, `auto` with no transcript denies first with `FABLE_UNREACHABLE_REASON`,
  which does not name the four categories, so the `fable: why` row (line 83, checked by
  `namesCategories` at line 95) would turn red. No row is removed or loosened.

IF S1 SAYS OTHERWISE: if stdin lacks `transcript_path` on PreToolUse, `auto` is always undecided and
the gate denies every Fable dispatch in `auto`; S5 ships as written. `auto` is then undecided and
denies. The tracker records that AC1 and AC4 are met, AC2 is met only with `fableAccess: "on"`, and
AC3 has nothing to cache and is unmet, until a later plan adds a probe. If S1 shows the
dispatching record is not yet in the transcript, the signal reads older records. A session
whose first act is a Fable dispatch has no older record: see Risks.

IMPORTS: `checkAccess`, `EVIDENCE` from `src/hooks/lib/fable-access.js`; `resolveFableAccess`,
`FABLE_MODES` from `src/hooks/lib/review-config.js`; `deny` from `src/hooks/lib/hook-output.js`.
ASSUMES LANDED: S3, S4.
MUST NOT TOUCH: `src/hooks/lib/fable-access.js` (S2, S3), `src/hooks/lib/review-config.js` (S4),
`hooks/hooks.json`.

TESTS FIRST: extend `src/hooks/test-agent-tier-gate.js`; the sandbox gains `SDLC_FABLE_ACCESS_DIR`;
`call` (test line 49, which builds the stdin JSON; `run` takes raw stdin) gains optional
`session_id` and `transcript_path`. Table `fable access`: columns
`name, subagent_type, fableAccess, transcript, expected decision, reason contains`; rows: AC1
unreachable transcript, Plan, prompt carries `TIER: fable: plan writing` (deny, `model: "opus"`);
AC1 the same for `sdlc:code-reviewer`, prompt with no TIER line (deny; the reason tells the caller to
add a `TIER: opus:` line); AC2 reachable, `TIER: fable: plan writing`: full stdout equals the stdout
for the same input with `fableAccess: "on"` (no `permissionDecision`, `updatedInput.model` `fable`,
the budget block appended); AC2 reachable, `user asked`: the same equality, with decision ask;
AC4 no `transcript_path` (deny); AC4 unreadable path
(deny); `off` with a reachable transcript (deny, names `fableAccess`); `on` with no transcript (the
tier logic decides). Plus: AC3 at the hook, two calls with one `session_id` and the transcript
switched to unreachable between them, both allowed (the prompt carries
`TIER: fable: plan writing`, so the tier check passes); the `agent-tier-gate` step off
leaves a Fable dispatch untouched; an Opus dispatch never reads the transcript (pass a
path that is a directory: output unchanged from today).

GATE: `node src/hooks/test-agent-tier-gate.js` exits 0 and `node src/hooks/test-fable-access.js` exits 0
and `node src/hooks/test-agent-tier-gate.js | tail -1` matches `^([0-9]+) passed, 0 failed$` with N
at least 147 plus the new rows, and
`git diff HEAD -- src/hooks/test-agent-tier-gate.js | grep -cE '^-\s*(\[.*(opus|fable)|\{ name:|assert\()'`
prints 0 (no table row or single-line assert removed or changed; continuation lines of multi-line
asserts are REVIEW question 6) and the baseline gate.

REVIEW:
1. Does a reachable Fable dispatch produce byte-identical output to today for the same input (AC2)?
2. Can any undecided, erroring or `off` path reach the tier logic for a Fable model (AC4)?
3. Does every deny reason contain `model: "opus"` (AC1)?
4. Is the Fable check skipped when the `agent-tier-gate` step is off, and run for non-gated types?
5. Do Opus, Sonnet and no-model dispatches behave exactly as at HEAD?
6. Was any existing assertion removed or its expected value changed?
FAIL if: a Fable dispatch passes when the check is undecided; an existing assertion is dropped or
loosened; a non-Fable dispatch's output changes; a reason string is inlined rather than a constant.

ROLLBACK: a single `git revert` of this step's commit. S6 cites the reasons, so revert S6 first.
BUDGET: about 35 tool calls, 25 minutes, two review rounds expected (a gate diff; round 2 on Opus).

**S6. README and CLAUDE.md describe the Fable access check, and the full suite is green.**
EXTEND `README.md`, `CLAUDE.md`.

WHAT TO BUILD:
- `README.md`, section "Model steering": one bullet, "Fable access", after the `agent-tier-gate.js`
  bullet: what is checked (explicit Fable dispatches), the signal S1 chose and its tag, the
  `fableAccess` modes, the cache place and TTL, fail closed, the Opus fallback. In the
  `agent-tier-gate.js` bullet, one sentence pointing to it. Section "Configuration", the
  `~/.claude/sdlc-review.json` paragraph: add `fableAccess` to the key list, user file only.
- `CLAUDE.md`, table "What ships here": one row, Fable access check, path
  `src/hooks/lib/fable-access.js`.
- Plain English, short sentences, no number without its source.

IMPORTS: none.
ASSUMES LANDED: S5.
MUST NOT TOUCH: every path under `src/`, `hooks/`, `tools/`.

TESTS FIRST: none; prose only. `src/test-plugin-layout.js` already checks the docs for stale paths.

GATE: `grep -c fableAccess README.md` prints 2 or more and `grep -c 'fable-access' CLAUDE.md` prints 1
or more and `bash tools/run-tests.sh` prints a line matching `^Files: [0-9]+  failed: 0` (AC5) and
the baseline gate. Named reader: the reviewer confirms every path in the new text resolves, the TTL
and modes match the code, and no number appears without its source.

REVIEW:
1. Do the modes, TTL, cache place and deny wording match the code at HEAD?
2. Does every path named resolve?
3. Does the text claim the signal is proof where S1 tagged it INFERRED?
FAIL if: a stated value differs from the code; a path does not resolve; an INFERRED claim is stated
as fact.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 15 tool calls, 10 minutes plus one full-suite run (about 30 seconds), one round.

## 6. What NOT to do

- Do not rewrite a Fable dispatch to Opus through `updatedInput`. AC1 asks for a deny, and a silent
  model swap hides the cost change from the orchestrator.
- Do not take `ANTHROPIC_BASE_URL` as a verdict. It is unconfirmed and was unset in a sub-agent shell.
- Do not run a paid probe from inside the hook (for example `claude -p` from the PreToolUse
  command). The hook's timeout is 5 seconds in `hooks/hooks.json`, and a hook that spends money on
  every cache miss is worse than a deny.
- Do not add `fable` to `MODELS`. That opens config routing to Fable, which S4 pins shut.
- Do not cache `unknown`. It would hold Fable off for a whole TTL after evidence appears.
- Do not read the whole transcript. Main transcripts reach tens of megabytes; `TAIL_BYTES` bounds it.

## 7. Definition of done

Run in this order from the repo root, after the last step's commit:

1. `node src/hooks/test-fable-access.js` exits 0.
2. `node src/hooks/test-review-config.js` exits 0.
3. `node src/hooks/test-agent-tier-gate.js` exits 0 (AC1, AC2, AC3 at the hook, AC4).
4. `claude plugin validate .` exits 0.
5. The single full-suite run: `bash tools/run-tests.sh` prints `Files: N  failed: 0` with N at least
   61 (60 at HEAD plus `test-fable-access.js`) (AC5).
6. `node tools/plugin-version.js check` exits 0 at each commit, and the version at the last commit is
   above 1.0.115.
7. The tracker's AS BUILT field names the signal S1 chose and the `Paid probe needed:` answer.

## Risks, deferred work, open decisions, unverified

Risks:
- `"global"` may not mean Fable is reachable on every direct backend, for example a direct API key
  without Fable access (GUESSED). The cost is one 403 per TTL window, the same as today's behaviour.
  The owner's `fableAccess: "off"` covers it.
- A cached reachable verdict goes stale when the session moves to the gateway: up to one wasted 403
  per TTL window (INFERRED from the CONFIRMED mid-session switch). The free path waits out the TTL.
- Fail closed means a new or unusual session shape (no `transcript_path`, a transcript format change)
  silently loses Fable. The deny reason says why, and `fableAccess: "on"` is the escape.
- The 403 text is the gateway's wording. If it changes, row B stops matching; rows A and C still decide.
  Row B matches two shapes only (failed Agent task-notification, Agent `tool_result`). A phrase match
  on any `tool_result` is wrong: Bash and Read results that quote the text are 16 of the hits on the
  morning of 22 Nov (it grows as sessions quote it), and none is a refusal.
- A session whose first act is a Fable dispatch, including every `claude -p` run, has no older
  assistant record. It gets `unknown` and a deny. `fableAccess: "on"` is the escape.

Deferred:
- Multi-session coordination. A gateway session handing Fable work to a direct session is out of
  scope. It has no steps here and comes in a later plan.
- A paid probe plus a recorder (the old S5b), to be planned only if S1 says `Paid probe needed: yes`.
  The round 2 review found three points the later plan starts from. (N1) The probe needs an explicit
  allow from the tier gate, because its prompt carries no TIER line and the tier check would deny
  it. Background dispatches are invisible to PostToolUse, so a recorder sees foreground dispatches
  only. (N2) A long-TTL cached probe verdict must not mask a decisive transcript verdict: the
  transcript verdict (row B or C) wins and is written over the cached entry.

Open owner decisions (section 3): standing authorisation; S1 spend (about $0.40); cache TTL (10 min
recommended). Decisions 4, 5 and 6 are settled by the code or the plan's default.

Not verified for this plan:
- That a PreToolUse hook on Agent receives `transcript_path` and `session_id`. PreToolUse already
  gives both to this repo's hooks (CONFIRMED: `pre-commit-review.js:1035` on the Bash matcher,
  `orchestrator-mode.js:249`). S1 confirms it for the Agent matcher.
- The real refusal shapes are CONFIRMED by counts (4 main task-notifications, 6 sub-agent synthetic
  records). A foreground Agent `tool_result` refusal has no example seen yet; row B's second shape
  rests on that.
- That a sub-agent's Agent call carries the main `transcript_path` (S1 probes main-session
  dispatches only).
- That the transcript holds the dispatching assistant record when the hook runs. S1 checks.
- That `""` means the gateway. Counts are CONFIRMED; the meaning is INFERRED. S1 checks against the
  403 sessions.
- What `"not_available"` means: no such record in the 40-day window (CONFIRMED by count). `null`
  appears on 56 `<synthetic>` records. Both are treated as no signal.
- That `SDLC_REVIEW_CONFIG_USER` turns the sdlc gate's step off for a `claude -p` child (INFERRED from
  the tests that set it). S1 reports PARTIAL if not.
- That PostToolUse on Agent sees the 403 text in `tool_response`. For a background dispatch it
  cannot: the result is the launch acknowledgement. No step here depends on it; S1 records it as
  evidence for the later paid-probe plan.
- The $0.39 probe cost is one observation (21 Nov), not a measured mean.

## Review rounds

- Round 1: NOT YET (1 CRITICAL, 5 IMPORTANT, 12 ADVISORY). Folded in Revision 2.
- Round 2: NOT YET (0 CRITICAL, 2 IMPORTANT, 7 ADVISORY). Both IMPORTANT findings sat in S5b.
  Revision 3 deletes S5b and applies the advisories (A-n1 to A-n7, and the `AGENT_TOOL_NAME`
  constant).
- The Revision 3 text has NOT been re-reviewed. Two-round cap; owner's decision, 22 Nov 2026.
- A10 and A11 not acted on (pre-existing `_comment` mismatch in `.claude/sdlc-review.json.example`,
  flagged in S4 and not fixed there; size NOTE is advisory).
