STEP: S8. Docs: README, CLAUDE.md table, session instruction line, steps table.

GATE:
- Assumes-landed check (test -f ... && node src/test-branch-review-skill.js): 28 passed, 0 failed.
- `node src/hooks/test-session-start-instructions.js`: Results: 544 passed, 0 failed (exit 0). Headroom held.
- `node src/test-plugin-layout.js`: exit 0. `node src/test-suite-isolation.js`: exit 0. `claude plugin validate .`: exit 0.
- `grep -c "pre-pr-branch-review" README.md CLAUDE.md`: README 5, CLAUDE 1.
- `grep -c "branch-review-repos.json" README.md instructions/feature-workflow-snippet.md`: 5 and 1.
- `grep -c maxChangedLines README.md`: 2.
- `grep -qF "branch-review on|off|status"` on README.md and on CLAUDE.md: both exit 0.
- `test -e` for every path in the new CLAUDE.md rows: all ok (skills/branch-review/, commands/branch-review.md, src/hooks/pre-pr-branch-review.js, src/hooks/lib/branch-review.js, branch-repos-config.js, branch-report.js, branch-repos-write.js, src/hooks/branch-review-cli.js, src/hooks/lib/review-config.js, .claude/sdlc-review.json.example).
- Snippet line longer than 160 chars: 0 lines.

RED FIRST: Not required. The session-instructions test and the GATE greps stood in.

FILES: README.md, CLAUDE.md, instructions/feature-workflow-snippet.md. Exactly the declared set. No source or test file touched. features/statusline-windows-datadir.md left alone.

DISAGREEMENTS:
- CLAUDE.md: the GATE needs the literal `branch-review on|off|status`. Inside a markdown table cell the bare pipes split the cell in the rendered view. I kept the literal (the gate requires it). README uses `\|` escapes in its command table row, with the full form `[on [--mode advisory\|enforce] \| off \| status]`, and the literal `on|off|status` in prose.
- The plan's CLAUDE.md "config key" row names `branchReview` in `sdlc-review.json`. I pointed it at `src/hooks/lib/review-config.js` and `.claude/sdlc-review.json.example`. Both exist.
- The plan lists the CLI as `branch-review-cli.js` without a directory; it is `src/hooks/branch-review-cli.js`. I used that path.

DECISIONS THE PLAN LEFT OPEN:
- Steps-table area is `branch-review` (from src/hooks/lib/steps.js), guard `no`, placed after the verification row. Conservative: matches the source.
- Marker path stated as `.git/.claude-last-branch-review`, from review-markers.js (`BRANCH_MARKER_NAME`, under the git dir).
- Skill entry says one `code-reviewer-deep` sub-agent per pass, per the SKILL.md tag `code-reviewer-deep:round<n>`.
- README list of failing states: missing, stale, empty, unreadable (error); also detached and no-base exist in the hook. The README names no-base under `base`; detached is not listed. Not a contradiction.
- Fail-closed list: unreadable or unparsable config; invalid `mode` or `base` in the repo's own entry. Taken from hook decision steps 3 and 5. The crash handler also blocks; not listed.

MEASUREMENTS: Quoted above; each from the command beside it. Defaults 25000 and 2 checked against src/hooks/lib/review-config.js line 35 (`model: 'opus', maxRounds: 2, maxChangedLines: 25000`).

BUDGET USED: about 10 tool calls, under the 25 allowed. One review round pending.

NEXT:
- The orchestrator bumps the plugin version before staging.
- The README names `.git/.claude-last-branch-review` and the four-line marker body; the reviewer should check these against src/hooks/lib/branch-review.js (`markerRecipe`, `readMarker`).
- README also adds `/sdlc:branch-review` to the "Using the plugin" command list (the step said "in the command entry").

TEST COMMAND: `node src/hooks/test-session-start-instructions.js` -> Results: 544 passed, 0 failed.

git diff --stat (my three files):
 CLAUDE.md                                |  3 ++
 README.md                                | 50 ++++++++++++++++++++++++++++++--
 instructions/feature-workflow-snippet.md |  1 +
 3 files changed, 51 insertions(+), 3 deletions(-)
