---
description: Review the whole branch against its base before the PR, or switch the branch-review gate on or off for this repo
---

# Branch Review

Run the cross-file branch review, or switch the gate for this repo. Run the
review after the last commit and before `gh pr create`.

## Arguments: $ARGUMENTS

`[on [--mode advisory|enforce] | off | status]`

## Instructions

1. Parse the first argument.
2. `on`, `off` or `status`: run
   `node ${CLAUDE_PLUGIN_ROOT}/src/hooks/branch-review-cli.js <subcommand>`
   with `enable` for `on`, `disable` for `off` and `status` for `status`. Pass
   the rest of the arguments through (for example `--mode enforce`). Print the
   result line and STOP. Do not invoke the skill, run a review or write a
   marker. If `enable` or `disable` prints `ok: false`, relay the `error`.
   This command holds no write logic: the CLI owns it.
3. Any other first argument, or none: invoke the `sdlc:branch-review` skill
   and follow it. It plans, dispatches fresh reviewers, checks each report
   with the CLI, and records the marker on PASS. It does not commit, push or
   open the PR.
