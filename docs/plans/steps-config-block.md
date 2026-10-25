# Steps config block and `/sdlc:steps`

Plan for `/sdlc:plan-spec run`. Written 25 Oct 2026 against `main` at e3e27e9
(plugin 1.0.65), on branch `steps-config-block`. Revision 2 (round 1 findings folded in; round 2 READY).

## Section 1: What this delivers, and what it does not

Delivers: a `steps` block in `sdlc-review.json` (user file and repo file)
that switches off any sdlc workflow area, or one step inside it; one resolver
lib that every hook asks first; a `/sdlc:steps` command that lists every step
with its state and the source of that state, and toggles one; the README
"Turning steps off" section rewritten around the block, alias rows kept.

The step table. Area ids and step ids are used verbatim in code, tests and docs.

| Area id | Guard | Step ids (hook or place) |
|---|---|---|
| `orchestration` | no | `orchestrator-mode`, `enforce-review-implementer`, `agent-tier-gate` (Opus TIER deny/ask), `agent-default-model` (no-model dispatch rewritten to Sonnet), `context-budget`, `read-trim` |
| `features` | no | `session-start-feature`, `pre-commit-feature`, `post-commit-feature` |
| `tdd` | yes | `tdd-mandate` (inside `pre-commit-review.js`) |
| `review` | yes | `review-gate` (inside `pre-commit-review.js`), `pending-review-gate`, `plan-review` |
| `hygiene` | no | `pre-commit-hygiene` |
| `verification` | no | `pre-pr-verify` |
| `commit-conventions` | yes | `enforce-co-author`, `claude-attribution-note`, `post-commit-notify` |
| `standalone` | no | `main-model`, `cache-ttl`, `session-instructions`, `marketplace-autoupdate` |

Schema: `"steps": { "<area>": <bool> | { "enabled": <bool>, "<step id>": <bool> } }`.

Does NOT: change `hooks/hooks.json` (the chain, its order and timeouts stay;
`src/test-plugin-layout.js` freezes them); remove or change any existing
switch; add a switch for the reporting commands (`/sdlc:model-spend`,
`/sdlc:fit`, `/sdlc:review-timing`); read `hygiene-repos.json` or
`verify-repos.json` from the resolver (they stay opt-in, owned by their hooks);
touch `post-commit-review.js`, `stop-review-trigger.js` or
`protect-user-dir.js` (not wired); refactor `mainModel` reading in
`session-start-instructions.js` beyond what step 11 names.

## Section 2: Working constraints

- Branch `steps-config-block`. Feature record created with
  `/sdlc:feature-new steps-config-block "<requirement>"` before step 1.
- Handoff work runs in sub-agents: the main session reads the plan, writes the
  brief, dispatches `sdlc:implementer` (`model: "sonnet"`), runs the review,
  commits. It never edits source. One fresh agent per role per round; never
  reuse one via SendMessage. Implementer tier: Sonnet (§9).
- Commit protocol, separate Bash commands, in order:
  `node tools/plugin-version.js bump`; then `git add <step files> .claude-plugin/plugin.json`;
  then, alone, `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  Never `git add && git commit`, never `-a`, never a heredoc holding the
  two-word commit phrase, no `$(` in a command that names a commit. A commit
  carrying only `features/*.md` skips the bump.
- Class-level guards, in every GATE as "the guards": `bash tools/run-tests.sh`
  exits 0, `node src/test-plugin-layout.js` exits 0,
  `node src/test-suite-isolation.js` exits 0, `claude plugin validate .` exits 0.
- Single owners. Step lookup: `src/hooks/lib/steps.js` (step 1). Config file
  reading and writing: `src/hooks/lib/review-config.js`. TDD alias:
  `src/hooks/lib/tdd-order.js::mandateInForce`. Git reads: `src/hooks/lib/git-read.js`.
  Deny shape: `src/hooks/lib/hook-output.js`. Nothing reimplements these.
- Hook convention, every hook step (H1-H6):
  - H1 Placement. The hook's own not-my-call exits stay first (wrong tool,
    not a commit, not `gh pr create`, not a sub-agent read). The resolver is the
    next decision, before any effect: block, write, rewrite, message, git call.
    An ordinary non-commit Bash call never reads config. Exceptions: the three
    feature hooks keep the alias's existing position (step 4); `orchestrator-mode.js`
    reads config only where it would act (step 9).
  - H2 Off output. Exactly the hook's existing approve or no-op output. No
    block, marker, lock or state write. A hook with a timing log logs
    `via: 'step-off'`.
  - H3 One read. A hook hosting several steps calls `stepStates` once.
  - H4 Warnings go to stderr, one line each, prefixed `<hook>: `. Never stdout.
  - H5 No reimplementation. After a hook's step lands, the hook reads no
    `steps` key and no alias file itself; its old alias check is replaced by
    the resolver call.
  - H6 Tests. One table added to the hook's suite, rows at least: default
    (behaviour unchanged), area off in the user file, the step off inside an on
    area, and a repo-file off (non-guard: honoured; guard: ignored, stderr
    names file and key). Each case sets `SDLC_REVIEW_CONFIG_USER` to a scratch
    file. A NEW JS suite calls `isolateGitEnv()` from
    `src/hooks/lib/isolate-git-env.js` first.
- Threat model for every hook or gate review: the hooks guard honest mistakes
  in commands Claude writes, not adversarial shell. Non-goals: a crafted
  `sdlc-review.json` written to defeat the resolver, a symlinked config dir,
  env vars set to subvert paths, a `.git` planted to mislead the root walk. A
  shape Claude would not write is ADVISORY, named as a gap, not chased. Two
  review rounds, then commit with open gaps named in the message.
- Gates see `SOURCE_EXTENSIONS` (`src/hooks/lib/source-files.js`); `.md` and
  `.json` diffs are reviewed as docs. Agents write files with the file tool
  and `cd` in every command outside the repo root. Batch doc edits go through
  `skills/plan-spec/edit_doc.py`.
- Always permitted, never counted: this plan, `features/steps-config-block.md`,
  the tracker docs/plans/steps-config-block/tracker.md and the reports
  directory docs/plans/steps-config-block/reports/.
- No client data: fixtures use temp dirs and invented repo names.

## Section 3: Owner decisions

Given by the owner in the planning brief, 25 Oct 2026. Not reopened.

- **D1 Standing authorisation. GRANTED.** The orchestrator stages, commits and
  dispatches fix agents per step without asking, on `steps-config-block` only.
  It overrides the harness rule "Commit or push only when the user asks" and
  `instructions/claude-md-snippet.md` ("Completing a review does not grant
  permission to commit -- wait for the user"). It stops at the PR: never
  pushes, never merges.
- **D2 Named-reader conditions.** Only the `/sdlc:steps` output (step 2, and the
  toggle lines of step 3) and the README wording (step 12). The owner clears
  both once, after step 13 and before the PR. Every code step closes on its
  GATE and the reviewer.
- **D3 Implementer Sonnet; review cap two rounds** (code and plan review).
- **D4 Areas and steps** as the Section 1 table. Reporting commands get no switch.
- **D5 Granularity.** Area switch with a per-step override inside it.
- **D6 Guard areas** `tdd`, `review`, `commit-conventions` switch from the user
  file only. A repo file that sets one off is ignored with a one-line warning
  naming the file and key. Other areas: either file; the repo file wins.
- **D7 Default on.** Absent block or key, invalid JSON, an invalid value: the
  step stays on. A bad file never switches a gate off.
- **D8 Aliases stay and keep working**: the repo files .claude/feature-tracking.disabled
  and .claude/tdd-mandate.disabled, `exempt_repos`/`exempt_paths` in
  `~/.claude/tdd-mandate.json`, `~/.claude/sdlc-cache-ttl.disabled`,
  `~/.claude/sdlc-autoupdate.disabled`, `/sdlc:main-model off`, and the
  `hygiene-repos.json`/`verify-repos.json` opt-ins.
- **D9 Orchestrator mode** keeps `/sdlc:orchestrate on|off` per session; the
  block adds the permanent switch.
- **D10 README** "Turning steps off" is rewritten for the block and command,
  alias rows kept.

Author's choices, standing unless the owner overrules before dispatch:

- **A1 "Per-role model rules"** is read as `agent-default-model`: the
  `agent-tier-gate.js` rewrite of a no-model `general-purpose`/`Explore`/`Plan`
  dispatch to Sonnet. Blocks steps 1 and 10.
- **A2 Alias versus block.** An alias that says off wins: the step is off,
  source `alias`, and the detail says the block said on. A block cannot turn on
  what an alias turned off. The opt-in files are preconditions, not aliases
  the resolver reads: block off always wins; block on cannot opt a repo in.
  Blocks step 1.
- **A3 Invalid value** falls to the next layer (as `review-config.js` does); it
  never switches anything off itself. Blocks step 1.
- **A4 Block off on `orchestrator-mode`** makes the hook inert, `/sdlc:orchestrate on`
  included; the switch prompt answers that the block holds it off. Blocks step 9.
- **A5 "Calls it first"** is H1: after the not-my-call exit, before any effect.
  Blocks steps 4-11.

## Section 4: Prerequisites, ordering and suite baseline

- Prerequisites: branch at e3e27e9, plugin 1.0.65; feature record created.
- Suite baseline, 25 Oct 2026, `bash tools/run-tests.sh` at HEAD: 40 files,
  0 failed, 20 s at `-j 16` (pytest absent, so the plan-spec Python suite is
  skipped with a warning). Nothing red at HEAD; nothing excluded from Section 7.
- No frozen target. The role is played by step 1's `CASES` table: its rows are
  the precedence rules every later step relies on.
- Order: 1 first, everything rests on it. 2 before 3 (the toggle prints the
  list line). 4-11 need only 1 and run by area. 12 documents built behaviour,
  so it follows every hook. 13 closes the run.

## Section 5: The steps

**1. `src/hooks/lib/steps.js` answers "is step X on, and why" for every step in the Section 1 table.**
EXTEND `src/hooks/lib/review-config.js`, `tools/run-tests.sh`.
NEW `src/hooks/lib/steps.js`, `src/hooks/test-steps.js`.

WHAT TO BUILD:
- `AREAS`: frozen, area id -> `{ guard, steps: [ids] }`, the Section 1 table.
- `stepStates(ids, { cwd, repoRoot })` -> `{ states: { [id]: state }, warnings: [string] }`;
  `state` is `{ id, area, guard, on, source, key, detail }`. `source` is one
  of `SOURCE_DEFAULT`, `SOURCE_USER`, `SOURCE_REPO`, `SOURCE_ALIAS`
  (`'default'`, `'user'`, `'repo'`, `'alias'`). `key` is the JSON path that
  decided (`steps.tdd.enabled`) or the alias path. `detail` is one line or ''.
- `stepState(id, opts)` -> state plus `warnings`; `isStepOn(id, opts)` -> boolean;
  `listSteps(opts)` -> `{ states: [AREAS order], warnings }`. One config read
  per call. None of the four throws: any exception, or an unknown id, gives
  `on: true`, `source: 'default'` and a warning ending `; treated as on`.
- Repo root: `opts.repoRoot`, else `findRepoRoot(opts.cwd || process.cwd())`,
  the nearest ancestor holding `.git` (directory or file), else null (no repo
  layer, no repo aliases). No git process. `configDir()`: `CLAUDE_CONFIG_DIR`
  when non-empty, else `~/.claude`.
- review-config.js: export `loadFile`, `userConfigPath`, `repoConfigPath`.
  No behaviour change. steps.js reads both files only through them.
- Precedence, per step: (R1) in one file, `steps.<area>.<step>` beats
  `steps.<area>.enabled` beats `steps.<area>` as a boolean. (R2) Guard area:
  user file only; a repo `false` at any of the three keys adds
  `<repo file>: <key> is read from the user file only; ignored`.
  (R3) Other areas: repo file beats user file. (R4) Default on. (R5) An alias
  that says off wins (A2); with a block `true`, detail says
  `block says on; the alias wins`. (R6) `steps` not an object, an area neither
  boolean nor object, a non-boolean value, an unknown area or step key: a
  warning naming file and key; that value is skipped (A3).
- Aliases: the three `features` steps: repo file .claude/feature-tracking.disabled
  exists. `tdd-mandate`: `mandateInForce(repoRoot)` not in force, detail its
  reason. `main-model`: user file `mainModel` is `"off"`. `cache-ttl`:
  sdlc-cache-ttl.disabled in `configDir()`, detail `writes nothing; still warns`.
  `marketplace-autoupdate`: sdlc-autoupdate.disabled in `configDir()`. Export `configDir` and the
  two file names as `CACHE_TTL_OPT_OUT`, `AUTO_UPDATE_OPT_OUT`.
- `pre-commit-hygiene`, `pre-pr-verify`, when on: detail
  `runs only in repos listed in ~/.claude/<file>`. Not read.
- run-tests.sh: export `SDLC_REVIEW_CONFIG_USER="$WORK/no-user-sdlc-review.json"`
  beside `TIMING_LOG_PATH`, so a real user file cannot turn a suite red.

IMPORTS: `src/hooks/lib/review-config.js` (file loading); `src/hooks/lib/tdd-order.js` (`mandateInForce`).
ASSUMES LANDED: nothing beyond HEAD
MUST NOT TOUCH: `src/hooks/review-config-cli.js` (6), `src/hooks/pre-commit-review.js` (5), every hook.

TESTS FIRST: `src/hooks/test-steps.js::CASES`, columns
`{ name, user, repo, files, step, on, source, warn }`. Rows: default on; user
area off; user step off inside an on area; user area off with the step `true`
(step wins); repo off, non-guard (`pre-commit-hygiene`), beats user on; repo
on beats user off; repo off, guard (`review-gate`): on, warning names file and
key; invalid JSON in the user file: on, warning; value `"off"`: on, warning;
unknown step key: warning; alias alone (feature-tracking.disabled): off,
alias; alias off plus block `true`: off, alias, detail; tdd-mandate.disabled:
off, alias. Plus `areasShape` (each id in one area; guards exactly `tdd`,
`review`, `commit-conventions`), `neverThrows` (unknown id, `steps: []`, a
directory where the file should be), `rootWalk` (subdirectory; `.git` file).

GATE: `node src/hooks/test-steps.js` exits 0 and `node src/hooks/test-review-config.js`
exits 0 and `grep -c SDLC_REVIEW_CONFIG_USER tools/run-tests.sh` prints 1 or
more and `grep -cE "spawn|execFile|writeFile" src/hooks/lib/steps.js` prints 0
and the guards.

REVIEW:
1. Does every path that cannot read, parse or validate config end `on: true`?
2. Is a repo `false` on a guard area ignored at all three key shapes, with the warning?
3. Does an alias off beat a block `true`, with an honest detail?
4. Is the TDD alias decided by `mandateInForce`, not re-derived?
5. Are the 13 rows present and each asserting `on`, `source` and the warning?
FAIL: a bad file, bad value or exception yielding `on: false`; a guard step
off from a repo file; config parsing outside `loadFile`; a git spawn or a
write in steps.js; a missing row.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls; one or two rounds.

**2. `/sdlc:steps` with no argument lists every step, its state and its source.**
NEW `src/hooks/steps-cli.js`, `src/hooks/test-steps-cli.js`, `commands/steps.md`.

WHAT TO BUILD:
- `node steps-cli.js list [--repo <path>] [--json]`. Repo: `--repo`, else the
  git toplevel of the cwd via `locateRepo` (`src/hooks/lib/git-read.js`),
  else none. Calls `listSteps` once. Exit 0 whatever the config holds.
- Text: one line per step in AREAS order,
  `<area>  <step>  on|off  <source label>  <detail>`, columns padded. Labels:
  `default`, `user file (<key>)`, `repo file (<key>)`,
  `alias (<path or key>)`. Then `warning: <text>` per warning. Last line:
  `Guard areas (tdd, review, commit-conventions) switch from the user file only.`
- `--json`: `{ steps: [state...], warnings: [...] }`.
- `commands/steps.md`, frontmatter description and `argument-hint`. Empty
  argument: run `node <plugin>/src/hooks/steps-cli.js list` and relay the
  output verbatim. Any other argument: say the toggle arrives in a later
  version and stop (step 3 replaces this line). `<plugin>` is `${CLAUDE_PLUGIN_ROOT}`.

IMPORTS: `src/hooks/lib/steps.js`; `src/hooks/lib/git-read.js`.
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/review-config-cli.js` (6), `src/hooks/lib/review-config.js` (3).

TESTS FIRST: `src/hooks/test-steps-cli.js::LIST_CASES`, columns
`{ name, user, repo, files, args, stdout, exit }`: no config (every line
`default`, one line per Section 1 id); user area off; repo off non-guard; repo off guard
(line stays `on`, warning line names file and key); alias file; `--json`
parses and carries every id.

GATE: `node src/hooks/test-steps-cli.js` exits 0 and the guards.

REVIEW:
1. Does the text output carry state and source for every id, in table order?
2. Is the guard footer printed always, and every warning printed?
3. Does the command relay output without paraphrase?
FAIL: a step missing from the output; a lookup done outside `listSteps`;
a non-zero exit on bad config.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 25 tool calls; one round. Named reader: the owner, at the end (D2).

**3. `/sdlc:steps on|off <area|step> [repo]` toggles one switch and prints the resulting state.**
EXTEND `src/hooks/steps-cli.js`, `src/hooks/test-steps-cli.js`, `commands/steps.md`, `src/hooks/lib/review-config.js`, `src/hooks/test-review-config.js`.

WHAT TO BUILD:
- review-config.js: extract `updateConfigFile(target, mutate)` from
  `setMainModel` (symlink refusal, malformed or non-object refusal, mode kept,
  mkdir, temp file plus rename; returns `{ ok, path, error }`). `setMainModel`
  calls it; its behaviour and messages are unchanged.
- `steps-cli.js set <id> <on|off> [--file user|repo] [--repo <path>]`. A step id
  writes `steps.<area>.<step>`; an area id writes `steps.<area>.enabled`, and
  an area held as a boolean becomes `{ "enabled": <bool> }` first. Every other
  key is kept. The repo file is `repoConfigPath(repoRoot)`.
- Refuse, writing nothing, exit 2: unknown id (list the area ids); `on`/`off`
  missing; `--file repo` on a guard area (`<id> is a guard step; it switches
  in the user file only`); `--file repo` with no repo. Exit 1: the writer refused.
- After a write, print the `list` line for each affected step from a fresh
  `stepStates`, so a winning alias or repo value shows.
- `commands/steps.md`: `on <id>`, `off <id>`, optional trailing `repo`, run
  `set`; relay output; on non-zero relay the error and say nothing was written.

IMPORTS: `src/hooks/lib/steps.js`; `src/hooks/lib/review-config.js` (writer).
ASSUMES LANDED: 1, 2
MUST NOT TOUCH: `src/hooks/review-config-cli.js` (6).

TESTS FIRST: `src/hooks/test-steps-cli.js::SET_CASES`, columns
`{ name, before, args, after, stdout, exit }`: step off in user file; area
off; area boolean to object; repo file non-guard; repo file guard refused,
file unchanged; unknown id; malformed file refused, file unchanged; alias
still wins (prints `alias`). The existing `setMainModel` cases in
`src/hooks/test-review-config.js` stay green.

GATE: `node src/hooks/test-steps-cli.js` exits 0 and `node src/hooks/test-review-config.js`
exits 0 and the guards.

REVIEW:
1. Is there one writer, used by both `setMainModel` and `set`?
2. Can any argument write a guard `false` to a repo file?
3. Is every unrelated key, `mainModel` and `rules` included, kept byte-for-value?
FAIL: a second JSON writer; a guard off written to a repo file; a refusal
that still writes; a `setMainModel` message changed.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls; one or two rounds.

**4. The three feature hooks ask the resolver and keep the feature-tracking.disabled alias through it.**
EXTEND `src/hooks/session-start-feature.js`, `src/hooks/pre-commit-feature.js`, `src/hooks/post-commit-feature.js`, `src/hooks/test-session-start-feature.sh`, `src/hooks/test-pre-commit-feature.sh`, `src/hooks/test-post-commit-feature.sh`.

WHAT TO BUILD:
- Each hook's `fs.existsSync(... 'feature-tracking.disabled')` check is replaced
  by `isStepOn('<its id>', { repoRoot: repo })` at the same point, with the
  same off output: pre-commit `approve('skip-disabled')`, post-commit the
  `skip-disabled` log and return, session-start `{ state: 'disabled' }` (per
  repo found). Warnings per H4. Messages naming the alias stay.

IMPORTS: `src/hooks/lib/steps.js`.
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/pre-commit-review.js` (5), `src/hooks/session-start-instructions.js` (11).

TESTS FIRST: in each of the three suites, the H6 rows plus "alias file still
disables". Red: the user-file-off row.

GATE: `bash src/hooks/test-session-start-feature.sh` and
`bash src/hooks/test-pre-commit-feature.sh` and `bash src/hooks/test-post-commit-feature.sh`
each exit 0 and `grep -c "feature-tracking.disabled')" src/hooks/session-start-feature.js src/hooks/pre-commit-feature.js src/hooks/post-commit-feature.js`
prints 0 for each and the guards.

REVIEW:
1. Is the off output byte-identical to the old disabled output in each hook?
2. Does each `isStepOn` sit exactly where the alias check was, so the
   unreliable-shape and `cd` blocks still run with the step off?
FAIL: H2, H4 or H5 broken; a changed output on the default row.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls (three shell suites); one round.

**5. `pre-commit-review.js` honours `tdd-mandate` and `review-gate` independently.**
EXTEND `src/hooks/pre-commit-review.js`, `src/hooks/test-pre-commit-review.js`.

WHAT TO BUILD:
- In `main`, after the not-a-commit exit: one `stepStates(['tdd-mandate','review-gate'], { cwd: process.cwd() })`.
  Both off: `approve()` with hook.end `via: 'step-off'`, before the shape check.
- `evaluateTddOrderGate` takes the `tdd-mandate` state as a new last argument
  and no longer calls `mandateInForce`; off gives
  `{ action: 'continue', reason: 'step-off:' + state.source }` (alias included).
- `review-gate` off, TDD on: the shape, repo and staged-index checks run as
  today (TDD reads the index, fail-closed); the marker and lock sections are
  skipped; after the TDD gate returns `continue`, approve `via: 'step-off'`
  with no marker and no lock written. With review off, the TDD block also
  writes no BLOCK marker.
- Warnings per H4 (a repo-file guard warning shows here).

IMPORTS: `src/hooks/lib/steps.js`. Fail-closed reads stay on `src/hooks/lib/git-read.js`.
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/lib/tdd-order.js` (owner of the alias), `src/hooks/pending-review-gate.js` (6).

TESTS FIRST: `src/hooks/test-pre-commit-review.js::STEP_CASES`, columns
`{ name, user, repo, staged, expect, marker }`: default (review-required
block); review off, code without test (TDD block, marker: none written); review off, code with test
(approve, no marker, no lock); TDD off (review-required block, no TDD block);
both off (approve); repo review off (still blocks, stderr warning);
tdd-mandate.disabled alias (no TDD block, as today).

GATE: `node src/hooks/test-pre-commit-review.js` exits 0 and
`node src/hooks/test-tdd-mandate.js` exits 0 and
`grep -c "mandateInForce(" src/hooks/pre-commit-review.js` prints 0 and the guards.

REVIEW:
1. With review off and TDD on, is every fail-closed read still before the approve?
2. Can review off leave a marker or lock that a later on-state would accept?
3. Is the both-off approve the only exit that skips the shape check?
FAIL: a fail-closed read weakened while either step is on; a marker or lock
written while review is off; a BLOCK marker written while review is off; the TDD gate skipped while TDD is on.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 35 tool calls (1,348-line hook, 2,556-line suite); one or two rounds.

**6. `pending-review-gate.js` and the plan-review loop honour their steps.**
EXTEND `src/hooks/pending-review-gate.js`, `src/hooks/review-config-cli.js`, `src/hooks/test-review-config.js`, `skills/plan-spec/SKILL.md`.
NEW `src/hooks/test-pending-review-gate.js`.

WHAT TO BUILD:
- pending-review-gate: after the pending-file freshness and lock exits,
  before the deny: `isStepOn('pending-review-gate', { cwd: process.cwd() })`;
  off: `approve()`, no lock written.
- `review-config-cli.js plan-review` adds `enabled` (boolean) and
  `enabledSource` from `stepState('plan-review', { repoRoot })`; resolver
  warnings join `warnings`. Other output keys unchanged.
- SKILL.md, the pre-run review loop: one sentence. When `plan-review` prints
  `enabled: false`, skip the loop and record that in §20.3.

IMPORTS: `src/hooks/lib/steps.js`.
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/pre-commit-review.js` (5), `skills/plan-spec/reference.md`.

TESTS FIRST: `src/hooks/test-pending-review-gate.js::CASES` (H6 rows, fresh
pending file: default denies, off approves and writes no lock);
`src/hooks/test-review-config.js` rows: `enabled` true by default, false from
the user file, true when only the repo file says false.

GATE: `node src/hooks/test-pending-review-gate.js` exits 0 and
`node src/hooks/test-review-config.js` exits 0 and the guards.

REVIEW:
1. Is the existing `plan-review` JSON unchanged apart from the two keys?
2. Does the SKILL.md sentence name the key the CLI prints?
FAIL: H2-H5 broken; a repo file switching plan review off.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 25 tool calls; one round.

**7. `pre-commit-hygiene.js` and `pre-pr-verify.js` honour their steps; the opt-in files stay.**
EXTEND `src/hooks/pre-commit-hygiene.js`, `src/hooks/test-pre-commit-hygiene.sh`, `src/hooks/pre-pr-verify.js`, `src/hooks/test-pre-pr-verify.js`.

WHAT TO BUILD:
- Hygiene: after the not-a-commit `approve()`,
  `isStepOn('pre-commit-hygiene', { cwd: process.cwd() })`; off:
  `endHook('approve', { via: 'step-off' })`, `approve()`. Before any git call
  or config read.
- Verify: after `if (!isPrCreate(command)) approve();`,
  `isStepOn('pre-pr-verify', { cwd: process.cwd() })`; off: `approve()`,
  before the verify-repos read. `enforce` mode included.
- On: both hooks behave as today, opt-in files included.

IMPORTS: `src/hooks/lib/steps.js`.
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/pre-commit-review.js` (5), `src/hooks/lib/verification.js`.

TESTS FIRST: the H6 rows in both suites, on a repo that is opted in (verify
in `enforce` mode with a stale record, so default blocks and off approves),
plus "repo off beats user on".

GATE: `bash src/hooks/test-pre-commit-hygiene.sh` exits 0 and
`node src/hooks/test-pre-pr-verify.js` exits 0 and the guards.

REVIEW:
1. Is the resolver read after the non-commit and non-PR exits only (H1)?
2. Does an unlisted repo still skip, whatever the block says?
FAIL: H1-H5 broken; a config or git read added to non-commit Bash calls.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls; one round.

**8. The three commit-convention hooks honour their steps, from the user file only.**
EXTEND `src/hooks/enforce-co-author.js`, `src/hooks/test-enforce-co-author.sh`, `src/hooks/claude-attribution-note.js`, `src/hooks/test-claude-attribution-note.sh`, `src/hooks/post-commit-notify.js`.
NEW `src/hooks/test-post-commit-notify.js`.

WHAT TO BUILD:
- enforce-co-author: in the segment loop, when `checkCommit` returns a reason
  and `isStepOn('enforce-co-author', { cwd: hookData.cwd || process.cwd() })`
  is false, `approve()`. One resolver read per run. The crash handler stays first.
- claude-attribution-note: after the `git commit`/`--amend` exit, before
  `git rev-parse`: off exits 0 with no note.
- post-commit-notify: inside the commit branch, before the script lookup:
  off runs no notifier.

IMPORTS: `src/hooks/lib/steps.js`.
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/lib/commit-command.js`, `src/hooks/pre-commit-review.js` (5).

TESTS FIRST: H6 rows in each suite (guard: the repo row stays on and warns).
`src/hooks/test-post-commit-notify.js::CASES`: `CLAUDE_COMMIT_NOTIFY` points at
a script that writes a file; default writes it, off does not.

GATE: `bash src/hooks/test-enforce-co-author.sh` exits 0 and
`bash src/hooks/test-claude-attribution-note.sh` exits 0 and
`node src/hooks/test-post-commit-notify.js` exits 0 and the guards.

REVIEW:
1. Can a repo file stop the co-author block?
2. Does co-author read config only on a commit it would block?
FAIL: a guard step off from a repo file; H2-H5 broken.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls; one round.

**9. `orchestrator-mode.js` gains its permanent switch; `enforce-review-implementer.js` honours its step.**
EXTEND `src/hooks/orchestrator-mode.js`, `src/hooks/test-orchestrator-mode.js`, `src/hooks/enforce-review-implementer.js`, `commands/orchestrate.md`.
NEW `src/hooks/test-enforce-review-implementer.js`.

WHAT TO BUILD:
- orchestrator-mode consults `isStepOn('orchestrator-mode', { cwd: input.cwd })`
  only where it would act: turning the mode on, denying an edit, the nudge, and
  the on/off switch. An ordinary prompt, Read, Edit or Bash call never reads
  config. Off: no state is written, no deny, no nudge, nothing is printed, except a `SWITCH_PROMPT` match on
  UserPromptSubmit, which returns additionalContext
  `Orchestrator mode: off (switched off in sdlc-review.json steps; <cmd('steps')> on orchestrator-mode turns it back on).`
  (A4). The command name is built with `cmd('steps')` (`cmd(name)` returns
  `'/' + PLUGIN + ':' + name`) from `src/hooks/lib/plugin-names.js`, already imported at
  `src/hooks/orchestrator-mode.js:24`, not written as a literal. On: unchanged, `/sdlc:orchestrate on|off` included.
- orchestrate.md: one line saying that line can appear and `on` then has no effect.
- enforce-review-implementer: after the `!hasReview || !hasImpl` exit, before
  the message: off gives `approve()`. Repo from `hookData.cwd`.

IMPORTS: `src/hooks/lib/steps.js`.
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/agent-tier-gate.js`, `src/hooks/read-trim.js` (10).

TESTS FIRST: `src/hooks/test-orchestrator-mode.js::STEP_CASES`: off and a
trigger read (no state file), off and `on` prompt (the off line), off and
an Edit on code (no deny), repo off (honoured). The NEW suite: H6 rows on a
prompt asking to apply review findings.

GATE: `node src/hooks/test-orchestrator-mode.js` exits 0 and
`node src/hooks/test-enforce-review-implementer.js` exits 0 and the guards.

REVIEW:
1. With the step off, can any event write orchestrator state, and does an
   ordinary prompt, Read, Edit or Bash call read config?
2. Is the per-session switch unchanged when the step is on?
FAIL: a deny or state write while off; H2-H5 broken.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls; one round.

**10. `agent-tier-gate.js` honours its three steps; `read-trim.js` honours its step.**
EXTEND `src/hooks/agent-tier-gate.js`, `src/hooks/test-agent-tier-gate.js`, `src/hooks/read-trim.js`, `src/hooks/test-read-trim.js`.

WHAT TO BUILD:
- agent-tier-gate: add a `GATED_TYPES` check to the stdin handler (today it
  lives only in `decide` and `decideTier`), then
  one `stepStates(['agent-tier-gate','agent-default-model','context-budget'], { cwd: input.cwd })`,
  passed into `decide(toolInput, on)` and `decideTier(toolInput, on)`.
  `agent-default-model` off: the no-model rewrite returns null.
  `agent-tier-gate` off: the Opus branch returns null (no deny, no ask).
  `context-budget` off: no `withBudget` append. All off: nothing printed. The
  existing fail-open catch stays.
- read-trim `decide`: after the offset/limit exit, before `trimRead`:
  `isStepOn('read-trim', { cwd: input.cwd })`; off returns null.

IMPORTS: `src/hooks/lib/steps.js`; `src/hooks/lib/context-budget.js` (unchanged).
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/orchestrator-mode.js` (9), `src/hooks/lib/context-budget.js`.

TESTS FIRST: `src/hooks/test-agent-tier-gate.js::STEP_CASES`, columns
`{ name, steps, input, expect }`: each step off alone (the other two still
act), all off (no output), area off, repo off (honoured).
`src/hooks/test-read-trim.js`: H6 rows on a long whole-file sub-agent read.

GATE: `node src/hooks/test-agent-tier-gate.js` exits 0 and
`node src/hooks/test-read-trim.js` exits 0 and the guards.

REVIEW:
1. Does each of the three steps switch only its own behaviour?
2. Is the resolver read skipped for non-gated agent types?
FAIL: one switch changing another's behaviour; H1-H5 broken.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls; one round.

**11. `session-start-instructions.js` honours the four standalone steps.**
EXTEND `src/hooks/session-start-instructions.js`, `src/hooks/test-session-start-instructions.js`.

WHAT TO BUILD:
- The hook requires `src/hooks/lib/steps.js` and imports `configDir`,
  `CACHE_TTL_OPT_OUT`, `AUTO_UPDATE_OPT_OUT` from it in place of its own
  `configDir`, `OPT_OUT_FILE` and `AUTO_UPDATE_OPT_OUT_FILE`. The header bullet
  "Self-contained (no requires beyond node built-ins)" is rewritten to say it
  requires lib/ and the test copies lib/.
- `build()`: one `stepStates` for the four ids with `{ cwd }`.
  `session-instructions` off: no `SECTIONS`. `main-model` off: no
  `mainModelLines` (the `"off"` alias already gives none). `marketplace-autoupdate`
  off: no `autoUpdateLines`. `cache-ttl`: off from the block, no
  `cacheTtlWarning`; off from the alias, `cacheTtlWarning(cwd, true)` warns
  and writes nothing (its own `existsSync` replaced by that argument). The
  legacy-install warning is not a step and stays.
- Empty context: print nothing.
- Test helper: copy `src/hooks/lib/` into the scratch layout with `fs.cpSync`.

IMPORTS: `src/hooks/lib/steps.js`.
ASSUMES LANDED: 1
MUST NOT TOUCH: `src/hooks/lib/review-config.js` (3), `defaults/sdlc-review.json`.

TESTS FIRST: `src/hooks/test-session-start-instructions.js::STEP_CASES`: each
step off alone (its part gone, the others kept), the cache-ttl alias (warns,
no write), block off on cache-ttl (no warning, no write), all four off with no
legacy install (no output), repo off for `session-instructions` (honoured).

GATE: `node src/hooks/test-session-start-instructions.js` exits 0 and
`grep -c "OPT_OUT_FILE = \|function configDir" src/hooks/session-start-instructions.js`
prints 0 and the guards.

REVIEW:
1. Is the cache-ttl alias behaviour exactly today's (warn, no write)?
2. Is any opt-out file name or config-dir rule still defined in the hook?
FAIL: H2-H5 broken; a settings.json write while its step is off.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 30 tool calls; one round.

**12. The README, the example config and CLAUDE.md describe the block and `/sdlc:steps`.**
EXTEND `README.md`, `.claude/sdlc-review.json.example`, `CLAUDE.md`.

WHAT TO BUILD:
- README "Turning steps off": lead with the block and `/sdlc:steps`; the schema
  with one example; R1-R6 in plain words, one line each; the Section 1 table
  with a Guard column and an "Alias (still works)" column holding today's
  switches; the alias-wins rule; the opt-in note for hygiene and verify; the
  `/plugin disable` row kept. Plain English, short sentences (CLAUDE.md
  communication style).
- README "The commands": a `/sdlc:steps` row. "Configuration" `sdlc-review.json`:
  add `steps`.
- Example config: a `steps` entry (`"hygiene": true` and an `orchestration`
  object with `enabled` and `read-trim`) and one `_comment` sentence on guard areas, in the top-level `_comment`, not inside `steps`.
- CLAUDE.md "What ships here": a row for `/sdlc:steps` and the resolver.

IMPORTS: none.
ASSUMES LANDED: 1-11
MUST NOT TOUCH: every source file.

TESTS FIRST: none; docs (Section 2).

GATE: `node -e "JSON.parse(require('fs').readFileSync('.claude/sdlc-review.json.example','utf-8'))"`
exits 0 and `grep -c "sdlc:steps" README.md` prints 2 or more and the guards
and the owner confirms, at the end (D2): every Section 1 id appears, every
alias row of HEAD's table survives, the guard rule and alias-wins rule are stated.

REVIEW:
1. Does each README claim match the behaviour steps 1-11 built?
2. Is every alias row from HEAD's table still present?
FAIL: a claim the code contradicts; a dropped alias row.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 20 tool calls; one round.

**13. Close-out: the tracker's batched advisories are applied and the Definition of done holds.**
EXTEND the union of the file sets of steps 1-12, limited to files the
tracker's advisory list names.

WHAT TO BUILD: each advisory and should-fix item listed in the tracker
outside its step's file set, smallest change each. None listed: no source
change; run Section 7 and record it.

IMPORTS: as the step that owns each file.
ASSUMES LANDED: 1-12
MUST NOT TOUCH: any file no tracker item names.

TESTS FIRST: a row in the owning suite per behavioural item; none for docs.

GATE: Section 7, every line.

REVIEW:
1. Does each change map to one tracker item?
FAIL: a change no tracker item names.

ROLLBACK: a single `git revert` of this step's commit.
BUDGET: about 25 tool calls; one round.

## Section 6: What NOT to do

- Do not add the lookup inside a hook, even "just this once". H5. One owner.
- Do not let an invalid value mean off. D7; a typo must not switch off gating.
- Do not move the resolver read above a hook's not-my-call exit. Every Bash
  call would pay a config read (H1; `pre-pr-verify.js` promises "no config
  read, no git" for other calls).
- Do not spawn git in steps.js. The root walk is enough and fails toward on.
- Do not reorder or rewire `hooks/hooks.json`. An off step approves and passes on.
- Do not delete an alias check without routing it through the resolver.
- Do not chase adversarial shell or crafted config in review (Section 2).

## Section 7: Definition of done

Run once, in this order, after step 13. The first line is the one full-suite run.

1. `bash tools/run-tests.sh` exits 0, every file `rc=0`.
2. `claude plugin validate .` exits 0.
3. `node tools/plugin-version.js check` exits 0 on the last commit.
4. `node src/hooks/steps-cli.js list` prints one line per Section 1 id and the guard footer.
5. `grep -ln "feature-tracking.disabled')\|mandateInForce(" src/hooks/*.js | grep -v /test-`
   prints nothing (`src/hooks/lib/tdd-order.js` is outside the glob).
6. `python3 skills/plan-spec/check_citations.py docs/plans/steps-config-block.md steps-config-block` exits 0.
7. The owner clears D2: the `/sdlc:steps` output and the README section.
8. `/sdlc:verify` passes against `features/steps-config-block.md`, then the PR is opened. No push, no merge.

## Section 8: Review findings, disposition

Round 1 (Opus source review):
- F1 folded in: step 1 now exports `configDir` with the file names.
- F2 folded in: step 9 builds the off-line command name with `cmd('steps')`, no `sdlc:` literal.
- F3 folded in: with review off the TDD block writes no BLOCK marker; STEP_CASES row and FAIL list say so.
- F4 folded in: H1 names both exceptions; step 4 keeps the alias position; step 9 reads config only where it acts.
- F5 folded in: step 2 labels are `user file (<key>)` and `repo file (<key>)`.
- F6 folded in: step 10 adds a `GATED_TYPES` check to the stdin handler.
- Below bar, noted, applied: step 12 puts the example `_comment` at top level.

## Section 9: DECISIONS-OPEN

None yet.

## Section 10: As built

Written last, from the tracker.
