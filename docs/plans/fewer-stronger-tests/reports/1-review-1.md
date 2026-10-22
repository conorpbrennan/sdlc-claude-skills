STEP: 1. Reviewer: sdlc:code-reviewer (Sonnet), round 1, in a throwaway worktree. Verdict: PASS (TDD_GATE: PASS).

Ran `node src/hooks/test-added-tests.js` in the worktree: 48 passed, 0 failed. Mutated the lib and probed patterns with `node -e`. Tree hash unchanged before and after. Guards and measure-tests not re-run; relied on the implementer report.

Answers:
1. `+++` header case bites through `testLines` (expects 1; a counted header gives 2). Disabling header handling in a temp copy gave 18 FAIL lines.
2. Test-path decision imported: `tddOrder.isTestFile`, `tddOrder.isNonCommentLine`, `sourceFiles.isSourcePath`. `LANGUAGES` holds only extensions and regexes. No second copy.
3. No pattern matches production code: `FooSpec.java` and `src/Foo.java` with `@Test` count as source; `x.go` with `func TestMain` counts as source; `src/lib.rs` with `#[test]` counts as source; Python, JS and C# patterns are line-anchored (`latest(`, `contest(` do not match).

CRITICAL: none. IMPORTANT: none.

ADVISORY (batched to the close-out list in the tracker):
- Go regex `^func\s+Test\w*\(` also matches `func Testing()` and `func TestMain(m *testing.M)` inside `_test.go`. Use `Test[A-Z0-9_]` and exclude `TestMain`.
- JS `test.each` / `it.each` not counted; JS `parametrised` is null.
- Rust inline `#[test]` modules in `src/*.rs`, and Java/C# tests outside test-named paths, count as source. Follows from "tdd-order decides"; a known undercount.
- `test-added-tests.js` has no failing-direction case for Go, C# or Rust.
- `measure-tests.js` runs `git show` twice per commit. Fine for a hand-run tool.

Confirmed RED: the test's first action is `require('./lib/added-tests.js')`, so it throws MODULE_NOT_FOUND until the lib exists.
