STEP: 2

GATE:
- `node src/hooks/test-verification.js` -> exit 0, 104 passed, 0 failed
- `node src/hooks/test-review-markers.js` -> exit 0, 33 passed, 0 failed
- GUARDS, all exit 0: test-suite-isolation 32; test-plugin-layout 126; test-source-files 67; test-hook-output 19; test-session-start-instructions 73.
- Not staged, not committed. Gate last run against the final files.

RED FIRST: both tests written before the implementation.
- `node src/hooks/test-verification.js` -> exit 1, "Error: Cannot find module './lib/verification.js'"
- `node src/hooks/test-review-markers.js` -> exit 1, "TypeError: Cannot read properties of undefined (reading 'startsWith')" at the first `a.verify` assertion (g)

FILES:
- New: `src/hooks/lib/verification.js`, `src/hooks/test-verification.js`
- Extended: `src/hooks/lib/review-markers.js`, `src/hooks/test-review-markers.js`
- Always-permitted: `docs/plans/verification-stage.md` (§9 step 2 block)
- No difference from the declared set.

DISAGREEMENTS:
- `src/test-plugin-layout.js` `BARE_INVOCATION`: a string literal `./feature-file` matches as a bare `/feature` command, so the plan's import failed the guard. `verification.js` uses `require(path.join(__dirname, 'feature-file'))`, with a comment. Guard is outside the file set; not touched. (Orchestrator confirmed: `./lib/feature-file` in other hooks passes only because `b` precedes the slash.)
- "Returns null on any read error or with no HEAD" leaves the all-feature-files tree open. Chose null.
- "A PASS row with empty evidence counts as UNVERIFIED" and "each unmet condition adds one problem": one problem per such row, not two.

DECISIONS THE PLAN LEFT OPEN (all in plan §9, "Step 2"):
- `codeTreeHash` returns null when no non-feature entry remains.
- `dirtyPaths` adds `--untracked-files=all`, so a new `features/` directory lists its files and is filtered. A rename or copy reports both paths.
- `parseReport`: a result word other than exactly PASS, FAIL or UNVERIFIED (case-sensitive) reads as UNVERIFIED, with a problem; a trailer is valid only as the last non-blank line; a FAIL trailer adds a problem.
- `renderSection`: a newline in a cell becomes a space; a repeated row number uses the first row; a PASS row with blank evidence renders UNVERIFIED.
- `readMarker` returns null for a truncated body, not only for a non-PASS first line.
- The feature-file require is rewritten as above.

MEASUREMENTS:
- Test counts in GATE.
- Mutation run (scratch script, file restored). Each mutation makes test-verification.js exit 1: FAIL trailer ignored, 3 failures; row-set check removed, 9; non-PASS rows ignored, 6; empty-evidence check removed, 4; missing-trailer check removed, 9; empty read hashed, 1; tree compare removed from checkFresh, 4; criterion taken from report (after adding a smuggled-field test), 1.

BUDGET USED: 1 implementer pass.

NEXT:
- Step 3 writes the marker with `markerBody(codeTreeHash, acceptanceHash(parseAcceptance(...)))` and calls `renderSection` with rows from `parseReport`; those rows already carry UNVERIFIED for evidence-less PASS rows.
- `renderSection` output starts `## Verification` and ends in a newline, as `replaceVerification` needs.
- Any hook that imports feature-file from `lib/` must avoid the literal `./feature-file`, or the plugin-layout guard fails.
- Review brief should state the bounded threat model: the parser faces an honest verifier's output, not adversarial text.
