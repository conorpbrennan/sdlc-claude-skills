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

1. Report the `Orchestrator mode:` line the hook added to this prompt's
   context, and nothing else. Do not run a command to look the state up and
   do not guess it.
2. For `off`, add that triggers will not turn the mode back on in this
   session until the owner runs `/sdlc:orchestrate on`.
