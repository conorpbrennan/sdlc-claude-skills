## Auto Code Review Triggers

The pre-commit hook decides whether to dispatch a review and, if so, which
shape. Claude only acts when the hook blocks; fast-path approvals happen
silently inside the hook. The review exists to produce code that is
correct, tested, readable and optimized, in that order.

**Stage and commit in separate Bash commands.** The pre-commit hooks read
the index before the command runs, so `git add x && git commit`,
`git commit -a`, `git commit -m msg <path>`, `git checkout b && git commit`,
`cd elsewhere && git commit`, or a commit inside `bash -c "..."` is blocked
outright (`PRE_COMMIT_GATE`). Run `git add ...` first, then `git commit ...`
on its own. `--amend` is gated like any other commit. Never commit through
a script, Makefile target, or package script: the gates guard ordinary
command shapes, not deliberate evasion, and cannot see inside those. A
commit must be `git commit` typed in its own command.

When the hook does block, the `systemMessage` carries one of two shapes:

- **Gap-patching** (thresholds failed, `coverage.xml` present): dispatch ONE
  sub-agent using the `<gap-patching-mode>` prompt in
  `sdlc:code-review-pre-commit`, with the thresholds and uncovered lines
  from the message. No scope review alongside, and no marker: on PASS the
  new tests are not staged yet, so the user stages them (`git add`, its own
  command) and retries. Its report ends `GAP_PATCH: PASS` or
  `GAP_PATCH: FAIL`: it is not a review, so it never licenses the marker.
- **Scope review** (everything else): run `/sdlc:code-review-pre-commit --fresh`.
  ONE `sdlc:code-reviewer` sub-agent (Sonnet) on the staged diff. `--deep`
  selects `sdlc:code-reviewer-deep` (Opus) for security-sensitive or
  parser-shaped changes and when the rounds policy says so.

The scope review ends with `TDD_GATE: PASS` or `TDD_GATE: FAIL` on the
last line. Only that trailer, from that review, licenses the marker.

On a scope review's **PASS**, run the `printf` command from the block
message verbatim, replacing `code-reviewer:round1` with the bare agent name (`code-reviewer`
or `code-reviewer-deep`, no `sdlc:` prefix) and the round used. It
recomputes both hashes at write time; do not compose a marker command by
hand.

On **FAIL**, do NOT write the marker. Surface the failing items and fix
with user permission. Rerun on `sdlc:code-reviewer-deep` only after a CRITICAL
or a correctness finding in a parser, gate or shell hunk; otherwise on
`sdlc:code-reviewer`. After two FAILs stop and ask the user to fix-and-rerun or
to accept with the gap named in the commit message.

**Stop after the marker is written.** Completing a review does not grant
permission to commit -- wait for the user. The retry is approved only by
the marker's hashes matching the index.
