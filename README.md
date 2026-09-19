# sdlc-claude-skills

The SDLC toolchain for Claude Code: skills, review sub-agents, pre-commit
hooks and slash commands that turn a change into a planned, reviewed,
tested commit. Extracted from `risk-claude-skills` so the generic
engineering workflow lives apart from the domain skills.

Install target is `~/.claude`. This repository is the source of truth —
edit here, then run `./install.sh`.

```bash
git clone <this repo> ~/dev/sdlc-claude-skills
cd ~/dev/sdlc-claude-skills
./install.sh --dry-run     # see what would change
./install.sh               # deploy
```

Node is required (the hooks and the install-time mergers are Node).
Restart Claude Code after installing.

---

## The loop

```
  plan            /plan-spec  ──────────► a plan of one-commit steps
    │
    ▼
  build           implementer sub-agent per step
    │
    ▼
  pre-flight      /commit-prep  ────────► ruff + pytest + coverage
    │
    ▼
  commit          pre-commit-feature.js  ─► is there a feature file?
                  pre-commit-review.js   ─► is there a fresh marker?
                  pre-commit-hygiene.js  ─► do lint and tests pass?
    │  (blocked)
    ▼
  review          /code-review-pre-commit ─► code-reviewer sub-agent
    │                                        ends in TDD_GATE: PASS|FAIL
    ├─ FAIL ──►   /code-review-implementer ─► fix items, re-review
    └─ PASS ──►   write marker, hand back to the user to commit
```

A completed review never commits on your behalf. It writes the marker; the
commit stays your command.

---

## What gets installed where

| Source | Installed to | Purpose |
|---|---|---|
| `.claude/skills/*` | `~/.claude/skills/` | the three workflow skills |
| `.claude/agents/*.md` | `~/.claude/agents/` | `code-reviewer` (Sonnet), `code-reviewer-deep` (Opus) |
| `commands/*.md` | `~/.claude/commands/` | `/commit-prep`, `/review-timing`, `/feature`, `/feature-new` |
| `src/hooks/*.js` (not `test-*`) | `~/.claude/hooks/` and `.claude/hooks/` | the gates |
| `src/hooks/lib/*.js` | `~/.claude/hooks/lib/` | shared hook helpers |
| `tools/*.py` | `~/.claude/tools/` | timing analyser, resolved by `/review-timing` |
| `.claude/hooks-config.json` | merged into `~/.claude/settings.json` | wires the hooks to events |
| `.claude/*-snippet.md` | merged into `~/.claude/CLAUDE.md` | the instructions Claude follows on a block, including the TDD mandate |
| `.claude/*.json.example` | seeded to `~/.claude/*.json` **first install only** | thresholds, repo opt-ins, TDD exemptions |

The `.json.example` files are seeded once and never overwritten: they hold per-repo
thresholds, opt-ins and exemptions you are expected to tune. `tdd-mandate.json`
seeds empty, because the mandate is on by default and that file only lists the
exceptions.

---

## The skills

### `plan-spec`
Writes an implementation plan sub-agents can build unattended — one step
per commit, one review per commit — or runs a plan that already exists.
Carries the step form, the plan skeleton, the pre-run review loop and the
four dispatch prompts. Not for search-shaped work, where the step list
cannot be fixed before dispatch.

### `code-review-pre-commit`
`[files|staged] [--fresh] [--deep]`

Runs the review a `PRE_COMMIT_REVIEW` hook block asks for: one
`code-reviewer` sub-agent on the staged diff, ending in the `TDD_GATE`
trailer, then writes the marker using the `printf` command from the block
message. `--deep` selects `code-reviewer-deep` (Opus) for
security-sensitive or parser-shaped changes. On a gap-patching block it
patches uncovered lines instead. Not for ad-hoc PR review — use the
built-in `/code-review` for that.

### `code-review-implementer`
`[all|critical|important|advisory|<item-numbers>]`

Applies the numbered `ACTIONABLE ITEMS` from the most recent review report
through one Sonnet sub-agent that makes the minimum change per item and
runs the tests. Use after a `TDD_GATE: FAIL`, before the rerun.

---

## The commands

| Command | Does |
|---|---|
| `/commit-prep [--skip-tests]` | Runs ruff + pytest + coverage before you stage, so hygiene and review failures collapse into one round-trip. Never stages or commits. |
| `/review-timing [--days N] [--repo PATH] [--json]` | Fast-path hit rate, per-gate breakdown, p50/p95 on coverage regen and diff-cover. |
| `/feature <slug>` / `/feature list` | Recall prior context for a feature branch. |
| `/feature-new <slug> "<requirement>"` | Seed or update `features/<slug>.md`. |

---

## The hooks

Wired to events by `.claude/hooks-config.json`. The `PreToolUse` chain runs
in order, cheapest rejection first.

| Hook | Event | Gate |
|---|---|---|
| `session-start-feature.js` | SessionStart | Creates `features/<branch>.md` on a new feature branch and asks for the requirement |
| `enforce-review-implementer.js` | UserPromptSubmit | Routes review-fix prompts through the implementer skill |
| `pre-commit-feature.js` | PreToolUse | Blocks source commits on trunk, and on a branch until the feature file has a real requirement |
| `pre-commit-review.js` | PreToolUse | Blocks unless `.git/.claude-last-review` is fresh and both hashes match |
| `pending-review-gate.js` | PreToolUse | Dormant — nothing writes its marker today |
| `enforce-co-author.js` | PreToolUse | Attribution trailer |
| `pre-commit-hygiene.js` | PreToolUse | ruff + pytest in opted-in repos |
| `post-commit-notify.js`, `claude-attribution-note.js`, `post-commit-feature.js` | PostToolUse | Notification, attribution note, sha-stamped feature history |

`stop-review-trigger.js` and `post-commit-review.js` ship but are not wired.

### What counts as code

Four lists in `src/hooks/lib/source-files.js` decide how far the gates reach, and
they are not the same list.

`SOURCE_EXTENSIONS` is what the gates *look at*. `.sh` and `.ps1` are in it. They
were not — in any of the four copies — and the consequence was specific: a diff touching only `install.sh` and
`uninstall.sh` — the two scripts that delete paths under `~/.claude` and rewrite
your global `CLAUDE.md` and `settings.json` — yielded zero code files and was
approved via `staged-no-code` with no review requested.

`CLASSIFIER_LANGUAGES` is what `lib/diff-classifier.js` can actually *read*, and
adding shell to the first list without this second one made things worse rather
than better. The classifier recognises Python/JS-family keywords, assignments and
calls; a shell command is a bare word list, so `rm -rf "$HOME/.claude"`,
`curl … | sh` and `chmod 777 /etc/passwd` all score zero semantic lines. The
silent approval simply moved from `staged-no-code` to the `trivial-diff` fast
path — which writes a `PASS` marker, crediting a review that never ran. Any staged
file outside `CLASSIFIER_LANGUAGES` now skips both fast paths and falls through to
a real review.

`COVERAGE_LANGUAGES` does the same job for the coverage gate. Without it a
shell-only commit made `coverage.xml` look stale, and because the hygiene cov
check is itself guarded on staged Python, nothing would ever refresh it: the hook
waited out `COV_WAIT_TIMEOUT_MS` — two minutes by default — and then blocked with
advice no one could act on.

`EXCLUDE_PATTERNS` is never reviewed whatever the extension, and the full list is
`.claude/`, `.vscode/`, `.idea/`, `node_modules/`, `__pycache__/`, `vendor/`,
`third_party/`, `.venv/` and `venv/`. Exclusions win over the extension, which is
load-bearing: installing this project copies its own hooks into `.claude/`, and
gating those would make every install a reviewable change. `dist/` and `build/` are
deliberately absent — they were there briefly and un-gated
`build/scripts/release.sh`, and plenty of projects keep hand-written source in
both. An exclusion list is the one place a wrong entry makes the gate quietly
weaker.

All four lists live in `src/hooks/lib/source-files.js` and nowhere else. They used
to be copied into four hooks, and the copies drifted: `.sh` was added to the review
gate alone, so `lib/feature-file.js` still read a shell-only commit as docs-only and
let `install.sh` onto `main` with no branch and no feature file.
`src/hooks/test-source-files.js` carries a drift guard that fails if any hook grows
its own copy again, and `src/hooks/test-fast-path-languages.js` runs the real hook
against throwaway repositories to assert a shell diff is neither approved nor
marked.


### The TDD mandate

On by default, in every repository. `pre-commit-review.js` reads the session
transcript to see which file you edited first and blocks two shapes: `code_first`
(implementation edited before its test) and `no_tests` (implementation staged with
no test in the diff). When order cannot be determined — no transcript, or files
staged in an earlier session — the order check is skipped but a test must still be
present, because that is decided from the index alone. An unverifiable order is not
an excuse for a missing test.

It was written long before it ran. The opt-in was an allowlist at
`~/.claude/tdd-order-repos.json` that nobody had created, and `loadTddOrderRepos`
returned `[]` on any read failure, so the gate was dormant everywhere. Switching it
on first required fixing what it considered a test: the recogniser matched
`test_foo.py` but not `test-foo.js`, so all 17 of this project's own test files
classified as implementation and every commit here would have been blocked as
`no_tests`.

Exempt automatically: `.md`, `.json`, `.toml`, `.yaml`, `.yml`, `.lock`, dotfiles,
extensionless files, and anything under `features/`, `tmp/` or `.planning/`. A
docs-only commit is never gated. Everything else is implementation, shell included.

To exempt a repository: `touch .claude/tdd-mandate.disabled`, or add its path to
`exempt_repos` in `~/.claude/tdd-mandate.json`. To exempt a path rather than a whole
repository, use `exempt_paths` in the same file — a trailing slash makes it a
directory prefix. There is no hardcoded directory list: there was, and a
project-specific `features/` prefix sitting in a shared library silently un-gated
every Cucumber suite, since that is where step definitions live. A config file that will not parse
does **not** disable the mandate — a typo must not silently switch off gating
everywhere.

What counts as a test is a path convention in `src/hooks/lib/tdd-order.js`. The
capitalised `*Test.java` / `*Spec.kt` suffix counts only **inside** a test
directory: a bare rule swept in whole public APIs — JavaPoet's `TypeSpec`,
KotlinPoet's `FileSpec`, `tensor_spec.py` — and calling production code a test is
the fail-open direction, because it moves the file out of the implementation set
*and* into the test set, so a commit with no test stops being `no_tests`.

### Staging and committing are two commands

`lib/commit-command.js` classifies the Bash command before any index-based
gate runs, and blocks outright anything whose committed contents cannot be
known from the index at hook time — a staging step chained onto the commit,
`-a`/`-i`/`--patch`, a pathspec on the commit, a branch switch or reset in
the same command, `-C otherdir`, a `cd` out of the repo, or a commit wrapped
in `bash -c`, `eval`, `$( )` or a heredoc. Fail closed by design.

Known boundary: the classifier cannot see inside a script or build target
(`bash deploy.sh`, `make commit`), so those are not gated. The commit must
be typed in its own Bash command.

Every git read fails closed (`lib/git-read.js`). A `git diff --cached` that
errors returns null, never an empty list, so a read failure blocks with
"could not be read" rather than passing as "nothing staged". No lock or
marker is written on such a block, so the retry re-reads the index.

### Marker protocol

The review gate opens on exactly one thing: a fresh `.git/.claude-last-review`
whose body is

```
PASS
<staged diff hash>
<coverage.xml hash>
<agent:round:PASS>
```

and whose two hashes match the index and `coverage.xml` *now*. Claude writes
it on `TDD_GATE: PASS` by running the `printf` from the block message
verbatim — that command recomputes both hashes at write time. Then Claude
stops. A completed review does not grant permission to commit.

The lock, `.git/.claude-review-in-progress`, means "a review was requested
for this diff and has not passed". It never approves. Delete it to force a
fresh review.

---

## Configuration

### `~/.claude/hygiene-repos.json`
Per-repo opt-in for the hygiene gate: `setup` shell lines plus a list of
`{ name, command }` checks. Seeded from `.claude/hygiene-repos.json.example`,
which carries the canonical ruff-check → ruff-format → pytest-cov →
diff-cover recipe. Copy that rather than inventing a variant.

The hook runs `bash -c`, not a login shell, so conda must be sourced
explicitly in `setup`.

For Python repos also using the coverage gate, include a pytest-cov check
(any check whose name contains "cov" or whose command uses `--cov-*`). When
the review hook finds `coverage.xml` older than a staged file it does not
run pytest-cov itself — it polls for the parallel hygiene hook to refresh
it (120s default, `COV_WAIT_TIMEOUT_MS` to override) and blocks if no cov
check is configured or the wait times out.

### `~/.claude/review-policy.json`
Per-repo fast-path tuning for `pre-commit-review.js`:
`presentational_paths`, `trivial_line_threshold`, `diff_cover_threshold`,
`branch_cover_threshold`. Defaults apply where a repo or field is absent.

### Emergency override
```bash
printf 'PASS\n%s' "$(git diff --cached | git hash-object --stdin)" > .git/.claude-last-hygiene
```

### Opt out of feature tracking per repo
```bash
touch .claude/feature-tracking.disabled
```

---

## Uninstall

```bash
./uninstall.sh --dry-run        # list what would go
./uninstall.sh                  # remove, keeping your tuned config
./uninstall.sh --purge-config   # also delete hygiene-repos.json and review-policy.json
```

Removal is derived from this source tree, so a file the project never
shipped is never touched. `settings.json` is edited surgically —
`src/unmerge-hooks.js` strips only the entries naming this project's hook
scripts, and hooks you added from elsewhere survive. `CLAUDE.md` loses only
the blocks this project wrote — byte for byte, verified by a round-trip test —
which it can identify exactly because install wraps them in sentinels:

```
<!-- sdlc-claude-skills:begin Feature Tracking -->
## Feature Tracking
...
<!-- sdlc-claude-skills:end Feature Tracking -->
```

Every lookup is a literal string search for those markers — there is no markdown
parsing, so a heading of ours quoted in a code example, a section of yours called
`## Feature Tracking Notes`, a sentence mentioning one of the headings, CRLF line
endings and tabs are all simply irrelevant. A `CLAUDE.md` installed before the
sentinels existed is found by searching for the snippet's exact text instead,
which works because this repository wrote it; install then adopts it in place
rather than appending a second copy. If neither search matches — you edited our
section, or our wording changed since — nothing is deleted: install appends a
wrapped copy and says so, and uninstall leaves the old text alone and tells you.

Ambiguity is refused, never resolved by guessing. A begin marker with no end, a
second begin marker before the matching end (which a marker quoted in prose or
pasted from this page would produce), more than one verbatim copy of a snippet,
a target that is not valid UTF-8, or a read that fails for any reason other than
"not there yet" all abort with a message naming the problem, leaving the file
untouched — and under `install.sh`'s `set -e` that stops the install.

Both sides write a timestamped `CLAUDE.md.backup.*` before overwriting, on every
path. Nothing outside a block is rewritten: blank-line runs are adjusted only
where a block was removed, so blank lines inside your own fenced code and any
minority line endings come back byte for byte.

Left in place on purpose: the timing log (`~/.claude/code-review-timing.jsonl`),
the per-repo `.git/` markers, which expire on their own, the timestamped
`settings.json` and `CLAUDE.md` backups, and `~/.claude/backups/`.

That last directory is where `install.sh` puts a copy of any user-scope skill it
is about to replace, and the location matters: Claude Code discovers skills by
scanning `~/.claude/skills/`, so a backup kept there as `plan-spec.bak.<ts>/` is
itself loaded as a skill, appearing in the skill list beside the real one with the
same name. Nothing that is not a shipped skill may live under `skills/`, and
`src/test-install.sh` asserts it.

**If another project installs the same hooks** — `risk-claude-skills`
currently does — uninstalling here removes its deployed copies too, because
they are the same filenames in `~/.claude/hooks`. Re-run that project's
install script afterwards. For the same reason `install.sh` only prunes
"no longer in source" hooks from the project-local `.claude/hooks/`, never
from `~/.claude/hooks`, so it cannot delete another project's hooks.

---

## Tests

```bash
for t in src/hooks/test-*.js src/test-*.js; do node "$t"; done
for t in src/hooks/test-*.sh src/test-*.sh; do bash "$t"; done
```

`src/test-claude-md-section.js` tests `src/lib/claude-md-section.js` directly,
including a block of assertions stating that the inputs which broke the previous
heading-matching design — fenced examples, prefix headings, mid-sentence
mentions, CRLF, tabs — are not matches at all now. Those are the assertions that
should fail if anyone reintroduces pattern matching over the user's text.

Run these from a clone with history, not from this repo before its first
commit: `test-pre-commit-review.js` stages its fixtures with `git add -f`
against `$PWD`'s repo, and in a repo with no commit it blocks before its
cleanup runs, leaving `features/pre-commit-hook-test.md` and
`tmp/pre-commit-hook-test-fixture.xml` in your index.

`src/test-install.sh` drives `install.sh` and `uninstall.sh` against a
throwaway `CLAUDE_HOME` and a throwaway copy of the source tree. It never
touches the real `~/.claude`, which matters because install also populates
`.claude/hooks/` in the source tree and uninstall deletes it.

Every suite passes except one, inherited from `risk-claude-skills` at the same count
and not caused by the split. Run them from a clone with history, not from this repo
before its first commit — see the note above.

| Suite | State |
|---|---|
| `test-enforce-co-author.sh` | 6 passed, 1 failed |

`test-stop-hook.sh` used to fail 3 of 14 and is now 14/14. The cause was the review
markers living in `$HOME`: the suite backed up, deleted and restored the user's real
review state on every run, and fought itself. Moving the markers into each
repository's git dir fixed the hook and the tests together.

A third, `test-pre-commit-feature.sh`, fails if run with `$PWD` inside a
repository that has no commit yet — two pass-through cases inherit the
ambient working directory instead of using a temp repo, so an unborn `HEAD`
makes them block. It passes from any repo with history.

---

## Known issues

**The first install after the sentinel change may leave a duplicate section.**
If your `CLAUDE.md` holds a section whose wording no longer matches the snippet
in this repository — the hygiene section was de-identified during the split, for
instance — the exact-text search cannot find it, so install appends a wrapped
copy and prints a NOTE. Delete the older copy by hand; there is no way to
identify it without the heading-matching that caused six consecutive text-loss
defects, and a false positive there costs you your own writing.

**`install.sh` replaces the whole `hooks` block in `settings.json`.**
`merge-hooks.js` assigns `settings.hooks` wholesale, so hooks installed by
anything else are dropped — verified against a sandboxed `CLAUDE_HOME`. A
timestamped backup is written first, and everything outside `hooks`
(`model`, `env`, `permissions`, `statusLine`, …) is preserved. `uninstall.sh`
is the asymmetric case: it strips only this project's entries and leaves
foreign hooks alone. Making install equally surgical is a behaviour change
and has been left alone deliberately.

**`protect-user-dir.js` ships but is not wired.** The hook and its passing
test came across, but `hooks-config.json` declares no `Edit`/`Write` matcher
for it, so the guard against editing `~/.claude` directly is not active. It
is not wired upstream either. Add a `PreToolUse` entry if you want it.

---

## Timing log

Both gates append JSONL to `~/.claude/code-review-timing.jsonl` —
`hook.start`/`hook.end` with per-gate durations, `regen.coverage` and
`diff_cover` phase timings, per-check `hygiene.check` events, and
`review.completed_inferred` durations derived from the lock→retry delta, so
sub-agent review cost shows up even though hooks cannot observe the
sub-agent. Rotates at 10k lines. Read it with `/review-timing`.
