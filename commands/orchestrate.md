---
description: Switch orchestrator mode on or off, or show its state. While on, the main session dispatches sub-agents instead of editing source or investigating inline
---

# Orchestrator Mode

Orchestrator mode keeps the main session thin. It turns on by itself when
the session reads a handoff or tracker file or runs `plan-spec run`. While
it is on, the hook denies code edits in the main session and nudges after
several inline Bash commands. Only code is denied. Docs, config and data
stay writable, as do briefs, reports, trackers, feature records, plans,
memory and scratch files.

## Arguments: $ARGUMENTS

`on`, `off` or `status`. Empty means `status`.

## Instructions

The switch itself is applied by the `UserPromptSubmit` hook the moment the
prompt is submitted. This command only reports. Do not edit any state file.

1. Report the `Orchestrator mode:` line the hook added to this prompt's
   context, and for `on` the Sonnet line under it, and nothing else. Do not run a command to look the state up and
   do not guess it.
2. If the hook's line says the mode is switched off in `sdlc-review.json` steps,
   report it and say `on` has no effect until that step is turned back on.
3. For `off`, add that triggers will not turn the mode back on in this
   session until the owner runs `/sdlc:orchestrate on`.

## Duties while the mode is on

- Run the orchestrator session on Sonnet (`/model sonnet`). Opus is for plan
  writing, plan source review and FAIL triage. The hook prints this line once
  when the mode turns on; nothing enforces it. On 19 Oct 2026 the weekly
  analysis put commit reviews at about 9% of spend, with Opus orchestrator
  turns a large share of the rest.
- The end-of-run `/sdlc:verify` runs the full test suite with coverage first,
  so expect it to be slow.
- Trust the implementer's report. It ends with the test command it ran, the
  pass/fail summary line and `git diff --stat`. Do not re-run the tests or
  shell-read the source to check them. Verification belongs to the reviewer
  sub-agent.
- Do not poll with sleep or until loops. A background agent notifies on
  completion. For external state, use the Monitor tool or a background
  command.
- If a read is unavoidable, use Grep or Read with a line range. Do not
  `cat` or `sed` whole files. A handoff, plan or tracker is read once, by
  range, not re-sliced every turn.
