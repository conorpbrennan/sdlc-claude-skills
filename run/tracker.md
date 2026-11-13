RUN: docs/plans/branch-review-pre-pr.md, revision 1 (T1, 10 steps: S1 S2 S3 S4 S5 S6 S6b S6c S7 S8). Branch: branch-review-pre-pr-1. Started: 2026-11-12.
BUDGET: plan total 65,655 bytes; per-step budgets in each step block (about 30 tool calls each). Spent: S1 about 14 calls against 30.
IN FLIGHT: nothing. All ten plan steps are committed and verified (2026-11-13). Waiting on the owner for the close-out step, the push and the PR.
TREE: staged nothing; unstaged: features/statusline-windows-datadir.md (unrelated, the owner's, never stage it). Worktrees open: none.
OWNER AUTHORISATION (2026-11-12, this session): stage, commit after each step's review PASS, dispatch fix agents, run the whole plan. Never push, never open a PR. Stop after two FAILs on one step.
SESSION NOTE: the run lives in /home/coder/dev/sdlc-claude-skills on branch branch-review-pre-pr-1 (cut from main 90caf92). The sibling worktree /home/coder/dev/sdlc-branch-review-pre-pr and its branch branch-review-pre-pr are abandoned and left untouched. The first attempt to commit S1 there was blocked by PRE_COMMIT_GATE (different repo from the one the hook inspects). Reviewers run on the staged diff in this repo, not in a throwaway worktree (the owner's rule allows a worktree only on request).
DISPOSITIONS: plan rounds 1 and 2 are in plan section 8. Run: S1 round 1 code-reviewer PASS, 0 critical, 0 important, 3 advisory (no pipefail in the recipe pipeline, fails closed; shellQuote duplicated by plan choice; optional base==HEAD row). All accepted, none acted on.
DECISIONS-OPEN: S1 implementer wrote the module before its red run, then moved it aside to show the failure. Red run is real; order was not tests-first. Accepted.
AS BUILT (2026-11-13, from the STEP blocks below):
  Branch branch-review-pre-pr-1, cut from main 90caf92. Ten step commits, S1 to S8 including S6b and S6c, plugin 1.0.89 to 1.0.99. Each step passed code-reviewer round 1 except S8: round 1 FAIL (one CRITICAL, an unescaped pipe in a CLAUDE.md table cell), fresh fix agent, round 2 code-reviewer-deep PASS. S8 is docs only, so the commit hook did not ask for a review; the reviews were run by hand before the commit.
  New files: src/hooks/pre-pr-branch-review.js (the gate), src/hooks/branch-review-cli.js (plan, check-report, enable, disable, status), src/hooks/lib/branch-review.js, branch-repos-config.js, branch-report.js, branch-repos-write.js, skills/branch-review/ (SKILL.md, reviewer-prompt.md), commands/branch-review.md, .claude/branch-review-repos.json.example, and a test beside each. Extended: review-markers.js, review-config.js, review-config-cli.js, steps.js, hooks/hooks.json, README.md, CLAUDE.md, instructions/feature-workflow-snippet.md. pre-pr-verify.js, pre-commit-review.js and test-pre-pr-verify.js are unchanged against main.
  DONE CHECKS (plan section 7): full suite `bash tools/run-tests.sh` 56 files, 0 failed; `claude plugin validate .` rc 0 (warnings only); plugin version 1.0.99, ten above main's 1.0.89; `git log main..HEAD` shows exactly the ten step commits in order; the protected-files diff is empty; outside-in acceptance, 26 rows: 24 PASS in the first run, rows 7, 11 and 19 PASS in a second run that built fixtures from existing commits (the commit gate blocked new commits in scratch repos). `node tools/plugin-version.js check` exits 1 on a clean index by design (it compares the staged version to HEAD's); the plan's item 3 wording is a slip, not a defect.
  OPEN RISK RESOLVED: the printed marker recipe contains git -C inside $(...). It ran as one plain Bash command under the harness, was not blocked, and the hook then approved (rows 8 and 19).
  NOT DONE: no push, no PR (owner's rule). The close-out items below are not built.

STEP S1: PASS
  commit:  d073a88
  gate:    test-branch-review 28/0; test-review-markers 39/0; test-pre-commit-review 535/0; test-plugin-layout, test-suite-isolation and `claude plugin validate .` rc 0; no spawnSync/execFileSync in branch-review.js (report S1-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute
  reports: run/reports/S1-implementer-1.md
  stage:   step files, plugin.json (1.0.90), plan, tracker, feature record features/branch-review-pre-pr-1.md, report
  files:   touched as declared (review-markers.js, test-review-markers.js, branch-review.js, test-branch-review.js)
  disagreements: none. Plan lists markerPaths as an import of branch-review.js; the module has no use for it, so it is not imported.
  decisions: marker layout PASS/head/hash/tag; blank line 3 gives missing; unparseable numstat gives error; resolveBase trims config and rejects empty; a root file is its own group.
  budget:  about 14 calls against about 30
  next for S2: STATE values are lowercase strings; checkFresh takes markerFile (markerPaths(cwd).branch); RECIPE_TAG is the literal code-reviewer-deep:round<n>, callers substitute <n>.

STEP S2: PASS
  commit:  18481d8
  gate:    test-branch-repos-config 23/0; test-plugin-layout rc 0; test-suite-isolation 52/0 rc 0 (first run failed for missing isolateGitEnv() in the new test, fixed); `claude plugin validate .` rc 0; example JSON parses (report S2-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute; 0 critical, 0 important, 2 advisory (entryFor can return {key, entry:null}, callers check modeOf; readReposConfig null/primitive handling matches original). Accepted, none acted on.
  reports: run/reports/S2-implementer-1.md
  stage:   step files, plugin.json (1.0.91), tracker, report
  files:   touched as declared (branch-repos-config.js, test-branch-repos-config.js, branch-review-repos.json.example)
  disagreements: none. Test needed isolateGitEnv() though the step did not say so.
  decisions: private helpers isObject and listed; entryFor normalizes dir as well, ties on key length go to the first key; baseOf on a non-object entry returns {ok:true, base:null}; non-object repos gives null, never a throw.
  budget:  about 9 calls against about 15
  next for S3: readReposConfig takes the path as an argument (callers pass configPath()); entryFor expects realNormalized(cwd); ownEntry takes the git toplevel; the example entry has no base key.

STEP S3: PASS
  commit:  651c9b1
  gate:    test-branch-report 26/0; test-plugin-layout, test-suite-isolation and `claude plugin validate .` rc 0 (report S3-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute; 0 critical, 0 important, 1 advisory (a URL with a port such as http://x.com:8080 counts as file:line evidence; gap, not acted on)
  reports: run/reports/S3-implementer-1.md
  stage:   step files, plugin.json (1.0.92), tracker, report
  files:   touched as declared (branch-report.js, test-branch-report.js)
  disagreements: none. One of the implementer's own test rows was wrong (two 4-character items correctly pass); row changed.
  decisions: repeated Q keeps the first body and marks the section bad; a finding heading ends a section; file:line evidence wins over a None found line in the same section; a bad finding heading adds one problem per line and forces FAIL.
  budget:  about 8 calls against about 15
  next for S4: parseReport is the only export; problem text names Q<n>, trailer, BRANCH_GATE: FAIL, F<n> malformed heading and CONFIRMED CRITICAL; callers use verdict, not the trailer.

STEP S4: PASS
  commit:  007cae2
  gate:    test-review-config 120/0; test-steps 62/0; test-plugin-layout, test-suite-isolation and `claude plugin validate .` rc 0; CLI with a missing user file prints maxChangedLines 25000, rc 0 (report S4-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute; 0 critical, 0 important, 2 advisory (no table row for a string or float maxChangedLines; CLI test does not cover --repo with a missing value). Accepted, none acted on.
  reports: run/reports/S4-implementer-1.md
  stage:   step files, plugin.json (1.0.93), tracker, report
  files:   touched as declared (review-config.js, review-config-cli.js, test-review-config.js, sdlc-review.json.example)
  disagreements: plan says "through resolveSection" with no signature; real one is positional resolveSection(repoRoot, section, spec), called as resolvePlanReview does.
  decisions: CLI joins the cwd-not-in-git warning with the section warnings, as plan-review does; one extra row proves top-level maxRounds does not leak into branchReview.
  budget:  about 7 calls against about 20
  next for S5: resolveBranchReview is exported from review-config.js and returns { model, maxRounds, maxChangedLines, warnings }; the CLI prints the same shape; resolveReview and top-level maxRounds untouched.

STEP S5: PASS
  commit:  07ebbfc
  gate:    test-pre-pr-branch-review 51/0; test-pre-pr-verify 63/0; test-steps 62/0; test-plugin-layout 167/0; test-suite-isolation 54/0; test-session-start-instructions 544/0; `claude plugin validate .` rc 0; steps-cli list shows pre-pr-branch-review; pre-pr-verify.js diff empty (report S5-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute; 0 critical, 0 important, 3 advisory (crash message has an sdlc-claude-skills path hint, existing style; unlocatable-marker-path branch not checked for a test; plan non-goals remain gaps). Reviewer ran the printed recipe and the hook then approved. Accepted, none acted on.
  reports: run/reports/S5-implementer-1.md
  stage:   step files, plugin.json (1.0.94), tracker, report
  files:   touched as declared (pre-pr-branch-review.js, test-pre-pr-branch-review.js, hooks.json, steps.js, test-steps.js, test-plugin-layout.js)
  disagreements: none. RECIPE_TAG is passed unchanged and the text tells the reader to replace round<n> (step wording), not substituted by the caller (S1 NEXT).
  decisions: unlocatable marker path reports error in the repo's mode; config errors, invalid mode and invalid base are labelled error, mode unknown, deny; empty state has fixed text and no recipe; recipe sits on its own line starting with printf; test-steps areas count 22 to 23.
  budget:  about 17 calls against about 40
  next for S6: the hook uses markerPaths(toplevel).branch; recipe text is "Fix: run <cmd>. ...\n<printf line>"; the header comment of pre-pr-branch-review.js can be quoted by later docs. Hook tests: 5 blocks, 19 rows, 51 assertions.

STEP S6: PASS
  commit:  e330e6a
  gate:    test-branch-review-cli 43/0; test-plugin-layout, test-suite-isolation and `claude plugin validate .` rc 0; `plan` in this repo prints valid JSON (changedLines 2561 against origin/main, cap 25000) (report S6-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute; 0 critical, 0 important, 2 advisory (parseArgs ignores an unknown flag, harmless; reviewer found no staged test at exactly the cap although the implementer reported one, reviewer's hand run of the boundary held). Accepted, none acted on.
  reports: run/reports/S6-implementer-1.md
  stage:   step files, plugin.json (1.0.95), tracker, report
  files:   touched as declared (branch-review-cli.js, test-branch-review-cli.js, test-plugin-layout.js)
  disagreements: none.
  decisions: a broken repos config adds its error as a warning and falls back to no base; plan fails ok:false if git rev-parse HEAD or git status cannot be read; failure order no repo, branch unreadable, detached, invalid config base, no base, unreadable diff, empty range; check-report takes exactly one positional.
  budget:  about 13 calls against about 30
  next for S6b: plan output on failure has only ok and error, callers check ok; overCap is changedLines > cap; a root file is its own group named by the file; dirty is true for untracked files too.

STEP S6b: PASS
  commit:  ebc8847
  gate:    test-branch-repos-write 83/0; test-branch-repos-config 23/0; test-plugin-layout, test-suite-isolation and `claude plugin validate .` rc 0; three greps (no spawnSync/execFileSync/os.homedir in the lib, no sdlc-review.json/settings.json in the lib, no os.homedir in the test) and the untouched-files git diff check rc 0 (report S6b-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute; 0 critical, 0 important, 3 advisory. Reviewer forced a rename failure and a partial write by monkeypatching fs: no .tmp left, config unchanged. Missing test, not a bug.
  reports: run/reports/S6b-implementer-1.md
  stage:   step files, plugin.json (1.0.96), tracker, report
  files:   touched as declared (branch-repos-write.js 137 lines, test-branch-repos-write.js)
  disagreements: none. Lib is 137 lines against about 120 (Args/Returns comments).
  decisions: temp name <config>.<pid>.tmp opened wx, mode copied, chmod after write; invalid existing mode with mode omitted becomes advisory; disableRepo refuses a matched non-object entry and writes nothing until its loop ends; ok:false results carry only ok and error; unchanged only when the old entry deep-equals the new one; disableRepo key is the first removed key or null.
  budget:  about 7 calls against about 30
  next for S6c: call enableRepo({configPath,toplevel,mode}) and disableRepo({configPath,toplevel}) and check ok first; callers pass the git toplevel; written JSON is re-indented to 2 spaces; ok:false means the file was not changed.

STEP S6c: PASS
  commit:  0fcdfc6
  gate:    test-branch-review-cli 70/0; test-branch-repos-write 83/0; test-plugin-layout, test-suite-isolation and `claude plugin validate .` rc 0; no writeFileSync/renameSync in the CLI; untouched-files git diff check rc 0; sandboxed cycle /tmp/s6c-cycle.sh ended CYCLE OK (report S6c-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute; 0 critical, 0 important, 2 advisory (dispatch table built per call; status base-resolution fallbacks are warnings with null base, exit 0). Reviewer ran every exit code, compared plan and check-report output byte for byte against the previous commit, all identical. Accepted, none acted on.
  reports: run/reports/S6c-implementer-1.md
  stage:   step files, plugin.json (1.0.97), tracker, report
  files:   touched as declared (branch-review-cli.js, test-branch-review-cli.js)
  disagreements: none. The usage rows expecting exit 2 passed red because unknown subcommands already exited 2.
  decisions: plan still lets a repeated --repo pass (last wins), only the new subcommands reject repeated flags; disable --mode x, a positional and a repeated --repo exit 2; status on an unlisted repo still resolves a base from origin/HEAD; status on a detached HEAD warns and exits 0; disable removal message is "removed <key>"; step-off warning text names /sdlc:steps on branch-review; tests switch the step off through SDLC_REVIEW_CONFIG_USER.
  budget:  about 14 calls against about 30
  next for S7: route on/off/status to enable/disable/status; status has no ok field; enable and disable print { ok:false, error } and exit 1 on refusal; writing test text with a commit-shaped string through bash trips the classifier, use the file tool.

STEP S7: PASS
  commit:  e279da8
  gate:    test-branch-review-skill 28/0; test-plugin-layout 172/0; test-suite-isolation 57/0; `claude plugin validate .` rc 0; grep -c BRANCH_GATE on the prompt prints 2 (report S7-implementer-1.md)
  reviews: code-reviewer, round 1, PASS, about 1 minute; 0 critical, 0 important, 5 advisory (see close-out). Reviewer followed the prompt literally to build reports: clean PASS exit 0; CONFIRMED CRITICAL with a FAIL trailer exit 1; CONFIRMED CRITICAL with a PASS trailer exit 1 (parser overrides the trailer); bare None sections exit 1. Every field the skill reads is in the real plan output.
  reports: run/reports/S7-implementer-1.md
  stage:   step files, plugin.json (1.0.98), tracker, report
  files:   touched as declared (skills/branch-review/SKILL.md, reviewer-prompt.md, commands/branch-review.md, src/test-branch-review-skill.js, src/test-plugin-layout.js)
  disagreements: none. The skill test calls isolateGitEnv() though it spawns no git (the isolation guard requires it).
  decisions: four test blocks; non-over-cap pass scope is "all files"; SKILL.md fills <repo>, <base>, <head> from plan fields toplevel, base, head and tests overCap; the prompt mentions TDD_GATE inline only, never at a line start.
  budget:  about 14 calls against about 35
  next for S8: README and CLAUDE.md do not list the skill and command yet; BARE_INVOCATION now includes branch-review so a bare /branch-review in docs fails the layout test, write /sdlc:branch-review.

STEP S8: PASS (with one fix round)
  commit:  61f671c
  gate:    test-session-start-instructions 544/0; test-plugin-layout, test-suite-isolation and `claude plugin validate .` rc 0; every grep and test -e from the plan gate ok; snippet line 108 characters (report S8-implementer-1.md)
  reviews: code-reviewer round 1 FAIL (1 critical, 0 important, 2 advisory): CLAUDE.md row 59 had an unescaped pipe in on|off|status, 4 cells against 2. Fix agent (S8-fix-1.md) moved the literal into a sentence after the table; the plan's grep still matches. code-reviewer-deep round 2 PASS, 0 critical, 0 important, 3 advisory.
  reports: run/reports/S8-implementer-1.md, run/reports/S8-fix-1.md
  stage:   README.md, CLAUDE.md, instructions/feature-workflow-snippet.md, plugin.json (1.0.99), tracker, reports
  files:   touched as declared. The plan's CLAUDE.md config-key row names branchReview in sdlc-review.json; the row points at review-config.js and .claude/sdlc-review.json.example (both exist). The CLI path is src/hooks/branch-review-cli.js.
  disagreements: the plan's gate needs the literal branch-review on|off|status in CLAUDE.md, which broke a table cell when placed in the table. Resolved by moving it into prose.
  decisions: steps-table area is branch-review, guard no; the README names the marker path .git/.claude-last-branch-review; the README fail-closed list is the config-error cases (hook steps 3 and 5); the README does not list the detached state (accepted).
  budget:  about 10 calls against about 25, plus a 3-call fix round

CLOSE-OUT ITEMS (batch into one close-out step, plan 7 item): 
  - S7: SKILL.md argument-hint advertises [on | off | status] but only the command handles them; drop the hint or say so.
  - S7: SKILL.md step 5 says "rerun once ... as round 2" while step 5 also relies on maxRounds; word it as up to maxRounds rounds.
  - S7: root-file group scope reads "files under foo.js only"; the skill does not say to pass the group's files list to the reviewer.
  - S7: src/test-branch-review-skill.js checks the Q headings but not the exact titles.
  - RESOLVED (S7/S5): the marker recipe uses `git -C '<top>'` inside $(...). The acceptance run (rows 8 and 19) ran it as one plain Bash command; it was not blocked and the hook then approved.
  - S8: README.md around line 205: say the review is one pass under the cap, and per-directory passes plus a cross-file pass over it.
  - S8: README.md around line 522: "If neither resolves, the state is no-base" reads as a fallback from a configured base to origin/HEAD. resolveBase uses the configured ref alone. Say "if the base does not resolve to a commit".
  - S8: README.md hook row lists missing, stale, empty or unreadable; the hook also reports no-base and detached (optional).
  - S5 (found in acceptance): the deny text for a config error ends "Fix the git problem named above, then retry." That is wrong for a JSON parse error in the config file. Needs a code change in src/hooks/pre-pr-branch-review.js and a test row.
  - Acceptance note: with no commits in the repo, enable and plan fail with "could not read the branch: fatal: ambiguous argument HEAD". Acceptable; status then reports listed:false.
  - S6b: add a test row that stubs fs.renameSync to throw and asserts ok:false, config bytes equal, no *.tmp left (reviewer advisory, missing test).
  - S3: a URL with a port counts as file:line evidence; optional tighter FILE_LINE plus a row.
  - S4: table rows for a string and a float maxChangedLines.
  - S6: a staged test row at exactly the cap (implementer reported one; reviewer found none).
