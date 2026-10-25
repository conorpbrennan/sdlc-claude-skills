# 13c fix 1

Cause: src/hooks/pre-commit-review.js:1084 spelled `/sdlc:steps` as a literal in the TDD block message. test-plugin-layout.js forbids `sdlc:` literals outside lib/plugin-names.js.
Failing assertion: "no hook literal outside plugin-names.js spells sdlc:", actual ["src/hooks/pre-commit-review.js:1084"].

Fix: the literal became `cmd('steps')` (cmd is already imported there). One line. Test unchanged.

Gate:
- node src/test-plugin-layout.js: 156 passed, 0 failed, rc 0
- node src/test-suite-isolation.js: 50 passed, 0 failed, rc 0
- claude plugin validate .: rc 0, "Validation passed with warnings" (warning is about commands/feature-new.md, a file not touched by step 13)
- node src/hooks/test-pre-commit-review.js: 535 passed, 0 failed
Nothing staged or committed.
