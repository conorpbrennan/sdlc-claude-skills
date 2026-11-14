STEP: S8 fix round 1
GATE:
- sed -n 59p CLAUDE.md | awk -F'|' '{print NF-2}' -> 2 (pass)
- awk -F'|' '/^\| /{print NF-2}' CLAUDE.md | sort | uniq -c -> 25 rows of 2, nothing else (before: 24 of 2, 1 of 4). No other table differs.
- grep -qF "branch-review on|off|status" CLAUDE.md -> exit 0
- grep -c pre-pr-branch-review CLAUDE.md -> 1
- grep -nE '(^|[^:a-z-])/branch-review' CLAUDE.md -> no output
- node src/test-plugin-layout.js -> exit 0
- node src/hooks/test-session-start-instructions.js -> exit 0
- git diff --stat -- CLAUDE.md -> 3 insertions, 1 deletion (row 59, new sentence and its blank line)
FILES: CLAUDE.md only.
DISAGREEMENTS: none.
DECISIONS: Used the reviewer's exact row and sentence. Edited with a small python replace of exact strings, no other row touched.
BUDGET USED: 3 tool calls.
NEXT: Restage CLAUDE.md. Row 59 now has 2 cells.
