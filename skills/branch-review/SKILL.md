---
name: branch-review
description: Review the whole branch against its base before the pull request, with a fresh reviewer that reads changed files whole and looks for defects that only show across files. Records the review marker that the gh pr create gate checks. Use before opening a PR on a repo where the branch-review gate is on.
argument-hint: "[on [--mode advisory|enforce] | off | status]"
---

# Branch review

Run one cross-file review of the branch before the PR. It is report-only and
it never commits, pushes or opens the PR.

`<plugin>` is the grandparent of this skill's base directory (the directory
that holds `skills/`). The reviewer prompt is `reviewer-prompt.md` beside this
file. The reviewer criteria file is `<plugin>/agents/code-reviewer.md`.

## Run order

1. Plan. Run `node <plugin>/src/hooks/branch-review-cli.js plan` and read its
   JSON. On `ok: false`, stop and relay the `error`. Show `warnings` to the
   user, and show it if `dirty` is true (the review reads HEAD, so
   uncommitted edits are not reviewed).
2. Dispatch. Fill `reviewer-prompt.md`: `<repo>` is the `toplevel`, `<base>`
   the `base`, `<head>` the `head`.
   - Not over the cap (`overCap` false): dispatch ONE `sdlc:code-reviewer-deep`
     sub-agent with `model` from the plan, the filled prompt, and the absolute
     path of `<plugin>/agents/code-reviewer.md`. `<pass scope>` is "all files".
   - Over the cap: one pass per entry of `groups`, with `<pass scope>` "files
     under <dir> only". Then one cross-file pass over all `files`, with
     `<pass scope>` "all files, interactions across directories only". Each
     pass is a fresh sub-agent. Run them one after another. A round is the
     whole set of passes.
3. Check. Write each reviewer's report with the file tool to a temp path. Run
   `node <plugin>/src/hooks/branch-review-cli.js check-report <file>`. The
   verdict is that command's exit code, not the report's own trailer. A report
   with no valid trailer is FAIL.
4. PASS on every pass: run the `recipe` from the plan verbatim, with `round<n>`
   replaced by the round number. Never compose the marker yourself. Then
   record the round:
   `node "<plugin>/src/hooks/timing-log.js" review.completed agent=code-reviewer-deep round=<n> scope=branch verdict=PASS`
   Then stop. Do not commit, push or open the PR.
5. FAIL: show the findings to the user. Fix only with the user's permission
   (or a standing authorisation), through a fresh fix agent, never the
   reviewer. Then rerun once on a fresh reviewer as round 2. This is the
   two-round stop: after `maxRounds` FAILs, stop and ask the owner to choose
   between fixing and opening the PR with the gap named.

## Threat model

The gate guards honest mistakes, not adversarial shell. A finding about a
shape Claude would not write is ADVISORY, named as a gap and not chased.
