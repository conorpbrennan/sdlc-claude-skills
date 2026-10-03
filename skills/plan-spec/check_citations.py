#!/usr/bin/env python3
"""Resolve a plan's citations against the branch the work will land on.

    python3 check_citations.py PLAN BRANCH

Reads every backticked citation in PLAN of the shapes

    `dir/file.py`            the path exists
    `dir/file.py:12`         ... and has at least 12 lines
    `dir/file.py:12-34`      ... and at least 34
    `dir/file.py::symbol`    ... and defines that symbol

and reports the ones that do not resolve, in four buckets: the path is
absent, the symbol is not defined, the line is past the end of the file, and
the citation shape was not understood -- that last one because a gate that
silently checks less than its reader believes is worse than a loud one.
Exit 0 when everything resolves, 1 when anything does not, 2 when the branch
does not exist or the plan cannot be read.

Files are read with `git show BRANCH:path`, never from the working tree. A
plan is usually written on one branch and dispatched against another, and
that difference is exactly what this is for.

Two things it does NOT do, both of which still need a reader:

  * It checks that a citation RESOLVES, never that the claim attached to it
    is TRUE. Naming the wrong module for a real behaviour cites a file that
    exists, and this will pass it.
  * It cannot tell a pointer from an example. A document quoting a broken
    citation in order to discuss it will be flagged, so write those in prose
    ("file.py at line 4930") rather than in the colon form.
  * It does not check an absolute or `~/`-rooted citation, even one pointing
    into this repository: those prefixes are skipped outright, so such a
    citation is neither resolved nor reported. Cite repo-relative.

Paths the plan declares NEW, and symbols it says it creates -- in a `NEW` file
set, or in a `TESTS FIRST` field, which names tests that must be red before the
code exists -- are exempt --
harvested from the plan's own text, so a step that stops creating something
stops being exempt. Scratch prefixes (scratch/, run/, features/) and the
plan's own path are skipped.
"""

import ast
import re
import subprocess
import sys
from pathlib import Path

# A citation must carry a directory separator. A bare `cli.py` or `run.json`
# in prose is not a citation, and treating it as one drowns the real findings:
# on the plan this was built for, the untightened form produced 49 false
# positives against 193 citations, which is a check nobody runs twice.
_PATH = r"[A-Za-z0-9_.\-]+(?:/[A-Za-z0-9_.\-]+)+"
CITATION = re.compile(
    r"`(" + _PATH + r")"
    r"(?::(\d+)(?:-(\d+))?|::([A-Za-z_][A-Za-z0-9_]*))?`"
)

# Citations are repo-relative, and these prefixes are not checked at all.
# `~/` and `/` are the honest cost: an absolute span is skipped even when it
# points into this very repository, so `/home/you/repo/src/x.js:99999` is
# neither resolved nor reported. That is a blind spot, not a definition --
# see the docstring's list of limits, where it is named.
SKIP_PREFIXES = ("scratch/", "run/", "features/", "DIR/", "tmp/", "~/", "/")

# A backticked span with no whitespace that carries a separator: that is a
# citation shape, whether or not CITATION understands it. Anything matching
# here and not there is reported rather than dropped -- a dotted or called
# symbol (`a/b.py::Class.method`, `a/b.py::fn()`), a non-ASCII name, a stray
# character. Silence is the one failure a gate cannot afford.
#
# Whitespace is excluded so that a backticked COMMAND (`python3 a/b.py x`) is
# not mistaken for a citation. The cost of that is the one shape this cannot
# see: a citation an editor wrapped across a line. Do not wrap citations.
CANDIDATE = re.compile(r"`([^`\s]*/[^`\s]*)`")

# Distinct from None: the path is there, but it is a directory.
IS_TREE = object()


def looks_like_a_file(span):
    """Is this candidate a file citation, or just a path-shaped word?

    Backticked prose is full of directories (`docs/`), globs
    (`.claude/skills/*`), slash commands (`/feature-new`) and bare separators.
    None of them cites a file, and reporting them is how a new bucket becomes
    the noise that gets the whole check switched off. A citation names a file:
    its last segment, before any `:line` or `::symbol`, carries an extension.
    """
    if "*" in span or span.endswith("/"):
        return False
    head = span.split("::", 1)[0].split(":", 1)[0]
    base = head.rsplit("/", 1)[-1]
    return bool(re.fullmatch(r"[^.].*\.[A-Za-z0-9]{1,8}", base))


class GitMissing(Exception):
    """git could not be run at all."""


def run_git(args):
    """`git <args>`, or GitMissing when there is no git to run.

    Every git failure this tool can meet must land as exit 2 rather than 1: a
    caller under §2b rule 1 reads 1 as "citations did not resolve" and would
    dispatch a fix round for a run that checked nothing.
    """
    try:
        return subprocess.run(
            ["git"] + list(args),
            capture_output=True, text=True, errors="replace",
        )
    except OSError as e:
        raise GitMissing(str(e))


def inside_repo():
    """True when the cwd is inside a repository.

    Separated from branch_exists so a broken GIT_DIR or a wrong cwd does not
    report as "no such branch": the exit code was already right, the message
    named the wrong cause, and `src/hooks/lib/git-read.js` in this repository
    draws exactly this distinction.
    """
    return run_git(["rev-parse", "--git-dir"]).returncode == 0


def branch_exists(branch):
    """True when BRANCH names a commit here."""
    return run_git(
        ["rev-parse", "--verify", "--quiet", "{}^{{commit}}".format(branch)]
    ).returncode == 0


def git_show(branch, path):
    """File content at BRANCH, or None when the path is not there.

    Callers must have established that BRANCH exists: without that, every
    citation reports absent, and on a plan whose paths are all exempt the run
    reports a clean pass against a branch that was never read.
    """
    r = run_git(["show", "{}:{}".format(branch, path)])
    if r.returncode != 0:
        return None
    # `git show BRANCH:some/dir` exits 0 and prints a tree listing, so a
    # directory citation would otherwise resolve, with a "line count" that is
    # really an entry count. IS_TREE says so, rather than calling it absent.
    if r.stdout.startswith("tree {}:".format(branch)):
        return IS_TREE
    return r.stdout


# A step's file set opens with `NEW <paths>` or `EXTEND <paths>` at the start
# of a line (reference.md §16). Only that anchors an exemption. Matching a bare
# \bNEW\b anywhere was a hole big enough to drive the whole gate through: any
# plan whose PROSE said "NEW" exempted every citation to the next blank line,
# and the prose §2b teaches people to write says exactly that ("declaring a
# function NEW that had existed all along"). A gate its own specification
# disables is worse than no gate.
NEW_BLOCK = re.compile(r"^[ \t]*NEW\b", re.M)

# A step's TESTS FIRST field names the tests that must be RED before the
# implementation exists (reference.md §16, §11). By definition those symbols do
# not exist yet -- and they are written into files that usually DO, so a NEW
# block cannot cover them and never could: NEW declares a path. Without this,
# every plan that writes a test into an existing file reports a false symbol
# miss per test, which on a plan of eleven steps was six of the seventeen
# residual items and enough noise to make a reader stop reading the output.
#
# It exempts SYMBOLS ONLY, never paths: the test file itself must still exist,
# and a step that writes a test into a file that is not there has a file-set
# defect this gate should still catch. The blast radius is therefore much
# narrower than NEW's, which is what makes a second anchor safe at all.
#
# The cost, stated because it is real: a TESTS FIRST block citing a test that
# ALREADY exists is now silently exempt rather than checked. That is a category
# error in the plan -- TESTS FIRST is where you name what you are about to
# write -- and it costs a check that would have passed anyway.
#
# The larger residue, and the reason this closes only half the false-positive
# class: CITATION's symbol group is [A-Za-z_][A-Za-z0-9_]*, so a pytest node id
# -- `path::TestClass.test_x`, `path::test_x()` -- never parses as a citation
# at all. It falls to the CANDIDATE pass, which is deliberately exemption-blind
# (a shape nobody understood is worth saying whether or not it was declared),
# so a plan naming class-based tests still pays one report per test, relabelled
# from "symbol not defined" to "citation shape not understood". That is noise
# rather than silence, and symmetric with NEW, but it is not fixed here.
TESTS_FIRST_BLOCK = re.compile(r"^[ \t]*TESTS FIRST\b", re.M)


def declared_new(text):
    """Paths and symbols the plan says it creates.

    Harvested from the plan rather than a hand-maintained list: a list goes
    stale silently, and the exemption it grants outlives the step that earned
    it. A NEW block runs to the next blank line.

    Two anchors, both at the start of a line and both running to the next blank
    line: a `NEW` file set (paths and symbols) and a `TESTS FIRST` field
    (symbols only -- see that pattern's own comment for why the file must
    still resolve).

    A citation carrying a symbol exempts only that symbol, never the file:
    `a/b.js::newHelper` says a helper is new, not that every line and symbol
    of an existing module is. Exemptions are document-global -- a NEW block in
    a later step covers the same path cited in an earlier one -- which is
    right for a forward-ordered plan and worth knowing when reading a pass.
    """
    paths, symbols = set(), set()

    # TESTS FIRST first: symbols only, and the same blank-line block rule.
    for m in TESTS_FIRST_BLOCK.finditer(text):
        block = re.split(r"\n[ \t]*\n", text[m.end():], 1)[0]
        for c in CITATION.finditer(block):
            if c.group(4):
                symbols.add((c.group(1), c.group(4)))

    for m in NEW_BLOCK.finditer(text):
        # A line of spaces is a blank line to Markdown and to every author.
        # Ending the block only on "\n\n" let three invisible characters widen
        # an exemption over the next paragraph, with nothing in the output to
        # say so -- the direction NEW_BLOCK's own comment calls a hole big
        # enough to drive the gate through.
        block = re.split(r"\n[ \t]*\n", text[m.end():], 1)[0]
        for c in CITATION.finditer(block):
            if c.group(4):
                symbols.add((c.group(1), c.group(4)))
            else:
                paths.add(c.group(1))
    return paths, symbols


def defined_symbols(source, path):
    """Every name a module defines at the top level.

    `def`, `async def`, `class`, and module-level assignment with or without
    an annotation -- `TOP_LEVEL_KEYS: dict = {...}` is a definition, and an
    earlier draft of this called it missing.
    """
    if not path.endswith(".py"):
        return None  # not a Python module; fall back to a literal search
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return None
    names = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    names.add(t.id)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
    return names


def is_own_path(plan_path, cited):
    """Does this citation point at the plan being checked?

    Resolved, not compared as strings: a sub-agent dispatched under §2b rule 1
    passes an absolute path, and the plan cites itself repo-relative.
    """
    try:
        return Path(plan_path).resolve() == Path(cited).resolve()
    except OSError:
        return False


def check(plan_path, text, branch):
    new_paths, new_symbols = declared_new(text)

    missing_path, missing_symbol, past_end, unparsed = [], [], [], []
    is_dir = []
    checked = 0
    seen = set()
    cache = {}

    for m in CITATION.finditer(text):
        path, lo, hi, sym = m.group(1), m.group(2), m.group(3), m.group(4)
        key = (path, lo, hi, sym)
        if key in seen:
            continue
        seen.add(key)
        if path.startswith(SKIP_PREFIXES) or is_own_path(plan_path, path):
            continue
        if path in new_paths:
            continue

        if path not in cache:
            cache[path] = git_show(branch, path)
        source = cache[path]

        checked += 1

        if source is IS_TREE:
            is_dir.append(path)
            continue
        if source is None:
            missing_path.append(path)
            continue

        if sym and (path, sym) not in new_symbols:
            names = defined_symbols(source, path)
            found = (sym in names) if names is not None else (sym in source)
            if not found:
                missing_symbol.append("{}::{}".format(path, sym))

        if lo:
            end = int(hi or lo)
            n = len(source.splitlines())
            if end > n:
                past_end.append(
                    "{}:{} (file has {} lines)".format(path, hi or lo, n)
                )

    # Shapes the extractor did not understand, rather than silence.
    parsed = {m.group(0) for m in CITATION.finditer(text)}
    for c in CANDIDATE.finditer(text):
        if c.group(0) in parsed:
            continue
        inner = c.group(1)
        if inner.startswith(SKIP_PREFIXES) or is_own_path(plan_path, inner):
            continue
        if not looks_like_a_file(inner):
            continue
        unparsed.append(inner)

    return (sorted(set(missing_path)), sorted(set(missing_symbol)),
            sorted(set(past_end)), sorted(set(is_dir)),
            sorted(set(unparsed)), checked)


def main(argv):
    if len(argv) != 3:
        print("usage: check_citations.py PLAN BRANCH", file=sys.stderr)
        return 2
    plan, branch = argv[1], argv[2]
    if not Path(plan).is_file():
        print("no such plan: {}".format(plan), file=sys.stderr)
        return 2
    # The docstring promises 2 for a plan that cannot be read, and a caller
    # under §2b rule 1 reads 1 as "citations failed" and 2 as "the harness is
    # broken". An unreadable plan is the second, so it must not arrive as the
    # first with a traceback attached.
    try:
        text = Path(plan).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        print("cannot read plan {}: {}".format(plan, e), file=sys.stderr)
        return 2

    try:
        if not inside_repo():
            print(
                "not inside a git repository (nothing was checked)",
                file=sys.stderr,
            )
            return 2
        if not branch_exists(branch):
            print(
                "no such branch: {} (nothing was checked)".format(branch),
                file=sys.stderr,
            )
            return 2

        missing_path, missing_symbol, past_end, is_dir, unparsed, checked = (
            check(plan, text, branch)
        )
    except GitMissing as e:
        print("git is not available, nothing was checked: {}".format(e),
              file=sys.stderr)
        return 2

    total = (len(missing_path) + len(missing_symbol) + len(past_end)
             + len(is_dir) + len(unparsed))
    if not total:
        # The count is the point: an empty plan, a truncated one and a working
        # one all printed the same sentence before, so a clean run said only
        # that nothing had failed, never that anything had been looked at.
        print("{} citation(s) resolve on {}".format(checked, branch))
        return 0

    for label, items in (
        ("path absent on {}".format(branch), missing_path),
        ("symbol not defined", missing_symbol),
        ("line past end of file", past_end),
        ("path is a directory, not a file", is_dir),
        ("citation shape not understood", unparsed),
    ):
        if items:
            print("{}:".format(label))
            for i in sorted(items):
                print("  {}".format(i))
    print("{} problem(s) in {} citation(s) checked".format(total, checked))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
