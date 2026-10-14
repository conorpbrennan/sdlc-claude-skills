# Verification stage: check a branch against its acceptance criteria before the PR

**Revision 3, 2026-10-14.** Full form (plan-spec §20): nine steps (0–8), several sharing files, more than one sitting.

## 1. What this delivers, and what it does not

**Delivers.** A per-branch check that runs after the per-commit gates (TDD, review, hygiene) and before a PR is opened:

- The feature record `features/<branch>.md` gains an `## Acceptance` section: 2–5 checkable criteria, written when the requirement is captured and before any code.
- A new `sdlc:verifier` agent (Sonnet). It runs the deliverable against each criterion from the outside, without editing anything, and reports PASS, FAIL or UNVERIFIED per criterion with the command and output as evidence. Its report ends `VERIFY_GATE: PASS|FAIL`.
- A `/sdlc:verify` command. It dispatches the verifier, then runs a recorder CLI that checks the report mechanically. The recorder writes a `## Verification — <date> @ <sha>` table into the feature record and, on PASS only, writes a marker at .git/.claude-last-verify.
- A PreToolUse hook on `gh pr create`. It is per-repo opt-in through `~/.claude/verify-repos.json`. In `advisory` mode (the default) it allows the PR and shows the user a notice when verification is missing or stale. In `enforce` mode it blocks.

**Does not deliver.**

- No gate on `git push`, `gh pr merge`, `gh pr ready`, or on a PR opened from the web UI.
- No change to the per-commit gates or to `agents/code-reviewer.md`.
- No change to `tools/analyze-review-timing.py`. The recorder logs a `verify.completed` event, and reporting on it is follow-up work.
- No Claude-visible advisory notice. See D1.
- No defence against adversarial shell around `gh pr create` (`bash -c`, aliases, scripts). This is the bounded threat model in `CLAUDE.md`. Gaps of that shape are ADVISORY and named, not chased.
- No migration of existing feature records. A record with no `## Acceptance` section is treated as unverifiable, which means a notice in advisory mode.
- No change to `stubContent` or `session-start-feature.js`. `/sdlc:feature-new` asks for the criteria.

## 2. Working constraints — these apply to every step

**Branch.** `verification-stage`, cut from origin/main at `98ff0f2` or later. Local `main` is stale (it lacks `src/hooks/lib/hook-output.js`), so run `git fetch origin` first. Step 0 seeds the feature record.

**Where the source lives.** Edit only inside this repository. Never edit `~/.claude/plugins/` (the plugin cache) or anything under `~/.claude/`. A sub-agent that needs the new agent or command before it ships gets the file's body pasted into a general-purpose agent's prompt (step 8).

**Every commit raises the plugin version**, except a commit of only `features/*.md` once step 7 has landed (D8). Run `node tools/plugin-version.js bump` before staging. The hygiene gate runs `node tools/plugin-version.js check` on this repository.

**Commit protocol.** Two Bash commands, never one:

```
git add <the step's files> .claude-plugin/plugin.json <always-permitted paths that changed>
```

then, alone:

```
git commit -m "<subject>" -m "<body>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expect the first attempt to block on `PRE_COMMIT_REVIEW`. The block message is the only source of the marker recipe. No `-a`, no `cd`, no `bash -c`, no script. Keep `$(` out of any command that names a commit.

**Harness facts.**

- The gates read every Bash command in the session, a sub-agent's included. Write any file whose text contains a commit command with the Write tool, not a heredoc.
- A sub-agent's working directory resets between commands. Every command outside the repository root carries its own `cd`.
- The review gate sees `SOURCE_EXTENSIONS` from `src/hooks/lib/source-files.js` (`.js` and `.sh` among them). A `.md`-only diff is not reviewed by the hook. Steps 0 and 8 are docs-only, so the orchestrator reviews them through §21.2 by hand. Every other step carries `.js`.
- Edit documents with `edit_doc.py` from the plan-spec skill directory, never a read-substitute-write loop.

**TDD mandate.** Edit the test file before the implementation file, and stage both in one commit.

**Class-level guards.** Every step's GATE includes all five. Each one scans the repository, so a new file falls under it without being named:

- `node src/test-suite-isolation.js`: every `test-*.js` / `test-*.sh` calls `isolateGitEnv()` (or the shell `unset` line) first.
- `node src/test-plugin-layout.js`: the frozen hook wiring (`EXPECTED_WIRING`), the frozen agent list, the skill list, no hook source outside `src/hooks/lib/plugin-names.js` spelling `sdlc:` in a string literal, and every hook source lexing to the end.
- `node src/hooks/test-source-files.js`: no file in `src/` defines its own `SOURCE_EXTENSIONS` or `EXCLUDE_PATTERNS`.
- `node src/hooks/test-hook-output.js`: every wired PreToolUse hook blocks through `hookOutput.deny` and has a crash handler carrying `permissionDecisionReason`.
- `node src/hooks/test-session-start-instructions.js`: the session context stays at least 1,500 characters under the 10,000-character cap. **Measured 2026-10-14: 8,347 characters, which leaves 153.** Step 8's snippet line must fit in that.

GATE lines below write these five as **GUARDS**.

**Single owners.** Import these, never reimplement them:

| Owner | Owns |
|---|---|
| `src/hooks/lib/git-read.js` | every git read (`gitRead`, `locateRepo`), fail-closed |
| `src/hooks/lib/review-markers.js` | marker paths inside the git dir |
| `src/hooks/lib/hook-output.js` | the PreToolUse output shape (`deny`; step 6 adds `notice`) |
| `src/hooks/lib/feature-file.js` | feature-record parsing (`isFeatureFile`, `isFeatureBranch`; step 1 adds the acceptance and verification functions) |
| `src/hooks/lib/commit-command.js` | shell tokenising (`tokenize`), wrapper words |
| `src/hooks/timing-log.js` | the JSONL timing log (`logEvent`) |
| `src/hooks/lib/plugin-names.js` | every `/sdlc:` and `sdlc:` name in hook code (`cmd`, `agent`); a string literal spelling `sdlc:` fails `test-plugin-layout.js` |
| `src/hooks/lib/isolate-git-env.js` | test isolation |
| `src/hooks/lib/verification.js` (NEW, step 2) | the marker body, both hashes, report parsing, section rendering |

**Implementer tier.** Sonnet. Plan review is Opus. Diff review round 1 is `sdlc:code-reviewer` and any rerun is `sdlc:code-reviewer-deep`.

**Always-permitted paths.** These are never listed in a step's file set and never count against it:

- this plan file
- `features/verification-stage.md`
- the tracker, docs/plans/verification-stage-tracker.md (the orchestrator creates it)
- `docs/plans/verification-stage/reports/`
- `.claude-plugin/plugin.json` (the version bump)

**No client data.** None is involved. Fixtures are synthetic scratch repos under `mktemp -d`.

## 3. Owner decisions

The owner answered on 2026-10-14: "go ahead with plan-spec, use your defaults". The defaults recorded here are those answers.

- **Q1, review-loop cap: 2 rounds.**
- **Q2, unattended authorisation: none.** The harness rule stands: "Stop after the marker is written … wait for the user". Per step, the orchestrator implements, stages, attempts the commit, reviews and writes the marker, then stops for the owner to commit. The owner can widen this at any break.
- **Q3, named-reader conditions: none.** The agent prose in step 4 is judged in its REVIEW field. The owner reads the PR.
- **D1, advisory notice.** Printed as `systemMessage`, which the user sees and Claude does not (`src/hooks/lib/hook-output.js` header, checked against the harness on 2026-10-12). Claude learns the rule from step 8's snippet line instead. Revisit at the switch to enforce.
- **D2, config.** `~/.claude/verify-repos.json`, shaped like `hygiene-repos.json`: `{ "version": 1, "repos": { "<toplevel>": { "mode": "advisory" | "enforce" } } }`. A missing `mode` means `advisory`. A repo not listed is not gated. The env var `VERIFY_REPOS_CONFIG` overrides the path, for tests.
- **D3, history.** The record keeps the latest `## Verification` section only. Each run replaces it. Git history holds the older runs.
- **D4, marker key.** `PASS\n<code-tree-hash>\n<acceptance-hash>\n`:
  - code-tree hash: SHA-1 of `git ls-tree -r --full-tree HEAD` with every `isFeatureFile` path removed;
  - acceptance hash: SHA-1 of the criteria joined by `\n`.
  
  This means committing the feature record (which the recorder itself edits) leaves the marker fresh. Any other committed change, or any edit to the criteria, makes it stale.
- **D5, gated command.** `gh pr create` only.
- **D6, missing pieces.** No `## Acceptance` section, no feature record, or a detached HEAD gives a notice in advisory mode and a block in enforce mode.
- **D7, verifier budget.** At most 20 probe commands or 15 minutes. Past that, the remaining criteria are UNVERIFIED.
- **D8, version policy (added after round 1, default taken).** A commit that carries only `features/*.md` records is exempt from the plugin-version check (step 7). The alternative was to leave the rule alone and drop the live demonstration of criterion 3 in this repository. Exempting is what lets a verification record ship in this repository at all without going stale. The owner may reverse this; reversing it removes step 7 and step 8's GATE line about the hook output after the feature-record commit.
- **D9, how an unlisted repo is recognised (added after round 1).** Before any git read, the hook compares the cwd's real path with the listed toplevels. If no listed toplevel equals the cwd or is an ancestor of it, the hook approves without spawning git. A linked worktree of a listed repo, at a path outside the listed toplevel, is therefore not gated. That gap is named, not chased.

## 4. Prerequisites and ordering

**Before step 0.**

- `git fetch origin`.
- The branch is cut from origin/main.
- The suite baseline below is re-run on the branch and matches.

**Suite baseline, measured 2026-10-14 on `1288617` (the tree equals origin/main at `98ff0f2`).** Every suite is green:

| Suite | Result |
|---|---|
| `test-commit-command.js` | 297/0 |
| `test-fast-path-languages.js` | 74/0 |
| `test-hook-output.js` | 19/0 |
| `test-pre-commit-review.js` | 472/0 |
| `test-protect-user-dir.js` | 13/0 |
| `test-review-markers.js` | 25/0 |
| `test-session-start-instructions.js` | 73/0 |
| `test-source-files.js` | 67/0 |
| `test-tdd-mandate.js` | 188/0 |
| `test-timing-log.js` | 25/25 |
| `test-claude-md-section.js` | 67/0 |
| `test-plugin-layout.js` | 125/0 |
| `test-suite-isolation.js` | 30/0 |
| `test-unmerge-claude-md.js` | 86/0 |
| `test-unmerge-hooks.js` | 22/0 |
| `test-plugin-version.js` | 22/0 |
| all ten `test-*.sh` suites | 0 failed |

Nothing is red, so nothing is out of scope.

**What plays the frozen target (plan-spec §3).** This is a hooks deliverable, so there is no byte target. Step 0 freezes this branch's own `## Acceptance` criteria in their own commit before any code exists. Step 8 checks them through the public interfaces only (the hook's stdin/stdout, the recorder's CLI, the command files), never by importing internals.

**Order.**

```
0 → 1 → 2 → 3 → 4 → 6 → 7 → 8
0 → 5 → 6
```

- 2 needs 1's parsers.
- 3 and 6 need 2.
- 4's format test needs 2's parser. 4 runs before 6, because both edit `src/test-plugin-layout.js`.
- 6 needs 5's detector and 3's recorder (test (e) runs it).
- 7 runs after 6 by choice (see step 7).
- 8 needs everything.

Only steps 3 and 5 may overlap (plan-spec §7a). Step 4 may not overlap either one. Its tests-first edits to `src/test-plugin-layout.js` (a GUARD) and to `src/hooks/test-verification.js` (in step 3's GATE) stay red until `agents/verifier.md` exists, and that would turn the other step's GATE red. Every other pair runs sequentially.

## 5. The steps

**0. This branch's acceptance criteria exist, frozen, before any code**

NEW `features/verification-stage.md` (seeded with `/sdlc:feature-new`, then edited).

WHAT TO BUILD:

- Run `/sdlc:feature-new verification-stage "Add a per-branch verification stage: acceptance criteria in the feature record, a read-only verifier agent, a recorder, and a gh pr create gate that is advisory by default."`.
- Add the section below immediately above `## Files involved`, in exactly the format step 1 parses: one numbered line per criterion, no wrapping.

```
## Acceptance

1. In a scratch repo listed in verify-repos.json with mode enforce, `gh pr create` with no verification marker is denied, and the deny reason names /sdlc:verify; with mode advisory the same command is allowed and a systemMessage names /sdlc:verify.
2. A verifier report whose trailer is VERIFY_GATE: PASS but which has an UNVERIFIED or FAIL row is recorded as FAIL, exits 1, and leaves no marker.
3. After a recorded PASS, committing only the feature record keeps the hook silent; committing a change to any other tracked file makes the hook report the verification as stale.
4. In a repo not listed in verify-repos.json, the hook's whole output for `gh pr create` is `{"decision":"approve"}`, with no systemMessage and no permissionDecision, and it spawns no git process.
5. The `## Acceptance` block written by /sdlc:feature-new's template is read back by parseAcceptance as the same criteria, in order.
```

IMPORTS: none. ASSUMES LANDED: nothing beyond origin/main. MUST NOT TOUCH: every other step's files.

TESTS FIRST: none. This is a docs-only step.

GATE:

- `grep -c '^[1-5]\. ' features/verification-stage.md` prints `5`, and
- `git diff --cached --name-only` lists only `features/verification-stage.md` and `.claude-plugin/plugin.json`, and
- GUARDS.

REVIEW:

1. Can each criterion be settled by running something, the same way twice?
2. Does any criterion name an internal (a function, a file path inside `src/`) where it should name an interface? Criterion 5 names `parseAcceptance` on purpose, because the parser is the interface the record format is written for.
3. Do the five criteria together cover D1–D6?

FAIL if, and only if: a criterion needs judgement to settle, or a decision in D1–D6 has no criterion and no reason recorded in §8.

ROLLBACK: revert the commit.

BUDGET: 10 minutes, one round. The review is by hand (docs-only).

-- status:

---

**1. The feature record has a parsed `## Acceptance` section and a replaceable `## Verification` section**

EXTEND `src/hooks/lib/feature-file.js`, `commands/feature-new.md`, `commands/feature.md`.

NEW `src/hooks/test-feature-file.js`.

WHAT TO BUILD, in `feature-file.js`, exported:

- `ACCEPTANCE_HEADING = '## Acceptance'`.
- `parseAcceptance(content: string) -> string[]`.
  - Reads the lines under `## Acceptance` up to the next `## ` heading.
  - Each criterion is a line matching `^\d+\.\s+(.+)$`, trimmed, in file order.
  - Returns `[]` when the heading is absent or the section holds no numbered line (for example, only a `<!-- -->` placeholder).
  - Numbering is not renumbered or checked for gaps, because the text order is what the hash covers.
- `replaceVerification(content: string, section: string) -> string`.
  - `section` starts `## Verification` and ends with a newline.
  - Replaces an existing block from a line starting `## Verification` up to the next `## ` heading or end of file.
  - With no such block, appends after one blank line at the end.
  - Leaves every other section byte-identical. This includes `## History`, which `prependHistory` keeps editing afterwards.

`commands/feature-new.md`:

- Arguments become `<slug> "<requirement>" ["<criterion>" ...]`.
- With no criteria, ask the user for 2–5 criteria, each checkable by running something. A user who says "later" gets the heading and the placeholder `<!-- 2-5 checkable criteria; /sdlc:verify reads these -->`.
- Fewer than 2 or more than 5: say so and ask again.
- Write or replace the `## Acceptance` section immediately above `## Files involved`, one `N. <criterion>` line each.
- Add the section to the step 5 stub template in the same position, and add one fenced example block of a filled `## Acceptance` section, which step 1's test extracts.
- Never edit an existing `## Verification` section.

`commands/feature.md`: the single-feature view also prints the Acceptance criteria and the first line of `## Verification` when present.

IMPORTS: none new.

ASSUMES LANDED: 0.

MUST NOT TOUCH: `src/hooks/lib/verification.js` (2), `src/hooks/session-start-feature.js` (out of scope, §1).

TESTS FIRST, in `test-feature-file.js` (it starts with `isolateGitEnv()`). Each is red because the export is missing:

- (a) The fenced `## Acceptance` example in `commands/feature-new.md`, extracted from that file at test time (not copied), parses to exactly the criteria it lists, in order. The step 0 section of `features/verification-stage.md`, read from the file, parses to five strings.
- (b) A placeholder-only section, an absent heading, and a section followed directly by `## Files involved` give `[]`, `[]` and its own items, in that order.
- (c) `replaceVerification` on a record with no section appends it. On a record with one, it replaces that block only. A record whose `## Verification` sits between `## Files involved` and `## History` keeps both of those byte-identical.
- (d) `prependHistory` run on the output of (c) still inserts under `## History`.

GATE:

- `node src/hooks/test-feature-file.js` exits 0, and
- `bash src/hooks/test-post-commit-feature.sh`, `bash src/hooks/test-pre-commit-feature.sh` and `bash src/hooks/test-session-start-feature.sh` each report 0 failed, and
- GUARDS.

REVIEW:

1. Does `parseAcceptance` read only the Acceptance section, so a numbered line in `## History` never leaks in?
2. Does `replaceVerification` stop at the next `## ` and not at a `### `?
3. Does (a) read the example from `commands/feature-new.md` at test time, so the command and the parser cannot drift?
4. Does `feature-new.md` say where the section goes, and that `## Verification` is never edited by hand?

FAIL if, and only if: (a)–(d) can pass while the parser reads outside its section; any existing feature-file export changes behaviour; or (a) uses a copy of the example rather than reading `commands/feature-new.md`.

ROLLBACK: revert the commit.

BUDGET: 1 + 1–2.

-- status:

---

**2. One module owns the verification marker, the two hashes, report parsing and section rendering**

NEW `src/hooks/lib/verification.js`, `src/hooks/test-verification.js`.

EXTEND `src/hooks/lib/review-markers.js`, `src/hooks/test-review-markers.js`.

WHAT TO BUILD.

`review-markers.js`:

- `VERIFY_MARKER_NAME = '.claude-last-verify'`.
- `markerPaths()` gains `verify`: the path inside the git dir, or `null` exactly when the others are `null`.

`verification.js`, every function with a JSDoc Args/Returns block as the hook files use, and every git call through `gitRead`:

- `codeTreeHash(cwd) -> string | null`. SHA-1 hex of the `git ls-tree -r --full-tree HEAD` output lines whose path fails `isFeatureFile`. Returns `null` on any read error or with no HEAD. Never hashes an empty read as if it were a tree.
- `acceptanceHash(criteria: string[]) -> string`. SHA-1 hex of `criteria.join('\n')`.
- `dirtyPaths(cwd) -> string[] | null`. Paths from `git status --porcelain -z` (staged, unstaged and untracked) that fail `isFeatureFile`. Returns `null` on a read error.
- `parseReport(text: string, count: number) -> { verdict: 'PASS'|'FAIL', rows: Array<{ n: number, result: 'PASS'|'FAIL'|'UNVERIFIED', evidence: string }>, problems: string[] }`.
  - Format: a markdown table with header `| # | Result | Evidence |`, then one row per criterion.
  - The last non-blank line must be `VERIFY_GATE: PASS` or `VERIFY_GATE: FAIL`.
  - `verdict` is `PASS` only when all of these hold:
    - the trailer is PASS;
    - the rows' `n` values are exactly `1..count`, each once;
    - every row is PASS;
    - every PASS row has non-empty evidence.
  - Each unmet condition adds one plain-English line to `problems`. A PASS row with empty evidence counts as UNVERIFIED.
  - A missing or unrecognised trailer gives FAIL with a problem. It never throws.
- `renderSection({ criteria, rows, verdict, date, shortSha, problems }) -> string`.
  - Heading `## Verification — <date> @ <shortSha>`.
  - A table `| # | Criterion | Result | Evidence |`. The criterion text comes from `criteria`, never from the report, so the verifier cannot reword a criterion.
  - A `|` inside any cell is escaped as `\|`.
  - A criterion with no row renders as UNVERIFIED with evidence `no row in report`.
  - Then `**Verdict**: <verdict>`, then each problem as a `- ` bullet, then a trailing newline.
- `markerBody(tree, acceptance) -> string`. Returns `'PASS\n' + tree + '\n' + acceptance + '\n'`.
- `readMarker(file) -> { tree, acceptance } | null`. Returns `null` when the file is missing, unreadable, or its first line is not `PASS`.
- `checkFresh(cwd, featureContent) -> { state: 'fresh'|'missing'|'stale'|'no-acceptance'|'error', detail: string }`.
  - Order: no criteria → `no-acceptance`; marker path or tree hash `null` → `error`; no PASS marker → `missing`; a hash mismatch → `stale`, with `detail` naming which hash moved; otherwise `fresh`.

IMPORTS: `git-read.js` (`gitRead`, `splitNul`), `review-markers.js` (`markerPaths`), `feature-file.js` (`isFeatureFile`, `parseAcceptance`). Read `ls-tree` and `status` with `-z` and split with `splitNul`.

ASSUMES LANDED: 1.

MUST NOT TOUCH: `src/hooks/record-verification.js` (3), `src/hooks/pre-pr-verify.js` (6).

TESTS FIRST. Each is red because the module is missing:

- In `test-verification.js`, which starts with `isolateGitEnv()` and works in scratch repos under `mktemp -d` / `fs.mkdtempSync`:
  - (a) `codeTreeHash` is unchanged after a commit that touches only `features/x.md`, and changes after a commit to `a.js`.
  - (b) `codeTreeHash` is `null` in a repo with no commits and with `GIT_DIR` pointing at a missing directory.
  - (c) `parseReport` gives PASS for a clean 3-row report. It gives FAIL, with one problem each, for:
    - a PASS trailer with an UNVERIFIED row;
    - a PASS trailer with a FAIL row;
    - a missing row 2;
    - a duplicated row 1;
    - an extra row 4;
    - a PASS row with empty evidence;
    - no trailer;
    - text after the trailer.
  - (d) `renderSection` takes the criterion text from `criteria` when a report row's evidence contains a different sentence, and escapes a `|` in the evidence.
  - (e) `checkFresh` reaches each of its five states.
  - (f) `dirtyPaths` ignores an edited `features/x.md` and reports an untracked `b.js`.
- In `test-review-markers.js`:
  - (g) `markerPaths().verify` sits inside the git dir.
  - (h) Two linked worktrees get different `verify` paths.

GATE:

- `node src/hooks/test-verification.js` exits 0, and
- `node src/hooks/test-review-markers.js` exits 0, and
- GUARDS.

REVIEW:

1. Does every git read fail closed, so no error path returns an empty-but-valid hash or an empty dirty list?
2. Is `verdict: 'PASS'` reachable only when all four conditions hold? Mutate one condition away and confirm a test goes red.
3. Can any report content change a criterion's text in the rendered section?
4. Does `codeTreeHash` exclude exactly `isFeatureFile` paths, imported and not re-expressed as a regex?
5. Does `checkFresh` ever return `fresh` without reading both hashes?

FAIL if, and only if:

- a read error yields a non-null hash or a non-null dirty list;
- PASS is reachable with an UNVERIFIED, FAIL, missing or evidence-less row;
- the rendered criterion text can come from the report;
- the feature-file test is reimplemented;
- the claimed red cannot be confirmed.

ROLLBACK: revert the commit.

BUDGET: 1 + 2. This is the parser-shaped step and the most likely to need the deep rerun.

-- status:

---

**3. A recorder CLI turns a verifier report into the feature-record section and the marker**

NEW `src/hooks/record-verification.js`, `src/hooks/test-record-verification.js`.

WHAT TO BUILD. `node record-verification.js --report <path>`, run from inside the repository:

1. Locate the repo with `locateRepo`. Not a repo, or an error: print the reason to stderr and exit 2.
2. Read the branch with `git rev-parse --abbrev-ref HEAD`. Then read `features/<branch>.md`. A branch failing `isFeatureBranch`, or a missing record, exits 2.
3. Read the criteria with `parseAcceptance`. None: exit 2 with `no ## Acceptance criteria in features/<branch>.md; add them with /sdlc:feature-new`.
4. Run `dirtyPaths`. Non-empty: exit 2 and list the paths, because the evidence would not be evidence about HEAD. `null`: exit 2.
5. Run `codeTreeHash`. `null`: exit 2.
6. Read the report file and run `parseReport(text, criteria.length)`.
7. Write `replaceVerification(record, renderSection(...))` back to the feature record. Use `date` = today and `shortSha` = `git rev-parse --short HEAD`.
8. On PASS, write `markerBody(tree, acceptanceHash(criteria))` to `markerPaths().verify`. On FAIL, delete that file if it exists. The record is written before the marker, so a crash between the two leaves no marker that the record does not back.
9. Log `logEvent('verify.completed', { verdict, criteria, pass, fail, unverified, repo })`.
10. Print the section, then `VERIFY_GATE: <verdict>`. Exit 0 on PASS, 1 on FAIL.

A crash anywhere is caught: print to stderr, exit 2, and write no marker. The recorder never stages and never commits.

IMPORTS: `verification.js`, `feature-file.js`, `git-read.js`, `review-markers.js`, `timing-log.js`, `plugin-names.js` (`cmd('feature-new')` for the message; a literal `/sdlc:` string fails GUARDS).

ASSUMES LANDED: 2.

MUST NOT TOUCH: `src/hooks/pre-pr-verify.js` (6), `agents/` (4).

TESTS FIRST, in `test-record-verification.js` (isolated; scratch repo on a branch `feat-x` with `features/feat-x.md` holding 2 criteria; `HOME` pointed at a scratch directory so the timing log stays off the real one). Each is red because the script is missing:

- (a) A clean PASS report: exit 0, the section is in the record, and the marker body has the expected hashes.
- (b) Acceptance criterion 2: a PASS trailer with one UNVERIFIED row gives exit 1, the record says `**Verdict**: FAIL`, and there is no marker. A marker left by (a) is deleted.
- (c) An untracked `b.js`: exit 2, the record is unchanged, no marker.
- (d) No `## Acceptance`: exit 2 with the message naming `/sdlc:feature-new`.
- (e) Running twice leaves exactly one `## Verification` section.
- (f) `GIT_DIR` broken: exit 2, no marker.

GATE:

- `node src/hooks/test-record-verification.js` exits 0, and
- `node src/hooks/test-verification.js` exits 0, and
- GUARDS.

REVIEW:

1. Is there any path to exit 0 without a PASS from `parseReport`?
2. Does every early exit happen before both the record write and the marker write?
3. Does a FAIL delete a stale PASS marker?
4. Does the CLI run any git command that writes?

FAIL if, and only if:

- a marker can exist after a FAIL, an error or a dirty tree;
- the recorder writes to the index or makes a commit;
- it reimplements a function step 2 owns;
- the claimed red cannot be confirmed.

ROLLBACK: revert the commit.

BUDGET: 1 + 1–2.

-- status:

---

**4. The verifier agent and the `/sdlc:verify` command exist, and the agent's report format is the format the parser accepts**

NEW `agents/verifier.md`, `commands/verify.md`.

EXTEND `src/test-plugin-layout.js`, `src/hooks/test-verification.js`.

WHAT TO BUILD.

`agents/verifier.md`:

- Frontmatter: `name: verifier`, `model: sonnet`, `tools: Bash, Read, Grep, Glob`, and a description that says outside-in, read-only, after review, before the PR.
- The body is the single source for the verifier's contract.
  - **Input:** the feature record path, the requirement, the criteria verbatim, and the HEAD sha.
  - **Method:** for each criterion, run the deliverable through the interface the criterion names (CLI, hook stdin, script, test). Read code only to find entry points, never to judge correctness. That is the reviewer's job.
  - **Results:** PASS needs a command run in this session and its observed output, quoted in Evidence. FAIL means the output contradicts the criterion. UNVERIFIED means the criterion could not be run. UNVERIFIED is never PASS.
  - **No rewording.** The criteria are not reworded, merged or skipped. A criterion the verifier thinks is wrong is UNVERIFIED with the reason.
  - **Constraints:** the same read-only constraints as `agents/code-reviewer.md` § Constraints, stated here in full and not by reference. The agent file is read alone. This means no edits and no index-writing git; the first and last commands are `git status --porcelain -z | sha1sum`; probe files go under `mktemp -d` only.
  - **Budget:** D7.
  - **Output:** a short SUMMARY paragraph, then exactly the table `| # | Result | Evidence |`, then `VERIFY_GATE: PASS|FAIL` as the last line, inside one fenced example block that the test in this step extracts.

`commands/verify.md` (`/sdlc:verify`):

1. Resolve the feature record from the branch. If it is missing, or it has no Acceptance section, say so, point at `/sdlc:feature-new`, and stop.
2. Resolve the recorder path the way `commands/review-timing.md` resolves its analyser: this repository's `src/hooks/record-verification.js` when inside this source repo, otherwise the newest `~/.claude/plugins/cache/*/sdlc/*/src/hooks/record-verification.js`.
3. If `git status --porcelain` shows anything outside `features/*.md`, say so and stop. Verification is of HEAD.
4. Dispatch ONE `sdlc:verifier` sub-agent with the feature record path, the requirement, the criteria verbatim, and the HEAD sha.
5. Write its report verbatim with the Write tool to a file in the session scratchpad.
6. Run `node <recorder> --report <file>` and show its output.
7. On FAIL, list the FAIL and UNVERIFIED rows and stop.
8. On PASS, say the feature record changed. To ship the evidence with the PR, stage it and commit it as two separate commands. Committing it keeps the marker fresh (D4).
9. Never commit and never open the PR on the user's behalf.

`src/test-plugin-layout.js`: the frozen agent list becomes `['code-reviewer-deep.md', 'code-reviewer.md', 'verifier.md']`.

`src/hooks/test-verification.js`, a new block: extract the fenced example from `agents/verifier.md` and assert that `parseReport(example, <its row count>)` gives PASS with no problems.

IMPORTS: none in prose. The test imports `verification.js`.

ASSUMES LANDED: 2 (3 for the command's recorder call to work, not for this step's GATE).

MUST NOT TOUCH: `agents/code-reviewer.md`, `agents/code-reviewer-deep.md`, `skills/` (the skill list is frozen at three; this is a command, not a skill).

TESTS FIRST:

- The plugin-layout agent-list assertion, red until `agents/verifier.md` exists.
- The example-block parse, red because the file is missing.

GATE:

- `node src/test-plugin-layout.js` exits 0, and
- `node src/hooks/test-verification.js` exits 0, and
- `claude plugin validate .` exits 0, and
- GUARDS.

REVIEW:

1. Could a verifier following `verifier.md` literally mark a criterion PASS without running anything?
2. Does the agent say where it must not write, as a full list and not a reference?
3. Does `verify.md` stop before the recorder when the tree is dirty, and does it ever commit, push or open a PR?
4. Is the format in the agent file the one the test extracts, a single block, so a second example cannot drift?
5. Does `verify.md` hand the verifier the criteria verbatim and nothing that rewords them?

FAIL if, and only if:

- the agent permits a PASS without a quoted command and output;
- the agent can edit files or the index;
- the command commits, pushes or opens a PR;
- the extracted example fails `parseReport`;
- `claude plugin validate .` fails.

ROLLBACK: revert the commit.

BUDGET: 1 + 1–2. Most of the step is prose.

-- status:

---

**5. A detector recognises `gh pr create` in a Bash command**

NEW `src/hooks/lib/pr-command.js`, `src/hooks/test-pr-command.js`.

EXTEND `src/hooks/lib/commit-command.js` (exports only).

WHAT TO BUILD.

- `isPrCreate(command: string) -> boolean`. True when any `tokenize()` segment, after skipping shell reserved words, `NAME=value` assignments and the wrapper words `commit-command.js` already skips, has the words `gh`, `pr`, `create` in order as its first three command words.
  - A `gh` given by path (`/usr/bin/gh`, or a relative path to gh) counts, by basename.
  - Text inside quotes, a heredoc body, or `opaque` words never counts. Bounded threat model: `bash -c "gh pr create"` is a named gap, not a target.
  - A wrapper that takes an argument (`timeout 5 gh …`) counts when `commit-command.js` already handles that wrapper's argument. If it doesn't, the case is a named gap.
- `commit-command.js` exports whatever `isPrCreate` needs (for example `commandWord` and `WRAPPER_WORDS`), unchanged. No behaviour change, and its own suite still passes.

IMPORTS: `commit-command.js` (`tokenize` and the newly exported helpers). Copying `WRAPPER_WORDS` or the reserved-word list is a FAIL.

ASSUMES LANDED: nothing beyond 0. It is independent of 1–4.

MUST NOT TOUCH: `src/hooks/pre-pr-verify.js` (6).

TESTS FIRST, in `test-pr-command.js` (isolated). Red because the module is missing.

- True for:
  - `gh pr create`
  - `gh pr create --fill`
  - `GH_TOKEN=x gh pr create`
  - `cd sub && gh pr create`
  - `sudo gh pr create`
  - `/usr/bin/gh pr create -t x`
- False for:
  - `gh pr list`
  - `gh pr view 3`
  - `echo "gh pr create"`
  - `git commit -m "gh pr create"`
  - `gh issue create`
  - `ghx pr create`
  - a heredoc body containing the phrase
  - the empty string

GATE:

- `node src/hooks/test-pr-command.js` exits 0, and
- `node src/hooks/test-commit-command.js` reports 297 passed, 0 failed (unchanged from the baseline), and
- GUARDS.

REVIEW:

1. Is any list copied rather than imported from `commit-command.js`?
2. Do the false cases cover quoted, heredoc and substring shapes?
3. Does the export change alter any `commit-command.js` behaviour?
4. Is each gap named in a comment as bounded-threat-model ADVISORY?

FAIL if, and only if:

- a list is duplicated;
- a quoted or heredoc occurrence returns true;
- `test-commit-command.js` changes result;
- the claimed red cannot be confirmed.

ROLLBACK: revert the commit.

BUDGET: 1 + 1.

-- status:

---

**6. A PreToolUse hook checks verification before `gh pr create`, advisory by default**

NEW `src/hooks/pre-pr-verify.js`, `src/hooks/test-pre-pr-verify.js`, `.claude/verify-repos.json.example`.

EXTEND `hooks/hooks.json`, `src/test-plugin-layout.js`, `src/hooks/lib/hook-output.js`, `src/hooks/test-hook-output.js`, `.gitignore`.

WHAT TO BUILD.

`hook-output.js`: `notice(message: string) -> { systemMessage: string }`, with an Args/Returns block. This is the allow-with-a-notice shape. It carries no `decision` and no `permissionDecision`.

`pre-pr-verify.js`:

- A crash handler is registered before any require, in the inline deny shape of `pre-commit-hygiene.js`.
- The hook reads stdin JSON and takes `tool_input.command`.
- Decisions, in this order. Each ends the hook:
  1. `!isPrCreate(command)` → approve silently (`{"decision":"approve"}`). No git read and no config read. This keeps the cost on every other Bash call at node startup plus the tokenizer.
  2. Read the config (`VERIFY_REPOS_CONFIG`, else `~/.claude/verify-repos.json`). A missing file → approve silently.
  3. D9: if no key of `repos` equals the cwd's real path or is an ancestor of it, approve silently, with no git spawned (acceptance criterion 4). An unparsable config cannot be matched, so it goes to decision 5's deny-or-notice instead.
  4. `locateRepo(cwd)`. `notARepo` → approve silently. Use the listed entry whose key equals `toplevel`. None does (the cwd sat under a listed path inside a different, nested repository) → approve silently.
  5. An unreadable config, an invalid `mode`, or a `locateRepo` error. The mode is the one on the entry matched in decision 3. If the config is unparsable or the mode is invalid, the mode cannot be known and the hook denies. Otherwise enforce denies and advisory gives a notice.
  6. Read the branch. A detached HEAD, a branch failing `isFeatureBranch`, or a missing `features/<branch>.md` is state `no-record` and goes to decision 8 (D6). Otherwise read the record and run `checkFresh`.
  7. `fresh` → approve silently.
  8. Any other state → in `advisory` mode, `notice(...)`; in `enforce` mode, `deny(reason, message)`.
- The message names:
  - the state and its `detail`;
  - the feature-record path;
  - `/sdlc:verify` as the fix;
  - in advisory mode, that the PR is allowed anyway.
- `hooks/hooks.json`: append `node "${CLAUDE_PLUGIN_ROOT}/src/hooks/pre-pr-verify.js"`, timeout 2000, as the last hook of the PreToolUse `Bash` block. Mirror it in `EXPECTED_WIRING` in `src/test-plugin-layout.js`.
- `.claude/verify-repos.json.example`: the D2 shape, one repo, `"mode": "advisory"`, with a `_comment` naming `enforce`.
- `.gitignore`: add the live config path .claude/verify-repos.json, next to the other live configs.

IMPORTS:

- `pr-command.js` (`isPrCreate`)
- `verification.js` (`checkFresh`)
- `feature-file.js` (`isFeatureBranch`)
- `git-read.js` (`locateRepo`, `gitRead`)
- `hook-output.js` (`deny`, `notice`)
- `plugin-names.js` (`cmd('verify')`; a literal `/sdlc:` string fails GUARDS)

ASSUMES LANDED: 2, 3, 5.

MUST NOT TOUCH: `src/hooks/record-verification.js` (3), `agents/` (4).

TESTS FIRST. Red because the hook is missing. In `test-pre-pr-verify.js` (isolated; scratch repo; `VERIFY_REPOS_CONFIG` pointed at a scratch file; the hook run as a child with stdin JSON):

- (a) Acceptance criterion 4: in a repo not listed, the whole stdout parses to `{"decision":"approve"}`. Run it under a PATH shim whose `git` writes a sentinel file and exits 1. The sentinel must not exist afterwards, which proves no git spawn.
- (b) A non-`gh` command in a listed repo approves silently, also under the failing-git shim.
- (c) Acceptance criterion 1, enforce: no marker gives a deny whose `permissionDecisionReason` contains `/sdlc:verify`.
- (d) Acceptance criterion 1, advisory: the same repo state gives no `permissionDecision` and a `systemMessage` containing `/sdlc:verify`.
- (e) Acceptance criterion 3:
  - Write a PASS marker by running `record-verification.js` on a clean PASS report, then commit only the feature record. The hook is silent.
  - Then commit a change to `a.js`. The hook reports `stale`.
- (f) No `## Acceptance` in enforce mode → deny. In advisory mode → notice.
- (g) Enforce mode with a broken `GIT_DIR` → deny.
- (h) A missing feature record, and separately a detached HEAD: enforce → deny; advisory → notice. Both messages name state `no-record`.

In `test-hook-output.js`: `notice('x')` deep-equals `{ systemMessage: 'x' }`. The existing guard then covers `pre-pr-verify.js` automatically, because it is wired.

GATE:

- `node src/hooks/test-pre-pr-verify.js` exits 0, and
- `node src/hooks/test-hook-output.js` exits 0, and
- `node src/test-plugin-layout.js` exits 0, and
- `claude plugin validate .` exits 0, and
- every baseline suite in §4 still reports 0 failed, and
- GUARDS.

REVIEW:

1. In enforce mode, does every error path deny? Probe a broken `GIT_DIR`, an unreadable config, a detached HEAD, and a marker that is a directory.
2. In advisory mode, can anything deny other than the crash handler?
3. On a non-PR command, is there any git spawn or file read? Time the hook on `ls` with `node -e` and quote the number.
4. Does the notice use `hook-output.js`, not a hand-built object?
5. Does the wiring order in `hooks.json` match `EXPECTED_WIRING` exactly?
6. Is each bounded-threat-model gap named in a header comment?

FAIL if, and only if:

- an enforce-mode error approves;
- an unlisted repo or a non-PR command gets any output other than `{"decision":"approve"}`, or a git read;
- an output shape bypasses `hook-output.js`;
- the wiring and its frozen copy differ;
- the claimed red cannot be confirmed.

ROLLBACK: revert the commit. The wiring and the hook land together, so a partial revert would wire a missing script, and `test-plugin-layout.js` would fail.

BUDGET: 1 + 2. A gate that must fail closed gets the deep rerun.

-- status:

---

**7. A commit that carries only feature records passes the plugin-version check**

EXTEND `tools/plugin-version.js`, `tools/test-plugin-version.js`, `CLAUDE.md` (the "Every commit raises the plugin version" bullet only).

WHY NOW: D4 depends on a features-only commit leaving the code tree alone. In this repository the hygiene gate runs `node tools/plugin-version.js check` on every commit, and `checkStaged` refuses a commit whose staged version equals HEAD's. So the commit that ships a verification record is blocked. Bumping the version to get past it changes `.claude-plugin/plugin.json`, which makes the marker stale. (Round 1 finding 1.)

WHAT TO BUILD:

- `checkStaged(cwd)` first lists the staged paths with `gitRead(['diff', '--cached', '--name-only', '-z'], { cwd })` and `splitNul`, from `src/hooks/lib/git-read.js`. `versionAt` keeps its own `spawnSync` read unchanged.
- When that list is non-empty and every path passes `isFeatureFile` (imported from `src/hooks/lib/feature-file.js`), return `{ ok: true, reason: null }` without comparing versions.
- A failed path read returns `{ ok: false, reason }`, the same as any other unreadable state in this tool.
- Otherwise behaviour is unchanged.
- `CLAUDE.md`: the bullet gains one sentence: "A commit that carries only `features/*.md` records is exempt: it ships no plugin content, and the verification marker depends on it leaving the version alone."

IMPORTS: `src/hooks/lib/feature-file.js::isFeatureFile`, `src/hooks/lib/git-read.js::gitRead`, `src/hooks/lib/git-read.js::splitNul`.

ASSUMES LANDED: nothing. It is independent of 1–6, but runs after 6 so that the version policy changes only once the gate that needs it exists.

MUST NOT TOUCH: `README.md` and `instructions/` (8).

TESTS FIRST, in `tools/test-plugin-version.js`, red because the check refuses today:

- (a) A scratch repo with only `features/x.md` staged and the version unchanged: `check` exits 0.
- (b) `features/x.md` plus `a.js` staged, version unchanged: exit 1. This one stays green and guards against over-exemption.
- (c) Nothing staged, version unchanged: exit 1 (unchanged behaviour).

GATE:

- `node tools/test-plugin-version.js` exits 0, and
- GUARDS.

REVIEW:

1. Can any staged path that is not a feature record reach the exemption?
2. Does a failed read of the staged paths ever exempt?
3. Is `isFeatureFile` imported rather than re-expressed?

FAIL if, and only if: a non-feature path is exempted; a read error exempts; or the feature-file test is duplicated.

ROLLBACK: revert the commit. Then step 8's feature-record commit needs a version bump, and the live demonstration of criterion 3 in this repository is lost.

BUDGET: 1 + 1.

-- status:

---

**8. The docs name the stage, and this branch is verified against its own criteria**

EXTEND `README.md`, `CLAUDE.md`, `instructions/feature-workflow-snippet.md`, `features/verification-stage.md` (its `## Verification` section, written by the recorder).

WHAT TO BUILD.

`README.md`:

- The loop diagram gains a `verify` stage after review: `/sdlc:verify ─► verifier sub-agent ─► VERIFY_GATE: PASS|FAIL`, then `gh pr create (gated per repo)`.
- The "What gets installed where" table gains `agents/verifier.md`, `commands/verify.md`, `src/hooks/pre-pr-verify.js` and `src/hooks/record-verification.js`.
- Configuration names `verify-repos.json` and its two modes.

`CLAUDE.md`: the "What ships here" table gains the verifier agent, `/sdlc:verify` and the PR gate.

`instructions/feature-workflow-snippet.md`: one line, at most 150 characters, for example:

`Before \`gh pr create\` in a repo listed in \`~/.claude/verify-repos.json\`, run \`/sdlc:verify\`; criteria live under \`## Acceptance\`.`

**Dogfood.**

- Load `agents/verifier.md`'s body into a general-purpose sub-agent (the installed plugin has no `sdlc:verifier` yet).
- Give it this branch's five criteria and the HEAD sha.
- Write its report to the scratchpad.
- Run `node src/hooks/record-verification.js --report <file>`.

Order inside the step, because the docs commit changes the code tree and D4 would make an earlier verification stale:

1. Write §10 As built from the tracker, and the tracker's step 8 line, before anything else. Commit them with the docs (reviewed by hand). After this commit, nothing touches the plan or the tracker until step 3 below has landed, because any other committed or uncommitted path makes the verification stale (D4) or stops the recorder.
2. Run the dogfood verification against that commit.
3. Commit the feature record alone, with no version bump (step 7). A features-only commit is bookkeeping, so the feature hook passes it, and D4 keeps the marker fresh. That is acceptance criterion 3, shown live.

This is the one step with two commits. The second carries only an always-permitted path.

IMPORTS: none.

ASSUMES LANDED: 0–7.

MUST NOT TOUCH: every code file.

TESTS FIRST: none. Docs, plus a run of the deliverable.

GATE:

- `node src/hooks/test-session-start-instructions.js` exits 0 (the headroom assertion included), and
- `node src/test-plugin-layout.js` exits 0, and
- `node src/hooks/record-verification.js --report <the dogfood report>` exited 0, and
- `features/verification-stage.md` holds `**Verdict**: PASS` under a `## Verification` heading naming the short sha of the docs commit, and
- after the feature-record commit, the hook run on `gh pr create` with this repository listed in enforce mode in a scratch `VERIFY_REPOS_CONFIG` prints only `{"decision":"approve"}`, and
- GUARDS.

If the dogfood run gives FAIL, the step does not close. Each FAIL or UNVERIFIED row is a plan-spec §18.6 inserted step (`6a`, `6b` …), written into this plan before dispatch.

REVIEW (by hand, docs-only):

1. Does every path named in the docs resolve?
2. Do the docs call the mode `advisory` by default, and say the notice is shown to the user, not to Claude (D1)?
3. Does the verification table's evidence for each criterion quote a command and its output?

FAIL if, and only if: a doc names a path that does not exist, the docs contradict D1–D6, or a PASS row lacks a command.

ROLLBACK: revert the commit.

BUDGET: 30 minutes. The dogfood verifier run is the long pole, at 10–15 minutes.

-- status:

## 6. What NOT to do

- **Do not let the verifier write the record or the marker.** It is read-only by definition, the same as the reviewer (plan-spec §10). The recorder writes both, from a parsed report.
- **Do not key the marker on the whole HEAD tree, or on the feature record's hash.** The recorder edits the record, and committing it would make every verification stale at once. D4 is the fix.
- **Do not take criterion text from the report.** A verifier that rewords "denies" to "warns" and then passes it has verified a different requirement.
- **Do not gate `git push`.** People push work in progress. D5.
- **Do not add a fourth skill.** `src/test-plugin-layout.js` freezes three, and a command plus an agent is the existing review pattern.
- **Do not grow the session snippet past one line.** There are 153 characters of headroom (§2).
- **Do not chase `bash -c "gh pr create"`, aliases, or script indirection.** Name them as gaps (`CLAUDE.md` § Code Review).
- **Do not run the verifier on every commit.** The per-commit gates already cost a review per commit, and criteria describe the feature, not a step.

## 7. Definition of done

**Run in this order, on verification-stage at its final commit.**

1. Every suite in §4's baseline reports 0 failed. This is the single full-suite run:
   ```
   for t in src/hooks/test-*.js src/test-*.js tools/test-*.js; do node "$t" | tail -1; done
   for t in src/hooks/test-*.sh src/test-*.sh; do bash "$t" | tail -1; done
   ```
2. The new suites are among them and green:
   - `test-feature-file.js`
   - `test-verification.js`
   - `test-record-verification.js`
   - `test-pr-command.js`
   - `test-pre-pr-verify.js`
   - `tools/test-plugin-version.js` with step 7's cases
3. `claude plugin validate .` exits 0.
4. `features/verification-stage.md` carries `## Acceptance` (committed in step 0, unchanged since: `git log --format=%h -L '/^## Acceptance/,/^## Files/:features/verification-stage.md'` shows only step 0's commit) and a `## Verification` section with `**Verdict**: PASS`.
5. Every step's commit was reviewed with a `TDD_GATE: PASS` marker, or a hand review for steps 0 and 8, each recorded in the tracker.
6. `.claude-plugin/plugin.json`'s version is above origin/main's.

## 8. Review findings — disposition

**Round 1, 2026-10-14. Opus, input: the source on origin/main. Verdict NOT YET, 4 findings, all accepted.**

1. *Critical.* In this repo, a features-only commit is blocked by the plugin-version check, so D4 cannot hold for step 8. A bump goes stale, and plan or tracker edits stop the recorder. **Accepted.** Added step 7 (exempt features-only commits) and D8. Step 8 now commits the as-built record and the tracker with the docs, before the dogfood run.
2. *High.* Criterion 4 ("no output", "no git read") contradicted the approve JSON and the `locateRepo`-first order, and test (a) would deny. **Accepted.** Added D9 (match cwd against the config before any git call). Reworded criterion 4, test (a) and step 8's GATE to "only `{\"decision\":\"approve\"}`". Folded in before step 0 freezes the criteria.
3. *Medium.* `test-plugin-layout.js` bans `sdlc:` literals in hook code. `plugin-names.js` was missing from the owners table and from steps 3 and 6. §2 described the test wrongly. **Accepted.** Added the owner and the imports, corrected the guard list, and added `test-source-files.js` as a fifth guard.
4. *Medium.* Step 6 test (e) runs step 3's recorder, but 6 did not assume 3. **Accepted.** ASSUMES LANDED for 6 is now 2, 3, 5, and the graph shows it.

Below the bar, two folded in because each costs one clause: `parseAcceptance` and `-z` in step 2's IMPORTS. Noted, not actioned:
- `status` without `-uall` collapses an untracked `features/` directory, which fails safe;
- the `timeout 5 gh` case is ambiguous and no test depends on it;
- `TIMING_LOG_PATH` exists as an alternative to a scratch `HOME`, and either works.

**Round 2, 2026-10-14. Opus, input: the document itself (internal consistency). Verdict NOT YET, 4 findings, all accepted. This round reached the cap (Q1 = 2), so the loop ends here, and these fold-ins are unreviewed by any round (plan-spec §2b).**

1. Step 0's FAIL line requires each of D1–D6 to have a criterion or a reason recorded here. D3, D5 and D6 had neither. **Accepted, with reasons.** None is a criterion because the cap is five and all five are taken by the behaviours a PR author meets. D3 is tested by step 3 (e), D5 by step 5's false cases, D6 by step 6 (f), (g) and (h).
2. Step 4's tests-first edits make GUARDS and step 3's GATE red while step 4 is mid-build, so it cannot overlap 3 or 5. The graph also left 4 unplaced against 6, and both edit `src/test-plugin-layout.js`. **Accepted.** The graph is now linear through 4 → 6. Only 3 and 5 overlap.
3. Step 6 had no decision for D6's no-record cases, and decision 5's mode source after a `locateRepo` error was unstated. **Accepted.** Added state `no-record` in decision 6, the mode source in decision 5, and test (h). Default taken: a non-feature branch such as `main` is `no-record` (notice or block), as D6 reads.
4. A step 6 FAIL line said "gets output", which contradicts criterion 4. **Accepted.** It now reads "any output other than `{\"decision\":\"approve\"}`".

Below the bar, folded in at one clause each: the header's revision and step count, D8's reference to step 8's GATE, and §2's version rule now naming the D8 exception. Noted, not actioned: a plan or tracker edit committed after step 8's last commit makes the shipped verification stale. That is the designed behaviour, and an advisory notice says so.

## 9. DECISIONS-OPEN

**Step 1, 2026-10-14 (implementer, conservative option taken).**

- The filled example in `commands/feature-new.md` is the one column-0 fenced block whose first line is `## Acceptance`. The stub template stays indented. Test (a) requires exactly one such block.
- `## Acceptance` and `## Verification` match by line prefix. A section ends at the next `^## `, never at `### `.
- `replaceVerification` writes `section` then one blank line before the next heading, or `section` alone at end of file. Appending trims trailing whitespace first, then adds one blank line.
- A "later" answer to `/sdlc:feature-new` leaves an existing `## Acceptance` section alone, so real criteria are never replaced by the placeholder.

## 10. As built

(Written last, from the tracker.)
