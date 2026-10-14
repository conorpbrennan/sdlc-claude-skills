STEP: 5 (a detector recognises `gh pr create` in a Bash command)

GATE:
- `node src/hooks/test-pr-command.js`: exit 0, 35 passed, 0 failed.
- `node src/hooks/test-commit-command.js`: 297 passed, 0 failed (baseline unchanged).
- GUARDS, each exit 0: test-suite-isolation 34; test-plugin-layout 128; test-source-files 67; test-hook-output 19; test-session-start-instructions 73.

RED FIRST: `test-pr-command.js` written first; before any implementation it died: "Error: Cannot find module '/home/coder/dev/sdlc-claude-skills/src/hooks/lib/pr-command.js'". First assertion needed: `isPrCreate('gh pr create') === true`.

FILES: all declared, none staged.
- NEW `src/hooks/lib/pr-command.js`, `src/hooks/test-pr-command.js`.
- `src/hooks/lib/commit-command.js`: only `module.exports` changed; now also exports `WRAPPER_WORDS` and `SHELL_RESERVED_WORDS`.
- `docs/plans/verification-stage.md`: §9 block (+2 lines).

DISAGREEMENTS: none.

DECISIONS THE PLAN LEFT OPEN:
- Exported `WRAPPER_WORDS` and `SHELL_RESERVED_WORDS`, not `commandWord`: `commandWord` returns a word, not the index the scan needs. Exports only.
- Two small patterns restated in `pr-command.js`: the `NAME=value` regex and the wrapper duration regex `^\d+[smhd]?$`. Neither is a list; both are inline in `commit-command.js`, so importing them would change it.
- After a wrapper, only flags and durations are skipped (the shape `findDirectoryChange` accepts), so `timeout 5 gh pr create` counts.
- Named ADVISORY gaps, in `pr-command.js`'s header and plan §9: `bash -c`, `eval`, `sh -c`; `sudo -u root gh ...` (commit-command does not skip that argument either); `$GH`; `gh --repo x pr create`; a quoted `"gh"` word.

MEASUREMENTS: 35 passed (`node src/hooks/test-pr-command.js`); 297 passed (`node src/hooks/test-commit-command.js`).

BUDGET USED: 1 implementation pass, against 1 + 1.

NEXT: step 6 imports `isPrCreate` from `./lib/pr-command`. It takes the raw command string and returns false for non-strings and the empty string. `bash -c "gh pr create"` is not detected.
