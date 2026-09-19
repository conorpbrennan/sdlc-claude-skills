# Fixture: every citation resolves

Not a real plan. It exists so `check_citations.py` can be shown passing on
input that genuinely contains citations, rather than passing because it found
none. Every path, symbol and line below is on `main`.

## Working constraints

- Running git is owned by `src/hooks/lib/git-read.js`; nothing else may spawn
  git for a read.
- The record's shape and the source-file predicate are owned by
  `src/hooks/lib/feature-file.js::hasSourceFile`.
- A Bash command is classified before any index-based gate runs:
  `src/hooks/lib/commit-command.js`.
- Rounds are logged through `src/hooks/timing-log.js::logEvent`.
- The Python symbol check has to read a module, not search it. A function:
  `.claude/skills/plan-spec/check_citations.py::defined_symbols`. A
  module-level assignment, which is a definition too:
  `.claude/skills/plan-spec/check_citations.py::SKIP_PREFIXES`.

## Steps

**1. The pre-commit gate refuses a source commit with no feature record.**
EXTEND `src/hooks/pre-commit-feature.js`.

GATE: `src/hooks/test-pre-commit-feature.sh` exits 0, and
`src/hooks/lib/git-read.js:1` is still the header comment it has always been.

**2. The post-commit hook stages the record for the next commit.**
EXTEND `src/hooks/post-commit-feature.js`.

GATE: `src/hooks/test-post-commit-feature.sh` exits 0.

## Notes

A bare `cli.py` in prose is not a citation and must not be treated as one.
Neither is `run.json`, nor `README.md` on its own.
