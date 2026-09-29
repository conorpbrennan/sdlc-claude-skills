# Install Preserves User Files

**Requirement**: install.sh never loses a user's own files: merge-hooks.js merges into existing hooks instead of replacing them, any agent, command, tool, hook or skill file that differs is backed up with a manifest before being overwritten, and uninstall.sh restores those originals.

**Started**: 2026-09-28
**Last updated**: 2026-09-29
**Branch**: install-preserves-user-files

## Files involved

- README.md
- install.sh
- src/hooks/lib/tdd-order.js
- src/hooks/test-tdd-bash-edits.js
- src/lib/hook-ownership.js
- src/merge-hooks.js
- src/test-install.sh
- src/test-merge-hooks.js
- src/test-unmerge-hooks.js
- src/unmerge-hooks.js
- uninstall.sh

## History

<!-- populated on commit -->
