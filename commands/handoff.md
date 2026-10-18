---
description: Write a fixed-form handoff file so a fresh session resumes in two or three turns, and print the line to paste into it
---

# Handoff

Write the handoff for the work in this session as one file in a fixed form,
then print the line the owner pastes into the new session. A fixed form with
the exact next action lets the next session act at once instead of
re-deriving state from the git log, the tracker and the code.

## Arguments: $ARGUMENTS

`[<slug>]`. The slug defaults to the current branch name. Slashes in a
branch name become hyphens.

## Instructions

1. Find the repo root (`git rev-parse --show-toplevel`) and settle the slug.
2. Fill State from commands, not from memory:
   - `git rev-parse --abbrev-ref HEAD`
   - `git log -1 --format='%h %s'`
   - `git status --short`
   - `date +%Y-%m-%d-%H%M` (the timestamp for the filename)
3. Create `tmp/` at the repo root if it is missing. Run
   `git check-ignore tmp/`. If it is not ignored, say so in the message to
   the owner: the handoff could be staged by accident. Do not edit
   `.gitignore`.
4. Write `tmp/HANDOFF-<slug>-<timestamp from step 2>.md` with the Write tool, using
   the template below verbatim. The filename must contain `HANDOFF`: that is
   what turns orchestrator mode on when the next session reads the file. The
   main session may write it while the mode is on.
5. Measure the file: `wc -c <path>`. Over 8,000 characters, trim it with
   the Edit tool until it is under, then measure again. Cut copied detail
   first (see Rules).
6. Print the path and the one line to paste: `read <path>`. Add the
   not-ignored warning from step 3 if it applies.

## Template

Every section is required. Write `none` where there is nothing to say.

```markdown
# Handoff: <slug>, <date time>

Work picked up from this handoff runs in sub-agents. The main session reads this file, writes step briefs,
dispatches implementers (model: "sonnet"), runs the review, and commits. It does not edit source or investigate inline.
It trusts implementer reports and does not poll (see `/sdlc:orchestrate`).

## Next action
<the single next thing to do, concrete enough to do without reading anything else: the dispatch to make with the
brief's path, or the exact command to run>

## State
- Branch / HEAD: <branch> @ <short sha> "<subject>"
- Staged / uncommitted: <paths, or none>
- Plan / tracker: <paths, and the step id it stands at>
- Review markers or blocks pending: <or none>

## In flight
<dispatched agents not yet reported, what each was asked, where its report will land; or none>

## Decisions since the last handoff
<one line each, with why; or none>

## Already verified, do not re-check
<facts the next session should trust without re-running: test counts at HEAD, probes done; or none>

## Read only if needed
<at most three paths, each with the question it answers>
```

## Rules

- Keep the file under about 8,000 characters (step 5 measures it). A
  fresh session reads it whole and re-reads it on every turn, so size is
  cost. It carries pointers, current state and the next action, not copies.
  Detail lives in the plan, tracker, feature record and commit messages:
  link to it, do not copy it.
- Never paste client data, credentials or identifiers into it.
- Next action is one action. If two things are next, pick the first and put
  the second in Decisions or the tracker.

## Examples

```
/sdlc:handoff
/sdlc:handoff sonnet-steering
```
