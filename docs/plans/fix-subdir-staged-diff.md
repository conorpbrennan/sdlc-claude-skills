# Pre-commit review reads the real staged diff from a subdirectory, and fails closed on an empty one. NOT: the retro review of the commits that already slipped through (they live in another repository), the `legacy_refresh` retry bug from the same session, or repairing the suite's pre-existing red baseline.

Reduced form (plan-spec §22): one step, one file pair, one sitting, no frozen target.

## Why

Reported from a session committing from `ConstraintsSystem/`, a subdirectory of its repository. The timing log showed 33 staged code files, a 0-byte diff read with `ok: true`, 0 semantic lines, and approval via the `trivial-diff` fast path. Four earlier commits from that directory were very likely waved through the same way.

Cause, reproduced here: `readStagedCodeFiles` in `src/hooks/pre-commit-review.js` lists paths with `git diff --cached --name-only`, which prints them relative to the repository root whatever the cwd. The classifier step then calls `readStagedDiff(codeFiles)` with no `cwd`, so `git diff --cached -U0 -- <paths>` resolves each pathspec against the hook's cwd. From a subdirectory every pathspec points at `<sub>/<sub>/...`, matches nothing, and git returns an empty diff with exit 0. `readStagedDiff` already fails closed on a thrown error, but not on a silent empty result.

Reproduction (scratch repo, file a.py staged in directory sub, run from sub): `readStagedDiff` over that one path returned `{"text":"","bytes":0,"error":null}`. The same call with `{cwd: <toplevel>}` returned the full diff.

## 1. Owner decisions

Answered 2026-10-03 (owner: "go with your recommendations"): Q1 = 1 round. Q2 = stop before commit: the orchestrator stages, attempts the commit, runs the review and writes the PASS marker, then the owner commits. Q3 = follow-up plan. Q4 = yes, `./install.sh --dry-run`, then `./install.sh`, after the owner's commit.


- Q1, review-loop cap for this plan: 1 round (recommended), or 2.
- Q2, standing authorisation for the orchestrator to create the branch, stage, attempt the commit and write the PASS marker without asking at each step. Without it, the run stops at the commit. Note that the user CLAUDE.md says "Stop after the marker is written ... wait for the user" — this authorisation would override that for this plan only.
- Q3, the suite's red baseline (26 failures, see Constraints). Leave it for a follow-up plan (recommended, keeps this diff to the bug), or add a step 0 that points the integration tests at an exempting `TDD_MANDATE_CONFIG`. Step 0 would share `src/hooks/test-pre-commit-review.js` with step 1, so the plan would move to the full form.
- Q4, deploy: run `./install.sh` once step 1 has committed, so the fix reaches `~/.claude/hooks/` (recommended, the bug is live in the installed copy), or leave deployment to the owner.

No step carries a named-reader condition.

## 2. Constraints, every step

- Branch: `fix-subdir-staged-diff`, cut from `main`. The feature hook requires `features/fix-subdir-staged-diff.md` with a real requirement before the first source commit. Seed it with `/feature-new fix-subdir-staged-diff "Pre-commit review must read the real staged diff when the commit runs from a subdirectory, and must not fast-path a zero-byte diff over staged code files."`.
- Hook source is `src/hooks/`. Never edit `~/.claude/hooks/`, since `install.sh` overwrites it.
- Every git read in the hooks fails closed (`src/hooks/lib/git-read.js`). Paths go to git as argv entries, never through a shell string.
- TDD mandate: write the test edits before the implementation edits, and stage both in one commit.
- Commit protocol: `git add <files>` in one Bash command, then `git commit -m "<msg>"` alone in the next. Never combine them, never use `-a`, `cd`, or a wrapper. Expect the first commit attempt to block. The block message is the only source of the marker recipe.
- Red baseline, recorded before any change: `node src/hooks/test-pre-commit-review.js` on `main` at `5854535` gives 177 passed, 26 failed. All 26 are the TDD gate's `no_tests` block, which pre-empts the gates those integration tests target, because they stage a lone dummy `.py` with no test file and the mandate is in force for this repository. The step's GATE is stated against this baseline: the same 26 failures, unchanged by name, and no others.
- Always-permitted paths: this plan file (its status line), and `features/fix-subdir-staged-diff.md` (written by the feature hook).

## 7. Done, the whole change

1. `node src/hooks/test-pre-commit-review.js` exits with only the 26 baseline failures, and every assertion step 1 adds passes.
2. From a subdirectory, a staged semantic change is never approved by a classifier fast path (asserted by step 1's integration test).
3. One commit on `fix-subdir-staged-diff`, reviewed with `TDD_GATE: PASS` on the last line.
4. If Q4 is answered yes, `./install.sh` has run, and `diff src/hooks/pre-commit-review.js ~/.claude/hooks/pre-commit-review.js` prints nothing.

## Step

**1. The classifier reads the staged diff from the repository root, and an empty read over staged code files skips the fast path**

EXTEND `src/hooks/pre-commit-review.js`, `src/hooks/test-pre-commit-review.js`.
IMPORTS: none. MUST NOT TOUCH: none (single step).

TESTS FIRST (red before the implementation edit, in `src/hooks/test-pre-commit-review.js`, in the Gate 3b area after the `getStagedDiff` unit blocks. `dummyRel` is declared there, and placing (a) earlier aborts the suite with a TDZ error):

- (a) Unit: from the repository root, `mod.readStagedDiff([dummyRel], { cwd: path.join(REPO_ROOT, 'src') })`, called with a dummy staged, returns `text === null` and an `error` that names the empty read. Red today: it returns `''` with `error: null`.
- (b) Integration: stage `def foo():\n    return 1\n` as the dummy, then `runHook('git commit -m x', {}, { cwd: path.join(REPO_ROOT, 'src') })`. Assert that the decision is not `approve`, that no PASS marker is written, and that the fast-pass log gained no line. Red today: approved as `trivial-diff`.
- (c) Integration guard, which passes before and after the fix: stage `# comment only\n` and run the same hook call from `src/`. Assert `approve`, with the marker tagged `trivial-diff`. This proves the fix still lets a genuinely trivial diff through from a subdirectory.
- (d) Integration, fail closed independent of cwd: from the repository root, with a semantic dummy staged, run the hook with a PATH shim that makes `git ... -U0 ...` print nothing and exit 0. Also pass `TDD_MANDATE_CONFIG`, pointing at a scratch JSON `{"exempt_repos":[REPO_ROOT]}` that is removed afterwards (the same pattern as the existing `TDD_CFG2` test), so the TDD `no_tests` block cannot pre-empt the review-required message. Assert that the decision is not `approve`, that no PASS marker is written, and that `systemMessage` contains `could not be read`. Add the shim as a sibling helper to `writeGitShim` (for example `writeGitEmptyShim(arg)`), and clean it up in the existing `finally` block via `cleanGitShim`. Red today: approved as `trivial-diff`.

WHAT TO BUILD:

- At the classifier step in `main`, call `readStagedDiff(codeFiles, { cwd: toplevel })`. `toplevel` is already in scope (`const toplevel = repo.toplevel`).
- In `readStagedDiff`, after a successful read: when `codeFiles` is non-empty and the read is 0 bytes, return `{ text: null, bytes: 0, error: 'empty diff for ' + codeFiles.length + ' staged code file(s)' }`. A path listed by `--name-only` always produces diff output (content, mode or rename lines), so an empty read means the pathspecs matched nothing. The existing `diffRead.text === null` branch then skips the fast path and writes the "could not be read" note, so no new branch is added in `main`. Extend the function's header comment by one sentence stating this.
- `getStagedDiff` inherits the change. Keep its existing callers and assertions as they are.
- Do not change `readStagedCodeFiles`, the marker hash read (`gitRead.stagedDiffHash`), or the `staged_diff_read` timing event's shape. That event already logs `ok: false` and the error when text is null.

GATE (each settled by running it):

1. `node src/hooks/test-pre-commit-review.js`: tests (a), (b) and (d) appear as PASS, (c) appears as PASS, and the FAIL lines match the 26 baseline names exactly. Compare `grep FAIL` output before and after.
2. Red first: the implementer's report shows (a), (b) and (d) failing against the unmodified `src/hooks/pre-commit-review.js`.
3. `git diff --cached --stat` lists exactly the two files in the file set, plus the plan's status line and the feature file.
4. `node -e "require('./src/hooks/pre-commit-review.js')"` exits 0.

REVIEW:

1. Does every other git read in `src/hooks/pre-commit-review.js` that passes repo-relative pathspecs either run with `cwd: toplevel` or use `:(top)` pathspecs? Name any that do not.
2. Can `readStagedDiff` now return `text: null` for a commit that should legitimately fast-path, such as a rename-only or mode-only change, or a file staged with intent-to-add? Answer by running each case in a scratch repo.
3. Does test (c) discriminate the `cwd` half? Revert only the `cwd` argument and confirm (c) goes red. (b) stays green there, because the empty-read check catches the same case.
4. Does test (d) discriminate? Revert only the empty-read check and confirm (d) goes red.

FAIL if any of:

- A staged semantic change can still be approved by the `trivial-diff` or `presentational` fast path when the hook runs from a subdirectory.
- An empty read over a non-empty `codeFiles` list can still reach `classifyDiff`.
- A file outside the declared set is changed.
- The baseline FAIL set changes, either by gaining a name or by losing one without explanation.
- Any of tests (a) to (d) is missing, or (a), (b) or (d) was not shown red first.

ROLLBACK: revert the commit.

-- status: implemented, staged, awaiting review. Implementer report: GATE 1 = 187 passed / 26 failed, with the FAIL set identical to baseline; red first = 179/34, exactly 8 new failures from (a), (b) and (d); GATE 4 ok. Decisions: (d)'s scratch config is `tmp/pre-commit-hook-test-tdd-mandate3.json`, cleaned up in a local `try/finally`; (b) and (d) assert `!== 'approve'`. The orchestrator re-ran the suite and got the same result. Disagreements: none.

## Decisions and disagreements

- 2026-10-03: owner decisions Q1-Q4 answered with the recommended options (section 1).
- 2026-10-03, review round 1 (Fable, held against the source, with the step applied in a scratch clone in five variants). Verdict NOT YET, 2 findings, both folded in. F1: (d)'s `could not be read` assertion would fail because the TDD `no_tests` block pre-empts it (measured: 27 FAILs), so (d) now exempts the repo via `TDD_MANDATE_CONFIG`. F2: reverting `cwd` turns (c) red, not (b), so REVIEW 3 was corrected. A placement note for (a) (TDZ on `dummyRel`) was also folded in. Noted and not actioned: `--no-ext-diff` hardening (with `diff.external` set, the fix fails closed already); C-quoted filenames being dropped by `isSourcePath` (a pre-existing escape from review, worth its own follow-up); `commands/commit-prep.md` prefixing `--name-only` output with `$(pwd)` (the same bug class in a shell command, out of scope). The cap was 1 round, so the loop stops here, and these fold-ins are unreviewed text (§2b).
