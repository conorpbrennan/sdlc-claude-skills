# Dotnet Test Dirs

**Requirement**: The TDD gate counts a .NET `<Name>.Tests/` or `<Name>.Specs/` project folder or a bare `Tests/`, in any case, as a test directory, so `CCF.TESTS/XTests.cs` pairs with `CCF.ROOT/X.cs`.

**Started**: 2026-10-06
**Last updated**: 2026-10-06
**Branch**: dotnet-test-dirs

## Files involved

- .claude-plugin/plugin.json
- README.md
- instructions/tdd-mandate-snippet.md
- src/hooks/lib/tdd-order.js
- src/hooks/test-tdd-mandate.js

## History

- 2026-10-06 `9195ea4` — Count a .NET <Name>.Tests/ project folder as a test directory
  - .claude-plugin/plugin.json
  - README.md
  - features/dotnet-test-dirs.md
  - instructions/tdd-mandate-snippet.md
  - src/hooks/lib/tdd-order.js
  - src/hooks/test-tdd-mandate.js
- 2026-10-06 `e44d5b7` — Keep case-folding off the old test-dir rule
  - .claude-plugin/plugin.json
  - README.md
  - features/dotnet-test-dirs.md
  - instructions/tdd-mandate-snippet.md
  - src/hooks/lib/tdd-order.js
  - src/hooks/test-tdd-mandate.js
