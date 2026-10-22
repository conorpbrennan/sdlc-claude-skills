STEP: C3. Reviewer: sdlc:code-reviewer (Sonnet), round 1, in a throwaway worktree, run before the commit (docs-only). Verdict: PASS (TDD_GATE: PASS).

Answers:
1. No criterion restated outside `agents/code-reviewer.md`: code-reviewer-deep.md:48 says 2.1-2.7 apply unchanged; code-review-pre-commit SKILL.md:156 points at 2.2-2.7; README.md:463,466 names `max_tests_per_commit` as a config key and message format only.
2. 2.1 word for word unchanged (HEAD lines 105-106, staged 107-108).
3. reference.md §17 (line 1028) lists six size tests: declared file set; GATE checkable without running unbuilt things; diff holdable in view; single-revert rollback; TESTS FIRST at most eight functions; about 40 tool calls.

CRITICAL: none. IMPORTANT: none.
ADVISORY: `skills/plan-spec/reference.md:1042` still says "The other three tests decide more often than this one" (stale against six; outside the file set). Left as a named gap.
