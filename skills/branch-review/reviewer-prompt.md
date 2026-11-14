You are reviewing the branch `<head>` of the repository `<repo>` against the base `<base>`.
Your pass scope: <pass scope>.

## Goal

Find defects that only show when files are read together. This review is
report-only: make no fixes and no edits. Do not run anything that changes the
tree.

## Scope override

This section replaces the "containing function only" rule of
`agents/code-reviewer.md`. For this review:

- Read each changed file whole, with `git show HEAD:<path>`, not only the
  hunk or the containing function.
- Follow callers and callees across files, including files the diff does not
  touch.
- The pre-commit trailer rules (the `TDD_GATE` line) do not apply. Do not
  write a `TDD_GATE` line.

The criteria and the finding format of `agents/code-reviewer.md` still apply,
except where this prompt says otherwise.

## The seven questions

Answer all seven, each in its own section, in this order. Use these headings
exactly.

## Q1 Handoffs between files

Does the receiver handle every form the sender can produce? Compare what an
entry point passes with what a batch driver passes to the same helper.

## Q2 Where two writers meet

Shared locks, keys, paths and cleanup: what happens when two writers touch the
same thing?

## Q3 Timing

List every retry count, backoff, timeout, TTL and poll interval across the
files. What happens when retries run out before the thing that clears the
error?

## Q4 Repeated requests in flight

What happens when the same request arrives again while the first is still
being worked on?

## Q5 Flags and modes

Check exit codes, help text, docstrings and docs, including text far from the
diff. Do they still describe what the code does?

## Q6 Tests

Does any test exercise the interaction between the files, or only each side
alone?

## Q7 Anything else spanning files

Any other defect that shows only when two or more files are read together.

## Evidence rule

Each of the seven sections holds either `file:line` evidence, or a line
`None found, checked: X, Y, Z` that names at least two things you checked. A
bare "none" is rejected. If any question lacks evidence, the verdict is FAIL.

## Findings

List findings after the seventh section, ranked, one per heading:

`### F<n> CONFIRMED|PLAUSIBLE CRITICAL|IMPORTANT|ADVISORY <title>`

CONFIRMED needs a probe you ran, or a quoted `file:line` pair that proves the
defect. Without one, the finding is PLAUSIBLE. Only a CONFIRMED CRITICAL
finding fails the report.

## Threat model

The gates guard honest mistakes, not adversarial shell. A hook that reads
command text can never prove what bash will do. A bug in a command shape
Claude writes is a real finding. A shape Claude would not write is classed
ADVISORY, and you name it as a gap rather than chase it. Non-goals: quoted
wrappers, `eval`, a forged marker, a path outside the toplevel.

## Trailer

End the report with one last line, and nothing after it:

`BRANCH_GATE: PASS` if no CONFIRMED CRITICAL finding stands and every question
has evidence, otherwise `BRANCH_GATE: FAIL`.
