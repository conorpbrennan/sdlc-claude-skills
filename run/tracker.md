RUN: docs/plans/branch-review-pre-pr.md, revision 1 (T1, 10 steps: S1 S2 S3 S4 S5 S6 S6b S6c S7 S8). Branch: branch-review-pre-pr-1. Started: 2026-11-12.
BUDGET: plan total 65,655 bytes; per-step budgets in each step block (about 30 tool calls each). Spent: S1 about 14 calls against 30.
IN FLIGHT: S7, implementer round 1 dispatched.
TREE: staged nothing; unstaged: features/statusline-windows-datadir.md (unrelated, the owner's, never stage it). Worktrees open: none.
OWNER AUTHORISATION (2026-11-12, this session): stage, commit after each step's review PASS, dispatch fix agents, run the whole plan. Never push, never open a PR. Stop after two FAILs on one step.
SESSION NOTE: the run lives in /home/coder/dev/sdlc-claude-skills on branch branch-review-pre-pr-1 (cut from main 90caf92). The sibling worktree /home/coder/dev/sdlc-branch-review-pre-pr and its branch branch-review-pre-pr are abandoned and left untouched. The first attempt to commit S1 there was blocked by PRE_COMMIT_GATE (different repo from the one the hook inspects). Reviewers run on the staged diff in this repo, not in a throwaway worktree (the owner's rule allows a worktree only on request).
DISPOSITIONS: plan rounds 1 and 2 are in plan section 8. Run: S1 round 1 code-reviewer PASS, 0 critical, 0 important, 3 advisory (no pipefail in the recipe pipeline, fails closed; shellQuote duplicated by plan choice; optional base==HEAD row). All accepted, none acted on.
DECISIONS-OPEN: S1 implementer wrote the module before its red run, then moved it aside to show the failure. Red run is real; order was not tests-first. Accepted.
AS BUILT: not written yet.

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

CLOSE-OUT ITEMS (batch into one close-out step, plan 7 item): 
  - S6b: add a test row that stubs fs.renameSync to throw and asserts ok:false, config bytes equal, no *.tmp left (reviewer advisory, missing test).
  - S3: a URL with a port counts as file:line evidence; optional tighter FILE_LINE plus a row.
  - S4: table rows for a string and a float maxChangedLines.
  - S6: a staged test row at exactly the cap (implementer reported one; reviewer found none).
