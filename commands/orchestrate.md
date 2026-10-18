---
description: Switch orchestrator mode on or off, or show its state. While on, the main session dispatches sub-agents instead of editing source or investigating inline
---

# Orchestrator Mode

Orchestrator mode keeps the main session thin. It turns on by itself when
the session reads a handoff or tracker file or runs `plan-spec run`. While
it is on, the hook denies source edits in the main session and nudges after
several inline Bash commands. Briefs, reports, trackers, feature records,
plans, memory and scratch files stay writable.

## Arguments: $ARGUMENTS

`on`, `off` or `status`. Empty means `status`.

## Instructions

The switch itself is applied by the `UserPromptSubmit` hook the moment the
prompt is submitted. This command only reports. Do not edit any state file.

1. Run the status line for this session and show its output as is. The hook
   input carries the session id, but Bash does not see it, so use the id
   from the session context if you have one:
   `node "${CLAUDE_PLUGIN_ROOT}/src/hooks/orchestrator-mode.js" --status <session_id>`
2. If you have no session id, say the switch for `on` or `off` has been
   applied by the hook and stop. Do not guess the state.
3. For `off`, add that triggers will not turn the mode back on in this
   session until the owner runs `/sdlc:orchestrate on`.
