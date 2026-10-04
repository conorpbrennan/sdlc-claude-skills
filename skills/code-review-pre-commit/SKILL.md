---
name: code-review-pre-commit
description: Runs the pre-commit review a PRE_COMMIT_REVIEW hook block asks for - one sdlc:code-reviewer (or, with --deep, sdlc:code-reviewer-deep) sub-agent on the staged diff, ending in the TDD_GATE trailer, then writes the marker with the printf command from the block message - or, on a gap-patching block, patches the uncovered lines. Not for ad-hoc PR or branch review; use the built-in code-review for that.
user_invocable: true
arg_spec: "[files|staged] [--fresh] [--deep]"
---

# Pre-commit review

A single-sub-agent review of **the staged diff**, run when the pre-commit
hook blocks. The review exists to produce code that is correct, tested,
readable and optimized, in that order; the criteria, method, constraints
and report format that serve that goal live in `agents/code-reviewer.md`
and are not restated here. This skill owns four things: which mode runs,
what the reviewer is handed, how many rounds, and what happens to the
report.

Coverage thresholds and TDD order are the hook's concern
(`src/hooks/pre-commit-review.js`, the coverage and tdd-order checks),
run before this skill is invoked.

## Trailer contract

The last line of every report is exactly `TDD_GATE: PASS` or
`TDD_GATE: FAIL`. Claude, not the hook, reads it: on PASS Claude writes the
marker; the hook only ever compares the marker's hashes to the index. The
name is historical.

## Usage

```
/sdlc:code-review-pre-commit --fresh            # what the hook asks for: one sub-agent on the staged diff
/sdlc:code-review-pre-commit --fresh --deep     # adversarial reviewer on Opus (sdlc:code-reviewer-deep)
/sdlc:code-review-pre-commit staged             # scope: staged changes (the default and only automatic scope)
/sdlc:code-review-pre-commit src/file.py        # scope: one file's staged portion
```

`--deep` selects `sdlc:code-reviewer-deep` (Opus). Use it for security-sensitive
or parser-shaped changes (input validation, auth, secrets, shell or git
command handling, gates that must fail closed), and when the rounds policy
below calls for it. Everything else stays on `sdlc:code-reviewer` (Sonnet): it
is the everyday gate.

<review-protocol>

<mode-selection>
- Hook block whose message names **gap-patching** → `<gap-patching-mode>`
  below. One sub-agent only.
- Otherwise → dispatch exactly ONE sub-agent:
  `subagent_type: "sdlc:code-reviewer"`, or
  `subagent_type: "sdlc:code-reviewer-deep"` when `--deep` is given or
  the rounds policy selects it. Do not dispatch a Plan agent. Pass the
  sub-agent the repository path, the diff target (the staged diff unless
  files were named), the commit's stated intent in one paragraph, and,
  on a rerun, the previous round's open items with what changed.
- `sdlc:code-reviewer-deep` also gets the absolute path of
  `agents/code-reviewer.md`: `../../agents/code-reviewer.md` resolved
  from this skill's base directory. The deep reviewer takes its criteria
  and report format from that file, and an agent's working directory is
  the repository under review, so a relative path finds nothing outside
  this plugin's own source repo.
</mode-selection>

<scope>
The staged diff (`git diff --cached -U10`). If files are named, only their
staged portions. The reviewer reads the containing function around each
hunk and nothing more, per its own definition.
</scope>

<rounds>
The block message states this policy; it is repeated here so a manual run
follows it too.

- Round 1 runs `sdlc:code-reviewer`.
- A FAIL with a CRITICAL finding, or a correctness finding in a parser,
  gate or shell hunk, reruns on `sdlc:code-reviewer-deep` after the fix.
- A FAIL on §6 alone (scope, commented-out code, debug artefact, secret,
  reformat churn) reruns on `sdlc:code-reviewer` after the fix.
- After two FAILs, stop. Do not dispatch a third review. Show the open
  items and ask the user to choose: fix and rerun, or accept with the gap
  named in the commit message. On accept, the user writes the marker.

The marker's fourth line records the bare agent name, without the `sdlc:`
prefix, and the round (`code-reviewer-deep:round2:PASS`), so the next
block message and the timing log can say where a change stands.
</rounds>

<post-review>
- `TDD_GATE: PASS` → run the `printf` command from the block message
  verbatim, replacing `code-reviewer:round1` with the bare agent name
  (`code-reviewer` or `code-reviewer-deep`) and the round used. It
  recomputes both hashes at write time and writes the absolute marker
  path; do not compose a marker command by hand. Then stop. Do
  **not** commit: staging and committing are the user's separate
  commands, and a completed review does not grant permission for either.
- `TDD_GATE: FAIL` → do not write the marker. Surface the failing items.
  With the user's permission, fix them (`/sdlc:code-review-implementer
  critical important` applies the numbered items), then rerun per the
  rounds policy.
- Either way, record the round so the timing log can join it to the
  hook's own events (the hooks never see the report). Run the timing
  command exactly as the block message gives it, filling in the
  placeholders. The hook builds it from its own location, so its path to
  `timing-log.js` is right wherever the plugin is installed:

  ```bash
  node "<path from the block message>/timing-log.js" review.completed agent=<code-reviewer|code-reviewer-deep> round=<n> verdict=<PASS|FAIL> critical=<n> important=<n> advisory=<n> repo="$(git rev-parse --show-toplevel)"
  ```

  A manual run with no block message: use `./src/hooks/timing-log.js`
  inside the `sdlc-claude-skills` source repo, else the newest
  `~/.claude/plugins/cache/*/sdlc/*/src/hooks/timing-log.js`.

- The review is done when the trailer is the last line of the report,
  the event is recorded and, on PASS, the four-line marker is written.
  Nothing else.
</post-review>

<gap-patching-mode>

Invoked only when the hook's message names gap-patching. Dispatch ONE
sub-agent (`subagent_type: "general-purpose"`, model `sonnet`) with this
prompt, filling in the message's thresholds and uncovered locations:

```
You are patching test coverage gaps. Do ONLY the steps below.

Uncovered locations: <from the block message>
Thresholds: <from the block message: diff-cover N%, branch M%>

1. Read the function(s) that contain the uncovered lines. Do not read
   surrounding code.
2. Write the minimum pytest test(s) that exercise those lines and assert
   observable behaviour (return value, stored state, externally visible
   side effect). Do NOT assert on mocks or log messages. Write each test to
   a path git does not ignore: `git check-ignore -q <path>` must exit 1.
   pytest still runs an ignored test, so coverage would count a test the
   commit cannot carry.
3. Run: pytest --cov=<pkg> --cov-branch --cov-report=xml -q
4. Run: diff-cover coverage.xml --compare-branch=HEAD --fail-under=<N>
5. List every test file you created or changed.
6. If diff-cover exits 0, per-file branch coverage on changed files is
   >= M%, and `git check-ignore` exits 1 for every test file you listed,
   print `GAP_PATCH: PASS` as the last line of your report.
   Otherwise print `GAP_PATCH: FAIL` with a one-line reason.

Do NOT refactor the source.
Do NOT add tests for already-covered code.
Do NOT run red-first / green-first choreography.
Do NOT re-review the diff.
Do NOT stage, commit, or write the review marker.
```

The trailer is `GAP_PATCH`, not `TDD_GATE`, on purpose. Every instruction
to write the review marker keys on the review's `TDD_GATE` trailer, and
this report is not a review: it never read the staged diff.

On `GAP_PATCH: PASS`, write no marker. The new tests are in the working
tree, not the index, and the marker hashes the index: one written now
approves a commit that leaves them out. Show the user the test files and
that they must be staged with `git add <files>`, its own command, before
the commit is retried. Staging and the retry are the user's call, as after
a scope review.

The retry comes back through the coverage gate, which measures again. It
approves on its own `thresholds-met` marker only when `coverage.xml` was
measured on the index: no Python file differs from its staged copy, and no
test file or `conftest.py` is untracked or gitignored. Otherwise the commit
needs a scope review, and the block message names the files coverage ran
that the index lacks, so the review knows what it is not seeing. A test
inside a wholly ignored directory is invisible to that check, which is why
the prompt above forbids ignored paths.

On `GAP_PATCH: FAIL`, surface the reason. After two FAILs stop and ask
the user, as in the rounds policy.
</gap-patching-mode>

</review-protocol>

## Integration

`src/hooks/pre-commit-review.js` runs its fast paths before this skill is
dispatched and writes `PASS\n<diff_hash>\n<cov_hash>\n<tag>` to
`.git/.claude-last-review` itself when one approves (tags `trivial-diff`,
`presentational`, `thresholds-met`, `thresholds-met-empty-gap`). The skill
is invoked only when none of them fires. The retry after a review is
approved by the marker's hashes matching the index, and by nothing else.
