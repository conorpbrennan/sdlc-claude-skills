# Pre-PR whole-branch review gate

Status: draft revision 1. Tier T1. Branch: branch-review-pre-pr-1 (cut from main).

## 1. What this delivers, and what it does not

Delivers a whole-branch review that runs before `gh pr create`, built like the pre-commit gate:

- The skill and command `/sdlc:branch-review`. Claude runs it. It dispatches ONE `sdlc:code-reviewer-deep`
  sub-agent (Opus) on `<base>...HEAD`. The reviewer reads changed files whole and across files and
  answers seven interaction questions, each with `file:line` evidence or "none found, checked X, Y".
- A report parser and a CLI, so the verdict is settled by a script and not by Claude's reading.
- A marker, written by the printf recipe the hook prints. It holds HEAD and a hash of the branch diff.
- A PreToolUse hook `pre-pr-branch-review.js` on `gh pr create`. It only checks the marker. It never
  runs the review. Advisory by default, enforce per repo, fail closed.
- A `branchReview` section in `sdlc-review.json`: reviewer model, round cap, changed-line cap.

Evidence for the design, as counts. On one real branch (about 21k changed lines, 113 files) a
whole-branch review with this prompt found all 3 defects a post-PR reviewer found, plus 4 more, each
with a CONFIRMED probe. The per-commit reviewer missed all 7: it reads one staged diff and the
enclosing function. That one pass cost 132k tokens and 10 minutes.

Does not deliver:

- No change to `pre-pr-verify.js`, `verify-repos.json` or the pre-commit gate.
- No fixing by the reviewer (report-only), no gate on `git push`, `gh pr merge` or a web PR.
- No check of uncommitted changes: the review covers commits. The CLI reports a dirty tree as a warning.
- No automatic split into parallel reviewers. A split runs the passes one after another.

## 2. Working constraints

Apply to every step. A step does not repeat them.

- Plugin repo rules (`CLAUDE.md`): work in this worktree only, never in `~/.claude/plugins/`. Hook
  source is `src/hooks/`. Tests sit beside the code (src/hooks/test-X.js, src/test-X.js).
  Every commit raises the plugin version: the orchestrator runs `node tools/plugin-version.js bump`
  BEFORE staging and stages `.claude-plugin/plugin.json` with the step.
- Baseline gate, part of every step's GATE: `node src/test-plugin-layout.js` exits 0 and
  `node src/test-suite-isolation.js` exits 0 and `claude plugin validate .` exits 0.
  Class-level guards: `src/test-plugin-layout.js` (hook wiring, skill and command names, bare
  slash-command scan, no stale paths), `src/test-suite-isolation.js` (git env in suites),
  `src/hooks/test-session-start-instructions.js` (instruction size cap).
- Suite baseline at HEAD: `bash tools/run-tests.sh` printed 49 files, 0 failed. It also printed
  "pytest is not installed; skipped skills/plan-spec". The one full-suite run is in section 7.
- Single owners (import, never reimplement):
  - `src/hooks/lib/git-read.js`: every git read (`gitRead`, `locateRepo`, `splitNul`,
    `HASH_EXCLUDE_PATHSPECS`). Nothing else spawns git for a read.
  - `src/hooks/lib/hook-output.js`: `deny` and `notice` shapes.
  - `src/hooks/lib/plugin-names.js`: `cmd`, `agent`, `skill`. No hook literal spells `sdlc:`.
  - `src/hooks/lib/review-markers.js`: marker file names and `markerPaths`.
  - `src/hooks/lib/pr-command.js`: `isPrCreate`.
  - `src/hooks/lib/steps.js`: step switches.
  - `src/hooks/lib/review-config.js`: `sdlc-review.json` layers.
  - Search that found them: `grep -rn "gitRead\|isPrCreate\|stepState" src/hooks --include=*.js`.
- New modules are owners too: `src/hooks/lib/branch-review.js` (S1), `src/hooks/lib/branch-repos-config.js`
  (S2), `src/hooks/lib/branch-report.js` (S3), `src/hooks/lib/branch-repos-write.js` (S6b). Later steps
  import them.
- Code standards (QDS): no in-line imports, no hard-coded strings (module constants), Args and Returns
  comments on every function (the repo's JS style, as in `src/hooks/lib/git-read.js`). Flag pre-existing
  violations, do not refactor them.
- Harness facts. The gates read every Bash command, a sub-agent's included: write files with the file
  tool, keep `$(` out of any command that names a commit. A sub-agent's cwd resets: every command
  outside the repo root carries its own `cd`. Apply multi-edit changes to documents with
  `skills/plan-spec/edit_doc.py`. Only `.js`, `.md`, `.json` change in this plan: the gates see them.
- Commit protocol. Three separate Bash commands per step: (1) `node tools/plugin-version.js bump`;
  (2) `git add` the step's files, `.claude-plugin/plugin.json` and the tracker; (3) attempt
  `git commit -F <message file>` once and expect the block. The message file is written with the
  file tool and ends with the co-author line the session's attribution reminder gives. On review
  PASS run the block's printf recipe verbatim, then retry the commit.
- Always-permitted paths, never listed in a step and never counted: this plan, the tracker,
  `features/branch-review-pre-pr.md` (the commit machinery rewrites it), `.claude-plugin/plugin.json`
  (the version bump) and the run's report directory `run/reports/`.
- Implementer tier: Sonnet (section 9 of the reference). Reviewer: round 1 `sdlc:code-reviewer`,
  round 2 `sdlc:code-reviewer-deep`, models from `sdlc-review.json`. Cap 2 rounds.
- Handoff rule. Work picked up from a handoff runs in sub-agents, never in the main session. The main
  session reads the handoff, writes the step brief, dispatches the implementer, runs the review and
  commits. It never edits source. A fix found mid-run goes to a fresh fix agent. An investigation that
  chases a difference goes to an agent. One fresh agent per role per round. Every handoff says this.
- No client data in the repo. The evidence counts above carry no identifiers.
- Rollback for every step: one `git revert` of its commit.
- TESTS FIRST: run the test file once and see it fail before writing code.
- Threat model: gates guard honest mistakes, not adversarial shell; unusual shapes are ADVISORY.
- Wording used below. "Block" means the `hook-output.js` deny shape. "Notice" means its `notice` shape.
  "Approve" means `{"decision":"approve"}`.

## 3. Owner decisions

Taken before the run. Not reopened.

1. New hook with its own step switch and config key. It does not extend `pre-pr-verify.js`.
2. Base branch: `git symbolic-ref refs/remotes/origin/HEAD`. A `base` key in the repo's config entry
   overrides it. If neither resolves: block (enforce) or notice (advisory).
3. Standing authorisation. The orchestrator may stage, commit after each step's review PASS, and
   dispatch fix agents without asking each time. It never pushes, never opens a PR, and stops after
   two FAILs on one step. This overrides three defaults, quoted:
   - the Bash tool rule "Commit or push only when the user asks";
   - `skills/code-review-pre-commit/SKILL.md` post-review: "Do **not** commit: staging and committing
     are the user's separate commands";
   - `instructions/claude-md-snippet.md`: "Stop after the marker is written."
   It does not override "staging and committing are two separate Bash commands": that stays.
4. Reviewer: `code-reviewer-deep` on Opus, one pass. Above a configurable changed-line cap the skill
   splits the diff by directory and adds one cross-file pass. The cap is `branchReview.maxChangedLines`
   in `sdlc-review.json`, default 25000.
5. Default mode advisory. Round cap 2.
6. No named-reader conditions. Every GATE is a script. Nothing is batched for the owner.

Proposed by the planner, not owner-settled. Each is cheap to reverse in the step named:

- P1. Config lives in a NEW file `~/.claude/branch-review-repos.json`, not a key in `verify-repos.json`.
  Why: one file per gate keeps them independently switchable. A repo can be `enforce` for verify and
  `advisory` for branch review. A parse error in one file cannot block the other gate. Cost: a second
  file to seed. Bites S2, S5.
- P2. A new step area `branch-review`, not the existing `verification` area. Why: `/sdlc:steps off
  verification` would otherwise switch both gates off together. Bites S5.
- P3. A CLI `branch-review-cli.js` (S6) owns base resolution, the changed-line count, the split groups
  and the marker recipe, so the skill does not restate them in prose. Bites S6, S7.
- P4. A report parser (S3) so "a bare none is rejected" is checked by a script as well as by the
  reviewer. Bites S3, S6.
- P5. The hook does not read the round in the marker tag. The skill enforces the round cap
  (`maxRounds`). The pre-commit hook does check it. Gap named, ADVISORY. Bites S5.
- P6. Marker freeze: the diff hash excludes `features/*.md` (same pathspec as the staged-diff hash).
  Staleness is judged on the hash alone. The marker keeps HEAD for the detail line only, because
  `commands/verify.md` has the user commit the feature record after /verify. Bites S1.
- P7. An empty range (no commits ahead of base) is reported as state `empty`: notice or block, never
  approve. A wrong `base` equal to HEAD must not wave a PR through. Bites S1, S5.

## 4. Order and seams

Order: S1, S2, S3, S4, S5, S6, S6b, S6c, S7, S8. No frozen target. The characterisation role is played by the
existing suites (49 files green at HEAD) and by `test-pre-pr-verify.js`, which S5 models its table on
and must leave untouched. S2 and S3 only need HEAD, so S1 to S4 can land in any order; the run keeps
the listed order. S5 needs S1 and S2. S6 needs S1 to S4. S6b needs S2 (added after the plan reviews, by
owner request). S6c needs S2, S5, S6 and S6b (same request). S7 needs S3, S6 and S6c. S8 needs all.

Seam table (one row per artefact that crosses between steps):

| artefact | producer | consumer | shape |
|---|---|---|---|
| `markerPaths(cwd).branch` | S1 | S1, S5, S6 | string path in the git dir, `.claude-last-branch-review`; null when no repo |
| `src/hooks/lib/branch-review.js::resolveBase` | S1 | S5, S6 | `(cwd, configBase) -> { ref, source, error }`; source `config` or `origin-head`; `ref` null on error |
| `src/hooks/lib/branch-review.js::readBranch` | S1 | S5, S6 | `(cwd) -> { name, detached, error }` |
| `src/hooks/lib/branch-review.js::numstat` | S1 | S1, S6 | `(cwd, base) -> [{ path, added, removed }] or null` |
| `src/hooks/lib/branch-review.js::groupByTopDir` | S1 | S6 | `(entries) -> [{ dir, files: [path], lines }]` sorted by dir; root files in dir `.` |
| `src/hooks/lib/branch-review.js::markerRecipe` | S1 | S5, S6 | `({ toplevel, markerPath, base, tag }) -> string` |
| `src/hooks/lib/branch-review.js::RECIPE_TAG` | S1 | S5, S6 | string `code-reviewer-deep:round<n>` |
| `src/hooks/lib/branch-review.js::checkFresh` | S1 | S5 | `({ cwd, base, markerFile }) -> { state, detail }`; state in `fresh missing stale empty error` |
| `src/hooks/lib/branch-repos-config.js` | S2 | S5, S6, S6b, S6c | `configPath()`, `readReposConfig(p)`, `modeOf(entry)`, `baseOf(entry)`, `entryFor(repos, dir) -> { key, entry }` or null, `ownEntry(repos, toplevel) -> { key, entry }` or null, `normalize(p)`, `realNormalized(p)` |
| `src/hooks/lib/branch-report.js::parseReport` | S3 | S6 | `(text) -> { verdict, sections, confirmed, plausible, blocking, problems }`; `blocking` counts CONFIRMED CRITICAL findings |
| `resolveBranchReview` | S4 | S4 CLI, S6 | `({ repoRoot }) -> { model, maxRounds, maxChangedLines, warnings }` |
| step id `pre-pr-branch-review` | S5 | S8 | in area `branch-review`; opt-in detail string names the config file |
| `branch-review-cli.js plan` | S6 | S7 | JSON; keys listed in S6 |
| `branch-review-cli.js check-report` | S6 | S7 | `<file> -> parseReport JSON`; exit 0 PASS, 1 FAIL, 2 usage |
| `branch-review-cli.js enable\|disable\|status` | S6c | S7 | one JSON line each; exit 0 ok, 1 refused or failed, 2 usage; keys listed in S6c |
| `src/hooks/lib/branch-repos-write.js` | S6b | S6c | `enableRepo({ configPath, toplevel, mode }) -> { ok, action, key, mode, error }`; `disableRepo({ configPath, toplevel }) -> { ok, removed, key, error }`; `action` in `created added updated unchanged` |
| `status` line | S6c | S7, section 7 | `{ step: on or off, listed, mode: advisory or enforce or null, base, baseSource, configPath, warnings }` |
| marker body | S1 recipe | S1 `checkFresh` | `PASS\n<head sha>\n<branch diff hash>\n<tag>`; HEAD is for the detail line only |
| report layout | S3 parser | S7 prompt | headings `## Q1` to `## Q7`, `### F<n> CONFIRMED|PLAUSIBLE CRITICAL|IMPORTANT|ADVISORY`, last line trailer |

## 5. The steps

**S1. A library that resolves the base, hashes the branch diff and judges a branch marker.**
EXTEND `src/hooks/lib/review-markers.js`, `src/hooks/test-review-markers.js`.
NEW `src/hooks/lib/branch-review.js`, `src/hooks/test-branch-review.js`.

WHAT TO BUILD:
- `review-markers.js`: add `BRANCH_MARKER_NAME = '.claude-last-branch-review'`, export it, and add a
  `branch` path to `markerPaths` (null when no repo).
- `branch-review.js`, all git reads through `gitRead`:
  - `readBranch(cwd)`: `git rev-parse --abbrev-ref HEAD`; `detached` true when the output is `HEAD`.
  - `resolveBase(cwd, configBase)`: if `configBase` is a string use it (source `config`), else run
    `git symbolic-ref --quiet refs/remotes/origin/HEAD`, strip `refs/remotes/` (source `origin-head`).
    Reject a ref that starts with `-`. Then `git rev-parse --verify --quiet <ref>^{commit}` must succeed.
    Any failure gives `ref: null` and a one-line `error` that says what to set (`base` in the config
    entry, or `git remote set-head origin -a`).
  - `numstat(cwd, base)`: `git diff --numstat -z --no-renames <base>...HEAD -- <HASH_EXCLUDE_PATHSPECS>`.
    A binary row (`-`) counts 0 lines. null on a read error.
  - `groupByTopDir(entries)`: group by first path component; `lines` is added plus removed.
  - `diffHash(cwd, base)`: raw bytes of `git diff --no-ext-diff --no-textconv --text <base>...HEAD --
    <HASH_EXCLUDE_PATHSPECS>`, SHA-1 of `'blob ' + length + NUL + bytes`, as `stagedDiffHash` does.
    null on a read error. It must equal the shell pipeline in `markerRecipe`.
  - `markerRecipe({ toplevel, markerPath, base, tag })`: a single-quoted-safe printf command that
    recomputes both values at write time:
    `printf 'PASS\n%s\n%s\n%s' "$(git -C '<top>' rev-parse HEAD)" "$(git -C '<top>' diff
    --no-ext-diff --no-textconv --text '<base>...HEAD' -- ':(top,exclude)features/*.md' | git -C
    '<top>' hash-object --stdin)" '<tag>' > '<markerPath>'` on one line. Quote with the same
    single-quote escaping as `shellQuote` in `pre-commit-review.js`. Do not import that file.
  - `readMarker(file)`: `{ head, diff, tag }`; null when missing, unreadable, first line not `PASS`,
    or line 2 or 3 empty. Tag may be empty.
  - `checkFresh({ cwd, base, markerFile })` order: `numstat` null gives `error`; zero rows gives
    `empty`; no marker gives `missing`; the hash unreadable gives `error`; a hash that differs from the
    marker's gives `stale`; else `fresh`. Judge on the hash alone; the marker's HEAD is for the detail
    line only.
- State names are module constants.

INTERFACES: Return shapes: resolveBase `{ref,source,error}`; readBranch `{name,detached,error}`;
numstat `[{path,added,removed}]`; groupByTopDir `[{dir,files,lines}]` with `files` an array of paths;
checkFresh `{state,detail}`. Export those, plus `diffHash`, `readMarker`, `RECIPE_TAG` (the string
`code-reviewer-deep:round<n>`) and `STATE` with keys FRESH, MISSING, STALE, EMPTY, ERROR.

IMPORTS:
- `src/hooks/lib/git-read.js`: `gitRead`, `splitNul`, `HASH_EXCLUDE_PATHSPECS`.
- `src/hooks/lib/review-markers.js`: `markerPaths`.

ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `src/hooks/lib/git-read.js`, `src/hooks/pre-commit-review.js`, every S2 to S8 path
(S6b and S6c included).

TESTS FIRST: `src/hooks/test-branch-review.js` and one added row in `src/hooks/test-review-markers.js`.
At most eight test blocks, table-driven, in a scratch repo with an `origin` remote:
- `resolveBase` table. Columns: setup, configBase, expected `{ source, refNull }`. Rows: origin/HEAD set;
  configBase valid; configBase names a missing ref; origin/HEAD unset and no configBase; configBase
  `-x`.
- `checkFresh` table. Columns: marker state, expected state. Rows: fresh; no marker; new commit
  touching a non-feature file after the marker (stale); a commit touching only `features/*.md` after
  the marker (fresh); branch has no commit ahead of base (empty); marker with line 3 blank; git dir
  unreadable.
- Recipe round trip: write the marker by running `markerRecipe` through `bash -c` from a subdirectory,
  then `checkFresh` is `fresh`.
- `numstat` and `groupByTopDir`: a binary file, a root file, two directories.
- `test-review-markers.js`: the `branch` path differs from the other marker paths and from a linked
  worktree's.

GATE: `node src/hooks/test-branch-review.js` exits 0 and `node src/hooks/test-review-markers.js` exits 0
and `node src/hooks/test-pre-commit-review.js` exits 0 and the baseline gate passes and
`! grep -qE "spawnSync|execFileSync" src/hooks/lib/branch-review.js`.

REVIEW:
1. Does `diffHash` equal what the recipe's shell pipeline prints, on a repo with a rename, a binary
   file and a `features/*.md` change? Run both.
2. Does every git failure give null or `error`, never an empty hash or `fresh`? Find each read.
3. Is the base ref passed as one argv element or one quoted word everywhere, never spliced?
4. Is the recipe right when `toplevel` or `base` holds a single quote or a space?
5. Does a new commit that touches a non-feature file give `stale`, and a commit that touches only
   `features/x.md` stay `fresh`?
Non-goals: a forged marker
file, a hostile ref name beyond the leading dash, SHA-256 repos (they fail closed, never match).
FAIL if: a git read can yield `fresh` on error; the hash and the recipe differ; the recipe is unquoted;
another module's marker name changed; `git-read.js` was edited; a test asserts on a mock.

BUDGET: about 30 tool calls, 20 minutes, one or two review rounds.

**S2. A library that reads the branch-review repos config.**
NEW `src/hooks/lib/branch-repos-config.js`, `src/hooks/test-branch-repos-config.js`,
`.claude/branch-review-repos.json.example`.

WHAT TO BUILD:
- `ENV_CONFIG = 'BRANCH_REVIEW_REPOS_CONFIG'`. `configPath()` returns the env value when set, else
  `~/.claude/branch-review-repos.json` (`os.homedir()`).
- `readReposConfig(configPath)` returns `{ missing: true }` on ENOENT, `{ error }` on any other read
  error, a JSON parse error, or no `repos` object, else `{ repos }`. Same shapes and messages as
  `readConfig` in `src/hooks/pre-pr-verify.js`; copy the logic, do not import that file (it runs on
  load).
- `MODE_ADVISORY`, `MODE_ENFORCE`. `modeOf(entry)`: advisory when `mode` absent; null when the entry
  is not an object or the mode is anything else.
- `baseOf(entry)`: `{ ok: true, base: null }` when `base` is absent; `{ ok: true, base }` for a
  non-empty string with no leading `-`; `{ ok: false }` for anything else.
- The example file: `version 1`, a `_comment` naming the file, the modes, `base`, and the default
  (advisory), and one repo entry `{ "mode": "advisory" }`, as `.claude/verify-repos.json.example`.

INTERFACES: also export `normalize(p)` and `realNormalized(p)` (copied from `src/hooks/pre-pr-verify.js`)
`entryFor(repos, dir)`: the `{ key, entry }` of the longest key that holds `dir` (the cwd prefilter; it
takes `realNormalized(cwd)`), comparing both `normalize(key)` and `realNormalized(key)`, or null. And
`ownEntry(repos, toplevel)`: the `{ key, entry }` whose `normalize(key)` or `realNormalized(key)` EQUALS
`normalize(toplevel)` or `realNormalized(toplevel)`, as `pre-pr-verify.js` line 207, or null.

ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `src/hooks/pre-pr-verify.js`, `.claude/verify-repos.json.example`, S1 paths.

TESTS FIRST: `src/hooks/test-branch-repos-config.js`. At most
seven blocks. One table for `baseOf` and `modeOf` (columns: entry, expected). Rows: no keys; mode
enforce; mode `loud`; entry is an array; base origin/dev; base `-x`; base `""`; base 5. One table for
`readReposConfig` (columns: file content, expected key). Rows: missing file; unreadable (a directory);
bad JSON; no `repos`; `repos` an array; valid. One block: `configPath()` honours the env.
One block: ancestor key listed, nested repo
unlisted: `ownEntry` returns null while `entryFor(repos, cwd)` returns the ancestor's entry.

GATE: `node src/hooks/test-branch-repos-config.js` exits 0 and the baseline gate passes and
`node -e "JSON.parse(require('fs').readFileSync('.claude/branch-review-repos.json.example','utf8'))"`
exits 0.

REVIEW:
1. Does each error shape match `readConfig` in `pre-pr-verify.js`, message for message?
2. Does an invalid `base` (number, empty, leading dash) give `{ ok: false }`, not a throw or null base?
FAIL if: any function throws on bad input; `pre-pr-verify.js` is imported or edited.

BUDGET: about 15 tool calls, 10 minutes, one review round.

**S3. A parser that settles a branch-review report's verdict.**
NEW `src/hooks/lib/branch-report.js`, `src/hooks/test-branch-report.js`.

WHAT TO BUILD: `parseReport(text)`, never throws, non-string input read as empty. Model on `parseReport` in
`src/hooks/lib/verification.js`; do not import it.
- Trailer: the last non-blank line, trimmed, matches `^BRANCH_GATE: (PASS|FAIL)$`. Missing gives a
  problem. A `FAIL` trailer gives a problem.
- Sections: headings matching `^##\s+Q([1-7])\b`, each number exactly once. A section body ends at the next
  line starting `## ` or `### F`. `sections` always has seven entries, n 1 to 7; a missing or repeated
  Q is `{ok:false, kind:'bad'}` and a problem.
- A section is ok when its body has either (a) a `file:line` token matching `[\w./\\-]+\.\w+:\d+`, or
  (b) a line `None found, checked: <list>` (case-insensitive, optional list bullet) where the list,
  split on `,` or `;`, has at least two items of at least three characters. Anything else (bare
  `none`, empty, n/a) is not ok, kind `bad`. Kinds: `evidence`, `none-found`, `bad`.
- Findings: headings `^###\s+F\d+\s+(CONFIRMED|PLAUSIBLE)\s+(CRITICAL|IMPORTANT|ADVISORY)\b`.
  A line matching `^###\s+F\d+` that does not match it adds a problem and forces FAIL. Count
  CONFIRMED in `confirmed`, PLAUSIBLE in `plausible`, CONFIRMED CRITICAL in `blocking`.
- Verdict PASS only when the trailer is PASS, all seven sections are ok and `blocking` is 0. Each unmet
  condition adds one plain-English line to `problems`.
- Returns `{ verdict, sections: [{ n, ok, kind }], confirmed, plausible, blocking, problems }`.

ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `src/hooks/lib/verification.js`, S1 and S2 paths.

TESTS FIRST: `src/hooks/test-branch-report.js`. One table,
columns: report, expected `{ verdict, problemMatch }`. Rows: all seven with evidence and trailer PASS;
one section a bare `None`; one section `None found, checked: a.js` (one item); one section
`None found, checked: lib/a.js, lib/b.js, test-a.js`; a missing Q5; a repeated Q2; PASS trailer but a
CONFIRMED CRITICAL finding; PASS trailer with a CONFIRMED ADVISORY finding (PASS); FAIL trailer; trailer
not last (text after it); empty string; a non-string input;
`### F1 CONFIRMED: CRITICAL` and `### F1 CONFIRMED` (each a problem, FAIL).

GATE: `node src/hooks/test-branch-report.js` exits 0 and the baseline gate passes.

REVIEW:
1. Is a bare "none" rejected in every spelling: `None`, `none.`, N/A, `- none`, `None found.`?
2. Can a section pass on a `file:line` token that sits inside another section or above the first `## Q`?
3. Does a report with the trailer in the middle and text after it fail?
FAIL if: any of those three answers is wrong; the verdict is PASS with a CONFIRMED CRITICAL finding.

BUDGET: about 15 tool calls, 10 minutes, one or two review rounds.

**S4. A `branchReview` section in `sdlc-review.json` and a CLI subcommand that prints it.**
EXTEND `src/hooks/lib/review-config.js`, `src/hooks/review-config-cli.js`,
`src/hooks/test-review-config.js`, `.claude/sdlc-review.json.example`.

WHAT TO BUILD:
- `DEFAULTS.branchReview = { model: 'opus', maxRounds: 2, maxChangedLines: 25000 }`.
- `resolveBranchReview({ repoRoot })` through the existing `resolveSection`, spec `{ model: isModel,
  maxRounds: isPosInt, maxChangedLines: isPosInt }`. Export it. Per key across the user and repo
  layers, as `planReview` does.
- `review-config-cli.js branch-review [--repo <path>]` prints one JSON line `{ model, maxRounds,
  maxChangedLines, warnings }` and exits 0. Add it to the usage text.
- The example file gains `"branchReview": { "model": "opus", "maxRounds": 2, "maxChangedLines": 25000 }`
  and the `_comment` names the three keys.

IMPORTS:
- `src/hooks/lib/review-config.js::resolveSection`, `isModel`, `isPosInt`.

ASSUMES LANDED: nothing beyond HEAD.
MUST NOT TOUCH: `maxRounds` (the top-level key, used by the commit gate), `resolveReview`, S1 to S3.

TESTS FIRST: `src/hooks/test-review-config.js`. At most four blocks. Table
columns: user file, repo file, expected `{ model, maxRounds, maxChangedLines }` and warning count. Rows:
no files (defaults 25000); user sets cap 40000; repo overrides user; `maxChangedLines: 0` (invalid, falls
back, one warning); `model: "gpt"` (invalid, falls back, one warning). One block runs the CLI as a
child process and parses the line.

GATE: `node src/hooks/test-review-config.js` exits 0 and `node src/hooks/test-steps.js` exits 0 and the
baseline gate passes and `node src/hooks/review-config-cli.js branch-review` prints JSON whose
`maxChangedLines` is 25000 when run with `SDLC_REVIEW_CONFIG_USER` pointed at a missing file.

REVIEW:
1. Does the top-level `maxRounds` still drive `resolveReview` unchanged?
2. Does a repo file that sets only `maxChangedLines` still take `model` from the user file?
3. Does an invalid value warn and fall back, never throw or return 0?
FAIL if: `resolveReview` output changes for any existing test row; the CLI exits non-zero on a valid call.

BUDGET: about 20 tool calls, 12 minutes, one review round.

**S5. A PreToolUse hook on `gh pr create` that checks the branch-review marker, wired and switchable.**
NEW `src/hooks/pre-pr-branch-review.js`, `src/hooks/test-pre-pr-branch-review.js`.
EXTEND `hooks/hooks.json`, `src/hooks/lib/steps.js`, `src/hooks/test-steps.js`,
`src/test-plugin-layout.js`.

WHAT TO BUILD: model it on `src/hooks/pre-pr-verify.js`: same header comment form, the
`uncaughtException` handler registered before any require (copy its shape; message tag
`PRE_PR_BRANCH_REVIEW: `, text names `src/hooks/pre-pr-branch-review.js`), `isPrCreate`, the D9 rule
(no git process unless a listed key holds the real cwd), `entryFor`, `ownEntry`, `approve`/`emit`.
Decision order, each ends the hook:
1. Not `gh pr create`: approve.
2. `steps.stepState('pre-pr-branch-review', { cwd })` off: approve. Before the config read.
3. No config file: approve. Config error: block, mode unknown.
4. `entryFor(repos, cwd)` is null: approve. `locateRepo` says not a repo: approve; any other locate
   error: report state `error`, in the holder's mode. `ownEntry(repos, toplevel)` is null: approve; else
   `entry` below is its entry.
5. Invalid `mode` or invalid `base` (`baseOf(entry).ok` false) in the entry: block in every mode (a
   config error), mode unknown.
6. `readBranch`: error gives state `error`; `detached` gives state `detached`.
7. `resolveBase(toplevel, baseOf(entry).base)`: no ref gives state `no-base`.
8. `checkFresh`. `fresh`: approve. `missing`, `stale`, `empty`, `error`: report.
`report(state, detail, mode)`: advisory gives a `notice`, anything else a `deny`. The text names
`cmd('branch-review')`, the state, the detail, and for `missing` and `stale` the recipe from
`markerRecipe` with `RECIPE_TAG` and the words "replace round<n> with the round
used". For `no-base`, `detached`, `error`: no recipe; the fix is stated (set `base`, check out a
branch). The advisory notice ends "The PR is allowed anyway (advisory mode)." Advisory never blocks,
except the crash handler and the config-error cases (steps 3 and 5).
- `steps.js`: new area `'branch-review': { guard: false, steps: ['pre-pr-branch-review'] }`, and an
  `OPT_IN_DETAIL` entry `runs only in repos listed in ~/.claude/branch-review-repos.json`.
- `hooks/hooks.json`: add the hook to the `Bash` PreToolUse list directly after `pre-pr-verify.js`,
  timeout 15.
- `test-plugin-layout.js`: add `['command', 'pre-pr-branch-review.js', 15]` after the verify row.
- `test-steps.js`: extend only the assertions that enumerate areas or steps.

IMPORTS:
- `src/hooks/lib/branch-review.js` (including `RECIPE_TAG`), `src/hooks/lib/branch-repos-config.js`
  (including `entryFor`, `ownEntry`, `normalize`, `realNormalized`), `src/hooks/lib/pr-command.js`,
  `src/hooks/lib/git-read.js`, `src/hooks/lib/hook-output.js`, `src/hooks/lib/steps.js`,
  `src/hooks/lib/plugin-names.js`, `src/hooks/lib/review-markers.js` (`markerPaths(toplevel).branch`).

ASSUMES LANDED: S1, S2.
MUST NOT TOUCH: `src/hooks/pre-pr-verify.js`, `src/hooks/test-pre-pr-verify.js`, S3, S4, S6 to S8
(S6b and S6c included).

TESTS FIRST: `src/hooks/test-pre-pr-branch-review.js`. Copy the
harness of `test-pre-pr-verify.js`: child process, stdin JSON, scratch repo with an `origin` remote,
`BRANCH_REVIEW_REPOS_CONFIG` and `HOME` pointed at scratch paths, a PATH shim that records any git
spawn. At most eight blocks:
- Table of states, columns: setup, mode, expected output kind (`approve`, `notice`, `deny`) and a text
  match. Rows: not a PR command; no config file; step off; repo not
  listed; ancestor key listed and cwd in a nested unlisted repo (approve, no marker); no marker (advisory and
  enforce); stale marker (advisory and enforce); fresh marker; no base; detached HEAD; empty range;
  invalid mode; unparsable config; invalid `base`.
- D9: cwd outside every listed key: approve and the shim saw no git.
- Recipe in the deny text, run verbatim from a subdirectory, makes the next call approve.
- Crash: a truncated `src/hooks/lib/branch-review.js` in a copied tree gives a deny whose reason starts with
  `PRE_PR_BRANCH_REVIEW:`, in both modes.
- `base` override: an entry `{ "base": "origin/dev" }` makes the hook judge origin/dev...HEAD.

GATE: `node src/hooks/test-pre-pr-branch-review.js` exits 0 and `node src/hooks/test-pre-pr-verify.js`
exits 0 and `node src/hooks/test-steps.js` exits 0 and the baseline gate passes and
`node src/hooks/steps-cli.js list` prints a line for `pre-pr-branch-review` and
`git diff --stat HEAD -- src/hooks/pre-pr-verify.js` is empty.

REVIEW:
1. Walk the eight-state decision order against the hook. Does any git read error end in approve?
2. Is advisory ever a deny, outside the crash handler and the config-error cases (steps 3 and 5)?
3. Does the recipe in the message run verbatim and make the hook approve?
4. Is any new literal `sdlc:` spelled in the hook, or a slash command named bare?
Threat model: honest mistakes in ordinary commands Claude writes, not adversarial shell; a shape
Claude would not write is ADVISORY, not CRITICAL. Non-goals (ADVISORY gaps): `bash -c "gh pr create"`,
`eval`, `$GH pr create`, `gh --repo x pr create`,
`sudo -u root gh pr create`; `cd other-repo && gh pr create`; a linked worktree outside the listed
toplevel; a forged marker file; the round in the marker tag is not checked (P5); `git push`, `gh pr
merge` and web PRs are not gated.
FAIL if: any read error or unknown mode approves; the crash handler does not deny; advisory denies
outside the crash handler and the config-error cases (steps 3 and 5); the hook runs the review or
writes a marker; the hook is not wired in `hooks.json` or the layout test.

BUDGET: about 40 tool calls, 25 minutes, one or two review rounds. The test file is the long part.

**S6. A CLI that plans a branch review and checks a report.**
NEW `src/hooks/branch-review-cli.js`, `src/hooks/test-branch-review-cli.js`.
EXTEND `src/test-plugin-layout.js`.

WHAT TO BUILD: `node branch-review-cli.js plan [--repo <path>]` and `check-report <file>`. Model the
argument parsing on `review-config-cli.js`. Prints one JSON line.
- `plan`: locate the repo (`locateRepo`), read its entry from the branch-review repos config (an
  unlisted repo, a missing file or a config error all fall back to no `base`; a config error adds a
  warning). Find the entry with `ownEntry(repos, toplevel)`;
  `baseOf(entry).ok` false is a failure. Then `resolveBase`,
  `readBranch`, `numstat`, `resolveBranchReview`, `git status --porcelain` for `dirty`, which is true
  when it prints anything. Success: `{ ok: true, toplevel, branch, head, base, baseSource, changedLines,
  files, cap,
  overCap, groups, maxRounds, model, agent: 'sdlc:code-reviewer-deep', markerPath, recipe, dirty,
  warnings }`. `agent` comes from `plugin-names.agent`. `files` is the array of changed paths; `cap` is
  `maxChangedLines`; `head` is the full sha. `groups` is `[]` when `overCap` is false and
  `groupByTopDir` output otherwise (each `{dir, files:[path], lines}`). `recipe` uses `RECIPE_TAG`.
  Failure: `{ ok: false, error }` and exit 1 for: no repo, detached HEAD, no base, an invalid config
  `base`, empty range, unreadable git.
- `check-report <file>`: read the file, `parseReport`, print the result, exit 0 on PASS, 1 on FAIL, 2
  on a usage error or an unreadable file. A usage error exits 2 in both subcommands.
- `NOT_HOOKS` in `src/test-plugin-layout.js` gains `branch-review-cli.js`.

IMPORTS:
- `src/hooks/lib/branch-review.js` (including `RECIPE_TAG`), `src/hooks/lib/branch-repos-config.js`
  (including `ownEntry`), `src/hooks/lib/branch-report.js`, `src/hooks/lib/review-config.js`
  (`resolveBranchReview`, from S4), `src/hooks/lib/git-read.js`, `src/hooks/lib/plugin-names.js`,
  `src/hooks/lib/review-markers.js` (`markerPaths(toplevel).branch`).

ASSUMES LANDED: S1, S2, S3, S4.
MUST NOT TOUCH: `src/hooks/review-config-cli.js`, `src/hooks/pre-pr-branch-review.js`, S6b, S6c, S7, S8
paths.

TESTS FIRST: `src/hooks/test-branch-review-cli.js`. At most six
blocks. `plan` table in a scratch repo, columns: setup, expected `{ ok, key facts }`. Rows: normal branch;
`maxChangedLines` set to 5 so `overCap` and `groups` show two directories; config `base` override;
detached HEAD; no base; empty range; dirty tree (`ok` true, `dirty` true). One block runs the printed
`recipe` through `bash -c` and then `checkFresh` is `fresh`. `check-report` table: a passing fixture,
a failing fixture, a missing file (exit 2).

GATE: `node src/hooks/test-branch-review-cli.js` exits 0 and the baseline gate passes and
`node src/hooks/branch-review-cli.js plan` run in this worktree prints a line that parses as JSON.

REVIEW:
1. Is every failure `ok: false` with exit 1, and never a plan with a null base or head?
2. Does `overCap` use the config value and `>` the cap, not `>=`, on the changed-line count?
3. Do the groups cover every changed file exactly once?
Threat model: honest mistakes, not adversarial input. Non-goals (ADVISORY): a hostile config file, a
repo path with control characters.
FAIL if: a failure exits 0; a file is missing from `groups`; the recipe is built here and not by
`markerRecipe`; `plan` or `check-report` writes anything (S6c adds writing subcommands later).

BUDGET: about 30 tool calls, 20 minutes, one or two review rounds.

**S6b. A library that lists and unlists a repo in the branch-review repos config.**
NEW `src/hooks/lib/branch-repos-write.js`, `src/hooks/test-branch-repos-write.js`.

Unreviewed by a plan round (added after the two-round cap); a disagreement is a DISAGREEMENTS entry, not an
error to work around.

WHY NOW: a slip in a hand-edit of `~/.claude/branch-review-repos.json` is a config error that blocks the
PR in every mode (S5 step 3). This lib is the one safe writer. S6c wires it to the CLI; no CLI work here.

WHAT TO BUILD: pure functions over a config path. No git, no `os.homedir`; the path is always an argument.
- Exports `enableRepo({ configPath, toplevel, mode }) -> { ok, action, key, mode, error }`, `action` in
  `created`, `added`, `updated`, `unchanged`; and `disableRepo({ configPath, toplevel }) -> { ok, removed,
  key, error }`. `mode` must be `MODE_ADVISORY` or `MODE_ENFORCE` from S2, else `{ ok: false, error }`.
- Shared read step. Call `readReposConfig(configPath)` (S2). `{ error }`, or an entry that is not an object
  and would be changed: refuse with `{ ok: false, error }`, the file untouched. `{ missing }`: `enable`
  starts from `{ "version": 1, "repos": {} }` and creates the directory; `disable` returns `removed: false`
  and writes nothing. Otherwise parse the file text once more for the whole document, so unknown top-level
  keys survive.
- The key. `ownEntry(repos, toplevel)` first: when it finds `{ key, entry }`, work on that key, never add a
  second key for one repo. Else the new key is `realNormalized(toplevel)`. A key must always be one that
  `ownEntry(repos, toplevel)` finds again.
- `enable`: the entry becomes a copy of the existing one with `mode` set; `base` and every unknown key stay.
  `mode` omitted: an existing valid mode is kept, else `advisory`. A new entry is `{ "mode": <mode> }`.
  An entry equal to the old one is `unchanged` and nothing is written.
- `disable`: delete every key that `ownEntry` matches to this toplevel (loop until null). Other entries,
  unknown keys and the file stay, also when `repos` becomes `{}`. Nothing matched: `removed: false`, no write.
- Write: change the one key in the parsed document, `JSON.stringify(doc, null, 2) + '\n'`, to a temp file
  in the config's own directory (`wx`, existing file mode copied), then `renameSync` over the config.
  Remove the temp file on every failure. Never write to the config path directly. Indentation may be
  normalised; no key or value is dropped.

IMPORTS (single owners; reimplementing one is a FAIL): `src/hooks/lib/branch-repos-config.js`:
`readReposConfig`, `ownEntry`, `realNormalized`, `MODE_ADVISORY`, `MODE_ENFORCE`.

ASSUMES LANDED: S2.
MUST NOT TOUCH: `src/hooks/branch-review-cli.js` and its test, any `settings.json`, `hooks/hooks.json`,
`src/hooks/pre-pr-verify.js`, `.claude/verify-repos.json.example`, `verify-repos.json`,
`src/hooks/lib/steps.js`, `.claude/sdlc-review.json`, `commands/branch-review.md`, S7 and S8 paths,
anything under `~/.claude`. Tests use a temp dir; the real home is never read or written.

TESTS FIRST: `src/hooks/test-branch-repos-write.js`. At most five blocks, in temp dirs, table-driven:
- `enable` table, columns: file before, call, expected `{ action, file after }`. Rows: no file (creates
  `{"version":1,"repos":{...}}`); another repo's entry, an unknown top-level key and an entry holding `base`
  and an unknown key (merge keeps all); same call twice (second `unchanged`, bytes equal); existing mode
  `enforce` and no mode (kept); the repo under an equivalent key (trailing slash or symlink path) gets no
  second key; the repo's entry is an array (refused, bytes equal).
- Refusal table, columns: file content, expected. Rows: unparsable; no `repos`; `repos` an array; a
  directory as the file; each gives `ok: false` for `enable` and `disable`, bytes equal after.
- `disable` table. Rows: removes only this entry and keeps the rest; absent entry (`removed: false`);
  last entry removed (file stays with `"repos":{}` and its other keys); no file (nothing created).
- Write block: no `.tmp` file left after success or after a failed write (parent path is a file); the
  written key round-trips through `ownEntry` for a plain path, a symlinked path and a trailing slash.
- Nested-repo block: ancestor listed, nested toplevel not (`ownEntry` null for the nested path); `enableRepo`
  for the nested path adds its own key and leaves the ancestor's entry equal.

GATE: all of these exit 0:
- `node src/hooks/test-branch-repos-write.js` and `node src/hooks/test-branch-repos-config.js` and the
  baseline gate.
- `! grep -qE "spawnSync|execFileSync|os.homedir" src/hooks/lib/branch-repos-write.js` and
  `! grep -qE "sdlc-review.json|settings.json" src/hooks/lib/branch-repos-write.js` and
  `! grep -q "os.homedir" src/hooks/test-branch-repos-write.js`.
- `git diff --quiet HEAD -- hooks/hooks.json src/hooks/pre-pr-verify.js src/hooks/lib/steps.js
  .claude/verify-repos.json.example commands/branch-review.md`.

REVIEW:
1. Is the write atomic: a temp file in the config's own directory, then `renameSync`, the temp removed on
   every failure path, and no write straight to the config path? Find each write call.
2. Is there no wholesale rewrite: does the new document equal the parsed one with one key of `repos` added,
   changed or removed? Run `enableRepo` on a file with an unknown top-level key, an unknown entry key, a
   `base` and a second repo, and diff the parsed result.
3. Does a bad file (unparsable, no `repos`, `repos` an array, a directory) give `ok: false`, a reason and
   byte-identical contents, for both functions? Run each.
4. Does the written key round-trip through `ownEntry` for a plain, a symlinked and a trailing-slash
   toplevel, and does `enableRepo` reuse an equivalent key? Is the ancestor's entry untouched?
5. Does `disableRepo` keep the file and all other entries and keys, also when the last entry goes?
6. Do the tests use a temp dir only, never the real home?
Threat model: honest mistakes, not adversarial input. Non-goals (ADVISORY): two writers racing (the last
rename wins); a hostile config; JSON whitespace being normalised; file ACLs.
FAIL if: the write is not atomic; any key, entry or unknown field is lost; a bad file changes; a written key
is one `ownEntry` cannot find; `sdlc-review.json`, a `settings.json` or `hooks/hooks.json` is touched; the
CLI is touched; a test reads or writes the real home.

ROLLBACK: a single `git revert` of this step's commit while S6c has not landed. After S6c, S7 and S8 land,
revert S8, S7 and S6c first: the CLI imports this lib.

BUDGET: about 30 tool calls, 20 minutes, one or two review rounds. The lib is about 120 lines.

**S6c. Enable, disable and status subcommands that switch the gate on or off for the current repo.**
EXTEND `src/hooks/branch-review-cli.js`, `src/hooks/test-branch-review-cli.js`.

Unreviewed by a plan round (added after the two-round cap); a disagreement is a DISAGREEMENTS entry, not an
error to work around.

WHY NOW: the CLI already owns the repo lookup (S6), so the subcommands live there, over the S6b lib. S7
only routes to them.

WHAT TO BUILD: subcommands parsed like `plan`. The lib's behaviour is not changed here.
- `enable [--mode advisory|enforce] [--repo <path>]`, `disable [--repo <path>]`, `status [--repo <path>]`.
  An unknown flag or subcommand, a repeated or valueless `--mode`, or a mode that is not `advisory` or
  `enforce` exits 2 before any read or write. Every success prints one JSON line.
- `locateRepo` finds no repo or no toplevel: `{ ok: false, error }`, exit 1. `enable` and `disable` also exit
  1 with `{ ok: false, error }` on a detached HEAD (`readBranch`) or any lib refusal. Exit codes: 0 ok, 1
  refused or failed, 2 usage.
- `enable` calls `enableRepo` and prints `{ ok: true, action, toplevel, key, mode, configPath, warnings }`.
  When `steps.stepState('pre-pr-branch-review', { cwd: toplevel }).on` is false, `warnings` holds a line that
  the gate is off and says `cmd('steps')` plus ` on branch-review` turns it on. Exit stays 0.
- `disable` calls `disableRepo` and prints `{ ok: true, removed, toplevel, key, configPath, message }`;
  `message` is `not listed` when nothing was removed. Exit 0 either way.
- `status` prints `{ "step": "on"|"off", "listed": bool, "mode": "advisory"|"enforce"|null, "base": <ref or
  null>, "baseSource": "config"|"origin-head"|null, "configPath": <string>, "warnings": [] }`. `step` is
  `stepState(...).on`, read only. `listed` is `ownEntry(...)` non-null; an unreadable config reads as not
  listed plus a warning. `mode` comes from `modeOf` (null when unlisted or invalid). `base` is `resolveBase`
  with the entry's `baseOf` value; a failure gives nulls and a warning. A detached HEAD is a warning. Exit 0.
- `enable` and `status` never edit `sdlc-review.json` or any `settings.json`. The CLI itself calls no
  `writeFileSync` or `renameSync`; only the lib writes. `plan` and `check-report` are unchanged.

IMPORTS (single owners; reimplementing one is a FAIL):
- `src/hooks/lib/branch-repos-write.js` (S6b): `enableRepo`, `disableRepo`.
- `src/hooks/lib/branch-repos-config.js`: `configPath`, `readReposConfig`, `modeOf`, `baseOf`, `ownEntry`.
- `src/hooks/lib/steps.js`: `stepState`. `src/hooks/lib/plugin-names.js`: `cmd`.
- `src/hooks/lib/branch-review.js`: `resolveBase`, `readBranch`. `src/hooks/lib/git-read.js`: `locateRepo`.

ASSUMES LANDED: S2, S5, S6, S6b. S6b lands `src/hooks/lib/branch-repos-write.js`
(`enableRepo`, `disableRepo`). Check:
`node -e 'const w=require("./src/hooks/lib/branch-repos-write.js");
if(!w.enableRepo||!w.disableRepo)process.exit(1)' && node src/hooks/test-branch-repos-write.js`.
MUST NOT TOUCH: `src/hooks/lib/branch-repos-write.js` and its test, any `settings.json`,
`hooks/hooks.json`, `src/hooks/pre-pr-verify.js`, `.claude/verify-repos.json.example`, `verify-repos.json`,
`src/hooks/lib/steps.js`, `.claude/sdlc-review.json`, `commands/branch-review.md`, S7 and S8 paths,
anything under `~/.claude`. Tests set `BRANCH_REVIEW_REPOS_CONFIG` and `HOME` to a temp dir; the real home
is never read or written.

TESTS FIRST: rows in `src/hooks/test-branch-review-cli.js`. At most four blocks, in temp dirs, table-driven:
- Usage table, columns: args, expected exit. Rows: `enable --mode bad`, `--mode` alone, `--mode` twice,
  unknown flag, unknown subcommand (all 2, file bytes equal); `enable` outside a repo (1).
- Cycle block: `status` unlisted, `enable`, `status`, `enable --mode enforce`, `disable`, `disable`.
- `status` table, columns: setup, expected `{ step, listed, mode }`. Rows: listed advisory; listed enforce;
  unlisted; step off (`step` "off", `sdlc-review.json` bytes equal after); unparsable config (listed false,
  one warning).
- Nested-repo and step-off block: ancestor listed, nested unlisted: `status` says `listed` false; `enable`
  in the nested repo adds its own key, ancestor's entry equal. `enable` with the step off exits 0 with the
  `/sdlc:steps` warning.

GATE: all of these exit 0:
- `node src/hooks/test-branch-review-cli.js` and `node src/hooks/test-branch-repos-write.js` and the
  baseline gate.
- `! grep -qE "writeFileSync|renameSync" src/hooks/branch-review-cli.js`.
- `git diff --quiet HEAD -- hooks/hooks.json src/hooks/pre-pr-verify.js src/hooks/lib/steps.js
  src/hooks/lib/branch-repos-write.js .claude/verify-repos.json.example commands/branch-review.md`.
- The sandboxed cycle below, run from the repo root. Its last line is `CYCLE OK` and it exits 0. A failing
  `test` or `cmp` ends it at once (`set -eu`) without that line.
```
set -eu; T=$(mktemp -d); mkdir "$T/home"; export HOME="$T/home"
export BRANCH_REVIEW_REPOS_CONFIG="$T/cfg.json" SDLC_REVIEW_CONFIG_USER="$T/none.json"
git clone -q "$PWD" "$T/r"; R=$(cd "$T/r" && pwd -P); C="node $PWD/src/hooks/branch-review-cli.js"
f() { node -e 'console.log(String(JSON.parse(process.argv[1])[process.argv[2]]))' "$1" "$2"; }
o=$($C status --repo "$R"); test "$(f "$o" listed)" = false; test "$(f "$o" step)" = on
o=$($C enable --repo "$R"); test "$(f "$o" action)" = created
node -e 'const c=require(process.argv[1]);const r=c.readReposConfig(process.argv[2]).repos;
const e=c.ownEntry(r,process.argv[3]);if(Object.keys(r).length!==1||e.entry.mode!=="advisory")process.exit(1)' \
  "$PWD/src/hooks/lib/branch-repos-config.js" "$T/cfg.json" "$R"
o=$($C status --repo "$R"); test "$(f "$o" listed)" = true; test "$(f "$o" mode)" = advisory
test "$(f "$o" baseSource)" = origin-head
o=$($C enable --mode enforce --repo "$R"); test "$(f "$o" action)" = updated
o=$($C status --repo "$R"); test "$(f "$o" mode)" = enforce
cp "$T/cfg.json" "$T/before.json"; rc=0
$C enable --mode loud --repo "$R" >/dev/null || rc=$?; test $rc = 2; cmp "$T/cfg.json" "$T/before.json"
o=$($C disable --repo "$R"); test "$(f "$o" removed)" = true; test -f "$T/cfg.json"
o=$($C disable --repo "$R"); test "$(f "$o" removed)" = false; test "$(f "$o" message)" = "not listed"
echo '{bad' > "$T/cfg.json"; cp "$T/cfg.json" "$T/before.json"; rc=0
$C enable --repo "$R" >/dev/null || rc=$?; test $rc = 1; cmp "$T/cfg.json" "$T/before.json"
test ! -e "$T/none.json"; echo CYCLE OK
```

REVIEW:
1. Exit codes: a bad, valueless or repeated `--mode`, an unknown flag or subcommand exit 2 before any read
   or write; refusals (a bad config file included, bytes unchanged) and a detached HEAD exit 1; success,
   `not listed` and the step-off warning exit 0?
2. Do the subcommands leave the `steps` block, `sdlc-review.json` and every `settings.json` alone? Does
   `status` read the switch only through `stepState`, and write nothing?
3. Does the CLI call no write function itself, using `enableRepo` and `disableRepo` for every change? In
   the nested case does `status` say `listed` false and `enable` leave the ancestor's entry untouched?
4. Do `plan` and `check-report` behave exactly as before?
5. Do the tests and the cycle use the env override and a temp dir only, never the real home?
Threat model: honest mistakes, not adversarial input. Non-goals (ADVISORY): two writers racing (the last
rename wins); a hostile config; JSON whitespace being normalised; file ACLs.
FAIL if: `sdlc-review.json`, a `settings.json` or `hooks/hooks.json` is touched; `status` writes; `plan` or
`check-report` output changed; the lib is changed; an exit code is wrong; a test or the gate reads or writes
the real home.

ROLLBACK: a single `git revert` of this step's commit while S7 has not landed. After S7 and S8 land, revert
S8, then S7, then S6c: the command file names these subcommands and its test asserts them.

BUDGET: about 30 tool calls, 20 minutes, one or two review rounds. The CLI addition is about 120 lines.

**S7. The `/sdlc:branch-review` skill, command and reviewer prompt.**
NEW `skills/branch-review/SKILL.md`, `skills/branch-review/reviewer-prompt.md`,
`commands/branch-review.md`, `src/test-branch-review-skill.js`.
EXTEND `src/test-plugin-layout.js`.

WHAT TO BUILD:
- `reviewer-prompt.md`: the text pasted into the reviewer's prompt, with placeholders `<repo>`,
  `<base>`, `<head>`, `<pass scope>`. It states, in this order:
  1. Goal: find defects that only show when files are read together. Report-only: no fixes, no edits.
  2. Scope override: it replaces the "containing function only" rule of `agents/code-reviewer.md`. Read
     each changed file whole, with `git show HEAD:<path>`, and follow callers and callees across files.
     The pre-commit trailer rules (the `TDD_GATE` line) do not apply.
  3. The seven questions, as sections `## Q1` to `## Q7`, titles exactly Q1 Handoffs between files, Q2
    Where two writers meet, Q3 Timing, Q4 Repeated requests
     in flight, Q5 Flags and modes, Q6 Tests, Q7 Anything else spanning files, guided by: handoffs
     between files (does
     the receiver handle every form the sender can produce; compare what an entry point passes with
     what a batch driver passes to the same helper); where two writers meet (shared locks, keys, paths,
     cleanup); timing (every retry count, backoff, timeout, TTL, poll interval across files, and "what
     happens when retries run out before the thing that clears the error"); repeated requests while
     work is in flight; flags and modes (exit codes, help text, docstrings, docs, including text far
     from the diff); tests (does any test exercise the interaction or only each side alone); anything
     else spanning files.
  4. Evidence rule: each section holds `file:line` evidence, or `None found, checked: X, Y, Z` naming
     what was checked. A bare "none" is rejected. If any question lacks evidence the verdict is FAIL.
  5. Findings as `### F<n> CONFIRMED|PLAUSIBLE CRITICAL|IMPORTANT|ADVISORY <title>`, ranked. CONFIRMED
     needs a probe or a quoted `file:line` pair that proves it, otherwise PLAUSIBLE. Only a CONFIRMED
     CRITICAL finding fails the report.
  6. Threat-model clause as in `CLAUDE.md`, using the words ADVISORY, honest mistakes, not adversarial:
     a shape Claude would not write is classed ADVISORY. Non-goals: quoted wrappers, `eval`, a forged
     marker, a path outside the toplevel.
  7. The last line is `BRANCH_GATE: PASS` or `BRANCH_GATE: FAIL`, nothing after it.
  It carries no earlier findings. It never mentions a round number.
- `SKILL.md` (frontmatter `name: branch-review`, `argument-hint`): run order. Resolve `<plugin>` as the
  skill base directory's grandparent.
  1. `node <plugin>/src/hooks/branch-review-cli.js plan`. On `ok: false` stop and relay the error.
     Show `warnings` and a dirty tree to the user.
  2. Not over the cap: dispatch ONE `sdlc:code-reviewer-deep` with `model` from the plan, the
     reviewer prompt filled in, and the absolute path of `agents/code-reviewer.md`, resolved from
     the skill's base directory (two directories up, then agents/code-reviewer.md). Over the cap: one pass per
     entry of `groups` (`<pass scope>`: "files under <dir> only"), then one cross-file pass over all
     `files` (`<pass scope>`: "all files, interactions across directories only"), each a fresh
     sub-agent, run one after another. A round is the whole set.
  3. Write each report with the file tool to a temp path, run `branch-review-cli.js check-report
     <file>`. The verdict is that command's exit code. A report with no valid trailer is FAIL.
  4. PASS on every pass: run the `recipe` from `plan` verbatim with `round<n>` replaced, then record the
     round with `node "<plugin>/src/hooks/timing-log.js" review.completed agent=code-reviewer-deep
     round=<n> scope=branch verdict=PASS` (the CLI takes an event and `key=value` pairs).
     Then stop. Do not commit, push or open the PR.
  5. FAIL: show the findings. Fix with the user's permission (or standing authorisation) through a
     fresh fix agent, never the reviewer. Rerun once, on a fresh reviewer, as round 2. After
     `maxRounds` FAILs stop and ask the owner: fix, or open the PR with the gap named.
- `commands/branch-review.md`: frontmatter `description`, an Arguments line
  (`[on [--mode advisory|enforce] | off | status]`), and instructions. Parse the first argument. `on`, `off`
  and `status` run `node ${CLAUDE_PLUGIN_ROOT}/src/hooks/branch-review-cli.js` with `enable`, `disable`
  and `status` (the rest of the arguments pass through), print the result line and STOP: no skill, no
  review, no marker. Anything else, or no argument, invokes the `sdlc:branch-review` skill as above. The
  command holds no write logic; S6c owns it. Style as `commands/verify.md`.
- `src/test-branch-review-skill.js`: reads the three files and asserts the properties in TESTS FIRST.
- `test-plugin-layout.js`: the skills list assertion gains `branch-review` and its title becomes
  "the four shipped skills"; add `branch-review` to `BARE_INVOCATION`'s name list.

IMPORTS:
- `agents/code-reviewer-deep.md`, `agents/code-reviewer.md`: criteria and report format are referred to,
  not restated, except the overrides above.

ASSUMES LANDED: S3, S6, S6c (S6b is implied through S6c).
Check: `node src/hooks/test-branch-review-cli.js`.
MUST NOT TOUCH: `skills/code-review-pre-commit/SKILL.md`, `agents/*`, `instructions/*`, S6b, S6c and S8
paths.

TESTS FIRST: `src/test-branch-review-skill.js`. At most five
blocks: `reviewer-prompt.md` holds the headings `Q1` to `Q7` in order; it names `BRANCH_GATE: PASS` and
`BRANCH_GATE: FAIL`; it holds the phrases "ADVISORY", "honest mistakes" and "not adversarial"; no
line of it matches `^\s*TDD_GATE:\s*(PASS|FAIL)` (the word may appear, to override it) and the trailer
line it specifies is `BRANCH_GATE`; a sample report built from the prompt's own headings, with one
CONFIRMED ADVISORY finding, passes `parseReport`; `SKILL.md` names `branch-review-cli.js`, `check-report`,
`maxRounds` and the two-round stop and contains no `git hash-object` and no `printf`; the command file
names `sdlc:branch-review`, `on`, `off`, `status`, `branch-review-cli.js` and the subcommands `enable`,
`disable`, `status`, and holds no `writeFileSync` or `renameSync`.

GATE: `node src/test-branch-review-skill.js` exits 0 and the baseline gate passes and
`grep -c "BRANCH_GATE" skills/branch-review/reviewer-prompt.md` prints at least 2.

REVIEW:
1. Does the prompt override the "containing function only" rule in so many words, and say how to read
   files whole?
2. Are all seven questions present with the owner's parentheticals, in order, each in its own section?
3. Does the prompt say a bare "none" is rejected and FAIL follows? Does it match S3's accepted layout
   (`## Q`, `### F`, `None found, checked:`, trailer last)?
4. Does the skill use the CLI for base, hash and recipe, and never compose a marker by hand?
5. Does the command route `on`, `off`, `status` to the S6c subcommands and stop, with no review and no
   write logic?
FAIL if: any of questions 1 to 5 is answered wrongly; the trailer is `TDD_GATE`; the skill tells
Claude to commit; the skill spells a hash command or a printf marker.

BUDGET: about 35 tool calls, 25 minutes, one or two review rounds.

**S8. Docs: README, CLAUDE.md table, session instruction line, steps table.**
EXTEND `README.md`, `CLAUDE.md`, `instructions/feature-workflow-snippet.md`.

WHAT TO BUILD:
- `CLAUDE.md` "What ships here": three rows: the skill and command (`skills/branch-review/`,
  `commands/branch-review.md`); the gate (`src/hooks/pre-pr-branch-review.js` and its libs
  `src/hooks/lib/branch-review.js`, `src/hooks/lib/branch-repos-config.js`,
  `src/hooks/lib/branch-report.js`,
  `branch-review-cli.js`, `src/hooks/lib/branch-repos-write.js`); the config key (`branchReview` in
  `sdlc-review.json`). The command row says `/sdlc:branch-review on|off|status` lists or unlists the
  current repo.
- `README.md`: one line naming `/sdlc:branch-review on|off|status` and the step switch
  (`/sdlc:steps off branch-review`), in the command entry; a `branch-review` entry under "The skills";
  the command under "The commands"; the hook
  row in the hooks table; a `### ~/.claude/branch-review-repos.json` section after the verify one (shape,
  `mode`, `base`, advisory default, fail-closed list, what is not gated, the marker content and that a
  change to the
  branch diff, not to `features/*.md`, makes it stale); the `branchReview` keys in the Model steering
  paragraph; the `pre-pr-branch-review`
  row of the "Turning steps off" table; the pull-request line of "The loop" diagram.
- `instructions/feature-workflow-snippet.md`: one line after the verify line, under 160 characters:
  before `gh pr create` in a repo listed in `~/.claude/branch-review-repos.json`, run
  `/sdlc:branch-review`. If `test-session-start-instructions.js` fails the headroom check, STOP AND
  REPORT; do not shorten other text.

ASSUMES LANDED: S1 to S6, S6b, S6c, S7.
Check: `test -f src/hooks/lib/branch-repos-write.js && test -f commands/branch-review.md
&& node src/test-branch-review-skill.js`.
MUST NOT TOUCH: every source and test file.

TESTS FIRST: Red not required; the session-instructions test and the GATE greps stand in.

GATE: `node src/hooks/test-session-start-instructions.js` exits 0 and the baseline gate passes and
`grep -c "pre-pr-branch-review" README.md CLAUDE.md` prints at least 1 for each and
`grep -c "branch-review-repos.json" README.md instructions/feature-workflow-snippet.md` prints at least
1 for each and `grep -c "maxChangedLines" README.md` prints at least 1 and
`grep -qF "branch-review on|off|status" README.md` and
`grep -qF "branch-review on|off|status" CLAUDE.md` and every path named in a new
`CLAUDE.md` row exists (`test -e` for each).

REVIEW:
1. Does every new README claim match the code as built (modes, fail-closed states, file names, defaults
   25000 and 2)? Check each against the source file.
2. Does the README say `git push`, `gh pr merge` and web PRs are not gated?
FAIL if: any README statement contradicts the source; a bare `/branch-review` appears; a source or test
file changed.

BUDGET: about 25 tool calls, 15 minutes, one review round.

## 6. What NOT to do

- Do not refactor the copied config reader into a shared module in this plan. The duplication is
  pre-existing shape and a follow-up for the owner.

## 7. Definition of done

Run in this order, from the repo root.

1. `bash tools/run-tests.sh` prints `failed: 0`. This is the one full-suite run. The baseline was 49
   files; the plan adds 7 (`test-branch-review.js`, `test-branch-repos-config.js`,
   `test-branch-report.js`, `test-pre-pr-branch-review.js`, `test-branch-review-cli.js`,
   `test-branch-repos-write.js`, `src/test-branch-review-skill.js`), so the count is 56.
2. `claude plugin validate .` exits 0.
3. `node tools/plugin-version.js check` exits 0 and `.claude-plugin/plugin.json` version is above the
   one at the branch point (1.0.89) by at least 10, one bump per step commit.
4. `git log --oneline main..HEAD` shows one commit per step, S1 to S6, S6b, S6c, S7, S8 (ten),
   each after a review PASS.
5. `git diff --stat main...HEAD -- src/hooks/pre-pr-verify.js src/hooks/pre-commit-review.js` is empty.
6. Acceptance list for `sdlc:verifier`, run from outside. Scratch repo with an `origin` remote and a
   branch one commit ahead of origin/main; `BRANCH_REVIEW_REPOS_CONFIG` and `HOME` point at scratch
   paths; the hook runs as `node src/hooks/pre-pr-branch-review.js` with stdin
   `{"tool_input":{"command":"gh pr create --fill"}}`. Expected output per state:

| # | state | mode | expected |
|---|---|---|---|
| 1 | command is `git status` | any | approve |
| 2 | repo not listed | any | approve |
| 3 | no config file | any | approve |
| 4 | step off in `sdlc-review.json` | enforce | approve |
| 5 | no marker | advisory | notice naming `/sdlc:branch-review` and a `printf` recipe |
| 6 | no marker | enforce | deny naming `/sdlc:branch-review` and a `printf` recipe |
| 7 | stale marker (a non-feature commit after it) | enforce | deny, detail names the branch diff |
| 8 | recipe from #6 run verbatim, then hook | enforce | approve |
| 9 | no origin/HEAD and no `base` | enforce | deny; advisory gives a notice |
| 10 | detached HEAD | enforce | deny; advisory gives a notice |
| 11 | config is invalid JSON | advisory | deny (mode unknown) |
| 12 | branch has no commit ahead of base | enforce | deny, state `empty` |
| 13 | a lib file truncated in a copied tree | any | deny starting `PRE_PR_BRANCH_REVIEW:` |
| 14 | entry has `base` origin/dev | enforce | judges origin/dev...HEAD |
| 15 | `skills/branch-review/reviewer-prompt.md` | n/a | lists Q1 to Q7 and `BRANCH_GATE` |
| 16 | `SKILL.md` | n/a | names the CLI, the two-round stop, no commit step |
| 17 | `branch-review-cli.js check-report` on a bare-`None` report | n/a | exit 1 |
| 18 | `node src/hooks/review-config-cli.js branch-review` | n/a | `maxChangedLines` 25000 |
| 19 | marker, then a commit touching only `features/*.md` | enforce | approve |
| 20 | `branch-review-cli.js enable`, empty config | n/a | exit 0; file holds this repo only, mode advisory |
| 21 | `enable --mode enforce`, then `status` | n/a | exit 0; one JSON line, `listed` true, `mode` enforce |
| 22 | `enable --mode loud` | n/a | exit 2; config file byte-identical |
| 23 | `enable` on an unparsable config | n/a | exit 1; reason printed; file byte-identical |
| 24 | `disable`, run twice | n/a | exit 0 both; entry gone, file kept; second says `not listed` |
| 25 | `status` line keys | n/a | `step`, `listed`, `mode`, `base`, `baseSource`, `configPath`, `warnings` |
| 26 | `commands/branch-review.md` | n/a | names `on`, `off`, `status` and the CLI subcommands |

## 8. Dispositions

DISPOSITIONS:

- Source review F1 to F8: each folded in.
  - F1: section 3 P6, section 4 marker-body row, S1 (checkFresh, tests, REVIEW 5), S8 README line,
    section 7 row 7 and new row 19.
  - F2: section 4 report-layout and parseReport rows, S3 (findings, verdict, tests, FAIL), S7 (items
    5 and 6, tests).
  - F3: S7 item 2 and TESTS FIRST.
  - F4: S2 INTERFACES, S5 steps 4, S6 WHAT, section 4 seam table.
  - F5: S1 INTERFACES (`RECIPE_TAG`), S5 and S6 IMPORTS and recipe tag.
  - F6: S5 step 5, advisory sentence, REVIEW 2, FAIL.
  - F7: S6 WHAT.
  - F8: S1 GATE. No other GATE uses the broken `grep -c` pattern.
- Round 2 (seam rows only): F1, F2 folded in (`ownEntry`); F3 folded in (near-miss headings fail);
  ASSUMES LANDED lines restored for form. This fold-in was NOT reviewed by a third round (cap of two); it
  copies pre-pr-verify.js:207 and the per-step reviews of S2, S3, S5 and S6 are its check.
- Cut job: PINs applied in S1, S3, S5, S6, S7. Cuts applied in section 2, S1 to S8 and section 6.
  LEAVE items noted-not-actioned: 17.
- Owner request after the plan reviews: enable/disable/status added as S6b (the `/sdlc:branch-review
  on|off|status` command, S7 routing, S8 docs). S6b is not covered by a plan round; its GATE is a script.
- S6b was split into S6b (lib) and S6c (CLI) at the owner's request on 2026-11-12, with no plan review round
  (cap of two already used); neither step has a plan round.
- Noted, not actioned: a features-only branch reads as `empty` and can never pass in enforce mode;
  deep reviewer maxTurns 60 may cut a pass short and fails closed; the hook makes about 10 git reads.
- Accepted (advisory): the plan stays over the 30 KB budget; S1, S5 and S7 stay over the step budget.
