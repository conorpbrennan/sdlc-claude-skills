# English Prose Skill

**Requirement**: Ship an english-prose skill that writes plain, simple English in my tone

**Started**: 2026-11-04
**Last updated**: 2026-11-04
**Branch**: english-prose-skill

## Acceptance

1. node src/test-plugin-layout.js exits 0 with english-prose in the shipped-skills list
2. claude plugin validate . exits 0
3. skills/english-prose/SKILL.md exists with name: english-prose and a description that triggers on rewrite and draft requests
4. CLAUDE.md and README.md both list english-prose
5. plugin.json version is 1.0.90, above origin/main

## Files involved

- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- skills/english-prose/SKILL.md
- src/test-plugin-layout.js

## History

<!-- populated on commit -->
