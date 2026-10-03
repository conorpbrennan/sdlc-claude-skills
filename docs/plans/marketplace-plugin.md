# Ship the SDLC toolchain as a Claude Code plugin from a same-repo marketplace, retiring `install.sh`. NOT: changing what any hook, skill or agent decides; the subdirectory staged-diff fix (separate plan, fix-subdir-staged-diff.md beside this one); the stale `protect-user-dir.js` message (it is not wired into `.claude/hooks-config.json`).

## 1. What this delivers

Today `install.sh` copies hooks, skills, agents, commands and tools into `~/.claude/`, merges hook entries into `~/.claude/settings.json`, and merges four sections into `~/.claude/CLAUDE.md`. After this plan:

```
/plugin marketplace add conorpbrennan/sdlc-claude-skills
/plugin install sdlc@sdlc-claude-skills
```

installs the same toolchain, updates come from `/plugin marketplace update`, and nothing is written into `~/.claude/` except the user's own config (`tdd-mandate.json`, `review-policy.json`, `hygiene-repos.json`), which the hooks already treat as optional.

Facts this plan rests on (Claude Code 2.1.288, plugin docs at code.claude.com/docs/en/plugins/*; the layout was confirmed with a probe plugin that `claude plugin validate` passed):

- Plugin root holds `.claude-plugin/plugin.json` (only `name` required), a skills directory with one SKILL.md per skill directory, `agents/*.md`, `commands/*.md`, `hooks/hooks.json` (top-level `"hooks"` key).
- `.claude-plugin/marketplace.json` may live in the same repo with plugin `"source": "./"`.
- `${CLAUDE_PLUGIN_ROOT}` is substituted in hook `command` strings. It is the install cache and changes on update, so nothing writes state there.
- Plugin components are namespaced and bare names do not resolve: `/sdlc:feature-new`, `/sdlc:code-review-pre-commit`, agent `sdlc:code-reviewer`.
- A plugin cannot write `CLAUDE.md`. A SessionStart hook's `additionalContext` is the substitute, capped at 10,000 characters per hook. The four snippets total 7,736 bytes today.
- Plugin hooks get the same stdin JSON, cwd and `{decision: block}` semantics as settings.json hooks.

## 2. Working constraints, every step

- Branch `marketplace-plugin` from `main`. Seed `features/marketplace-plugin.md` with `/feature-new marketplace-plugin "Install the SDLC toolchain as a Claude Code plugin from this repo's marketplace instead of install.sh."` before the first source commit.
- Plugin name `sdlc`, marketplace name `sdlc-claude-skills` (Q1).
- Single owners: the plugin name lives in exactly one code constant, `PLUGIN` in `src/hooks/lib/plugin-names.js` (step 3). Hook messages build names from it, and nothing else spells `sdlc:` in JS. Hook wiring lives only in `hooks/hooks.json` once step 1 lands. `.claude/hooks-config.json` is the parity reference until step 6, which moves it to `legacy/hooks-config.json` as frozen legacy wiring read only by `uninstall.sh` and `src/test-unmerge-hooks.js`.
- Marker and timing tags (`code-reviewer:round1:PASS`, `agent=code-reviewer`) stay bare. They are labels the analyser groups on, not dispatch names.
- Commit protocol: `git add <paths>` alone, then `git commit -m "..."` alone. Never `-a`, a `cd`, or a wrapper. The first attempt blocks, and its message is the only source of the marker recipe. Moves use `git mv`, staged by the same rule.
- TDD: each step's test file is edited before its implementation, and both land in one commit. Moves and JSON/markdown are exempt by extension, but every step still carries a test (below).
- Red baseline, recorded on `main` at `5854535`: `node src/hooks/test-pre-commit-review.js` gives 177 passed, 26 failed (all TDD `no_tests` pre-emption, see the subdir-fix plan). Record the pass/fail counts of every other `src/hooks/test-*.js`, `src/test-*.js` and `bash src/test-install.sh` in the tracker before step 1. A step's GATE is "no new failures against this baseline, named".
- `claude plugin validate .` exits 0 after every step from step 1 on.
- Always-permitted paths: this plan file, `features/marketplace-plugin.md`.

## 3. Owner decisions

Answered 2026-10-03 (owner: "go with your recommendations"): Q1 = `sdlc` / `sdlc-claude-skills`. Q2 = no `version` field. Q3 = delete `install.sh` and keep `uninstall.sh` as the migration. Q4 = the subdir fix lands on `main` first. Q5 = 1 round. Q6 = stop before commit: the orchestrator runs up to a written PASS marker, then the owner commits. Revised 2026-10-03 by the owner ("you commit each step"): the orchestrator commits each step once its review passes. After two FAILs on a step it stops and asks.


- Q1, names: plugin `sdlc` and marketplace `sdlc-claude-skills` (recommended, short namespace), or another name. Blocks step 1.
- Q2, versioning: omit `version` so every commit on the default branch is an update (recommended for a single-user toolchain), or semver with a bump per release. Blocks step 1.
- Q3, `install.sh`: delete it and its merge scripts, keeping `uninstall.sh` as the one-time migration that removes the legacy copies (recommended), or keep `install.sh` as a developer path alongside the plugin. Blocks step 6.
- Q4, ordering against the subdir-fix plan: land that fix first on `main` (recommended, since the bug is live and the fix is one step), or fold it in after step 6.
- Q5, review-loop cap for this plan: 1 or 2 rounds.
- Q6, standing authorisation to stage, attempt commits and write PASS markers unattended for this plan. The user CLAUDE.md otherwise says to stop after the marker and wait.
- The repository is private on GitHub, so `/plugin marketplace add` needs working git credentials on each machine. Not a decision, but a cutover precondition.

## 4. Order

1 -> 2 -> 3 -> 4 -> 5 -> 6, strictly sequential. Steps 2 and 3 both touch skill text, and 3 and 6 both touch README and CLAUDE.md. The branch merges to `main` as a unit, because the namespaced names in step 3 resolve only once the plugin is installed. Cutover (section 7) follows the merge.

## Steps

**1. The repository is a valid plugin and marketplace, with hook wiring identical to `install.sh`'s**

NEW `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `src/test-plugin-layout.js`.
IMPORTS: none. MUST NOT TOUCH: `.claude/hooks-config.json` (parity reference), `install.sh`.
TESTS FIRST: `src/test-plugin-layout.js` asserts (a) both manifests parse and name `sdlc` / `sdlc-claude-skills`; (b) every `command` in `hooks/hooks.json` has the form `node "${CLAUDE_PLUGIN_ROOT}/src/hooks/<file>.js"` and that file exists; (c) the event -> matcher -> ordered script-name list in `hooks/hooks.json` equals the one in `.claude/hooks-config.json` with the `$HOME/.claude/hooks/` prefix stripped, timeouts included. Red today: the files do not exist.
WHAT TO BUILD: `plugin.json` with `name`, `description`, `author` (Conor Brennan), and `version` per Q2. `marketplace.json` with `name`, `owner`, `description`, and `plugins: [{ "name": "sdlc", "source": "./" }]`. `hooks/hooks.json` as a mechanical translation of `.claude/hooks-config.json`.
GATE: `node src/test-plugin-layout.js` exits 0. `claude plugin validate .` exits 0. Baseline suites unchanged.
REVIEW: 1. Is the parity assertion strict about order within a matcher, since order decides which block wins? 2. Does any hook rely on `$HOME/.claude/hooks/` as its own location, beyond `require('./lib/...')`, which follows `__dirname`? FAIL if: parity is not asserted, a hook is missing or reordered, or validation fails.
ROLLBACK: revert the commit.
-- status: committed `4803eb2`, code-reviewer:round1:PASS (0 critical, 0 important, 2 advisory: the layout test would throw rather than fail on a malformed block; `src/hooks/` serving both plugin and legacy is covered by later steps). GATE: layout test 35/0, validate exit 0, test-source-files and test-tdd-mandate unchanged. Parity mutation check (two PreToolUse hooks swapped) went red. Decisions: a missing `matcher` is kept distinct from `""`; parity also compares type and event order; the test asserts no `version`. Disagreement: see section 8 (hook timeouts).

**2. Skills and agents sit at the plugin layout paths, and their internal paths follow**

EXTEND (moves via `git mv`): `.claude/skills/plan-spec/` -> `skills/plan-spec/`; `.claude/skills/code-review-pre-commit.md` -> `skills/code-review-pre-commit/SKILL.md`; `.claude/skills/code-review-implementer.md` -> `skills/code-review-implementer/SKILL.md`; `.claude/agents/code-reviewer.md`, `.claude/agents/code-reviewer-deep.md` -> `agents/`. EXTEND `install.sh` (source paths only, so it keeps working until step 6), `src/test-install.sh` if it names the old paths, `uninstall.sh` (the no-record FILE_LIST paths only: the `skills/` tree and `agents/*.md`, so a no-record uninstall still finds them), `skills/plan-spec/fixtures/clean-plan.md` and `skills/plan-spec/fixtures/dirty-plan.md` (citation path text only), `src/test-plugin-layout.js`, `CLAUDE.md` (the "What ships here" table, the Development Workflow lines naming `.claude/skills/` and `.claude/agents/`, and line 43's path).
NEW (move destinations): `skills/plan-spec/reference.md`, `skills/plan-spec/fixtures/clean-plan.md`, `skills/plan-spec/fixtures/dirty-plan.md`.
IMPORTS: step 1's test file. MUST NOT TOUCH: hook JS.
TESTS FIRST: extend `src/test-plugin-layout.js`. Every `skills/*/SKILL.md` has frontmatter whose `name` equals its directory name. Every `agents/*.md` has a `name`. Nothing remains under `.claude/skills/` or `.claude/agents/`. No text under `skills/` names a `.claude/skills/` path.
WHAT TO BUILD: the moves. In `skills/plan-spec/` (SKILL.md, reference.md, `edit_doc.py` docstring), replace `.claude/skills/plan-spec/<tool>` with "`<tool>` in this skill's base directory" (the harness prints the base directory when a skill loads). The fixtures cite symbols in the old check_citations.py path (double-colon symbol form), which stops resolving once the move commits. Re-point each such citation at a file that keeps the fixture case's purpose. The checker parses only `.py` files and substring-searches anything else (amended 2026-10-03, see section 8). Dirty-plan's undefined symbol goes to `src/hooks/lib/git-read.js::no_such_function`; its appears-but-undefined word goes to `tools/analyze-review-timing.py::by_event` (a function-local). Clean-plan's function citation goes to `tools/analyze-review-timing.py::summarise`; its module-level citation goes to `skills/plan-spec/check_citations.py::SKIP_PREFIXES`, which resolves only once this step commits.
GATE: `node src/test-plugin-layout.js` exits 0. `python3 skills/plan-spec/check_citations.py skills/plan-spec/fixtures/clean-plan.md HEAD` exits 0, and the same against `dirty-plan.md` exits 1 with the same bucket counts as before the move. Record both before and after in the report. `bash src/test-install.sh` matches its baseline. `claude plugin validate .` exits 0.
REVIEW: 1. Does any reference to a moved path survive? Check with `git grep -n '.claude/skills\|.claude/agents'`, and justify each remaining hit. FAIL if: a skill's `name` does not match its directory, or a moved file's content changed beyond path text.
ROLLBACK: revert the commit.
-- status: committed `34f4419`. code-reviewer-deep:round1:FAIL (1 important: orphaned flat skills after a no-record install; documented per owner remedy (a)); code-reviewer:round2:PASS. Amended before review: D1 (fixture targets), D2 (CLAUDE.md scope). Post-commit check: the clean fixture resolves on HEAD.

**3. Every name Claude is told to invoke is the namespaced plugin name, from one constant**

NEW `src/hooks/lib/plugin-names.js`. EXTEND every `src/hooks/*.js` that names `/feature`, `/feature-new`, `/code-review-pre-commit`, `/commit-prep` or the reviewer agents (at `main`: `pre-commit-review.js`, `pre-commit-feature.js`, `post-commit-feature.js`, `session-start-feature.js`, and `enforce-review-implementer.js`, which names the skill as `skill: "code-review-implementer"`); their `src/hooks/test-*.js` and `src/hooks/test-*.sh` assertions; `skills/code-review-pre-commit/SKILL.md`, `skills/code-review-implementer/SKILL.md`, `skills/plan-spec/` (dispatch names only); `commands/*.md`; `.claude/*snippet.md`; `agents/*.md` (prose only; frontmatter `name:` stays bare; amended D1); `src/test-plugin-layout.js`.
IMPORTS: steps 1-2. MUST NOT TOUCH: marker and timing tag formats.
TESTS FIRST: extend `src/test-plugin-layout.js`. Scan every string literal in `src/hooks/*.js` (excluding tests), and all text under `skills/`, `commands/`, `agents/` and `.claude/*snippet.md`, with three regexes: (1) `(^|[^:a-z])/(feature|feature-new|code-review-pre-commit|code-review-implementer|commit-prep|review-timing|plan-spec)\b` must not match at all; (2) every `subagent_type:\s*"([^"]+)"` value (each dispatch value carries its own `subagent_type:` key, so none hides behind an "or"; amended D2) and (3) every `skill:\s*"([^"]+)"` value must be `sdlc:<x>` with x an existing agent file, skill directory or command file, or be on a fixed built-in allowlist (`general-purpose`). Allowlisted paths: `skills/plan-spec/fixtures/`, `src/hooks/test-*`, and the example line in `check_citations.py` that names `/feature-new`. Agent frontmatter `name:`, timing tags (`agent=code-reviewer`) and marker literals (`code-reviewer:round1:PASS`) are not scanned and stay bare. Prose mentions of the reviewer agents (snippets, skills, `ROUNDS_POLICY`) are hand-edited and checked under REVIEW 1. Update the existing hook-test assertions that expect bare names (`/code-review-pre-commit` and similar) to expect the namespaced form.
WHAT TO BUILD: `plugin-names.js` exports `PLUGIN = 'sdlc'`, plus `cmd(name)` returning `'/' + PLUGIN + ':' + name` and `agent(name)` returning `PLUGIN + ':' + name`. Hook messages use them. Markdown is spelled out literally, and the scan keeps it honest.
GATE: `node src/test-plugin-layout.js` exits 0. All hook suites show no new failures by name. `git grep -nE '(^|[^:a-z])/(feature|feature-new|code-review-pre-commit|code-review-implementer|commit-prep|review-timing|plan-spec)\b' -- src/hooks skills commands agents .claude/*snippet.md` returns only allowlisted paths.
REVIEW: 1. Is any name Claude must act on still bare, including inside the marker recipe text and the gap-patching prompt? 2. Did any marker or timing tag change? FAIL if: a bare invocable name remains outside a justified fixture, or a tag format changed.
ROLLBACK: revert the commit.
-- status: committed `921bf2c`. code-reviewer-deep:round1:PASS (1 important: the namespaced block message has no passing test while the TDD baseline pre-empts it, carried to sdlc-hardening step 0). Amended before review: D1-D4. The reviewer showed end to end that a reviewed commit still matches its marker, and that the tag is only a label.

**4. The four CLAUDE.md sections reach every session through a plugin SessionStart hook**

NEW `src/hooks/session-start-instructions.js`, `src/hooks/test-session-start-instructions.js`, `instructions/` (the four snippets moved from `.claude/*snippet.md` via `git mv`). EXTEND `hooks/hooks.json`, `src/test-plugin-layout.js`, `install.sh` (snippet source paths only), `uninstall.sh` (the fallback SNIPPETS paths only, pointed at `instructions/`).
NEW (move destinations): `instructions/tdd-mandate-snippet.md` and the other three snippets.
IMPORTS: step 3's names in the snippet text. MUST NOT TOUCH: the snippets' wording beyond paths and names.
TESTS FIRST: `test-session-start-instructions.js` runs the hook with stdin `{}`. It asserts that stdout is one JSON object with `hookSpecificOutput.hookEventName === 'SessionStart'`, that `additionalContext` contains each snippet's `## ` heading, and that `additionalContext.length < 10000`. It also asserts that a missing `instructions/` file yields exit 0 with the remaining sections plus a one-line notice, so the hook never crashes a session. Red today: the hook does not exist.
WHAT TO BUILD: the hook reads `instructions/*.md` relative to `__dirname` (`../../instructions`) in a fixed order: review triggers, feature tracking, hygiene, TDD mandate. It strips the `<!-- sdlc-claude-skills:* -->` sentinels and emits them joined. Add it to `hooks/hooks.json` SessionStart before `session-start-feature.js`, and extend step 1's parity test to expect exactly this one addition. Edit snippet text that says "installed to `~/.claude/hooks/`" to say "shipped in the `sdlc` plugin".
GATE: both tests exit 0. `claude plugin validate .` exits 0. Under the cap with at least 1,500 characters of headroom: the test prints the length, and the report quotes it as a number.
REVIEW: 1. Is the order deterministic? 2. Can the hook print anything other than the JSON object to stdout? FAIL if: the cap is not asserted, or the hook can exit non-zero.
ROLLBACK: revert the commit.
-- status: committed `d15eb16`. code-reviewer:round1:PASS (0/0/3 advisory). Amended: D1 (two merge tests' snippet path). additionalContext is 7,873 chars.

**5. Nothing a skill, command or hook runs assumes the toolchain lives in `~/.claude/`**

EXTEND `src/hooks/pre-commit-review.js` (new text: the scope-review block message gains a timing-log command, since today the only one is in the skill), `skills/plan-spec/reference.md` (the one "deployed to `~/.claude/hooks/`" phrase), `skills/code-review-pre-commit/SKILL.md` (the `node "$HOME/.claude/hooks/timing-log.js"` line), `commands/review-timing.md` (the analyser lookup), `src/hooks/test-pre-commit-review.js`, `src/test-plugin-layout.js`.
IMPORTS: steps 1-4. MUST NOT TOUCH: the timing log's own location, `~/.claude/code-review-timing.jsonl` (user data, stays).
TESTS FIRST: the block message for a scope review contains `node "<abs path of src/hooks/timing-log.js>"`, computed from the hook's `__dirname`, and no `$HOME/.claude/hooks`. `src/test-plugin-layout.js` fails on any `$HOME/.claude/hooks`, `~/.claude/hooks` or `~/.claude/tools` string under `skills/`, `commands/`, `agents/`, `instructions/` or `src/hooks/` (non-test).
WHAT TO BUILD: the hook embeds the absolute timing-log path in its block message, and the skill tells Claude to run the timing command exactly as that message gives it. `review-timing.md` resolves the analyser as `./tools/analyze-review-timing.py` inside the source repo, else the newest match of `~/.claude/plugins/**/sdlc*/tools/analyze-review-timing.py`, else tells the user to install the plugin.
GATE: tests exit 0, with no new failures by name. `git grep -nE '(\$HOME|~)/\.claude/(hooks|tools)' -- skills commands agents instructions src/hooks ':!src/hooks/test-*'` returns nothing.
REVIEW: 1. Do the user-config paths (`tdd-mandate.json`, `review-policy.json`, `hygiene-repos.json`, the timing log) still resolve under `~/.claude/`, unchanged? FAIL if: any of those moved, or a toolchain path still points at `~/.claude/`.
ROLLBACK: revert the commit.
-- status: committed `9a14a9f`. code-reviewer:round1:PASS (0/0/2 advisory; `ls -t` picks the cached version by mtime, acceptable with no version field). Its new assertion joins the TDD-pre-empted baseline (27).

**6. `install.sh` is retired, `uninstall.sh` is the migration, and a doubled install is detected**

DELETE (per Q3) `install.sh`, `src/merge-hooks.js`, `src/merge-claude-md.js`, `src/test-install.sh`, `src/test-merge-hooks.js`, `src/test-merge-claude-md.js`. MOVE `.claude/hooks-config.json` via `git mv` to the path declared NEW below. EXTEND `uninstall.sh` and `src/test-unmerge-hooks.js` (re-point their hooks-config path at `legacy/hooks-config.json`, paths only), `instructions/tdd-mandate-snippet.md` (the sentence calling `install.sh` the most destructive code, which becomes `uninstall.sh`), `src/hooks/session-start-instructions.js` and its test, `src/test-plugin-layout.js` (drop the parity reference, and keep a frozen copy of the expected script list inline), `uninstall.sh` (header text only: it is now the migration), `README.md`, `CLAUDE.md`.
NEW (move destination): `legacy/hooks-config.json`.
IMPORTS: steps 1-5. MUST NOT TOUCH: `uninstall.sh` and `src/test-unmerge-hooks.js` beyond the path changes above, and `src/unmerge-*.js`, which are still needed to remove legacy installs.
TESTS FIRST: with `HOME` pointed at a temp dir whose settings.json (under .claude) contains a `"$HOME/.claude/hooks/pre-commit-review.js"` command, the SessionStart hook's `additionalContext` begins with a warning naming the double-run and the fix (`./uninstall.sh` from a checkout). With a clean settings.json there is no warning. An unreadable settings.json produces a warning, not a crash.
WHAT TO BUILD: the deletions. Add a legacy-install check to `session-start-instructions.js`. README gets install, update, local development (`claude --plugin-dir .`), and migration (`./uninstall.sh`, then the two `/plugin` commands). The project CLAUDE.md "Development Workflow" section swaps `install.sh` for the plugin flow, and keeps the "never edit `~/.claude/`" rule, reworded for the plugin cache.
GATE: all remaining suites show no new failures by name. `claude plugin validate .` exits 0. `git grep -nE '(^|[^n])install\.sh' -- . ':!features' ':!docs' ':!src/hooks/test-*' ':!src/hooks/lib/source-files.js'` returns hits only in `uninstall.sh`, `README.md` and `.gitignore`.
REVIEW: 1. Can a user who follows the README end up with both the legacy hooks and the plugin active, without being told? 2. Does `uninstall.sh` still run to completion with `install.sh` gone (`bash -n uninstall.sh`, and a dry run against a temp `CLAUDE_HOME` seeded by the old install record)? FAIL if: the double-run is undetected, or `uninstall.sh` depends on a deleted file.
ROLLBACK: revert the commit.

## 7. Done, and cutover

Done on the branch: steps 1-6 committed and reviewed, `claude plugin validate .` exits 0, and every suite shows no new failures against the recorded baseline, by name.

Cutover, by the owner after the merge to `main` (each command is outward-facing or rewrites `~/.claude`):

1. `./uninstall.sh --dry-run`, then `./uninstall.sh` from a checkout of the pre-merge `main`. This removes the copied hooks, skills, agents, commands, tools, the settings.json hook entries and the four CLAUDE.md sections.
2. `/plugin marketplace add conorpbrennan/sdlc-claude-skills`, then `/plugin install sdlc@sdlc-claude-skills`.
3. A new session shows no double-run warning. `/sdlc:feature list` runs. A trivial staged commit in a scratch repo gets the `trivial-diff` approval, which proves the PreToolUse hook is live from the plugin.

## 8. Decisions and disagreements

- 2026-10-03, owner request: README's Install section was rewritten ahead of the run for the marketplace flow (install, update, uninstall, migration, `--plugin-dir` development), with a "not available yet" banner and the legacy `install.sh` block kept beneath it. Step 6's README work therefore narrows to: delete the banner and the legacy block, and rewrite "What gets installed where" and "Uninstall" for the plugin. The names used there (`sdlc`, `sdlc-claude-skills`) assume Q1's recommended answer.
- 2026-10-03, review round 1 (Fable, held against the repo on `main`). Verdict NOT YET, 5 findings. The orchestrator spot-checked each against source before folding it in. All five were folded in:
  - F1: `uninstall.sh`'s no-record and partial-record fallbacks read `.claude/skills`, `.claude/agents`, `.claude/*snippet.md` and `.claude/hooks-config.json`, and `src/test-unmerge-hooks.js` reads the last. Fix: steps 2 and 4 re-point `uninstall.sh` paths, and step 6 moves the hooks config to `legacy/` instead of deleting it.
  - F2: the claim that `check_citations.py` already skips `.claude/skills/*` was false (its `SKIP_PREFIXES` has no such entry), and the fixtures cite the moved file. Fix: step 2 re-points the fixture citations at `src/hooks/lib/git-read.js`, and the GATE checks both fixtures' outcomes.
  - F3: step 3 missed `enforce-review-implementer.js` (it uses the `skill: "..."` form) and the `.sh` tests, the gate alternation omitted three names, and "agent dispatch names" had no pattern. Fix: three explicit regexes, a built-in allowlist, a fixture allowlist, and the seven-name gate.
  - F4: step 6's `install.sh` grep also matches `uninstall.sh` everywhere, and the TDD snippet calls `install.sh` the most destructive code. Fix: a `(^|[^n])` pattern with excludes, and the snippet sentence added to the file set.
  - F5 (low): `skills/plan-spec/reference.md` trips step 5's grep, and the hook's timing-log command is new text. Fix: added to the file set and labelled as new.
  - Below the bar, noted and not actioned: the snippet sources carry no sentinels, so stripping them is a no-op; `claude plugin validate .` already passes today, so step 1's test is the real gate; step 2's REVIEW grep will hit README and CLAUDE.md, which is justified as pending step 6.
  - The cap was 1 round, so the loop stops here. The fold-in text above has not been read by any round (plan-spec §2b). The step 2, 3 and 6 reviewers should treat these clauses as unverified claims about the code.
- 2026-10-03, step 1 implementer DISAGREEMENT (not acted on, owner to decide): Claude Code hook `timeout` values are in seconds. The legacy wiring (`.claude/hooks-config.json`), copied verbatim under the parity rule, uses 1000-200000, which reads as milliseconds, so every hook's timeout is effectively unbounded. This predates the plan. Fixing it changes both files together, so it belongs in its own step or follow-up, not in step 1.
- 2026-10-03: Q4 satisfied differently from planned. The subdir fix is committed (`785a7ef` on `fix-subdir-staged-diff`) and deployed with `install.sh`, but not yet merged to `main`, since merging needs a push/PR, which is the owner's call. `marketplace-plugin` is therefore cut from `fix-subdir-staged-diff`, and the two branches merge together.
- 2026-10-03, step 2 implementer DISAGREEMENTS, both accepted and amended before review:
  - D1: the F2 fold-in was wrong about the code. `check_citations.py` parses only `.py` files and substring-searches anything else, so a JS target cannot express "appears but not defined" (measured: the dirty fixture dropped to 4 problems). Amended: Python targets in `tools/analyze-review-timing.py`, with the module-level case on the new `skills/plan-spec/` path, checked post-commit. This is the plan-spec §2b failure mode: an unreviewed fold-in, caught by the implementer.
  - D2: stale `.claude/skills` and `.claude/agents` lines in CLAUDE.md sit outside the file set. Step 2's CLAUDE.md scope is widened to them. README lines 130-131 stay with step 6, which rewrites that table.
  - Noted from the implementer's decisions: install.sh now deploys the two flat skills as `<name>/SKILL.md` directories. A no-record uninstall of an old flat install misses the flat files, while the record-based uninstall (this machine's case) is unaffected.
- 2026-10-03, step 2 review round 1 (code-reviewer-deep): FAIL, 1 IMPORTANT. Installing over a no-record (pre-record) legacy install leaves the old flat `skills/code-review-pre-commit.md` and `skills/code-review-implementer.md` next to the new `skills/<name>/` directories, and a later uninstall keeps the flat files. With a record it is clean (verified), and so is this machine. Owner chose remedy (a): document, do not code it, since `install.sh` is deleted in step 6. Step 2's file set is amended to add one note to `README.md`'s "Migrating from `install.sh`" section. The round-2 fix also folds in the reviewer's advisory that `listDir` in `src/test-plugin-layout.js` must treat only ENOENT as empty. Re-review on `code-reviewer`, since no shell logic changes.
- 2026-10-03, step 3 implementer DISAGREEMENTS, all accepted:
  - D1: `agents/*.md` hold two bare invocable names (the deep agent's description and the reviewer's implementer pointer) but were outside the file set. Added, prose only.
  - D2: regex (2) missed the second value of a `subagent_type: "a", or "b"` line. The skill now spells each value with its own key, and the plan says so.
  - D3: two plain-word skill mentions in hook messages ("the code-review-pre-commit skill") were namespaced under REVIEW 1, though no regex catches them.
  - D4: the namespaced-message assertion in `test-pre-commit-review.js` is pre-empted by the TDD `no_tests` baseline, so it was verified by hand. The baseline-repair follow-up would make it real.
  - Decision noted: the marker recipe now says to use the *bare* agent name in the tag, so a namespaced `sdlc:code-reviewer:round1:PASS` never reaches a marker.
- 2026-10-03, step 4 implementer: D1 accepted. `src/test-merge-claude-md.js` and `src/test-unmerge-claude-md.js` read the shipped snippets from `.claude/` and would break on the move, so their path line was changed (one line each), outside the declared file set. The uninstall.sh fold-in was confirmed correct: without it a no-record uninstall would silently skip every snippet. No snippet contained the "installed to `~/.claude/hooks/`" text, so the snippets are unchanged. additionalContext is 7,873 chars. The new hook's timeout is 5 (seconds).
- 2026-10-03, step 5: its new assertion "block message carries the timing-log command at the hook's own path" joins the TDD-pre-empted baseline (now 27 names). The message was verified by hand against a scratch repo with the mandate disabled, and sdlc-hardening step 0 makes the assertion real. The analyser and timing-log fallbacks use the observed cache layout, `~/.claude/plugins/cache/*/sdlc/*/`.
- 2026-10-03, step 6 implementer: D1 accepted. The plan's delete list would have broken `src/test-unmerge-hooks.js` and `src/test-unmerge-claude-md.js`, whose round trips call the mergers. `src/merge-hooks.js` and `src/merge-claude-md.js` move to `legacy/` as frozen fixtures, with a one-line path change in each unmerge test. Their own tests are still deleted. F1 and F4 were verified correct against the code. The legacy check matches 13 script names in four home forms, only ENOENT is silent, and additionalContext with the warning is 8,246 chars.
- 2026-10-03, step 6 review round 1 (code-reviewer-deep): FAIL, 1 critical and 3 important, all of which the owner chose to fix:
  1. README:187 (and :508) named the moved `.claude/hooks-config.json`.
  2. README's Update section offered `marketplace update` and `plugin update` as alternatives; it needs both in order, then a restart.
  3. Deleting `test-install.sh` left `uninstall.sh` untested.
  4. `LEGACY_SCRIPTS` named three scripts the legacy wiring never had, so the warning could fire when `uninstall.sh` cannot clear it.
  File set amended: NEW `src/test-uninstall.sh`, built on `legacy/merge-*.js`. Re-review on code-reviewer-deep, per the rounds policy after a CRITICAL.
- 2026-10-03, step 6 committed `a01f383`. code-reviewer-deep round 1 FAIL (fixed: README paths and Update order, new `src/test-uninstall.sh`, `LEGACY_SCRIPTS` cut to the 10 legacy-wired scripts); round 2 PASS. Gate amendment: the `install.sh` grep gate also hits two comments in `src/test-uninstall.sh` that describe the installer as retired. That is the gate's intent satisfied, not a stale reference, and the pattern predates that file. Accepted without rewording, since rewording would have invalidated the reviewed index. Follow-ups noted: a `mktemp` guard in `src/test-uninstall.sh`; `snapshotStaged` in `test-pre-commit-review.js` misses rename sources.
- Plan complete: steps 1-6 committed. Cutover per section 7 follows.

## Inserted step (plan-spec §18.6; written after the Windows test, unreviewed by any plan round)

**6a. Text files keep LF on every platform, and the instructions hook tolerates CRLF anyway**

Found by the Windows test after cutover. With no `.gitattributes`, Git for Windows (`core.autocrlf=true`) checks the files out with CRLF, and so does a GitHub marketplace clone on Windows. `instructions/*.md` then reach Claude with stray `\r` (8,012 chars against 7,875 on Linux). 14 assertions in `src/hooks/test-session-start-instructions.js` fail (`^## Heading$` with a trailing `\r`), and 3 README checks in `src/test-plugin-layout.js` fail.

NEW `.gitattributes`. EXTEND `src/hooks/session-start-instructions.js`, `src/hooks/test-session-start-instructions.js`, `src/test-plugin-layout.js`.
IMPORTS: steps 1-6. MUST NOT TOUCH: the instruction files' wording.
TESTS FIRST:
- `test-session-start-instructions.js` runs the hook against a scratch `instructions/` tree whose four files are CRLF-encoded. It asserts that additionalContext contains no `\r`, contains each `## ` heading, and is byte-identical to the LF tree's output. Red today.
- `test-plugin-layout.js` asserts that `.gitattributes` exists and sets `eol=lf` for `*.md`, `*.js`, `*.sh`, `*.json` and `*.py` (or `* text=auto eol=lf`). It also makes the README Update checks tolerate CRLF (normalise before matching). Red today.
WHAT TO BUILD: `.gitattributes` with `* text=auto eol=lf`, plus explicit binary entries only if the repo holds binaries (check with `git ls-files`). The hook replaces `\r\n` with `\n` when it reads each instruction file. Run `git add --renormalize .` only if it changes nothing; the repo is LF today. If it does change anything, report it rather than staging it.
GATE (commands, expected output):
- `node src/hooks/test-session-start-instructions.js` gives `Results: N passed, 0 failed`.
- `node src/test-plugin-layout.js` gives `Results: N passed, 0 failed`.
- `claude plugin validate .` exits 0.
- `git ls-files --eol | awk '{print $2}' | sort | uniq -c` shows only `w/lf` (and `w/-text` for binaries, if any).
- Windows (orchestrator, after commit): on the EC2 box, a fresh clone of the branch has no CR in `instructions/*.md` (`grep -c $'\r'` gives 0), and both suites pass.
REVIEW: 1. Does `.gitattributes` change how any tracked file is stored? (`git add --renormalize . && git status` in a scratch clone should show nothing.) 2. Is the normalisation applied before the sentinel strip and the heading join? FAIL if: CRLF input changes the output, or `.gitattributes` renormalises a tracked file.
ROLLBACK: revert the commit.
-- status: committed `ce835c1`. code-reviewer (run as a general-purpose Sonnet agent from `agents/code-reviewer.md`, since the legacy agents were uninstalled before restart) round 1 PASS. Windows gate: a fresh clone with `autocrlf=true` has 0 CR in `instructions/*.md` and `src/test-uninstall.sh`; instructions test 73/0, layout test 110/0. Installed plugin updated `a01f383d91ae` -> `ce835c10c250`.
- 2026-10-03, after cutover: the step 5 reviewer's advisory proved real. After `plugin update`, the old cache dir has the newer mtime, so the `ls -t` fallbacks in `skills/code-review-pre-commit/SKILL.md` and `commands/review-timing.md` pick the stale version. `installPath` in `~/.claude/plugins/installed_plugins.json` is authoritative. The hooks are unaffected, since they run from the install path. Carried to sdlc-hardening step 7a.
