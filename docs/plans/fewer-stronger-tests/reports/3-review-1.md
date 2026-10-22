STEP: 3. Reviewer: sdlc:code-reviewer (Sonnet), round 1, in a throwaway worktree, run before the commit (docs-only diff; the hook did not block). Verdict: PASS (TDD_GATE: PASS).

Read the staged agents diff; grep gate prints 7; nothing under skills/ or instructions/ restates 2.x; the deep reviewer cites 2.1-2.7 by number. Runner and plugin validate not re-run (relied on the report).

Answers:
1. 2.2, 2.3, 2.5 are settleable from the diff. 2.4 and 2.6 are checkable from the block message and the diff; 2.6's "policy ceiling" is defined elsewhere.
2. 2.1 is word-for-word the old rule. 2.7 does not touch a bug fix's test.
3. Single source holds.

CRITICAL: none. IMPORTANT: none.

ADVISORY (to the close-out list):
- 2.6: name where the policy ceiling lives (`max_tests_per_commit`, step 7).
- The old text asked for new behaviour to be exercised against the invariant, with inputs a reader would think of; restore that clause in the TESTED lead-in.
- 2.3 "same expression as the implementation" is a judgement call at the margin; acceptable.
- Deep-reviewer line appended to step 5 runs long (style).
