# Statusline Plugin

**Requirement**: The sdlc plugin ships the status line as a Node script (`ctx N% used (used/size) | model | cost day $X | branch`), and an opt-in `/sdlc:statusline` command installs it by merging only the `statusLine` key into `~/.claude/settings.json`.

**Started**: 2026-10-25
**Last updated**: 2026-10-25
**Branch**: statusline-plugin

## Acceptance

1. Piping `{"model":{"display_name":"Sonnet"},"cost":{"total_cost_usd":1.2},"workspace":{"current_dir":"/tmp"},"context_window":{"remaining_percentage":73,"context_window_size":200000,"current_usage":{"input_tokens":54000}}}` into `node src/statusline.js` prints a line that starts `ctx 27% used (54k/200k) | Sonnet | $1.20` once colour codes are stripped.
2. `node src/statusline.js` with malformed JSON on stdin exits 0 and prints a line.
3. `node src/test-statusline.js` and `node src/test-day-cost.js` exit 0, and `bash tools/run-tests.sh` shows rc=0 on every line.
4. Running the installer against a settings.json that has other keys (including `hooks`) leaves every other key unchanged and writes a `settings.json.backup.<UTC>-pre-sdlc-statusline` copy.
5. Running the installer against a settings.json that already has a different `statusLine` leaves it unchanged unless `--force` is passed.
6. `/sdlc:statusline` appears in `commands/` and `claude plugin validate .` exits 0.

## Files involved

- .claude-plugin/plugin.json
- src/lib/day-cost.js
- src/statusline.js
- src/test-day-cost.js
- src/test-statusline.js

## History

- 2026-10-25 `e07c102` — statusline: tests for the status line and its day-cost estimate
  - .claude-plugin/plugin.json
  - src/test-day-cost.js
  - src/test-statusline.js
