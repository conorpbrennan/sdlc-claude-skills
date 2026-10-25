# Readme Disable Steps

**Requirement**: The README tells the reader how to switch off each sdlc workflow area today (Orchestration, Features, TDD, Code Review, Hygiene, Verification, Commit conventions, model steering, plugin upkeep), and says plainly which steps have no switch.

**Started**: 2026-10-25
**Last updated**: 2026-10-25
**Branch**: readme-disable-steps

## Acceptance

1. `grep -c '^### Turning steps off' README.md` prints 1, and the old `### Opt out of feature tracking per repo` heading is gone.
2. The "Turning steps off" table has a row for each of Orchestration, Features, TDD, Code Review, Hygiene, Verification, Commit conventions, Model steering and Plugin upkeep.
3. Each switch the table names exists in the source: `.claude/feature-tracking.disabled`, `.claude/tdd-mandate.disabled`, `exempt_repos`, `sdlc-cache-ttl.disabled` and `sdlc-autoupdate.disabled` each appear in `src/hooks/`.
4. Every `](#anchor)` link in the new section resolves to a heading in README.md.
5. `claude plugin validate .` exits 0 and `.claude-plugin/plugin.json` carries a version above 1.0.64.

## Files involved

- .claude-plugin/plugin.json
- README.md

## History

<!-- populated on commit -->
