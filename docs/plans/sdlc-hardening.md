# Close the review and TDD gates' bypasses, align the hooks with the harness, and tighten plan-spec's checker. NOT: new features, a rewrite of the reviewer agents' criteria, or the `reference.md` split (Q5 decides whether it joins).

Runs after `docs/plans/marketplace-plugin.md` has landed: paths below are the plugin layout (`skills/`, `agents/`, `instructions/`, `hooks/hooks.json`).

## 1. What this delivers

Source: a clean-context review of code review, the TDD mandate and plan-spec (2026-10-03), whose headline claims the orchestrator re-verified against the code, plus items carried from the subdir-fix and plugin plans (Windows path handling and test harness, quoted filenames, literal pathspecs, the red baseline). After this plan:

- No diff with a behaviour-changing line is approved without a review, and no approval skips the TDD gate.
- Every git command that creates a commit is either gated on the index or refused with a reason. Aliases, `git-commit`, `commit-tree`, `cherry-pick`, `revert`, `merge`, `am`, `rebase`, `pull` included.
- The TDD mandate checks that the staged tests contain test code, claims "test first" only when it observed both edits, and sees sub-agent edits.
- PreToolUse hooks speak the current harness schema: no output on allow, `permissionDecision: deny` on block. Timeouts are set knowingly in seconds.
- plan-spec's citation checker resolves non-Python symbols by word boundary, catches out-of-range line starts, and has a test that pins its fixtures.
- Windows (Git Bash) gets the same verdicts as Linux, and the whole suite is green on both.

Verified facts this plan rests on (2026-10-03):
- `isLineSemantic` in `src/hooks/lib/diff-classifier.js` returns false for `assert user.is_admin`, `is_admin = True`, `ALLOWED = ["*"]`, `os.system(`, `@admin_required`, `counter++;`, `throw err;`, `del x`.
- `classifyCommitCommand` in `src/hooks/lib/commit-command.js` returns `not-a-commit` for `git commit-tree`, `cherry-pick`, `am`, `merge`, and an alias `git ci`. Only `git commit` returns `commit`.
- The fast path in `src/hooks/pre-commit-review.js` (Gate 3b) runs before `evaluateTddOrderGate`.
- Claude Code hook `timeout` is in seconds, and a timed-out PreToolUse hook does not block (hooks docs). Top-level `decision: approve` is the legacy schema and bypasses the permission prompt.
- Sub-agent tool calls are recorded in `<session dir>/subagents/agent-*.jsonl`, never in the parent transcript (verified locally).

## 2. Working constraints, every step

- Branch `sdlc-hardening` from the branch carrying the plugin (`marketplace-plugin`, or `main` once merged). Seed `features/sdlc-hardening.md` with `/sdlc:feature-new sdlc-hardening "Close the review and TDD gates' bypasses and align the hooks with the Claude Code harness."`.
- Every git read fails closed (`src/hooks/lib/git-read.js`). Paths go to git as argv, never through a shell string. A hook that cannot decide blocks.
- Single owners: what counts as code, `src/hooks/lib/source-files.js`; commit-shape parsing, `src/hooks/lib/commit-command.js`; test-file recognition and TDD verdicts, `src/hooks/lib/tdd-order.js`; hook stdout, `src/hooks/lib/hook-output.js` (NEW in step 4a); the plugin name, `src/hooks/lib/plugin-names.js`.
- Commit protocol: `git add <paths>` alone, then `git commit -m "..."` alone. The first attempt blocks, and its message carries the marker recipe. The orchestrator commits on PASS (owner authorisation carried from the plugin plan, re-confirmed in Q6).
- TDD: each step's test edits come before its implementation edits, and both land in one commit.
- Baseline: step 0 makes every suite green on Linux. From step 1 on, a step's GATE is "every suite green", with no allowance.
- `test-pre-commit-review.js` and the other integration suites write markers under `.git`, so they run in scratch worktrees, never in the checkout that holds a staged step.
- Suite command (Linux and Windows), always from the repo root, because `test-pre-commit-review.js` has cwd-sensitive reads: `for t in src/hooks/test-*.js src/test-*.js; do node "$t"; done; for t in src/hooks/test-*.sh src/test-*.sh; do bash "$t"; done`. Run the integration suites in a scratch worktree, as above.
- Windows: steps marked (W) are also run on the Windows EC2 box (`i-0688b5ce9ff2b2bfd`, Git Bash, `core.autocrlf=true`) with that same command, and their GATE includes "Windows suite green".
- Always-permitted paths: this plan file, `features/sdlc-hardening.md`.

## 3. Owner decisions

Answered 2026-10-03, all with the recommended option: Q1 = keep the presentational path, opt-in. Q2 = refuse commit-producing commands with guidance toward the non-committing form. Q3 = silent on allow (the owner adds a git-commit Bash allow rule if they want no prompt). Q4 = require a matching `review.completed` event. Q5 = defer the `reference.md` split to its own plan. Q6 = 2 Fable review rounds before dispatch, and the orchestrator commits each step on PASS. Q7 = the opt-out must be tracked at HEAD.


- Q1, the presentational fast path (small diffs inside configured `presentational_paths`): keep it on top of the inverted classifier, meaning at most N non-trivial lines in configured paths (recommended: keep, since it is opt-in per repo and off by default), or delete it. Blocks step 1.
- Q2, commit-producing commands: refuse them with a reason telling Claude to use `--no-commit` (or `--ff-only`) and then `git commit` (recommended, fail closed), or gate them on the index. Gating on the index cannot work for `cherry-pick`, `merge`, `am` or `rebase`, whose content is not staged when the hook runs. Blocks step 2.
- Q3, allow output: print nothing on allow, so the normal permission flow decides (recommended, matching README's "the commit stays your command"), or keep auto-approving reviewed commits. With nothing printed, `git commit` follows your permission settings: add `Bash(git commit:*)` to `allow` to keep today's flow. Blocks step 4a.
- Q4, marker attestation: require a matching `review.completed` timing event (verdict PASS, same diff-hash prefix, within the marker TTL) before a reviewer-tagged marker approves (recommended), or leave the marker as the only attestation. Blocks step 6.
- Q5, split plan-spec's `reference.md` into rules (read when writing) and forms (read when running), about 24k tokens down to about 10k in run mode. Recommended: defer to its own plan. Blocks nothing.
- Q6, review-loop cap (recommended 2), and standing authorisation for the orchestrator to commit each step on PASS, as in the plugin plan.
- Q7, the TDD opt-out: require the .claude/tdd-mandate.disabled file to be tracked at HEAD, so the opt-out itself ships in a reviewed commit (recommended), or keep the untracked-file opt-out and correct the snippet's "no per-commit override" claim. Blocks step 10.

## 4. Order

0 -> 1 -> 2 -> 3a -> 3b -> 3c -> 4b -> 4a -> 5 (4b runs first, so that `pending-review-gate.js` is unwired before 4a asserts that no wired PreToolUse hook prints on allow) -> 6 -> 7a -> 7b -> 8 -> 9 -> 10, strictly sequential. Most steps share `src/hooks/pre-commit-review.js` or a test suite, so no two overlap.

## Steps

**0. Every suite is green on Linux: integration tests isolate the gate they target**

EXTEND `src/hooks/test-pre-commit-review.js`, `src/hooks/test-enforce-co-author.sh`, and `src/hooks/enforce-co-author.js` only if the investigation below shows the hook is wrong rather than the test.
TESTS FIRST: not applicable (this step repairs tests). Record every baseline FAIL name before any edit (27 in test-pre-commit-review.js plus 1 in test-enforce-co-author.sh at the time of writing; the recorded list, not the count, is the reference).
WHAT TO BUILD: in `test-pre-commit-review.js`, run every integration case that targets a gate other than the TDD gate with `TDD_MANDATE_CONFIG` pointing at a scratch JSON that exempts `REPO_ROOT`, the pattern the subdir fix's test (d) already uses. Keep the TDD-gate cases on the real mandate. In `test-enforce-co-author.sh`, fix the harness: it passes the payload in the `CLAUDE_TOOL_INPUT` environment variable with a top-level `command`, while the hook reads stdin and `tool_input.command`. Both the channel and the shape are wrong. Also add an assertion that the review block's recipe tag is bare, and that TAG_NOTE says "bare agent name" (carried from the plugin plan, section 8).
GATE: every `src/hooks/test-*` and `src/test-*` suite reports 0 failures on Linux. Every recorded baseline name now passes, and none were deleted (each name is listed with its new result).
REVIEW: 1. Does any case now pass only because it was exempted from the gate it was meant to test? 2. Was any assertion weakened? FAIL if: a suite still fails, an assertion was removed or loosened, or a TDD-gate case was exempted.
ROLLBACK: revert the commit.

**1. Only comments and whitespace are trivial, and no fast path runs before the TDD gate (W)**

EXTEND `src/hooks/lib/diff-classifier.js`, `src/hooks/pre-commit-review.js`, `src/hooks/test-pre-commit-review.js`, `src/hooks/test-fast-path-languages.js`.
IMPORTS: step 0. MUST NOT TOUCH: `src/hooks/lib/source-files.js`.
TESTS FIRST: a table test over `isLineTrivial`. Every line in the verified-facts list is non-trivial, and so are `#define X 1` (.c), `*flag = 1;` (.go) and `/* note */ run();` (.js). Blank lines, `# x` (.py/.rb/.php only), `// x`, a line that is wholly `/* x */`, and `-- x` (.sql only) are trivial for their languages. A marker not listed for a language is never a comment in it (`-- x` is a decrement in JS/C; there is no `;` comment language). Integration: a staged diff whose only change is deleting `'.sh', '.ps1',` from a copy of `source-files.js` is not approved, run with `TDD_MANDATE_CONFIG` exempting the repo, so that the classifier, not the TDD gate, is what refuses it. A comment-only diff with no test file in a mandate-on repo is blocked by the TDD gate (or reaches review), and never approved `trivial-diff`. Red today.
WHAT TO BUILD: replace `isLineSemantic` with `isLineTrivial(line, ext)`: true only for blank lines, lines that are wholly a line comment for the file's language (`#` only for .py/.rb/.php, since it is a preprocessor directive in C-family files), and lines that are wholly one block comment (`^\s*/\*([^*]|\*(?!/))*\*/\s*$`). A block-comment continuation (` * x`) is non-trivial, because with -U0 hunks it cannot be told from a pointer dereference. Anything else, docstrings included, is non-trivial. `classifyDiff` counts non-trivial added and removed lines. Delete `SEMANTIC_KEYWORDS`, `findAssignEq`, `isPureLiteralRHS` and `resolvePythonCmd` (the per-line Python spawn). In `main`, evaluate the TDD gate before Gate 3b, and take a fast path only when the TDD verdict is `continue`. Presentational path per Q1.
GATE: all suites green. `node -e` over the verified-facts lines prints `false` for each `isLineTrivial`. Windows suite green.
REVIEW: 1. Can any non-comment line still score trivial? Try string-literal lines, line continuations, and comment markers inside strings. 2. Does a comment-only change in a test file alone still fast-path when the TDD gate allows it? FAIL if: any verified-facts line is trivial, or a fast path can approve before the TDD gate.
ROLLBACK: revert the commit.

**2. Every commit-producing git command is gated or refused**

EXTEND `src/hooks/lib/commit-command.js`, `src/hooks/test-commit-command.js`.
IMPORTS: step 1. MUST NOT TOUCH: the hooks' call sites, unless the new resolver parameter needs a default.
TESTS FIRST: `classifyCommitCommand` returns `unreliable` with a reason for `git commit-tree ...`, `git cherry-pick x`, `git revert x`, `git merge x`, `git am p.mbox`, `git rebase x` and `git pull`. It returns `not-a-commit` for `git merge --ff-only x`, `git pull --ff-only`, `git cherry-pick -n x`, `git revert --no-commit x` and `git merge --squash x`. `/usr/lib/git-core/git-commit -m x` returns `commit`. A persisted alias (`git ci` with `alias.ci=commit` in a scratch repo's config) returns `commit`, and `alias.x=!sh -c ...` returns `unreliable`. `alias.cia=commit -a` returns `unreliable`, with a reason naming `-a`; `alias.cp=cherry-pick -n` returns not-a-commit; `alias.cp=cherry-pick` returns `unreliable`. An unreadable config returns `unreliable`. Red today.
WHAT TO BUILD: a `COMMIT_PRODUCING` table with each command's non-committing flags; per Q2, a committing form is `unreliable` with a reason naming the non-committing form. `GIT_EXE_RE` also accepts `git-<sub>` executables and maps them to `<sub>`. For any subcommand not already in the commit, index-writing or commit-producing sets, resolve it with one `git config --default '' --get alias.<sub>` read through `git-read.js` (no builtin list is needed, since aliases cannot shadow builtins). Empty output means no alias, so not-a-commit; a value is split into words, and `[aliasSub, ...aliasArgs, ...args]` is classified through the same `inspectCommitArgs` / `COMMIT_PRODUCING` path as a typed command (so `alias.cia=commit -a` is `unreliable`, naming `-a`; `alias.cp=cherry-pick -n` is not-a-commit; `alias.cp=cherry-pick` is `unreliable`); a `!` shell alias or `out === null` (a read failure) means `unreliable`. In the table, `--continue` is committing for cherry-pick, revert, merge, rebase and am; `--abort` and `--quit` are not.
GATE: all suites green. Every case above holds.
REVIEW: 1. Do the other hooks that classify commands (feature, hygiene, co-author) see the same verdicts? 2. Does a harmless alias (`git st` = status) stay not-a-commit, and does an absent alias cost exactly one git spawn? FAIL if: any listed shape is `not-a-commit` in its committing form.
ROLLBACK: revert the commit.

**3a. "Has a test" means the staged test diff adds test code**

EXTEND `src/hooks/lib/tdd-order.js`, `src/hooks/pre-commit-review.js` (to pass the staged test diff), `src/hooks/test-tdd-mandate.js`, `src/hooks/test-pre-commit-review.js`.
IMPORTS: step 2.
TESTS FIRST: an `--amend` whose test is already in HEAD (and not in `git diff --cached`) passes, including an amend of a root commit. An impl file plus a 0-byte `test_billing.py` gives `no_tests`. An impl plus one blank line added to an unrelated test gives `no_tests`. An impl plus a test adding `def test_x():` / `assert` / `it(` / `expect(` / `@Test` gives a pass. An unreadable test diff blocks. Red today.
WHAT TO BUILD: `classifyFromEvents` takes the diff of the test paths, read by the hook with `cwd: toplevel`: `git diff --cached -U0 -- <testPaths>` normally, and for `--amend` the index against the amended commit's parent (`git diff --cached -U0 HEAD~1 -- <testPaths>`, or, when `HEAD~1` does not resolve because HEAD is a root commit, against the empty tree from `git hash-object -t tree /dev/null`), so a test already in HEAD still counts, as `pathsInResultingCommit` intends, and requires at least one added line matching a test-definition or assertion shape (`TEST_CODE_RE`, one regex per supported language family). A null diff is `unreadable`, which blocks.
GATE: all suites green.
REVIEW: 1. Are the shapes broad enough for every language in `SOURCE_EXTENSIONS` that has a test convention, and narrow enough that a comment cannot satisfy them? FAIL if: an empty or whitespace-only test change satisfies the mandate.
ROLLBACK: revert the commit.

**3b. Order verdicts need both edits observed, anchored to this repository, per implementation file**

EXTEND `src/hooks/lib/tdd-order.js`, `src/hooks/pre-commit-review.js` (pass `toplevel`), `src/hooks/test-tdd-mandate.js`.
IMPORTS: step 3a.
TESTS FIRST: with the impl never observed and the test observed, the verdict is `not_applicable`, never `test_first`. With the impl observed and the test never observed (written via Bash), the verdict stays `code_first`. A `Write` to another repository's tests/test_billing.py does not count as this repo's test edit. With test at 09:00, impl at 10:00 and test again at 11:00, and two impl files where the second's first edit precedes any test edit, the verdict is `code_first`. Red today.
WHAT TO BUILD: `eventMatchesCommitPath` compares `norm(event)` with `toplevel + '/' + commitPath`. `classifyFromEvents` returns `not_applicable` when the implementation side has no observed event; an observed implementation with no observed test edit stays `code_first`. Otherwise it requires each implementation file's first edit to follow some test edit.
GATE: all suites green.
REVIEW: 1. Does `not_applicable` still require presence (step 3a)? 2. Any Windows path-case issue in the anchoring? FAIL if: an unobserved implementation yields `test_first`, or an observed implementation with an unobserved test yields anything but `code_first`.
ROLLBACK: revert the commit.

**3c. The order check sees sub-agent edits**

EXTEND `src/hooks/lib/tdd-order.js`, `src/hooks/test-tdd-mandate.js`.
IMPORTS: step 3b.
TESTS FIRST: a fixture session directory whose subagents/agent-1.jsonl holds the impl `Write` and whose parent transcript holds the test `Write` yields an order verdict that uses both. A missing `subagents/` directory changes nothing. An unreadable sub-agent file is skipped with a counted warning, never a crash. Red today.
WHAT TO BUILD: `readEditEvents(transcriptPath)` also reads `<dirname(transcriptPath)>/<basename without .jsonl>/subagents/agent-*.jsonl`. Confirm the layout on disk first and record it in the report. Merge with the same parser and order by timestamp.
GATE: all suites green. The report quotes the real directory layout observed.
REVIEW: 1. Does a sub-agent's edit in another repository stay excluded (step 3b's anchoring)? FAIL if: sub-agent events are ignored, or a malformed file blocks every commit.
ROLLBACK: revert the commit.

**4a. Hook output follows the current PreToolUse schema (W)**

NEW `src/hooks/lib/hook-output.js`, `src/hooks/test-hook-output.js`. EXTEND every PreToolUse hook (`pre-commit-feature.js`, `pre-commit-review.js`, `enforce-co-author.js`, `pre-commit-hygiene.js`, `protect-user-dir.js`) and these test harnesses, which must map "no output" to allow: `src/hooks/test-pre-commit-review.js` (about 20 `approve` assertions), `src/hooks/test-fast-path-languages.js`, `src/hooks/test-protect-user-dir.js`, `src/hooks/test-enforce-co-author.sh`, `src/hooks/test-pre-commit-feature.sh`, `src/hooks/test-pre-commit-hygiene.sh`. (`pending-review-gate.js` is already unwired by 4b.) Assertions that must tell "allowed" from "ignored" once allow is silent (for example `--amend is gated, not ignored`, which asserts `!== 'silent'`, and `test-protect-user-dir.js`'s `JSON.parse(stdout)`) read a side channel instead: the `hook.end` timing event's `via`, through `TIMING_LOG_PATH`.
IMPORTS: step 4b (4b runs before 4a). MUST NOT TOUCH: block reasons' wording.
TESTS FIRST: `allow()` writes nothing and exits 0. `deny(reason, systemMessage)` writes one JSON object with `hookSpecificOutput.hookEventName === 'PreToolUse'`, `permissionDecision === 'deny'` and `permissionDecisionReason`, plus the legacy `decision: 'block'`, `reason` and `systemMessage` for the transition. Every hook's approve path prints nothing. Red today.
WHAT TO BUILD: the lib above, adopted by every PreToolUse hook. Q3 decided: allow prints nothing. The uncaught-exception handlers are registered before any require, so they emit the deny JSON inline (same shape) rather than through the lib.
GATE: all suites green on Linux and Windows. `grep -ln "decision: 'approve'" src/hooks/pre-commit-feature.js src/hooks/pre-commit-review.js src/hooks/enforce-co-author.js src/hooks/pre-commit-hygiene.js src/hooks/protect-user-dir.js` prints nothing.
REVIEW: 1. Does any hook still print on allow? 2. Does every block path go through `deny`, or (the uncaught-exception handlers only) emit its JSON shape inline? FAIL if: a PreToolUse hook auto-approves, or a block path is lost.
ROLLBACK: revert the commit.

**4b. Timeouts are seconds, chosen on purpose, and the dormant hook is unwired**

EXTEND `hooks/hooks.json`, `src/test-plugin-layout.js` (its inline `EXPECTED_WIRING` asserts timeout-for-timeout parity and must change in step), `src/hooks/pre-commit-review.js` (the coverage-wait cap), and README (one sentence: a timed-out hook is fail-open; plus the two places that state the 120 s coverage-wait default). `legacy/hooks-config.json` stays frozen: it records what the pre-plugin installer wrote.
IMPORTS: step 3c.
TESTS FIRST: the layout test asserts every timeout is an integer of at most 900 seconds, that the review hook's timeout exceeds `COV_WAIT_TIMEOUT_MS / 1000` plus a margin, and that `pending-review-gate.js` is not wired. Red today. Update the layout test's "the plugin wires every legacy script" assertion, which fails once it is unwired: the plugin wires every legacy script except `pending-review-gate.js`.
WHAT TO BUILD: timeouts in seconds: session-start 10, enforce-review-implementer 5, pre-commit-feature 15, pre-commit-review 300, enforce-co-author 5, pre-commit-hygiene 900, post-commit hooks 30/15/15. Remove `pending-review-gate.js` from `hooks/hooks.json` (the file stays). Cap the coverage wait at 240 s.
GATE: all suites green. `claude plugin validate .` exits 0.
REVIEW: 1. Can any gate time out before it can decide in normal use (hygiene's pytest on a large repo)? FAIL if: a timeout is in milliseconds, or a gate's work can exceed its timeout.
ROLLBACK: revert the commit.

**5. plan-spec's checker resolves symbols by word boundary, catches bad ranges, and has a test**

NEW `skills/plan-spec/test_check_citations.sh`. EXTEND `skills/plan-spec/check_citations.py`, the fixtures if their counts change, and `skills/plan-spec/fixtures/clean-plan.md` (its "on `main`" claim).
IMPORTS: none from earlier steps.
TESTS FIRST: the new test asserts each fixture's exit code and problem count against a named branch, and a probe plan citing `src/hooks/lib/git-read.js::gitRea`, `::HASH` and `:500-10` reports three problems. Red today: the probe reports clean.
WHAT TO BUILD: for non-Python files, a symbol resolves only on a definition shape (`(function|const|let|var|class)\s+SYM\b`, `SYM\s*[:=(]`, `module.exports.SYM`, `def SYM`, `SYM()` for shell), falling back to `\bSYM\b`. The range check uses `max(lo, hi)`. `SKIP_PREFIXES` drops `features/` and instead skips only `features/*.md`.
GATE: the new test passes. The existing fixtures keep their documented counts, or the report explains each change.
REVIEW: 1. Does a real JS export, a Python nested function or a shell function still resolve? FAIL if: a substring of a name resolves.
ROLLBACK: revert the commit.

**6. A reviewer-tagged marker needs a matching review event**

EXTEND `src/hooks/pre-commit-review.js`, `src/hooks/timing-log.js` (exempt `diff` from its all-digit-to-Number coercion, so a prefix like `00123456` survives, plus a reader if needed), `skills/code-review-pre-commit/SKILL.md` (the scope-review timing command and the gap-patching prompt both carry `diff=<prefix>`), `src/hooks/test-pre-commit-review.js`, `src/hooks/test-timing-log.js`.
IMPORTS: step 4a.
TESTS FIRST: a `PASS` marker tagged `code-reviewer:round1:PASS` with no `review.completed` event for its diff prefix inside the TTL blocks, and the message names the missing event. With the event, it approves. A 3-line PASS marker (no tag) blocks, and so does `mystery:round1:PASS`; update the existing tests that write 3-line markers and expect approve. A `gap-patch:round1:PASS` marker likewise needs a matching event (agent `gap-patch`). Fast-path tags (`trivial-diff`, `presentational`) are unaffected. A `diff` value with a leading zero round-trips through timing-log as a string. Red today.
WHAT TO BUILD: per Q4. The rule is inverted: a PASS marker approves without an event only when its tag is one of the hook's own fast-path tags (`trivial-diff`, `presentational`, `thresholds-met`, `thresholds-met-empty-gap`); every other tag, and no tag, needs the event. Both the hook's block text and the skill's post-review section give the timing command (with `diff=`) FIRST and the marker command SECOND, since the marker now depends on the event. The hook scans the tail of the timing log (bounded, at most 2,000 lines) for `review.completed`, `verdict=PASS`, and a matching `diff` prefix newer than the marker's TTL. The skill's timing command adds `diff=$(git diff --cached -- ':(top,exclude)features/*.md' | git hash-object --stdin | cut -c1-8)`. An unreadable log blocks.
GATE: all suites green.
REVIEW: 1. Is the remaining forgery path stated in the skill as the trust boundary? FAIL if: a recipe-only marker approves a commit (any non-fast-path tag, or no tag), or the instructions put the marker before the event.
ROLLBACK: revert the commit.

**7a. The instructions match the code**

EXTEND `skills/code-review-pre-commit/SKILL.md`, `agents/code-reviewer.md`, `instructions/claude-md-snippet.md`, `instructions/tdd-mandate-snippet.md`, `skills/plan-spec/SKILL.md`, `skills/plan-spec/reference.md`, `commands/review-timing.md`.
IMPORTS: step 6.
TESTS FIRST: the layout test asserts that `skills/code-review-pre-commit/SKILL.md` has a line defining `--fresh` (matching `` ^`--fresh` ``), and fails on "semantic lines" in `agents/`. Red today.
WHAT TO BUILD:
- Gap-patching stages the tests it writes before running the marker command.
- `--fresh` is defined in one sentence in the skill (decided: define, since dropping it reaches hook messages and README outside this step).
- The reviewer's size heuristic uses lines changed, not semantic lines.
- The snippet states that writing the marker is the act of attestation.
- The TDD snippet lists `specs/` and `[-_]spec.rb`, and that the order check now covers sub-agents (step 3c).
- plan-spec section 20.2 gains the review-commit permission note.
- The manual-run fallbacks in `skills/code-review-pre-commit/SKILL.md` and `commands/review-timing.md` find the plugin through `installPath` in `~/.claude/plugins/installed_plugins.json`, not `ls -t` over the cache (after `plugin update` the old cache dir has the newer mtime; observed 2026-10-03). Add `commands/review-timing.md` to this step's file set.
GATE: all suites green. `node src/test-plugin-layout.js` passes.
REVIEW: 1. Does every instruction a model acts on match the hook's behaviour after steps 1-6? FAIL if: an instruction contradicts the code.
ROLLBACK: revert the commit.

**7b. `.claude/` is reviewed, except the deploy target**

EXTEND `src/hooks/lib/source-files.js`, `src/hooks/test-source-files.js`.
IMPORTS: step 7a.
TESTS FIRST: the paths .claude/skills/x/tool.py and .claude/foo.js are code; .claude/hooks/pre-commit-review.js is not. Red today.
WHAT TO BUILD: narrow the exclusion from `/^\.claude\//` to `/^\.claude\/hooks\//`.
GATE: all suites green.
REVIEW: 1. Does this repo's own `.claude/` still hold anything the gates now newly require tests for? List it. FAIL if: a `.claude/` code file is excluded.
ROLLBACK: revert the commit.

**8. Windows gets the same verdicts and a green suite (W)**

EXTEND `src/hooks/lib/commit-command.js` (MSYS path translation), `src/hooks/test-commit-command.js`, and the test files whose harness breaks on Windows: the git shim helpers, `execSync(..., {shell: true})` uses. (the old install test and its symlink case were deleted with the pre-plugin installer; `src/test-uninstall.sh` has no symlink cases.)
IMPORTS: step 7b.
TESTS FIRST: on win32, `cd /c/Users/x/repo` resolves to `C:/Users/x/repo` in `directoryChangeReason`. On Linux the same string is left alone. Red on Windows today.
WHAT TO BUILD: in `directoryChangeReason`, translate `^/([a-zA-Z])/` to `$1:/` when `process.platform === 'win32'`. Test shims: on win32, write `git.cmd` that calls `bash <shim>`, so Node's process lookup finds it; replace `shell: true` with an explicit `bash -c`.
GATE: all suites green on Linux and on the Windows box. The report includes both summaries.
REVIEW: 1. Do the fail-closed paths (fake git failures) now actually run on Windows? FAIL if: any Windows-only failure remains, or a test is skipped without detection.
ROLLBACK: revert the commit.

**9. Unusual filenames cannot hide code from the gates**

EXTEND `src/hooks/pre-commit-review.js` (`readStagedCodeFiles`, `readStagedDiff`, the TDD path list), `src/hooks/pre-commit-hygiene.js` and `src/hooks/pre-commit-feature.js` (their `--name-only` reads), `src/hooks/test-pre-commit-review.js`.
IMPORTS: step 8.
TESTS FIRST: a staged `é.py` with semantic content is not approved as `staged-no-code`. A staged file literally named `:(exclude)evil.py` next to a semantic `evil.py` is not approved. Red today.
WHAT TO BUILD: every `--name-only` read uses `-z` and splits on NUL. `readStagedDiff` runs `git --literal-pathspecs diff ...`.
GATE: all suites green on Linux and Windows.
REVIEW: 1. Is any other path list read without `-z`? FAIL if: either crafted name escapes review.
ROLLBACK: revert the commit.

**10. The TDD opt-out is itself reviewed**

EXTEND `src/hooks/lib/tdd-order.js`, `src/hooks/test-tdd-mandate.js` (its opt-out case needs a `git init` repo with a commit), `src/hooks/test-fast-path-languages.js` (its fixtures write an untracked opt-out; commit it in the seed commit, or point `TDD_MANDATE_CONFIG` at an exempting JSON), `instructions/tdd-mandate-snippet.md`.
IMPORTS: step 9.
TESTS FIRST: per Q7. An untracked .claude/tdd-mandate.disabled does not disable the mandate; a tracked one at HEAD does. Red today.
WHAT TO BUILD: `mandateInForce` checks the opt-out at HEAD, not in the index: `git cat-file -e HEAD:.claude/tdd-mandate.disabled` with `cwd` at the toplevel, failing closed (any error, including no HEAD, means the mandate is in force). A staged-but-uncommitted opt-out therefore cannot switch the mandate off for the commit that introduces it. The snippet says how to opt out, and says plainly that the opt-out is tracked at HEAD and visible in history, but not itself reviewed (an extensionless file is not code to the review gate).
GATE: all suites green.
REVIEW: 1. Is the opt-out's limit (tracked, not reviewed) stated in the snippet? FAIL if: an untracked or staged-but-uncommitted file disables the mandate.
ROLLBACK: revert the commit.

## 7. Done

Steps 0-10 committed and reviewed. Every suite green on Linux and on the Windows box. A fresh clean-context Fable review, holding the toolchain against this plan's section 1, finds none of section 1's bypasses reproducible.

## 8. Decisions and disagreements

- 2026-10-03: owner decisions Q1-Q7 answered (section 3).
- 2026-10-03: carried from plugin step 3's review (IMPORTANT, accepted as D4 there): the review block's namespaced names, ROUNDS_POLICY and TAG_NOTE have no passing test while the TDD baseline pre-empts them. Step 0 must make that assertion real, and add one asserting that the recipe's tag is bare and that TAG_NOTE says "bare agent name".
- 2026-10-03: the Windows run of plugin steps 1-2 showed one more cmd.exe-quoting failure (`stagedDiffHash of an empty index matches the pipeline`), which is step 8's category, and a one-off hang of `test-enforce-co-author.sh` that did not reproduce in 3 reruns.
- 2026-10-03, review round 1 (Fable, held against the code at `9a14a9f`). Verdict NOT YET, 10 findings, all folded in. The orchestrator re-checked the timing-log coercion claim against `timing-log.js`.
  - F1 (3b): treating both unobserved sides as `not_applicable` would have opened a Bash-written-test bypass. Now only an unobserved implementation is `not_applicable`, and an observed implementation with an unobserved test stays `code_first`.
  - F2 (3a): an amend's test already in HEAD would regress to `no_tests`. The read for amends is now the index against `HEAD~1`.
  - F3 (10): `ls-files` checks the index, not HEAD. Now `git cat-file -e HEAD:<path>`, and `test-fast-path-languages.js` is added to the file set.
  - F4 (1): `/* c */ code;`, ` * x` and C's `#define` scored trivial. Now a whole-line block-comment regex, no continuation lines, and `#` only for .py/.rb/.php. The source-files integration case runs mandate-exempt.
  - F5 (2): git-read cannot tell an absent alias from a failure. Now `git config --default '' --get`, with no builtin list, and `--continue` counts as committing.
  - F6 (4b): the layout test's inline wiring and two README lines are added to the file set; `legacy/hooks-config.json` stays frozen.
  - F7 (4a): the grep gate is now an explicit file list, the harness files are named, and the uncaught-exception handlers emit deny JSON inline.
  - F8 (6): `gap-patch` tags also need an event, and timing-log no longer coerces `diff`.
  - F9 (7a): `--fresh` is defined, not dropped, with a decidable test.
  - F10 (0): the baseline is referenced by recorded names, not a count (27 + 1), and the co-author harness cause is recorded.
  - Steps 3c, 5, 7b, 8 and 9 were judged sound. Round 2, a source round blind to these fold-ins, runs against the code after plugin step 6.
- 2026-10-03, review round 2 (Fable, a source round blind to round 1, held against the code at `a01f383`). Verdict NOT YET, 8 findings, all folded in. Its experiments confirmed the step 1 regexes, the step 2 alias exit codes, the step 3c sub-agent layout, step 9's two crafted names, and step 10's `cat-file` behaviour.
  - F1 (6): an untagged or unknown-tagged marker still approved. The rule is inverted: only the hook's own fast-path tags skip the event.
  - F2 (6): the instructions wrote the marker before the event it depends on. The order is now event first.
  - F3 (2): alias values with arguments (`commit -a`) now go through `inspectCommitArgs`.
  - F4 (4a/4b): `pending-review-gate.js` stays wired until 4b, so 4b now runs before 4a. The layout test's "wires every legacy script" assertion is updated, and silent-allow assertions read the timing side channel.
  - F5 (3a): a root-commit amend diffs against the empty tree.
  - F6 (1): `; x` is dropped, and `--` is scoped to .sql.
  - F7 (section 2): the exact suite command from the repo root (`run-all.sh` was the orchestrator's scratch script, not in the repo).
  - F8 (10): stated honestly that the opt-out is tracked but not reviewed.
  - Added by the orchestrator: step 7a's `installPath` fallback fix (from the post-cutover finding).
  - The cap (2 rounds) is reached, so the loop stops. These fold-ins are unreviewed text (plan-spec §2b), and implementers and step reviewers are told so.
