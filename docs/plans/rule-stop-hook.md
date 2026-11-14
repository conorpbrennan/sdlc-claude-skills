# Rule stop hook

Status: ready. Tier T0 (shape only; see section 2 on the shared files).

## 1. What this delivers, and what it does not

Delivers two plugin hooks that make the owner's two rules hold without the model
remembering them. Rule 1: never give up. Rule 2: do it to the best of your ability.

- A Stop hook that blocks a turn ending in an option question to the owner,
  outside the gates (commit, push, secrets, delete or overwrite, spend).
- A UserPromptSubmit hook that injects a short end-of-turn check.
- Both switch on and off through `/sdlc:steps`. Every Stop block is logged.

Does not: prove the code was read (the injected text only reminds), tune the
regex (tune it later on the block log), or edit `settings.json` or any CLAUDE.md.

## 2. Working constraints

- Repo `sdlc-claude-skills`, branch `rule-stop-hook`. Work in this directory only.
  No worktrees, no stash, no `git -C`.
- Not ours: `features/statusline-windows-datadir.md`. Never stage it.
- The two steps share `hooks/hooks.json`, `src/hooks/lib/steps.js` and `README.md`.
  They run one after the other, never overlapped. So the plan is not strictly T0.
- Tests first. Tests live beside the code as `src/hooks/test-*.js`.
- Hooks fail open: any error prints nothing and exits 0. Style follows
  `src/hooks/orchestrator-mode.js`: step check through `stepState` in
  `src/hooks/lib/steps.js`, output through `src/hooks/lib/hook-output.js`.
- Starting code for step 1 is outside the repo, at
  `/home/coder/dev/risk-reporting-data-services/tmp/rule-stop-hook.js`.
  Copy it in. Do not run it from there.
- The orchestrator raises the plugin version before each commit
  (`node tools/plugin-version.js bump`). Implementers never stage or commit.
- Implementers run on Sonnet. Reviews read the staged diff in place.
- Code standards: no inline imports, Args and Returns comments on every function,
  no hard-coded strings that belong in a constant.

**1. The Stop hook**
NEW `src/hooks/rule-stop-hook.js`, `src/hooks/test-rule-stop-hook.js`.
EXTEND `hooks/hooks.json`, `src/hooks/lib/steps.js`, `README.md`.
WHAT TO BUILD:
- Read stdin JSON (`transcript_path`, `stop_hook_active`). Take the last assistant
  text from the JSONL transcript.
- Block with `{"decision":"block","reason":...}` when the last 3 non-empty lines
  end in an option question and name no gate. Option phrases: "do you want me to",
  "should I", "shall I", "which option/one/should", "would you like me to",
  "want me to", "do you prefer", "let me know which". Gate words: commit, push,
  secret, credential, password, token, delete, overwrite, force, spend,
  permission, approve, SSO, login.
- Print nothing when `stop_hook_active` is true, when the step is off, and on any
  error.
- Reason text: pick the next step, say why in one line, start it.
- Each block appends one JSON line (`ts`, `session_id` if present, the tail text
  cut to 200 chars) to `sdlc-rule-stop.log` in the config dir (`CLAUDE_CONFIG_DIR`,
  else `~/.claude`). A log write failure never changes the decision.
- Add a `Stop` entry to `hooks/hooks.json` (timeout 5).
- Add area `conduct` (guard false) to `AREAS` in `src/hooks/lib/steps.js` with
  step `rule-stop-hook`. Fix any test that counts steps.
- One README line: the hook, its step id, the log path.
GATE:
- `node src/hooks/test-rule-stop-hook.js` exits 0. It covers 7 sample messages,
  the loop guard, step off, a transcript error and the log line.
- `node src/hooks/test-steps.js` exits 0.
- `bash tools/run-tests.sh` shows 0 failed.
- `claude plugin validate .` exits 0.
REVIEW:
1. Does any error path print a block? It must not.
2. Does `stop_hook_active: true` always pass?
3. Is the gate-word list applied to the same 3-line tail as the question?
4. Does the step-off check read `steps.conduct` as `orchestrator-mode` reads its own?
FAIL if: a block can be printed on error; the loop guard is missing; a log failure
can throw; the test has no red-first run.
-- status: pending

**2. The end-of-turn check injection**
NEW `src/hooks/rule-reminder.js`, `src/hooks/test-rule-reminder.js`.
EXTEND `hooks/hooks.json`, `src/hooks/lib/steps.js`, `README.md`.
WHAT TO BUILD:
- A `UserPromptSubmit` hook that prints a few lines of additional context:
  (a) no option question to the owner outside a gate;
  (b) open the code behind every claim, read delegated diffs yourself, say what was
  verified and what was not;
  (c) a negative result is not a stop: state the next step and start it.
- Add it to the existing `UserPromptSubmit` entry's `hooks` list in
  `hooks/hooks.json`, after `orchestrator-mode.js`. No second entry.
- Step id `rule-reminder`, added to area `conduct` in `src/hooks/lib/steps.js`.
  Off means print nothing.
- Fail open. One README line.
GATE:
- `node src/hooks/test-rule-reminder.js` exits 0. It covers text present when on,
  nothing when off, nothing on error.
- `grep -c '"UserPromptSubmit"' hooks/hooks.json` prints 1.
- `bash tools/run-tests.sh` shows 0 failed.
- `claude plugin validate .` exits 0.
REVIEW:
1. Is there one `UserPromptSubmit` entry, with the new hook in its list?
2. Does off print nothing?
3. Is the text three points and short?
FAIL if: a second `UserPromptSubmit` entry exists; the hook can throw; the step
cannot be switched through `/sdlc:steps`.
-- status: pending

## 7. Definition of done

Both gates pass. `/sdlc:steps` lists `rule-stop-hook` and `rule-reminder` under
`conduct` and switches each. Each step is one reviewed commit with the plugin
version raised. Nothing is pushed without the owner's word.
