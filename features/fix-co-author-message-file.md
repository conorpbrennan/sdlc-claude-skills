# Fix Co Author Message File

**Requirement**: The co-author check reads each commit's real message (`-m`, `-F` file, heredoc or `--trailer`) and blocks one without a `Co-Authored-By` line.

**Started**: 2026-10-04
**Last updated**: 2026-10-04
**Branch**: fix-co-author-message-file

## Files involved

- CLAUDE.md
- README.md
- skills/plan-spec/reference.md
- src/hooks/enforce-co-author.js
- src/hooks/lib/commit-command.js
- src/hooks/test-commit-command.js
- src/hooks/test-enforce-co-author.sh

## History

<!-- populated on commit -->
