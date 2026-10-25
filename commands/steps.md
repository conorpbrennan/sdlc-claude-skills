---
description: List every sdlc workflow step, whether it is on or off, and where that state comes from
argument-hint: [no argument lists all steps]
---

<objective>
Show which sdlc workflow steps are on or off, and why. The tool reads the `steps` block of the user and repo `sdlc-review.json` files and the older opt-out files.
</objective>

<arguments>
`$ARGUMENTS` is empty or not.
</arguments>

<steps>
1. If `$ARGUMENTS` is empty, run `node ${CLAUDE_PLUGIN_ROOT}/src/hooks/steps-cli.js list` and relay its output verbatim. Do not summarise, reorder or reword it.
2. If `$ARGUMENTS` is anything else, say the toggle arrives in a later version and stop. Do not run anything.
</steps>

<constraints>
- Read-only. Do NOT write to `~/.claude` or any git state.
- If the tool exits non-zero, show the error and stop.
</constraints>
