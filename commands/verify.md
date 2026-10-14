---
description: Verify the feature's acceptance criteria against HEAD with the read-only verifier, and record the result in the feature record
---

# Verify the Feature

Run the `sdlc:verifier` sub-agent on the current feature's acceptance
criteria and record the outcome. Run it after the pre-commit review and
before the PR.

## Arguments: $ARGUMENTS

None.

## Instructions

1. Resolve the feature record from the branch: `features/<branch>.md`
   under `git rev-parse --show-toplevel`. If the file is missing, or it
   has no `## Acceptance` section with numbered criteria, say so, point at
   `/sdlc:feature-new`, and stop.
2. Resolve the recorder path, first match wins:
   - `./src/hooks/record-verification.js` if `$PWD` is inside the
     `sdlc-claude-skills` source repo;
   - else the newest match of
     `~/.claude/plugins/cache/*/sdlc/*/src/hooks/record-verification.js`,
     e.g.
     `ls -t ~/.claude/plugins/cache/*/sdlc/*/src/hooks/record-verification.js | head -1`;
   - otherwise tell the user to install the `sdlc` plugin from the
     `sdlc-claude-skills` marketplace, and stop.
3. Run `git status --porcelain`. If it shows anything outside
   `features/*.md`, say so and stop. Verification is of HEAD, and the
   recorder is not run.
4. Dispatch ONE `sdlc:verifier` sub-agent (`subagent_type:
   "sdlc:verifier"`). Its prompt carries the feature record path, the
   requirement, the acceptance criteria copied verbatim from the record
   with their numbers, and the HEAD sha (`git rev-parse HEAD`). Add
   nothing that rewords, summarises or reorders the criteria.
5. Write the sub-agent's report verbatim, with the Write tool, to a file in
   the session scratchpad. Do not edit it.
6. Run `node <recorder> --report <file>` and show its output.
7. On FAIL (exit 1), list the FAIL and UNVERIFIED rows and stop.
   On a refusal (exit 2), show the reason and stop.
8. On PASS, say the feature record changed. To ship the evidence with the
   PR, the user stages the record and commits it as two separate
   commands. Committing it keeps the verification marker fresh, because the
   marker ignores feature records.
9. Never commit, never push and never open the PR on the user's behalf.

## Constraints

- Read-only except for the recorder, which writes the feature record and
  the marker.
- Do not retry a FAIL or an UNVERIFIED row to coax a PASS.
