STEP: S2. A library that reads the branch-review repos config.

GATE:
- `node src/hooks/test-branch-repos-config.js` -> exit 0, "23 passed, 0 failed".
- `node src/test-plugin-layout.js` -> exit 0.
- `node src/test-suite-isolation.js` -> exit 0 ("52 passed, 0 failed"). First run failed because the new test lacked `isolateGitEnv()`; added it, reran green.
- `claude plugin validate .` -> exit 0.
- `node -e "JSON.parse(...branch-review-repos.json.example...)"` -> exit 0.

RED FIRST: ran `node src/hooks/test-branch-repos-config.js` before the module existed: "Error: Cannot find module './lib/branch-repos-config.js'".

FILES: new `src/hooks/lib/branch-repos-config.js`, `src/hooks/test-branch-repos-config.js`, `.claude/branch-review-repos.json.example`. Exactly the declared set. pre-pr-verify.js not imported or edited.

DISAGREEMENTS: none. The step's test list did not mention `isolateGitEnv()`, but `src/test-suite-isolation.js` requires it in every suite; added.

DECISIONS THE PLAN LEFT OPEN:
- Added private helpers `isObject` and `listed` (not exported). Same behaviour as pre-pr-verify.js.
- `entryFor` normalizes its `dir` argument as well (harmless for a realNormalized input). Ties on key length: first key wins.
- `entryFor` and `ownEntry` return `{key, entry}` only; the `keys` spellings are internal. Non-object `repos` gives null, never a throw.
- `baseOf` on a non-object entry returns `{ok:true, base:null}` (modeOf is the check for a bad entry shape).
- Test blocks: 4 (baseOf/modeOf table, readReposConfig table, configPath, entryFor/ownEntry); the unreadable-row and error rows also assert the message names the file.

MEASUREMENTS: 23 assertions passed (`node src/hooks/test-branch-repos-config.js`). Suite-isolation 52 passed.

BUDGET USED: about 9 tool calls, under budget; no review round run by me.

NEXT: `readReposConfig` takes the path as an argument; callers pass `configPath()`. `entryFor` expects the caller to pass `realNormalized(cwd)`. `ownEntry` takes the git toplevel from `gitRead` (S1/git-read owner). The example file has no `base` key in the entry, per the plan.

TEST COMMAND: `node src/hooks/test-branch-repos-config.js` -> "23 passed, 0 failed".

git diff --stat (working tree, tracked files): only pre-existing edits (features/statusline-windows-datadir.md, run/tracker.md). My three files are untracked (new): `.claude/branch-review-repos.json.example`, `src/hooks/lib/branch-repos-config.js`, `src/hooks/test-branch-repos-config.js`.
