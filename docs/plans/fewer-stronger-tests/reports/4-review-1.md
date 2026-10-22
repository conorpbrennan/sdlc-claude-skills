STEP: 4. Reviewer: sdlc:code-reviewer (Sonnet), round 1, in a throwaway worktree, run before the commit (docs-only diff). Verdict: PASS (TDD_GATE: PASS).

RED confirmed: a `git archive HEAD` copy gives 72 passed, 1 failed ("at least 1500 characters of headroom"); the staged worktree gives 73/0. `instructions/*.md` total 8,242 (limit 8,250). "no uncovered line" count 0. Nothing in src/, commands/ or skills/code-review-pre-commit touched. Runner, check_citations and plugin validate taken from the report.

Answers:
1. No criterion restated; implementer.md and §21.1 cite 2.2-2.7; SKILL.md clauses are pointers.
2. Moved paragraph lost no rule: README carries the full path convention (.NET and `*Spec.java` rationale included); the snippet keeps a pointer. Of the three tightened sentences, two lost wording only; the "no exempt-directory list" paragraph lost its history (`tmp/`, `.planning/`) and the `uninstall.sh` example, but the rule (no exempt dirs, shell scripts need tests) survives.
3. A tenth case is a new row: "at most eight functions; a case is a row", and the snippet says a new row satisfies the mandate.

CRITICAL: none. IMPORTANT: none.

ADVISORY (to the close-out list):
- `skills/plan-spec/SKILL.md:58-60` item 4 says "§17's four tests"; §17 now has six.
- Two new snippet lines are single long lines; the file wraps at about 80 columns (style).
- `skills/plan-spec/SKILL.md:147` clause sits mid-line in a long paragraph (style).
