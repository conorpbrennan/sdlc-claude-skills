STEP: S6b. Library that lists and unlists a repo in the branch-review repos config.

GATE (each run from the repo root, all exit 0):
- `node src/hooks/test-branch-repos-write.js`: 83 passed, 0 failed.
- `node src/hooks/test-branch-repos-config.js`: 23 passed, 0 failed.
- `node src/test-plugin-layout.js`: 0. `node src/test-suite-isolation.js`: 0. `claude plugin validate .`: 0.
- `! grep -qE "spawnSync|execFileSync|os.homedir" src/hooks/lib/branch-repos-write.js`: 0.
- `! grep -qE "sdlc-review.json|settings.json" src/hooks/lib/branch-repos-write.js`: 0.
- `! grep -q "os.homedir" src/hooks/test-branch-repos-write.js`: 0.
- `git diff --quiet HEAD -- hooks/hooks.json src/hooks/pre-pr-verify.js src/hooks/lib/steps.js .claude/verify-repos.json.example commands/branch-review.md`: 0.

RED FIRST: ran `node src/hooks/test-branch-repos-write.js` before the lib existed. Failure: `Error: Cannot find module './lib/branch-repos-write.js'`.

FILES: touched `src/hooks/lib/branch-repos-write.js` (new, 137 lines) and `src/hooks/test-branch-repos-write.js` (new). Both in the declared set. Nothing else changed by me. The staged `features/branch-review-pre-pr-1.md`, `run/tracker.md` and the unrelated `features/statusline-windows-datadir.md` edit were already there.

DISAGREEMENTS: none. The plan said the lib is about 120 lines; it is 137 (Args/Returns comments).

DECISIONS THE PLAN LEFT OPEN:
- Temp name `<config>.<pid>.tmp` in the config's directory, opened `wx`, mode copied from the existing file (0644 for a new one), chmod after write so umask does not narrow it. Conservative: same directory keeps rename atomic.
- Invalid existing mode with `mode` omitted: becomes `advisory` (the plan says "else advisory").
- `disableRepo` on a matched non-object entry: refused with an error, file untouched (also when an earlier matched key was a valid object; nothing is written until the loop ends).
- Failed-write test: a config path under a plain file fails at the read step (ENOTDIR), so it is refused before any write. The temp-removal path in `writeDocument` is not driven by a test; the failed-write row shows nothing is created.
- `ok: false` results carry only `ok` and `error`.
- `enableRepo` returns `unchanged` only when the old entry deep-equals the new one; `disableRepo` returns `key` as the first removed key, or null.

MEASUREMENTS: 83 and 23 pass counts from the two test commands above. `wc -l src/hooks/lib/branch-repos-write.js` gave 137.

BUDGET USED: about 7 tool calls, well within about 30.

NEXT: S6c should call `enableRepo({ configPath, toplevel, mode })` and `disableRepo({ configPath, toplevel })` and check `ok` first. Callers pass the git toplevel; the lib applies `realNormalized` for new keys. The written JSON is re-indented to 2 spaces. A `ok: false` result means the file was not changed.

Test command: `node src/hooks/test-branch-repos-write.js` -> `83 passed, 0 failed`.
git diff --stat: no tracked file changed by this step (both files are untracked new files; `git status --short` shows `?? src/hooks/lib/branch-repos-write.js` and `?? src/hooks/test-branch-repos-write.js`).
