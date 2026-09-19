## Feature Tracking

Feature files (`features/<slug>.md`) are auto-created at session start on
any feature branch and auto-updated on commit. Branch names drive slug
derivation -- use `kebab-case-branch-names` for clean tracking.

**All feature work happens on a branch, and every feature commit carries its
feature file.** The `pre-commit-feature` hook enforces both — it is not
advisory. Never work around it by disabling tracking without asking.

- Committing **source files** on `main`/`master`/`develop`/`trunk` is
  BLOCKED. Create a branch first (`git checkout -b <slug>`); staged changes
  carry over untouched. Docs/config-only commits are never gated, and
  `release/*` and `worktree-*` branches are exempt.
- Committing source on a feature branch is BLOCKED until
  `features/<branch>.md` exists with a real requirement. On a block, ask the
  user for a one-sentence requirement, run
  `/feature-new <branch> "<their answer>"`, then retry.
- On a passing commit the hook merges the touched file list into the feature
  file and stages it, so the record ships **in the same commit** as the code.
- On a new feature branch with no stub, the `session-start-feature` hook
  creates `features/<branch>.md` and instructs Claude to ask you for a
  one-sentence requirement *before* starting any build work.
- Seed or update a feature explicitly: `/feature-new <slug> "<requirement>"`.
- Recall prior context: `/feature <slug>` or `/feature list`.
- The `post-commit-feature` hook then appends the sha-stamped history entry
  and stages it for the next commit — the sha cannot exist before the commit
  does, so that one line always lands with the following commit.
- Opt out per-repo: `touch .claude/feature-tracking.disabled`.
