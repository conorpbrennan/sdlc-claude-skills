# sdlc-claude-skills

The SDLC toolchain for Claude Code: skills, review sub-agents, pre-commit
hooks and slash commands that turn a change into a planned, reviewed,
tested commit. Extracted from `risk-claude-skills` so the generic
engineering workflow lives apart from the domain skills.

## Using the plugin

Plugin components are namespaced, so commands and skills are invoked with
the `sdlc:` prefix: `/sdlc:feature`, `/sdlc:feature-new`, `/sdlc:commit-prep`,
`/sdlc:review-timing`, `/sdlc:verify`, `/sdlc:orchestrate`, `/sdlc:handoff`,
`/sdlc:model-spend`, `/sdlc:fit`, `/sdlc:main-model`, `/sdlc:plan-spec`,
`/sdlc:code-review-pre-commit` and `/sdlc:code-review-implementer`. The review
agents are `sdlc:code-reviewer` and `sdlc:code-reviewer-deep`; the plan-step
agent is `sdlc:implementer`; the verification agent is `sdlc:verifier`.
Both reviewers carry a `maxTurns` cap (75 and 60) that only cuts runaways; a report cut off without its `TDD_GATE` trailer counts as FAIL.

Your own config stays in `~/.claude/`: `tdd-mandate.json`,
`review-policy.json`, `hygiene-repos.json`, `verify-repos.json` and
`sdlc-review.json`. Each is optional. The plugin writes to `~/.claude/` in one
place only: the session-start hook sets `promptCacheTtl`, `model` and
`extraKnownMarketplaces` in `settings.json` (see
[Model steering](#model-steering) and [Auto-update](#auto-update)). See
[Configuration](#configuration) and the `.claude/*.json.example` templates.

### Install

Add this repository as a marketplace, then install the plugin from it:

```
/plugin marketplace add conorpbrennan/sdlc-claude-skills
/plugin install sdlc@sdlc-claude-skills
```

or from a shell:

```bash
claude plugin marketplace add conorpbrennan/sdlc-claude-skills
claude plugin install sdlc@sdlc-claude-skills
```

Then restart Claude Code; the plugin loads only after a restart.

### Update

Two steps, in order: refresh the marketplace, then update the plugin from it.
If either step fails with `Marketplace 'sdlc-claude-skills' not found` or
`Plugin "sdlc" not found`, the marketplace was never added on this machine:
run the [Install](#install) steps instead.

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

### Auto-update

You do not need to run the update steps by hand. Claude Code leaves
auto-update off for a third-party marketplace, and a plugin cannot switch it
on through its own `settings.json`. So the session-start hook does it. On the
first session after install it sets `"autoUpdate": true` on the
`sdlc-claude-skills` entry of `extraKnownMarketplaces` in
`~/.claude/settings.json`, with a `settings.json.backup.<UTC timestamp>-pre-sdlc-autoupdate`
copy. Claude Code then checks for a new version after the first message of
each session (up to 10 minutes later), updates the files on disk and asks for
`/reload-plugins`. A new version is detected by the `version` in
`.claude-plugin/plugin.json`, which every commit raises.

The hook acts only when Claude Code's own record
(`~/.claude/plugins/known_marketplaces.json`) shows the marketplace was added
from `conorpbrennan/sdlc-claude-skills`. A fork or local-path marketplace of
the same name is left alone. A value you set yourself is kept, true or false.
To opt out, set `"autoUpdate": false` on that entry, or
`touch ~/.claude/sdlc-autoupdate.disabled`. `DISABLE_UPDATES`,
`DISABLE_AUTOUPDATER` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` switch
Claude Code's update pass off whatever the setting says.

Because updates now flow in unattended, a change pushed to this repo reaches
every install. That includes changes to the shipped defaults (see
[Model steering](#model-steering)).

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
    │
    ▼  (once per branch, after the last commit)
  verify          /sdlc:verify ─► verifier sub-agent ─► VERIFY_GATE: PASS|FAIL
    │                             recorder writes ## Verification + marker
    ▼
  pull request    gh pr create (gated per repo by pre-pr-verify.js)
```

A completed review never commits on your behalf. It writes the marker; the
commit stays your command. Verification is the same: `/sdlc:verify` changes
the feature record and writes its marker, and the commit and the PR stay yours.

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
| `agents/implementer.md` | `sdlc:implementer` (Sonnet, 80 turns) | the plan-step implementer; at 60 turns it wraps up, past 80 it reports PARTIAL |
| `agents/verifier.md` | `sdlc:verifier` (Sonnet) | the read-only verification sub-agent |
| `commands/*.md` | `/sdlc:commit-prep`, `/sdlc:review-timing`, `/sdlc:feature`, `/sdlc:feature-new`, `/sdlc:orchestrate`, `/sdlc:handoff`, `/sdlc:model-spend`, `/sdlc:fit`, `/sdlc:main-model` | slash commands |
| `commands/verify.md` | `/sdlc:verify` | dispatches the verifier, then runs the recorder |
| `hooks/hooks.json` | registered while the plugin is enabled | wires `src/hooks/*.js` to events through `${CLAUDE_PLUGIN_ROOT}` |
| `src/hooks/*.js`, `src/hooks/lib/*.js` (not `test-*`) | run in place from the cache | the gates and their shared helpers |
| `src/hooks/pre-pr-verify.js` | PreToolUse on `Bash` | the `gh pr create` gate, per repo |
| `src/hooks/record-verification.js` | run by `/sdlc:verify` | turns a verifier report into the `## Verification` section and the marker |
| `instructions/*-snippet.md` | injected each session by `session-start-instructions.js` | the instructions Claude follows on a block, including the TDD mandate; the same hook warns when a legacy install is still wired, turns on auto-update for this plugin's marketplace (see Auto-update below), sets `"promptCacheTtl": "1h"` in the user settings file when a per-token backend would use the 5-minute prompt cache (opt out with `~/.claude/sdlc-cache-ttl.disabled`), and copies `mainModel` from `~/.claude/sdlc-review.json` into settings `model`; both apply from the next session |
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
message. Round 1 is always `code-reviewer` (Sonnet); `--deep` selects
`code-reviewer-deep` (Opus) for the rerun after a FAIL. On a gap-patching block it
patches uncovered lines instead and writes no marker: the new tests are
staged and the commit retried. Its report ends in `GAP_PATCH`, not
`TDD_GATE`, so it cannot license the marker. The hook approves on coverage
only once no Python file differs from its staged copy and no test file or
`conftest.py` is untracked or gitignored (a test inside a wholly ignored
directory is the one it cannot see). Not for ad-hoc PR review — use the
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
| `/commit-prep [--skip-tests]` | Runs ruff + the full pytest suite + coverage before you stage, so hygiene and review failures collapse into one round-trip. Never stages or commits. |
| `/review-timing [--days N] [--repo PATH] [--json]` | Fast-path hit rate, per-gate breakdown, p50/p95 on coverage regen and diff-cover. |
| `/feature <slug>` / `/feature list` | Recall prior context for a feature branch. |
| `/feature-new <slug> "<requirement>" ["<criterion>" ...]` | Seed or update `features/<slug>.md`, including its 2–5 `## Acceptance` criteria. |
| `/sdlc:orchestrate on\|off\|status` | Switch orchestrator mode: the main session dispatches sub-agents instead of editing source. See [Model steering](#model-steering). |
| `/sdlc:handoff [slug]` | Write a fixed-form handoff file in `tmp/` and print the line that resumes it in a fresh session. |
| `/sdlc:model-spend [--days N] [--json]` | Weekly model spend from local transcripts: Opus and Sonnet share, orchestration, untiered Opus dispatches, review round 3, and (section 8) main-session prompt cache cost by backend and TTL. |
| `/sdlc:fit [--days N] [--json]` | Usage fit from local transcripts: context size, resets, model mix, cache backend, and what each lever would have saved on your own history. Counterfactuals at list prices, not forecasts. |
| `/sdlc:main-model [haiku\|sonnet\|opus\|off]` | Show or set the persistent main-session model (`mainModel` in `~/.claude/sdlc-review.json`; Sonnet by default). `off` opts out of the shipped default. |
| `/verify` | Check the branch against its `## Acceptance` criteria: dispatches the `verifier` sub-agent, then records the result in the feature record and, on PASS, writes `.git/.claude-last-verify`. Needs a clean tree. Never commits or opens the PR. |

---

## The hooks

Wired to events by `hooks/hooks.json`. The `PreToolUse` chain runs
in order, cheapest rejection first.

| Hook | Event | Gate |
|---|---|---|
| `session-start-feature.js` | SessionStart | Creates `features/<branch>.md` on a new feature branch and asks for the requirement |
| `enforce-review-implementer.js` | UserPromptSubmit | Routes review-fix prompts through the implementer skill |
| `orchestrator-mode.js` | UserPromptSubmit, PreToolUse (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`), PostToolUse (`Read`, `Bash`, `Skill`, `Agent`) | Orchestrator mode: turns on from a handoff, denies main-session code edits, nudges after inline Bash |
| `session-start-instructions.js` | SessionStart | Injects the session instructions; sets `promptCacheTtl` and `model` in settings.json (see [Model steering](#model-steering)) |
| `agent-tier-gate.js` | PreToolUse (`Agent`) | Opus dispatch needs a `TIER` reason; unset models on built-in agents go to Sonnet |
| `read-trim.js` | PostToolUse (`Read`) | Trims whole-file Reads over 12,000 chars inside sub-agents |
| `pre-commit-feature.js` | PreToolUse | Blocks source commits on trunk, and on a branch until the feature file has a real requirement |
| `pre-commit-review.js` | PreToolUse | Blocks unless `.git/.claude-last-review` is fresh and both hashes match |
| `pending-review-gate.js` | PreToolUse | Dormant — nothing writes its marker today |
| `enforce-co-author.js` | PreToolUse | Attribution trailer |
| `pre-commit-hygiene.js` | PreToolUse | ruff + targeted pytest in opted-in repos |
| `pre-pr-verify.js` | PreToolUse | On `gh pr create` in a repo listed in `verify-repos.json`: a notice (advisory, the default) or a block (enforce) when the verification is missing or stale |
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

A change can also go in as two commits, test first. An implementation commit with
no test passes when the commit just before it (HEAD, or HEAD~1 for `--amend`) is
test-only and adds test code. Until 2026-10-12 the docs promised this and the gate
blocked the second commit as `no_tests` every time. Committing the test first is
also the way through a `code_first` block.

What counts as a test is a path convention, listed in
`src/hooks/lib/tdd-order.js`: a `test/`, `tests/`, `spec/` or `__tests__/`
directory; a `test-` or `test_` prefix; a `_test.` or `.test.` or `.spec.` infix;
`_spec.rb`; or a `*Test.java`-style suffix **inside** a test directory, where a
.NET `Tests/`, `<Name>.Tests/` or `<Name>.Specs/` folder (any case, plural only)
also counts. That last restriction matters: a bare `*Spec.java` rule swept in
whole public APIs (JavaPoet's `TypeSpec`, KotlinPoet's `FileSpec`), and calling
production code a test is the fail-open direction.

A `features/` directory is Cucumber's, and its step definitions count as tests.
If this project's own feature records live there too, they are `.md` and
therefore not code, so they are exempt rather than mistaken for tests.

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
directory, which includes a .NET `Tests/`, `<Name>.Tests/` or `<Name>.Specs/` folder
in any case (`CCF.TESTS/`), plural only: a bare rule swept in whole public APIs — JavaPoet's `TypeSpec`,
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

Every PreToolUse block goes out through `lib/hook-output.js` as a
`permissionDecision: deny`. Claude sees `permissionDecisionReason` and nothing
else: `systemMessage` goes to the user, and the legacy `reason` is dropped once
the deny shape is present. So the deny reason carries the full instructions:
the marker recipe, the rounds policy, a failing check's output. Until 2026-10-12
those were in `systemMessage` only, and Claude never saw them.

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
fresh review. Only the review-required block writes it: the TDD,
coverage-stale and gap-patch blocks ask for a code or coverage change, not
a review, so their retries go back through the gate that blocked them. On
the hygiene path that means a retry waits for fresh coverage again, up to
`COV_WAIT_TIMEOUT_MS` (two minutes by default).

---

## Model steering

Prompt-cache TTL. Claude Code gives the main conversation a 1-hour prompt cache on a claude.ai subscription, but 5 minutes on an API key, a custom `ANTHROPIC_BASE_URL` gateway, Bedrock, Vertex or Foundry. On 5 minutes, every wait over 5 minutes (a sub-agent, a review, the owner) re-caches the whole context. A plugin cannot set the TTL through plugin settings, so `session-start-instructions.js` writes `"promptCacheTtl": "1h"` into the user settings file (`$CLAUDE_CONFIG_DIR/settings.json`, else `~/.claude/settings.json`) at session start when it finds a per-token backend on the 5-minute default. It keeps every other key, copies the old file to `settings.json.backup.<UTC timestamp>-pre-sdlc-cache-ttl` first, and tells the owner. The setting takes effect from the next session; the session that wrote it stays on 5 minutes. To opt out, `touch ~/.claude/sdlc-cache-ttl.disabled` (in the config directory); the hook then only warns. If settings.json is not a JSON object or cannot be written, the hook warns and the manual fix is `export CLAUDE_CODE_PROMPT_CACHE_TTL=1h` in the shell profile that launches claude. The hook does nothing if you have already chosen a TTL: `CLAUDE_CODE_PROMPT_CACHE_TTL` set to `1h` or `5m` (in your shell or an `env` block), a `promptCacheTtl` setting, `ENABLE_PROMPT_CACHING_1H` or `FORCE_PROMPT_CACHING_5M`. Sub-agents stay on 5 minutes on purpose. A 1h cache write costs more, and sub-agents mostly run without pauses, so a longer cache rarely helps them. `/sdlc:fit` prices the 1h cache for the main session only, and only on a per-token backend.

Main-session model. `mainModel` (`haiku`, `sonnet` or `opus`) in `~/.claude/sdlc-review.json` makes the main-session model persistent when settings.json is reset on container start. The plugin ships `defaults/sdlc-review.json` with `"mainModel": "sonnet"`, so installing the plugin makes Sonnet the main-session model from the second session on, with no setup. The shipped default applies whenever the user file has no `mainModel` key (or there is no user file), and it overwrites an existing `model` in settings.json. A plugin cannot set `model` through its own `settings.json` (Claude Code honours only `agent` and `subagentStatusLine` there), so the hook does it. `/sdlc:main-model off` stores `"mainModel": "off"` as an explicit opt-out; removing the key would bring the default back. A malformed user file gets no default. At session start `session-start-instructions.js` writes it into `model` in `<config dir>/settings.json` when they differ, with the same safe single-key writer and a `settings.json.backup.<UTC timestamp>-pre-sdlc-model` copy, and tells the owner. It applies from the next session. It is read from the user file only (a repo file's `mainModel` is ignored with a warning, since settings.json is global), and an invalid value does nothing. If `ANTHROPIC_MODEL` is set it overrides settings, so the hook warns that `mainModel` has no effect. `/sdlc:main-model [haiku|sonnet|opus|off]` shows (the effective model and whether it comes from the user file, the shipped default or an opt-out) or changes it; `/model` changes only the current session.

- **Goal.** The main session runs on Sonnet (`mainModel`). Volume work (building, reviewing, investigating) runs on Sonnet. Opus is used where it is stated on purpose: writing new plans (switch with `/model`; editing an existing plan runs on Sonnet), plan source review, round-2 code review.
- **Keep the main context short.** Every call re-reads the whole conversation. A call at 300K tokens costs far more than one at 100K, and a long session pays that on every turn. When the context reaches about a fifth of the window, run `/sdlc:handoff`, then `/clear`, then resume from the handoff file. Several short sessions cost less than one long one. Orchestrator mode also helps: it keeps the work in sub-agents, so the main context grows slowly. `/sdlc:fit` shows how much of your cost is in calls over 300K.
- **`sdlc-review.json`** sets the models. Layers, weakest first: built-in defaults, `~/.claude/sdlc-review.json`, `<repo>/.claude/sdlc-review.json`, path rules, then a one-off `--model` on `/sdlc:code-review-pre-commit`. A rule is `{ "paths": [...], "round1": "<model>", "round2": "<model>" }`. Rules from both files apply, and the strongest matching model wins (opus, then sonnet, then haiku). Copy `.claude/sdlc-review.json.example`; every key is optional.
- **Keys.** `round1` (default sonnet) and `round2` (default opus) are the models for the first review and for reruns. Round 1 always runs `code-reviewer`, later rounds `code-reviewer-deep`: only the model is configurable. `maxRounds` (default 2) is enforced by the gate: it refuses a marker for a higher round. `planReview.source` (opus), `planReview.consistency` (sonnet) and `planReview.cap` (2) steer the `plan-spec` review rounds. `orchestrator.bashNudge` (8) is the nudge threshold below. The gate message names the reviewer and model it expects.
- **Globs.** `**/*.md` does not match a root-level file such as `README.md`. List `*.md` too, as the example does.
- **A bad file never blocks.** Invalid JSON or an invalid value is ignored with a one-line warning, and the next layer applies.
- **`agent-tier-gate.js`** (PreToolUse on `Agent`). An Opus or Fable dispatch needs a `TIER: opus: <category>` line, where the category is plan writing, plan source review, fail triage, or user asked (the last raises a confirm prompt), or it is denied. Plan writing is for new plans only: folding findings into, revising or adding to an existing plan runs on Sonnet (the gate checks the description and the first sentence of the prompt for edit wording). Any other reason is denied; the dispatch goes on Sonnet. A `general-purpose`, `Explore` or `Plan` dispatch with no model (or `inherit`) is rewritten to Sonnet. The same three types get a short context-budget block appended to the prompt (`lib/context-budget.js`, once, in the same `updatedInput`). `sdlc:*` agents, `fork` and custom agents are untouched.
- **`read-trim.js`** (PostToolUse on `Read`). Inside a sub-agent, a whole-file text read over 12,000 chars is cut to whole lines plus a note saying how to read the rest. Ranged reads (`offset` or `limit`), the main session and non-text results are untouched.
- **Orchestrator mode** (`orchestrator-mode.js`). It turns on when the main session reads a handoff or tracker file (a `.md` named `*handoff*`, or with `tracker` in its path) or runs `plan-spec run`. While on, it denies Edit, Write, MultiEdit and NotebookEdit in the main session on code: the extensions in `lib/source-files.js` (`SOURCE_EXTENSIONS`) plus `.ipynb`. Every other file stays writable: docs, config, data, handoffs, trackers, reports, briefs, plans, feature records, memory and temp files. Code under `/tmp` and the handoff, tracker, report and brief paths stays writable too. After `bashNudge` inline Bash commands with no Agent dispatch in between, it adds a nudge to hand the work to a sub-agent. Commands such as `git add`, `git status`, `gh` and `printf` do not count. Sub-agents are never affected. `/sdlc:orchestrate on|off|status` is the owner's switch; after `off`, triggers do not turn it back on in that session.
- **`/sdlc:handoff [slug]`** writes `tmp/HANDOFF-<slug>-<timestamp>.md` in a fixed form (next action, state, in flight, decisions, verified facts) and prints the line to paste into a fresh session. Reading that file turns orchestrator mode on there.
- **`/sdlc:model-spend [--days N] [--json]`** reads `~/.claude/projects` transcripts and reports the Opus and Sonnet share of cost, main-session work versus orchestration, Opus sub-agents without a `TIER` line, and sessions that reached review round 3. List-price estimates, local files only.
- **`/sdlc:fit [--days N] [--json]`** reads the same transcripts. For each week it prints how much main-session cost is in long-context calls, how often you reset, the model mix and the cache rebuild cost. It then prices four levers and a combined total:
  - `context-reset`: calls over 300K repriced at your under-100K cost per call. Exact arithmetic.
  - `sonnet-main`: 30 to 45 percent off the Opus and Fable work on the main session. An estimate.
  - `cache-1h-main`: about 70 percent of the main-session cache rebuild cost on a per-token backend. An estimate. Not applicable on a claude.ai login.
  - `cap-runaway-subagents`: the cost past call 40 of sub-agent runs over 100 calls. An upper bound, because a fresh agent redoes some of that work.

  Percentages are of total cost: main session plus sub-agents. The combined total applies the levers one after another, so overlapping savings are not counted twice. There is no sub-agent cache lever; see the cache note above. If you already use a lever, its saving is already in your history, so compare the default window with `--days 7`. All figures are what the levers would have saved on your own history at list prices. They are not forecasts. On a claude.ai subscription, read the shares, not the dollars. The tool only reads, and prints numbers and fixed labels only.

## Configuration

### `~/.claude/sdlc-review.json`
Model steering: `round1`, `round2`, `maxRounds`, `planReview`, `orchestrator.bashNudge`, path `rules` and `mainModel`. A repo file `<repo>/.claude/sdlc-review.json` layers over it, except `mainModel`, which is read from the user file only. Template: `.claude/sdlc-review.json.example`. Details under [Model steering](#model-steering).

### `~/.claude/hygiene-repos.json`
Per-repo opt-in for the hygiene gate: `setup` shell lines plus a list of
`{ name, command }` checks. Seeded from `.claude/hygiene-repos.json.example`,
which carries the canonical ruff-check → ruff-format → targeted pytest-cov →
diff-cover recipe. Copy that rather than inventing a variant. The pytest
check runs only the tests that match the staged modules
(`test_<basename>*.py`, found anywhere in the repo outside `.venv`,
`node_modules` and `archive`, plus any staged test file); with no match it runs the
`smoke` marker or warns, and diff-cover is skipped because no `coverage.xml`
was written. The full suite runs in `/sdlc:verify` and `/commit-prep`.
Hygiene pytest cost 436 min/week on 19 Oct 2026, 22 min per commit in the
one large worktree, on the full suite.

The recipe runs pytest with `-n auto --dist loadfile` when xdist imports and
warns and runs serially otherwise; move any fixed-path fixture (`.db`,
`.sqlite`, `/tmp/<name>`) to `tmp_path_factory` before a repo opts in.

The hook runs `bash -c`, not a login shell, so conda must be sourced
explicitly in `setup`.

A `ruff check --fix` or `ruff format` check that rewrites a staged file
leaves the rewrite unstaged. The coverage gate then skips its fast path and
names the file, because `coverage.xml` measured the rewrite rather than the
index: stage it and retry.

For Python repos also using the coverage gate, include a pytest-cov check
(any check whose name contains "cov" or whose command uses `--cov-*`). When
the review hook finds `coverage.xml` older than a staged file it does not
run pytest-cov itself — it polls for the parallel hygiene hook to refresh
it (120s default, `COV_WAIT_TIMEOUT_MS` to override) and blocks if no cov
check is configured or the wait times out.

### `~/.claude/verify-repos.json`
Per-repo opt-in for `pre-pr-verify.js`, keyed by git toplevel:
`{ "version": 1, "repos": { "<toplevel>": { "mode": "advisory" } } }`.
Seeded from `.claude/verify-repos.json.example`. A repo not listed is not
gated.

- `advisory` (the default, and what a missing `mode` means): `gh pr create`
  runs. When the verification is missing or stale, the user sees a notice.
  Claude does not see it; Claude learns the rule from the session
  instructions.
- `enforce`: the same states block `gh pr create` until `/sdlc:verify`
  passes. A config that cannot be read blocks too, because the mode cannot be
  known.

The marker is keyed on the code tree without `features/*.md`, plus the
acceptance criteria. Committing the feature record that `/sdlc:verify` writes
keeps it fresh. Any other committed change, or a criteria edit, makes it
stale. Only `gh pr create` is gated: not `git push`, not `gh pr merge`, not a
PR opened from the web.

### `~/.claude/review-policy.json`
Per-repo fast-path tuning for `pre-commit-review.js`:
`presentational_paths`, `trivial_line_threshold`, `diff_cover_threshold`,
`branch_cover_threshold`, `max_tests_per_commit`. Defaults apply where a repo or field is absent.

The review-required block message ends its file list with an advisory line,
`Tests added: <functions> functions, <rows> parametrised rows, <testLines>/<sourceLines> test/source lines (ceiling <max_tests_per_commit>).`
It counts the staged source diff the hook already read, through
`src/hooks/lib/added-tests.js`; the rows figure counts parametrise decorators.
A failed read prints `Tests added: unreadable.` The ceiling (default 8) never
blocks and never touches a marker. The coverage thresholds stay at 95 and 90 on
22 Oct 2026 evidence (3 of 31 hygiene blocks, 10 of 285 review blocks were coverage).

### Emergency override
```bash
printf 'PASS\n%s' "$(git diff --cached | git hash-object --stdin)" > .git/.claude-last-hygiene
```

### Opt out of feature tracking per repo
```bash
touch .claude/feature-tracking.disabled
```

---

## Tests

```bash
bash tools/run-tests.sh [-j N]
```

`tools/run-tests.sh` runs every suite in parallel (`-j` defaults to `nproc`),
points `TIMING_LOG_PATH` at a scratch file so no suite writes fixture rows to
`~/.claude/code-review-timing.jsonl`, prints one `rc=N file` line per file and
exits non-zero if any file did. To run one suite, use its own command, for
example `node src/hooks/test-X.js` or `bash src/hooks/test-X.sh`.

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

Every suite passes. Run them from a clone with history, not from this repo
before its first commit — see the note above.

`test-pre-commit-review.js` also reads this repository's HEAD. Its TDD-mandate
fixtures run with no transcript, so the hook's split rule asks whether HEAD is
a test-only commit. While HEAD holds test files and nothing else that is code,
10 of its cases fail. They pass again once HEAD carries implementation.

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
