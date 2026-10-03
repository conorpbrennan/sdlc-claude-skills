# Fixture: a plan that writes tests into files that already exist

Exercises the `TESTS FIRST` symbol exemption. Two of the citations below are
tests this fixture's step is about to write — the FILES exist, the SYMBOLS do
not, and no `NEW` block can cover that shape because `NEW` declares a path.
Two more are deliberate defects outside any block. A working checker reports
exactly two problems, neither of them a test; without the exemption it reports
four.

Every path here carries a directory separator. The citation grammar requires
one, so a fixture written with bare filenames matches nothing and exercises
nothing — which is precisely how this fixture's first draft passed while
testing nothing at all.

**1. A step that extends two existing modules and tests them.**
EXTEND `src/hooks/lib/git-read.js`, `src/hooks/timing-log.js`.

WHAT TO BUILD:
- Nothing real. This fixture exists to be parsed, not built.

TESTS FIRST: `src/hooks/lib/git-read.js::test_enobufs_reports_as_an_error`,
`src/hooks/timing-log.js::test_rotation_keeps_the_newest_events`.
Both are red before the step exists, which is the whole point of the field
(§11): the files resolve, the symbols do not, and only the `TESTS FIRST`
anchor can say so.

GATE: not applicable to a fixture.

**2. The deliberate defects, outside any exemption block.**

A symbol cited in ordinary prose, which must still be reported because no
block covers it: `src/hooks/lib/git-read.js::a_symbol_nothing_defines`.

A path that does not exist, which must still be reported:
`docs/no-such-file-here.md`.

**3. What the anchor must NOT do.**

`src/hooks/timing-log.js` is EXTENDed, never NEW, so if that file were absent
this fixture would report it. The `TESTS FIRST` anchor exempts symbols and
never paths: a step writing a test into a file that is not there has a
file-set defect, and catching it is most of what this gate is for.
