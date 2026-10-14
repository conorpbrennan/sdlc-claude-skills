STEP: 4

GATE:
- `node src/test-plugin-layout.js`: exit 0, 130 passed, 0 failed.
- `node src/hooks/test-verification.js`: exit 0, 108 passed, 0 failed.
- `claude plugin validate .`: exit 0 ("Validation passed with warnings": the existing root `CLAUDE.md` warning and one other not read; `commands/feature.md` has its own).
- GUARDS, all exit 0: test-suite-isolation 34; test-source-files 67; test-hook-output 19; test-session-start-instructions 73.

RED FIRST:
- Layout: `FAIL: agents/ holds the two review agents and the verifier`, expected `["code-reviewer-deep.md","code-reviewer.md","verifier.md"]`, actual `["code-reviewer-deep.md","code-reviewer.md"]`.
- Verification: crashed with `ENOENT ... open '/home/coder/dev/sdlc-claude-skills/agents/verifier.md'`.
- Both green after the two markdown files were written.

FILES: `agents/verifier.md` (new), `commands/verify.md` (new), `src/test-plugin-layout.js`, `src/hooks/test-verification.js`, plan §9. Declared set exactly. `agents/code-reviewer*.md` and `skills/` untouched.

DISAGREEMENTS:
- `agents/code-reviewer.md` § Constraints "do not run the repository's own hooks or install scripts" would stop the verifier driving hooks through stdin. Kept the install/uninstall ban; a hook or script a criterion names may run only against a scratch repository under `mktemp -d`.
- The harness blocked a first Bash heredoc whose markdown mentioned committing; both files rewritten with the Write tool.

DECISIONS THE PLAN LEFT OPEN (plan §9, "Step 4"):
- Added `verify` to `BARE_INVOCATION` in `src/test-plugin-layout.js`, with a catch assertion for a bare `/verify`; `/sdlc:verify` and paths still pass.
- The test finds the example by its table header and asserts exactly one fenced block carries it.
- `verify.md` has `description` frontmatter and a `$ARGUMENTS` heading, like `feature-new.md`.

MEASUREMENTS: pass counts above, from each test's `Results:` line.

BUDGET USED: 1 implementation pass, 1 gate run, within 1 + 1–2.

NEXT:
- Review Q1: the agent says PASS needs a quoted command and observed output; `parseReport` enforces only non-blank evidence, so the command-quoting rule is held by the prompt alone.
- The verifier marks every criterion UNVERIFIED if HEAD does not match the sha it was given.
- Example row 2 uses a placeholder `src/hooks/example.js`; format-only.
- `/sdlc:verify` step 6 needs `record-verification.js` (step 3, landed).
