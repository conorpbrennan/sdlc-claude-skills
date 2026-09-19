# Fixture: citation shapes the extractor does not understand

Not a real plan. The extractor knows four shapes; anything else that is
plainly a file citation has to be reported rather than dropped, because a
gate that quietly checks less than its reader believes is worse than a loud
one. Exactly three things below are reportable: two shapes it cannot parse,
and one directory that would otherwise resolve as a file.

## Reportable — the shape is not understood

- A dotted symbol: `src/hooks/lib/git-read.js::Class.method`. §2b rule 2
  tells authors to prefer symbol citations, so this shape turns up.
- A called symbol: `src/hooks/lib/git-read.js::gitRead()`.

## Reportable — a directory is not a file

`git show BRANCH:src/hooks/lib` exits 0 and prints a tree listing, so a
directory cited without a trailing slash would otherwise resolve, with an
entry count standing in for a line count: `src/hooks/lib`.

## Not reportable — none of these cites a file

- A directory written as one: `src/hooks/lib/`, and `docs/`.
- A glob: `.claude/skills/*`.
- A slash command: `/feature-new`.
- A bare separator: `/`.
- A command line rather than a citation:
  `python3 tools/analyze-review-timing.py --days 7`.
- Shapes the extractor DOES understand, all of which resolve on `main`:
  `src/hooks/lib/git-read.js`, `src/hooks/lib/git-read.js:1`,
  `src/hooks/lib/git-read.js::gitRead`.
- A skipped prefix: `scratch/notes.md`.
- A path-shaped span with no extension, which `looks_like_a_file` is what
  rejects — the absolute and home-rooted spans that used to cover this rule
  are now skipped by prefix, so it is pinned here:
  `src/hooks/lib/git-read#gitRead`.
