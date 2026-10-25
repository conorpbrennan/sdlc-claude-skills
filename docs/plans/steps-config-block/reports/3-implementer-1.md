# Step 3 report: /sdlc:steps on|off

## FILES CHANGED
- `src/hooks/lib/review-config.js`: new exported `updateConfigFile(target, mutate)`; `setMainModel` calls it.
- `src/hooks/steps-cli.js`: `set <id> <on|off> [--file user|repo] [--repo <path>]`, `formatLine`, `resolveRepo`, `--file` flag, positional args.
- `src/hooks/test-steps-cli.js`: `SET_CASES` (11 rows).
- `commands/steps.md`: `on`/`off` branch replaces the "later version" line.
- `src/hooks/test-review-config.js`: not edited; existing `setMainModel` cases pass unchanged.

## RED RUNS
`node src/hooks/test-steps-cli.js` before `set` existed (23 FAIL lines):
```
  FAIL: step off in user file: exit
  FAIL: step off in user file: has 'orchestration read-trim off user file (steps.orchestration.read-trim)'
  FAIL: step off in user file: user content
  FAIL: area off: exit
```

## GATE OUTPUT
- `node src/hooks/test-steps-cli.js`: `Results: 91 passed, 0 failed`
- `node src/hooks/test-review-config.js`: `Results: 107 passed, 0 failed`
- `bash tools/run-tests.sh`: `Files: 42  failed: 0`
- `node src/test-plugin-layout.js`: exit 0
- `node src/test-suite-isolation.js`: exit 0
- `claude plugin validate .`: exit 0

## DISAGREEMENTS
None.

## DECISIONS
- `mutate` in `updateConfigFile` edits the parsed object in place; the function returns `{ ok, path, error }` as briefed. `setMainModel` messages are the same strings.
- Every refusal (unknown id, missing on/off, bad `--file` value, guard in repo file, no repo) is checked before `updateConfigFile`, so exit 2 writes nothing. Writer refusal exits 1 with "Nothing was written."
- Guard check uses the area of the id, so `--file repo` on a guard area id or step is refused.
- A `steps` value or area value of the wrong type is replaced by an object on write (a non-object `steps` is not a valid block anyway).
- Output after a write: one `list`-format line per affected step, then `warning:` lines from the fresh read.
- Alias test uses `mainModel: "off"` with `set main-model on`; prints `standalone main-model off alias`, and `mainModel` is kept.
- `list` now rejects positional args and `--file` (exit 2).

## UNRELATED FINDINGS
None.
