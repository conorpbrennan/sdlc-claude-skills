---
name: code-review-implementer
description: Applies the numbered ACTIONABLE ITEMS from the most recent code review report in this conversation, by severity or by item number, through one Sonnet sub-agent that makes the minimum change per item and runs the tests. Use after a pre-commit review ends in TDD_GATE FAIL, before the rerun.
user_invocable: true
arg_spec: "[all|critical|important|advisory|<item-numbers>]"
---

# Code review implementer

Turns a review report's `ACTIONABLE ITEMS` into fixes. The report is the
one produced by `/sdlc:code-review-pre-commit` (its items are numbered from 1
for exactly this purpose); the fixes are made by one fresh sub-agent so
the change stays minimal and isolated from the conversation that wrote the
code.

## Usage

```
/sdlc:code-review-implementer              # every actionable item
/sdlc:code-review-implementer critical     # CRITICAL only
/sdlc:code-review-implementer important    # CRITICAL and IMPORTANT
/sdlc:code-review-implementer advisory     # everything, ADVISORY included
/sdlc:code-review-implementer 1 3 5        # items 1, 3 and 5 by number
```

<protocol>

<prerequisite>
A review report must be in this conversation: `## FINDINGS` and
`## ACTIONABLE ITEMS` with `file:line` references, ending in a
`TDD_GATE:` trailer. If there is none, say so and point at
`/sdlc:code-review-pre-commit --fresh`. Stop.
</prerequisite>

<scope>
Select items by argument: `all` (default) takes every item; `critical`,
`important`, `advisory` take items tagged at that severity or higher;
numbers take those items. For each selected item collect the `file:line`,
the issue, the risk, and the suggestion as the report gives them. Do not
read the files yourself: the sub-agent reads what it needs.
</scope>

<delegation>
Dispatch exactly ONE sub-agent: `subagent_type: "general-purpose"`,
`model: "sonnet"`. Do not inline file contents into the prompt. The prompt:

```
You are implementing code review findings in <repo path>. Make the
minimum change that resolves each item correctly, in the order given.

ITEMS:
<n>. [<severity>] <file>:<line> — <issue>. Risk: <risk>. Suggestion: <suggestion>.
...

RULES:
1. Read only the function or block around each file:line, plus what the
   fix directly touches. Do not read whole files by default.
2. One logical change per item. Do not refactor, rename, or reformat
   around the fix. Preserve the surrounding style.
3. A fix that needs a design decision the report did not make: skip it
   and say why, rather than guess.
4. If the item names a missing test, write it, and make it fail without
   the fix and pass with it. Run the relevant suite (`node
   src/hooks/test-*.js`, `bash src/hooks/test-*.sh`, `pytest -q`, or
   whatever the repository uses) after the last change.
5. Do not stage or commit. Do not touch the index. Do not run the
   repository's hooks or install scripts.
6. Report per item: fixed / skipped (why) / partial (what remains), the
   files changed, and the test command and result.
```
</delegation>

<after>
Relay the sub-agent's per-item outcome and the test result. Then rerun
the review per the rounds policy in `sdlc:code-review-pre-commit`: on
`sdlc:code-reviewer-deep` if the FAIL carried a CRITICAL or a correctness
finding in a parser, gate or shell hunk, otherwise on `sdlc:code-reviewer`.
Do not stage or commit; that is the user's call.
</after>

</protocol>
