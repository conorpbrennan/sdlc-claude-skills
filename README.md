# sdlc-claude-skills

The SDLC toolchain for Claude Code: skills, review sub-agents, pre-commit
hooks and slash commands that turn a change into a planned, reviewed,
tested commit. Extracted from `risk-claude-skills` so the generic
engineering workflow lives apart from the domain skills.

## Install

The toolchain ships as a Claude Code plugin named `sdlc`. This repository is
also the marketplace that serves it. Inside Claude Code:

```
/plugin marketplace add conorpbrennan/sdlc-claude-skills
/plugin install sdlc@sdlc-claude-skills
```

Or from a shell:

```bash
claude plugin marketplace add conorpbrennan/sdlc-claude-skills
claude plugin install sdlc@sdlc-claude-skills
```

Node is required, because the hooks are Node. The repository is private, so
git needs credentials for GitHub before the marketplace can be added. Restart
Claude Code after installing.

Plugin components are namespaced, so commands and skills are invoked with
the `sdlc:` prefix: `/sdlc:feature`, `/sdlc:feature-new`, `/sdlc:commit-prep`,
`/sdlc:review-timing`, `/sdlc:plan-spec` and `/sdlc:code-review-pre-commit`.
The review agents are `sdlc:code-reviewer` and `sdlc:code-reviewer-deep`.

Your own config stays in `~/.claude/`, and the plugin never writes to it:
`tdd-mandate.json`, `review-policy.json` and `hygiene-repos.json`. Each is
optional. See [Configuration](#configuration) and the `.claude/*.json.example`
templates.

### Update

Two steps, in order: refresh the marketplace, then update the plugin from it.

```
/plugin marketplace update sdlc-claude-skills
/plugin update sdlc@sdlc-claude-skills
```

or from a shell:

```bash
claude plugin marketplace update sdlc-claude-skills
claude plugin update sdlc@sdlc-claude-skills
```

Then restart Claude Code; the update takes effect only after a restart.

### Uninstall or disable

```bash
claude plugin disable sdlc@sdlc-claude-skills     # keep it installed, turn it off
claude plugin uninstall sdlc@sdlc-claude-skills
```

### Migrating from `install.sh`

An `install.sh` deployment and the plugin must not run together, because every
gate would fire twice. The plugin checks for this: while `~/.claude/settings.json`
still wires one of the legacy hook scripts, every session opens with a warning
naming them and this fix. Remove the legacy copy first, then install the plugin:

```bash
cd ~/dev/sdlc-claude-skills
./uninstall.sh --dry-run    # list what would go
./uninstall.sh              # remove copied files, settings.json hooks and CLAUDE.md sections
```

Your tuned `~/.claude/*.json` config is kept. See [Uninstall](#uninstall) for
exactly what is removed.

An install older than the install record (no
`~/.claude/backups/sdlc-claude-skills/installed.tsv`) may leave two flat skill
files that neither a reinstall nor `uninstall.sh` removes:
`~/.claude/skills/code-review-pre-commit.md` and
`~/.claude/skills/code-review-implementer.md`. Delete them by hand after
uninstalling.

### Developing the plugin

This repository is the source of truth. To load a working copy instead of the
installed plugin:

```bash
claude --plugin-dir ~/dev/sdlc-claude-skills
```

Check the manifests before pushing with `claude plugin validate .`.

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

`/plugin install` copies the repository into Claude Code's plugin cache
(`~/.claude/plugins/cache/`), and everything runs from there. Nothing is copied
into `~/.claude/skills`, `hooks` or `tools`, and neither `settings.json` nor
`CLAUDE.md` is edited: disabling the plugin turns all of it off.

| Source | At run time | Purpose |
|---|---|---|
| `.claude-plugin/plugin.json`, `marketplace.json` | read by `/plugin` | the `sdlc` plugin, served by the `sdlc-claude-skills` marketplace |
| `skills/*/SKILL.md` | skills `sdlc:plan-spec`, `sdlc:code-review-pre-commit`, `sdlc:code-review-implementer` | the three workflow skills |
| `agents/*.md` | `sdlc:code-reviewer` (Sonnet), `sdlc:code-reviewer-deep` (Opus) | the review sub-agents |
| `commands/*.md` | `/sdlc:commit-prep`, `/sdlc:review-timing`, `/sdlc:feature`, `/sdlc:feature-new` | slash commands |
| `hooks/hooks.json` | registered while the plugin is enabled | wires `src/hooks/*.js` to events through `${CLAUDE_PLUGIN_ROOT}` |
| `src/hooks/*.js`, `src/hooks/lib/*.js` (not `test-*`) | run in place from the cache | the gates and their shared helpers |
| `instructions/*-snippet.md` | injected each session by `session-start-instructions.js` | the instructions Claude follows on a block, including the TDD mandate; the same hook warns when a legacy install is still wired |
| `tools/*.py` | run in place, found by `/sdlc:review-timing` | timing analyser |
| `.claude/*.json.example` | templates only | thresholds, repo opt-ins, TDD exemptions |
| `legacy/hooks-config.json` | read only by `uninstall.sh` | the pre-plugin wiring it strips from `settings.json` |

Your config lives in `~/.claude/*.json` and the plugin only reads it. Copy a
`.json.example` there to tune per-repo thresholds, opt-ins or exemptions; every
file is optional. `tdd-mandate.json` starts empty, because the mandate is on by
default and that file only lists the exceptions.

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

Wired to events by `hooks/hooks.json`. The `PreToolUse` chain runs
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
extensionless files. There is no exempt-directory list — `tmp/` and `.planning/`
had one and lost it, so code committed there needs a test like any other. A
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

The plugin is removed like any other:

```bash
claude plugin disable sdlc@sdlc-claude-skills     # keep it, turn it off
claude plugin uninstall sdlc@sdlc-claude-skills   # remove it from the cache
```

That touches nothing outside the plugin cache. Your `~/.claude/*.json` config and
the timing log stay; delete them by hand if you want them gone.

### Removing a pre-plugin install (`uninstall.sh`)

`uninstall.sh` is the one-time migration for a machine that ran the retired
`install.sh`, which copied files into `~/.claude/` and merged into
`settings.json` and `CLAUDE.md`. Run it from a checkout of this repository (or
of the pre-plugin toolchain):

```bash
./uninstall.sh --dry-run        # list what would go
./uninstall.sh                  # remove, keeping your tuned config
./uninstall.sh --purge-config   # also delete hygiene-repos.json, review-policy.json and tdd-mandate.json
```

Removal is read from the install record the old `install.sh` wrote to
`~/.claude/backups/sdlc-claude-skills/`: `installed.tsv` lists every file it
deployed with a checksum, and uninstall deletes a file only while it still
matches. Anything added after that install — a new agent, a file dropped into
one of its skill directories, a hook another tool overwrote — is not in the
record or no longer matches it, and stays. `backups.tsv` lists what the install
moved aside to make room: an `original` (yours before this project was
installed there) is put back once the path is free; an `edited` copy (its file
with your changes) stays in `~/.claude/backups/`. The record also keeps its
own copies of the hooks wiring and the CLAUDE.md snippets that were merged
(the wiring as it stood at that install, of which `legacy/hooks-config.json`
is the final form), so uninstall strips exactly what was installed even
though this tree has moved on.

Without a record — an install older than it — uninstall falls back to this
tree's file list, the snippets in `instructions/` and the frozen pre-plugin
wiring in `legacy/hooks-config.json`, and says so. Read the flat-skill-file note
under [Migrating](#migrating-from-installsh) before relying on that fallback.

`settings.json` is edited surgically — `src/unmerge-hooks.js` strips only the
entries naming this project's hook scripts, and hooks you added from elsewhere
survive. It runs before any file is deleted, so a `settings.json` that will not
parse stops the uninstall with the hooks still wired to scripts that exist.
`CLAUDE.md` loses only the blocks this project wrote — byte for byte, verified
by a round-trip test — which it can identify exactly because the install
wrapped them in sentinels:

```
<!-- sdlc-claude-skills:begin Feature Tracking -->
## Feature Tracking
...
<!-- sdlc-claude-skills:end Feature Tracking -->
```

Every lookup is a literal string search for those markers — there is no markdown
parsing, so a heading of ours quoted in a code example, a section of yours called
`## Feature Tracking Notes`, a sentence mentioning one of the headings, CRLF line
endings and tabs are all simply irrelevant. A `CLAUDE.md` merged before the
sentinels existed is found by searching for the snippet's exact text instead. If
neither search matches — you edited the section, or its wording changed since —
nothing is deleted: uninstall leaves the old text alone and tells you.

Ambiguity is refused, never resolved by guessing. A begin marker with no end, a
second begin marker before the matching end (which a marker quoted in prose or
pasted from this page would produce), more than one verbatim copy of a snippet,
a target that is not valid UTF-8, or a read that fails for any reason other than
"not there" all abort with a message naming the problem, leaving the file
untouched — and under `uninstall.sh`'s `set -e` that stops the run.

A timestamped `CLAUDE.md.backup.*` is written before overwriting, on every path.
Nothing outside a block is rewritten: blank-line runs are adjusted only where a
block was removed, so blank lines inside your own fenced code and any minority
line endings come back byte for byte.

Left in place on purpose: the timing log (`~/.claude/code-review-timing.jsonl`),
the per-repo `.git/` markers, which expire on their own, the timestamped
`settings.json` and `CLAUDE.md` backups, and whatever stays in
`~/.claude/backups/` (edited copies, and originals whose path is in use).

**If another project installed the same hooks** — `risk-claude-skills` did — a
copy it wrote over ours no longer matches the record, so uninstall here leaves
it. A byte-identical copy cannot be told apart and is removed; re-run that
project's install script afterwards.

---

## Tests

```bash
for t in src/hooks/test-*.js src/test-*.js; do node "$t"; done
for t in src/hooks/test-*.sh; do bash "$t"; done
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

`src/test-unmerge-hooks.js` and `src/test-unmerge-claude-md.js` build the
`settings.json` and `CLAUDE.md` a legacy install wrote with the frozen mergers in
`legacy/`, then check that `uninstall.sh`'s unmergers reverse them exactly.

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

**`protect-user-dir.js` ships but is not wired.** The hook and its passing
test came across, but `hooks/hooks.json` declares no `Edit`/`Write` matcher
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
