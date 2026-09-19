# Fixture: exactly five citations that do not resolve

Not a real plan. It carries one defect per bucket, plus one that pins the
scope of a NEW symbol exemption and one that pins the AST symbol check
against a substring search — so a run that reports four or six has changed
behaviour.

The five defects, for the reader of this fixture:

1. path absent   -- src/hooks/lib/git-write.js has never existed (named in
   prose here, and cited below, so this list does not add a fourth).
2. symbol absent -- .claude/skills/plan-spec/check_citations.py has no such
   function; the citation is below.
3. line past end -- src/hooks/lib/commit-command.js is far shorter than the
   line the constraint below cites.
4. line past end again, on a file whose step declares a NEW symbol. Declaring
   a symbol new says nothing about the rest of the module, so the line must
   still be checked.
5. symbol absent although the name is IN the file: check_citations.py binds
   `names` inside a function, so it is not a module-level definition. A
   substring search accepts it and the AST rejects it, which is the only
   thing here that tells the two apart.

## Working constraints

The paragraph you are reading contains the word NEW in prose, deliberately.
An exemption that keys on that word rather than on a step's `NEW <paths>`
line would swallow the citation in this sentence — which is
`src/hooks/lib/git-write.js`, and must be reported.

- The symbol check must read Python through the AST, not a substring search.
  Two citations say so together:
  `.claude/skills/plan-spec/check_citations.py::no_such_function` appears
  nowhere in the file, and
  `.claude/skills/plan-spec/check_citations.py::names` appears a dozen times
  in it — as a local inside `defined_symbols`, never at module level. A
  substring search would report the first and miss the second.
- The classifier's table starts at `src/hooks/lib/commit-command.js:99999`.

## Steps

**1. Everything below this line resolves, and must not be reported.**
EXTEND `src/hooks/pre-commit-feature.js`.

NEW `src/hooks/lib/not-written-yet.js`,
`src/hooks/lib/git-read.js::plannedHelper`.

GATE: `src/hooks/test-pre-commit-feature.sh` exits 0 and
`src/hooks/lib/feature-file.js::isSourceFile` still decides it, and
`src/hooks/lib/git-read.js::gitRead` is still the one way to run git, and the
helper lands beside `src/hooks/lib/git-read.js:99999`.

A bare `cli.py` is prose, not a citation. So is `scratch/notes.md`, which is
skipped by prefix.
