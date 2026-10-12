# Tdd Split Commit Gate

**Requirement**: Make the TDD gate accept a test-first two-commit split, and make every PreToolUse block reach Claude with its full instructions.

**Started**: 2026-10-12
**Last updated**: 2026-10-12
**Branch**: tdd-split-commit-gate

## Files involved

- .claude-plugin/plugin.json
- README.md
- docs/plans/sdlc-hardening.md
- instructions/claude-md-snippet.md
- instructions/tdd-mandate-snippet.md
- src/hooks/enforce-co-author.js
- src/hooks/lib/hook-output.js
- src/hooks/lib/tdd-order.js
- src/hooks/pending-review-gate.js
- src/hooks/pre-commit-feature.js
- src/hooks/pre-commit-hygiene.js
- src/hooks/pre-commit-review.js
- src/hooks/test-enforce-co-author.sh
- src/hooks/test-hook-output.js
- src/hooks/test-pre-commit-feature.sh
- src/hooks/test-pre-commit-hygiene.sh
- src/hooks/test-pre-commit-review.js
- src/hooks/test-tdd-mandate.js

## History

<!-- populated on commit -->
