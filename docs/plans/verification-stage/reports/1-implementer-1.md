STEP: 1. Code and tests done; GATE green. Did not write §9 DECISIONS-OPEN (orchestrator did).

GATE:
- `node src/hooks/test-feature-file.js`: exit 0, 19 passed, 0 failed.
- `bash src/hooks/test-post-commit-feature.sh`: 26 passed, 0 failed.
- `bash src/hooks/test-pre-commit-feature.sh`: 57 passed, 0 failed.
- `bash src/hooks/test-session-start-feature.sh`: 28 passed, 0 failed.
- GUARDS, all exit 0: test-suite-isolation 31 passed; test-plugin-layout 125; test-source-files 67; test-hook-output 19; test-session-start-instructions 73.

RED FIRST: test file written before `feature-file.js` was touched. Before the implementation it exited 1, 1 passed, 16 failed:
- "FAIL ACCEPTANCE_HEADING is exported"; "FAIL exactly one fenced example starts with ## Acceptance — found 0".
- "FAIL placeholder-only section gives [] — expected [] got null".
- "FAIL no section: appended after one blank line at the end … got null".
- The one "ok" was vacuous (idempotence compared null to null); tightened to require a string result.

FILES: `src/hooks/lib/feature-file.js`, `commands/feature-new.md`, `commands/feature.md`, new `src/hooks/test-feature-file.js`. Matches the declared set. Not touched: `verification.js`, `session-start-feature.js`, plan, tracker, `plugin.json`. Nothing staged, no bump.

DISAGREEMENTS: none.

DECISIONS THE PLAN LEFT OPEN:
- Example vs template in `feature-new.md`: the filled example is a column-0 fenced block whose first line is `## Acceptance`; the step 5 template stays indented and starts with a title. The test requires exactly one such column-0 block.
- Heading match by prefix (`^## Acceptance`, `^## Verification`), as the plan says "starts". Section ends at `^## `, so `### ` does not end it.
- Spacing: `replaceVerification` writes `section`, then one blank line before the next heading; at EOF just `section`. Append trims trailing whitespace and adds one blank line.
- "Later" answer: leaves an existing `## Acceptance` section alone, so real criteria are never overwritten by the placeholder.

MEASUREMENTS: 19 passed / 0 failed (`node src/hooks/test-feature-file.js`). `features/verification-stage.md` parses to 5 criteria (same test).

BUDGET USED: 1 implementer pass. Within 1 + 1–2.

NEXT:
- `feature.md`'s Acceptance and first-`## Verification`-line output is prose instruction only; no code enforces it.
- Step 2's renderer must produce `section` starting `## Verification` and ending in a newline; `replaceVerification` assumes it.
- Any new column-0 fenced block starting `## Acceptance` in `commands/feature-new.md` fails the "exactly one" check.
