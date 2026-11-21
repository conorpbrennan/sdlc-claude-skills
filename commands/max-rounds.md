---
description: Show or set the review round cap (maxRounds) in ~/.claude/sdlc-review.json - how many pre-commit review rounds run before the owner decides
---

# Review round cap

`maxRounds` in `~/.claude/sdlc-review.json` is how many pre-commit review
rounds run on one commit before the review stops and the owner chooses:
fix and rerun, or accept with the gap named. The default is 2. The hook
refuses a review marker for a round above the cap. A repo file
`<repo>/.claude/sdlc-review.json` that sets its own `maxRounds` wins in
that repo.

## Arguments: $ARGUMENTS

A whole number of 1 or more, or empty. Empty shows the current state.

## Instructions

`<plugin>` is `${CLAUDE_PLUGIN_ROOT}`.

1. Empty: run `node <plugin>/src/hooks/review-config-cli.js max-rounds show`.
   Print `maxRounds` and `source` (`repo config`, `user config` or
   `default`) from its JSON, and any warnings.
2. A number: run
   `node <plugin>/src/hooks/review-config-cli.js max-rounds set <n>`.
   Tell the owner the new value in one line. It applies from the next
   review. Relay any warning: a repo file that sets its own `maxRounds`
   keeps that value in that repo.
3. Anything else: say the argument must be a whole number of 1 or more,
   and stop.
4. If the command exits non-zero, relay its one-line error (an invalid
   number, a malformed or symlinked file) and say nothing was written.

Do not edit `sdlc-review.json` by hand.
