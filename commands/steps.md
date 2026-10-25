---
description: List every sdlc workflow step and its state, or switch one step or area on or off
argument-hint: [on|off <area|step> [repo]]
---

<objective>
Show which sdlc workflow steps are on or off, and why, or switch one. The tool reads the `steps` block of the user and repo `sdlc-review.json` files and the older opt-out files.
</objective>

<arguments>
`$ARGUMENTS` is empty, or `on <id>` or `off <id>` with an optional trailing `repo`. `<id>` is an area id or a step id.
</arguments>

<steps>
1. If `$ARGUMENTS` is empty, run `node ${CLAUDE_PLUGIN_ROOT}/src/hooks/steps-cli.js list` and relay its output verbatim. Do not summarise, reorder or reword it.
2. If `$ARGUMENTS` is `on <id>` or `off <id>`, run `node ${CLAUDE_PLUGIN_ROOT}/src/hooks/steps-cli.js set <id> <on|off>` and relay its output verbatim. With a trailing `repo`, add `--file repo`. Guard steps (tdd, review, commit-conventions) switch in the user file only; do not pass `repo` for them.
3. If the tool exits non-zero, relay its error and say nothing was written.
4. Any other argument: show the usage `/sdlc:steps [on|off <area|step> [repo]]` and stop. Do not run anything.
</steps>

<constraints>
- `list` is read-only. `on` and `off` write one `sdlc-review.json` (user file, or the repo file with `repo`) and nothing else. Do NOT touch git state.
- If the tool exits non-zero, show the error and stop.
</constraints>
