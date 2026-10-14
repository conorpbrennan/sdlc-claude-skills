STEP: 3

GATE:
- `node src/hooks/test-record-verification.js` -> exit 0, 35 passed, 0 failed
- `node src/hooks/test-verification.js` -> exit 0, 104 passed, 0 failed
- GUARDS, all exit 0: test-suite-isolation 33; test-plugin-layout 127; test-source-files 67; test-hook-output 19; test-session-start-instructions 73.

RED FIRST: `node src/hooks/test-record-verification.js` before `record-verification.js` existed. Case (a): "exit 0" expected 0, actual 1; "stdout ends with the trailer" expected "VERIFY_GATE: PASS", actual ""; "record has the section" and "record says PASS" actual false. The run then died on `ENOENT ... .git/.claude-last-verify` reading the missing marker. The marker read was made tolerant afterwards (the only test edit after the red run); the red was not re-run with that edit.

FILES: `src/hooks/record-verification.js` (new), `src/hooks/test-record-verification.js` (new), both declared. `docs/plans/verification-stage.md` §9 (always permitted). `pre-pr-verify.js` and `agents/` untouched.

DISAGREEMENTS: none. The plan does not define the `unverified` count (see decisions).

DECISIONS THE PLAN LEFT OPEN (plan §9, "Step 3"):
- The record path is `features/<branch>.md` under the repo toplevel, not the cwd.
- A missing report file or missing `--report` exits 2 before any write. A report that exists but does not parse is exit 1 (FAIL).
- Every check runs before the first write. The only writes are the record, then the marker (PASS) or the marker delete (FAIL).
- `unverified` in `verify.completed` = criteria - PASS rows - FAIL rows, so a criterion with no row counts as unverified.
- If a FAIL's marker delete throws (not ENOENT), the CLI exits 2 with the record already written; not made safe without breaking the record-first order.

MEASUREMENTS: test counts above, from the last line of each command.

BUDGET USED: 1 implementer pass.

NEXT:
- `record()` throws `Refusal` for every exit-2 reason; the main block prints it to stderr, so a crash and a refusal both exit 2 with no marker.
- Test (h): branch `main` gives exit 2. Detached HEAD not tested.
- Review mapping: Q1 `parseReport` is the only verdict source, exit is `pass ? 0 : 1`; Q2 every `Refusal` is before the "Writes begin here" comment; Q3 FAIL runs `fs.rmSync(markerFile, {force:true})`, covered by (b); Q4 only `rev-parse`, `ls-tree`, `status` through `gitRead`.
- The script exports `record(argv, cwd)`, not asked for; step 6 does not need it.
