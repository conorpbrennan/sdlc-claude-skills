---
description: Set, show or clear the persistent main-session model (haiku, sonnet, opus or off). Stored in ~/.claude/sdlc-review.json and applied to settings.json at the next session start
---

# Main-session model

`mainModel` in `~/.claude/sdlc-review.json` is the model the main session
starts on. At session start the SessionStart hook copies it into `model` in
`~/.claude/settings.json` when the two differ. The owner's settings.json may
be reset on container start; `sdlc-review.json` is not, so this sticks.

## Arguments: $ARGUMENTS

`haiku`, `sonnet`, `opus`, `off` or empty. Empty shows the current state.

## Instructions

`<plugin>` is `${CLAUDE_PLUGIN_ROOT}`.

1. Empty: run `node <plugin>/src/hooks/review-config-cli.js main-model show`.
   Print `mainModel` from its JSON (null means unset) and its warnings. Then
   print the `model` key of `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json`
   (`grep '"model"'` is enough; say "not set" if absent). If the
   `ANTHROPIC_MODEL` environment variable is set (test with
   `[ -n "$ANTHROPIC_MODEL" ]`, never print its value), say it overrides
   both.
2. `haiku`, `sonnet` or `opus`: run
   `node <plugin>/src/hooks/review-config-cli.js main-model set <model>`.
3. `off`: run `... main-model off`. This removes `mainModel`; settings.json
   `model` is left as it is.
4. Any other argument: say the four valid values and stop.
5. After a set or off, tell the owner in two lines: the change applies from
   the next session, and `/model` changes only the current session.
   If the command exits non-zero, relay its one-line error (an invalid model,
   a malformed or symlinked file) and say nothing was written.

Do not edit `sdlc-review.json` or `settings.json` by hand.
