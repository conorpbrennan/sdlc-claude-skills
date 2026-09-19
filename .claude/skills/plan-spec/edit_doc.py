#!/usr/bin/env python3
"""Apply a batch of exact-string edits to one file, all or nothing.

    import sys; sys.path.insert(0, ".claude/skills/plan-spec")
    from edit_doc import apply_edits, apply_edits_multi

    apply_edits("docs/plan.md", [
        ("old text", "new text", "label"),
        ...
    ])

    apply_edits_multi({                      # all-or-nothing ACROSS files
        "docs/plan.md":  [(old, new, "label"), ...],
        "docs/other.md": [(old, new, "label"), ...],
    })

There is no CLI: running this file executes its self-tests.

Use the multi form whenever a change touches more than one file. `apply_edits`
is all-or-nothing within ONE file, so two calls to it are two independent
decisions, and a batch whose first file fails while the second succeeds leaves
exactly the half-applied change this module exists to prevent -- the same
defect one level up.

WHY THIS EXISTS. The obvious way to script a batch of edits is to substitute
into a string, print OK as each one lands, and write the file at the end. That
is wrong in a way that hides itself: a later substitution that finds no match
exits before the write, so the edits that printed OK were never applied. The
transcript says three succeeded and one failed; the disk says nothing
happened.

The mirror-image mistake is worse and is the one seen here: read, substitute
and write inside the loop, one file at a time. Then a later miss leaves the
earlier edits ON DISK and exits reporting only the anchor that failed. The
document is half-edited and nothing says which half. It was caught on 3 Sep
only because a separate checker returned a different count on the next run,
and other scripts the same day did it correctly -- so the pattern was
inconsistent within one session, which is worse than being wrong consistently.

Two-phase is the fix, and it is the whole design:

  VALIDATE every edit, against the text as the earlier edits in the same
    batch have already changed it, collecting failures.
  If any failed, write NOTHING and say so.
  Only then write, once.

Validating against the ORIGINAL text instead is a subtler version of the same
bug, and it shipped here for a day: an edit whose anchor an earlier edit
consumed still counts 1 in the original, prints OK, and then does nothing when
the replace runs against the mutated text. The report says two applied, the
disk has one. Validation therefore walks a working copy, and that working copy
is what gets written -- one pass, so the report cannot describe a different
document from the one on disk.

THREE OUTCOMES PER EDIT, kept distinct because they need different responses:

  OK             matched exactly once at its turn in the batch; will be applied
  ALREADY        this edit landed on an earlier run. Not an error: re-running
                 a script after a partial failure is the normal way to
                 recover, and calling that a miss sends you hunting for an
                 anchor that is fine. How it is decided depends on the edit's
                 shape, because no single test covers both: when `new`
                 contains `old` (an append, where the anchor survives) it is
                 `new` being present; otherwise it is the anchor having gone
                 AND `new` being present. Using either test alone is a real
                 bug in both directions -- one duplicates appends, the other
                 silently skips deletions.
  MISS (n)       matched n times, n != 1, at its turn. Zero means the anchor is
                 wrong, the text moved, or an earlier edit in this batch
                 consumed it; more than one means it is ambiguous, and
                 replacing all of them is not what you asked for. Ambiguity is
                 not consent.

The write is atomic -- a temporary file in the same directory, then rename --
so an interrupted run cannot leave a half-written document. Same directory
because rename is only atomic within a filesystem. The file's mode is carried
over by hand, since `mkstemp` creates 0600 and without this an edit would
silently turn a 644 document into 600, or stop a 755 script running. Owner,
group and xattrs are NOT carried, so a file edited as another user changes
hands: a reason not to point this at /etc.

A symlinked path is resolved before writing, so the edit lands on the real
file. Without that the rename replaces the LINK with a regular file and the
target keeps the old content -- two names that were one document, silently
diverged.

Line endings are preserved: both handles use newline="", so a CRLF document
stays CRLF. The default translates on read and again on write, rewriting every
line while the report says one edit applied.

LIMITS worth knowing before trusting a green run:

  * ALREADY is decided by `new` being present, in BOTH branches. If some other
    edit legitimately introduces that same text elsewhere, an unapplied edit
    is called ALREADY and skipped. That direction is the safe one -- a skipped
    edit shows up in the report and in the next diff, a duplicate does not --
    but it means `new` must be distinctive. Anchors with enough context make
    it so, which is what you want for `old` anyway.
  * A deletion (`new == ""`) can never be recognised as ALREADY: after
    deleting X, "already deleted" and "never contained X" are the same text.
    Re-running a delete reports MISS(0) instead. That is deliberate -- the
    alternative calls every delete-edit with a wrong anchor ALREADY, which is
    silence in the one direction this module refuses to be silent.
  * An edit whose anchor survives its own replacement is not idempotent:
    `"aaa"` with `old="aa"`, `new="a"` gives `"aa"` on the first run and `"a"`
    on the second, both honestly reported as OK. The report matches the disk
    every time, so the invariant holds, but "re-run to recover" does not apply
    to that shape. Anchors that contain their own replacement are worth
    avoiding for the same reason ambiguous ones are.
  * Temp-and-rename needs a WRITABLE DIRECTORY, which a direct write did
    not: a read-only directory holding a writable file now fails. It also
    breaks a hardlink, since the rename gives the name a new inode -- the
    other name keeps the old content, the same way an unresolved symlink
    would. `apply_edits_multi` refuses two keys that share an inode for this
    reason; the single-file form cannot know a second name exists.
  * It does not fsync before the rename, so a power loss between the two can
    leave the old file. The right trade for a working-tree document, the wrong
    one for a durable log.
"""
import contextlib
import io
import os
import shutil
import sys
import tempfile


def _classify(working, old, new):
    """One edit against the text as it stands at its turn in the batch.

    Returns ("ok", text_after) | ("already", None) | ("miss", n).
    """
    if old == "":
        return ("miss", 0)
    n = working.count(old)
    if old in new and new in working:
        return ("already", None)
    if n == 1:
        return ("ok", working.replace(old, new, 1))
    if n == 0 and new != "" and new in working:
        return ("already", None)
    return ("miss", n)


def _validate(text, edits):
    """Walk the batch over a working copy.

    Returns (working, planned, already, failed). The working copy is the
    document that will be written: validating and applying are the same pass,
    so an anchor an earlier edit consumed fails here rather than silently
    doing nothing later.
    """
    working = text
    planned, already, failed = [], [], []
    for old, new, label in edits:
        verdict, payload = _classify(working, old, new)
        if verdict == "ok":
            planned.append(label)
            working = payload
        elif verdict == "already":
            already.append(label)
        else:
            failed.append((label, payload))
    return working, planned, already, failed


def _write_atomically(path, text):
    """Replace `path` with `text`, preserving mode and following symlinks."""
    real = os.path.realpath(path)
    directory = os.path.dirname(real) or "."
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".edit_doc.", suffix=".tmp")
    try:
        with io.open(fd, "w", encoding="utf-8", newline="") as handle:
            handle.write(text)
        fd = -1  # the with-block closed it; do not close a recycled descriptor
        # mkstemp gives 0600. Without this the edit is a silent chmod.
        shutil.copymode(real, tmp)
        os.replace(tmp, real)
    except BaseException:
        try:
            if fd >= 0:
                os.close(fd)
        except OSError:
            pass
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _read(path):
    with io.open(path, encoding="utf-8", newline="") as handle:
        return handle.read()


def apply_edits(path, edits, dry_run=False, verbose=True):
    """Apply (old, new, label) triples to `path`, all or nothing.

    Returns True when the file is in the intended state -- every edit either
    applied now or already present. Returns False and writes nothing when any
    edit could not be applied unambiguously.
    """
    working, planned, already, failed = _validate(_read(path), edits)

    if verbose:
        for label in planned:
            print("OK       %s" % label)
        for label in already:
            print("ALREADY  %s" % label)
        for label, n in failed:
            print("MISS(%d)  %s" % (n, label))

    if failed:
        if verbose:
            print("\n%d edit(s) could not be applied. NOTHING WRITTEN -- %s is "
                  "unchanged." % (len(failed), path))
        return False

    if not planned:
        if verbose:
            print("\nnothing to do: every edit was already applied.")
        return True

    if dry_run:
        if verbose:
            print("\ndry run: %d edit(s) would apply, nothing written."
                  % len(planned))
        return True

    _write_atomically(path, working)

    if verbose:
        print("\n%d edit(s) applied to %s." % (len(planned), path))
    return True


def _report_partial(written, unchanged, pending):
    """Name every file in the batch, in three sets that partition it.

    Two sets did not partition anything: a file already in its intended state
    was removed from both and appeared nowhere, while the comment beside them
    called them a partition. Three sets say what happened to every key.

    `str()` on each member because a caller may key the batch with
    `pathlib.Path`. Without it `", ".join` raises inside this function, the
    handler calls it again, it raises again, and the one report whose purpose
    is naming the written half prints nothing.
    """
    def names(paths):
        return ", ".join(str(p) for p in paths) or "nothing"

    print("\nA file changed between validation and write. This batch is now "
          "PARTIALLY applied -- inspect before re-running.")
    print("  WRITTEN:     %s" % names(written))
    print("  UNCHANGED:   %s" % names(unchanged))
    print("  NOT WRITTEN: %s" % names(pending))


def apply_edits_multi(batches, dry_run=False, verbose=True):
    """Apply {path: [(old, new, label), ...]} across files, all or nothing.

    Validates every edit in every file first. If any file has a failing edit,
    NOTHING is written anywhere -- not even the files whose own edits were
    fine. Returns True only when every file ends in its intended state.

    If a file changes between the two phases, the files already written are
    NAMED before returning or re-raising. Reporting which half landed is the
    whole point: a partial write nobody can see is the defect this module
    exists to end.
    """
    paths = sorted(batches)

    # Two keys naming the same real file are two entries in the batch and one
    # document on disk. Both validate against the unmutated file, both report
    # OK, and phase two then half-applies while the report names the written
    # file as NOT WRITTEN -- the report disagreeing with the disk, which is the
    # one thing this module exists to prevent. `_write_atomically` already
    # resolves symlinks, so the module can see the aliasing; the keys could
    # not. Refuse rather than guess which key the caller meant.
    seen = {}
    for path in paths:
        try:
            info = os.stat(path)
            key = (info.st_dev, info.st_ino)
        except OSError:
            # Not there yet, or unreadable: phase one will fail on it loudly.
            # Fall back to the path so two spellings of one absent file still
            # collide.
            key = os.path.realpath(path)
        if key in seen:
            raise ValueError(
                "%s and %s are the same file; put their edits in one batch"
                % (seen[key], path))
        seen[key] = path

    ok = True
    for path in paths:
        if verbose:
            print("-- %s" % path)
        if not apply_edits(path, batches[path], dry_run=True, verbose=verbose):
            ok = False

    if not ok:
        if verbose:
            print("\nNOTHING WRITTEN in any of the %d file(s): a batch that "
                  "cannot be applied everywhere is not applied anywhere."
                  % len(batches))
        return False

    if dry_run:
        if verbose:
            print("\ndry run: %d file(s) validated, nothing written."
                  % len(batches))
        return True

    written, unchanged, pending = [], [], list(paths)
    try:
        for path in paths:
            before = _read(path)
            if not apply_edits(path, batches[path], verbose=False):
                _report_partial(written, unchanged, pending)
                return False
            # Assume written, then move to `unchanged` only once the after-read
            # has confirmed it. If that read raises, the file stays under
            # WRITTEN rather than falling out of the report: over-reporting is
            # recoverable, and under-reporting is the silent half-apply this
            # module exists to end. The three lists partition the batch, so
            # every key is accounted for on every failure path.
            pending.remove(path)
            written.append(path)
            if _read(path) == before:
                written.remove(path)
                unchanged.append(path)
    except BaseException:
        _report_partial(written, unchanged, pending)
        raise

    if verbose:
        print("\n%d file(s) written, %d already in the intended state."
              % (len(written), len(unchanged)))
    return True


if __name__ == "__main__":
    work = tempfile.mkdtemp()

    def read_bytes(p):
        with open(p, "rb") as fh:
            return fh.read()

    def write(p, content):
        with io.open(p, "w", encoding="utf-8", newline="") as fh:
            fh.write(content)

    target = os.path.join(work, "sample.md")
    write(target, "alpha\nbeta\ngamma\nbeta\n")
    os.chmod(target, 0o644)

    print("-- a batch with one bad anchor must write nothing --")
    assert apply_edits(target, [
        ("alpha", "ALPHA", "good edit"),
        ("delta", "DELTA", "anchor not present"),
    ]) is False
    assert _read(target) == "alpha\nbeta\ngamma\nbeta\n"
    print("   -> file unchanged, as required\n")

    print("-- an ambiguous anchor is a MISS, not a replace-all --")
    assert apply_edits(target, [("beta", "BETA", "ambiguous")]) is False
    assert _read(target).count("BETA") == 0
    print("   -> file unchanged, as required\n")

    print("-- an anchor an EARLIER edit consumed is a MISS, not a silent drop --")
    overlap = os.path.join(work, "overlap.md")
    write(overlap, "## Step 1: alpha beta\nbody\n")
    assert apply_edits(overlap, [
        ("## Step 1: alpha beta", "## Step 1: rewritten", "rewrite heading"),
        ("alpha beta", "ALPHA BETA", "emphasise the phrase"),
    ]) is False
    assert _read(overlap) == "## Step 1: alpha beta\nbody\n", _read(overlap)
    print("   -> reported, and nothing written\n")

    print("-- two edits sharing one anchor is a MISS --")
    dup = os.path.join(work, "dup.md")
    write(dup, "x\n")
    assert apply_edits(dup, [("x", "y", "first"), ("x", "z", "second")]) is False
    assert _read(dup) == "x\n"
    print("   -> reported, and nothing written\n")

    print("-- a clean batch applies --")
    assert apply_edits(target, [
        ("alpha", "ALPHA", "first"),
        ("gamma", "GAMMA", "second"),
    ]) is True
    assert _read(target) == "ALPHA\nbeta\nGAMMA\nbeta\n"
    print("   -> applied\n")

    print("-- re-running the same batch is ALREADY, and writes nothing --")
    assert apply_edits(target, [
        ("alpha", "ALPHA", "first"),
        ("gamma", "GAMMA", "second"),
    ]) is True
    assert _read(target) == "ALPHA\nbeta\nGAMMA\nbeta\n"
    print("   -> recognised as already applied\n")

    print("-- an append does not duplicate on a re-run --")
    app = os.path.join(work, "append.md")
    write(app, "- one\n- two\n")
    batch = [("- one\n", "- one\n- inserted\n", "append after one")]
    assert apply_edits(app, batch, verbose=False) is True
    assert apply_edits(app, batch, verbose=False) is True
    assert _read(app).count("- inserted") == 1, _read(app)
    print("   -> applied once\n")

    print("-- a shrink still applies, and is ALREADY on a re-run --")
    shr = os.path.join(work, "shrink.md")
    write(shr, "- dup\n- dup\n- keep\n")
    shrink = [("- dup\n- dup\n", "- dup\n", "de-duplicate")]
    assert apply_edits(shr, shrink, verbose=False) is True
    assert _read(shr) == "- dup\n- keep\n", _read(shr)
    assert apply_edits(shr, shrink, verbose=False) is True
    assert _read(shr) == "- dup\n- keep\n"
    print("   -> applied once\n")

    print("-- dry run writes nothing --")
    assert apply_edits(target, [("beta\nGAMMA", "beta\nGAMMA\ndelta", "insert")],
                       dry_run=True) is True
    assert "delta" not in _read(target)
    print("   -> nothing written\n")

    print("-- the file's mode survives the atomic replace --")
    assert os.stat(target).st_mode & 0o777 == 0o644
    script = os.path.join(work, "run.sh")
    write(script, "#!/bin/bash\necho one\n")
    os.chmod(script, 0o755)
    assert apply_edits(script, [("one", "two", "exec")], verbose=False) is True
    assert os.stat(script).st_mode & 0o777 == 0o755
    print("   -> 644 stayed 644 and 755 stayed 755\n")

    print("-- CRLF line endings survive --")
    crlf = os.path.join(work, "crlf.md")
    with open(crlf, "wb") as fh:
        fh.write(b"alpha\r\nbeta\r\n")
    assert apply_edits(crlf, [("alpha", "ALPHA", "x")], verbose=False) is True
    assert read_bytes(crlf) == b"ALPHA\r\nbeta\r\n", read_bytes(crlf)
    print("   -> not rewritten to LF\n")

    print("-- a symlink is followed, not replaced --")
    realdir = os.path.join(work, "real")
    os.mkdir(realdir)
    realfile = os.path.join(realdir, "doc.md")
    write(realfile, "alpha\n")
    link = os.path.join(work, "link.md")
    os.symlink(realfile, link)
    assert apply_edits(link, [("alpha", "ALPHA", "via link")], verbose=False) is True
    assert os.path.islink(link), "the link was replaced by a regular file"
    assert _read(realfile) == "ALPHA\n", "the real file was not edited"
    print("   -> the real file changed and the link is still a link\n")

    print("-- a re-run of a deletion is MISS(0), never a false ALREADY --")
    dele = os.path.join(work, "delete.md")
    write(dele, "keep\ndrop\n")
    delete_batch = [("drop\n", "", "remove the block")]
    assert apply_edits(dele, delete_batch, verbose=False) is True
    assert _read(dele) == "keep\n"
    assert apply_edits(dele, delete_batch, verbose=False) is False
    print("   -> loud on the second run rather than falsely clean\n")

    print("-- across files: one bad anchor writes nothing anywhere --")
    a = os.path.join(work, "multi_a.md")
    b = os.path.join(work, "multi_b.md")
    write(a, "aaa\n")
    write(b, "bbb\n")
    assert apply_edits_multi({
        a: [("aaa", "AAA", "fine")],
        b: [("zzz", "ZZZ", "bad anchor")],
    }, verbose=False) is False
    assert _read(a) == "aaa\n", "the good file was written anyway"
    print("   -> the file whose own edit was fine is untouched\n")

    print("-- across files: a clean batch writes both --")
    assert apply_edits_multi({
        a: [("aaa", "AAA", "fine")],
        b: [("bbb", "BBB", "also fine")],
    }, verbose=False) is True
    assert _read(a) == "AAA\n" and _read(b) == "BBB\n"
    print("   -> both written\n")

    print("-- an empty anchor is refused, not matched everywhere --")
    empty = os.path.join(work, "empty.md")
    write(empty, "")
    assert apply_edits(empty, [("", "X", "empty anchor")], verbose=False) is False
    assert _read(empty) == ""
    print("   -> MISS(0), nothing written\n")

    print("-- a read-only target is still edited, which is what pins the rename --")
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        print("   -> skipped: root can write a 0444 file, so this proves nothing\n")
    else:
        ro = os.path.join(work, "readonly.md")
        write(ro, "alpha\n")
        os.chmod(ro, 0o444)
        assert apply_edits(ro, [("alpha", "ALPHA", "ro")], verbose=False) is True
        assert _read(ro) == "ALPHA\n"
        assert os.stat(ro).st_mode & 0o777 == 0o444
        print("   -> temp-and-rename works where a direct write raises\n")

    print("-- aliased keys in one multi batch are refused --")
    aliased_real = os.path.join(work, "aliased.md")
    write(aliased_real, "P\nR\n")
    aliased_link = os.path.join(work, "aliased-link.md")
    os.symlink(aliased_real, aliased_link)
    try:
        apply_edits_multi({
            aliased_link: [("P", "Q", "via alias")],
            aliased_real: [("P", "Z", "via real")],
        }, verbose=False)
        raise AssertionError("aliased keys were accepted")
    except ValueError:
        pass
    assert _read(aliased_real) == "P\nR\n", "a half-apply happened anyway"
    print("   -> refused before anything was written\n")

    print("-- a phase-two failure names which half landed --")
    pa = os.path.join(work, "partial_a.md")
    pb = os.path.join(work, "partial_b.md")
    write(pa, "A\n")
    write(pb, "B\n")
    _real_apply = apply_edits

    def _clobbering(path, edits, dry_run=False, verbose=True):
        out = _real_apply(path, edits, dry_run=dry_run, verbose=verbose)
        if not dry_run and path == pa:
            write(pb, "clobbered\n")   # B's anchor is gone by its turn
        return out

    apply_edits = _clobbering
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            ok = apply_edits_multi({pa: [("A", "AA", "a")],
                                    pb: [("B", "BB", "b")]}, verbose=False)
    finally:
        apply_edits = _real_apply
    report = buf.getvalue()
    assert ok is False
    assert pa in report.split("WRITTEN:")[1].split("\n")[0], report
    assert pb in report.split("NOT WRITTEN:")[1], report
    assert _read(pa) == "AA\n", "A was not written"
    print("   -> the written half is named, and so is the rest\n")

    print("-- a phase-two exception names which half landed too --")
    qa = os.path.join(work, "raise_a.md")
    qb = os.path.join(work, "raise_b.md")
    write(qa, "A\n")
    write(qb, "B\n")

    def _vanishing(path, edits, dry_run=False, verbose=True):
        out = _real_apply(path, edits, dry_run=dry_run, verbose=verbose)
        if not dry_run and path == qa:
            os.unlink(qb)              # B disappears before its turn
        return out

    apply_edits = _vanishing
    buf = io.StringIO()
    raised = False
    try:
        with contextlib.redirect_stdout(buf):
            apply_edits_multi({qa: [("A", "AA", "a")],
                               qb: [("B", "BB", "b")]}, verbose=False)
    except OSError:
        raised = True
    finally:
        apply_edits = _real_apply
    report = buf.getvalue()
    assert raised, "the missing file should have raised"
    assert qa in report.split("WRITTEN:")[1].split("\n")[0], report
    assert qb in report.split("NOT WRITTEN:")[1], report
    print("   -> named before the exception was re-raised\n")

    print("-- a file whose AFTER-read raises is still named WRITTEN --")
    ra = os.path.join(work, "vanish_a.md")
    rb = os.path.join(work, "vanish_b.md")
    write(ra, "A\n")
    write(rb, "B\n")

    def _vanish_self(path, edits, dry_run=False, verbose=True):
        out = _real_apply(path, edits, dry_run=dry_run, verbose=verbose)
        if not dry_run and path == ra:
            os.unlink(ra)              # the file we just wrote disappears
        return out

    apply_edits = _vanish_self
    buf = io.StringIO()
    raised = False
    try:
        with contextlib.redirect_stdout(buf):
            apply_edits_multi({ra: [("A", "AA", "a")],
                               rb: [("B", "BB", "b")]}, verbose=False)
    except OSError:
        raised = True
    finally:
        apply_edits = _real_apply
    report = buf.getvalue()
    assert raised
    assert ra in report.split("WRITTEN:")[1].split("\n")[0], (
        "a file written then unreadable must not fall out of the report: %s"
        % report)
    print("   -> over-reported rather than lost\n")

    print("-- hardlinked keys are refused, which realpath cannot see --")
    ha = os.path.join(work, "hard_a.md")
    hb = os.path.join(work, "hard_b.md")
    write(ha, "P\nR\n")
    os.link(ha, hb)
    try:
        apply_edits_multi({ha: [("P", "Q", "one name")],
                           hb: [("R", "S", "the other")]}, verbose=False)
        raise AssertionError("hardlinked keys were accepted")
    except ValueError:
        pass
    assert _read(ha) == "P\nR\n", "the document was split in two"
    print("   -> refused before either name was written\n")

    print("-- an already-applied file is named UNCHANGED, not omitted --")
    ua = os.path.join(work, "unchanged_a.md")
    ub = os.path.join(work, "unchanged_b.md")
    write(ua, "AA\n")                  # already in its intended state
    write(ub, "B\n")

    def _clobber_b(path, edits, dry_run=False, verbose=True):
        out = _real_apply(path, edits, dry_run=dry_run, verbose=verbose)
        if not dry_run and path == ua:
            write(ub, "clobbered\n")
        return out

    apply_edits = _clobber_b
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            apply_edits_multi({ua: [("A", "AA", "already")],
                               ub: [("B", "BB", "b")]}, verbose=False)
    finally:
        apply_edits = _real_apply
    report = buf.getvalue()
    assert ua in report.split("UNCHANGED:")[1].split("\n")[0], report
    print("   -> every key in the batch appears somewhere\n")

    print("-- Path keys still print which half landed --")
    import pathlib
    za = os.path.join(work, "path_a.md")
    zb = os.path.join(work, "path_b.md")
    write(za, "A\n")
    write(zb, "B\n")

    def _clobber_z(path, edits, dry_run=False, verbose=True):
        out = _real_apply(path, edits, dry_run=dry_run, verbose=verbose)
        if not dry_run and str(path) == za:
            write(zb, "clobbered\n")
        return out

    apply_edits = _clobber_z
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            apply_edits_multi({pathlib.Path(za): [("A", "AA", "a")],
                               pathlib.Path(zb): [("B", "BB", "b")]},
                              verbose=False)
    finally:
        apply_edits = _real_apply
    report = buf.getvalue()
    assert za in report, report
    print("   -> no TypeError swallowing the report\n")

    print("-- no temporary files are left behind --")
    leftovers = [f for f in os.listdir(work) if f.startswith(".edit_doc.")]
    assert not leftovers, "left %r" % leftovers
    print("   -> none\n")

    shutil.rmtree(work)
    print("all self-tests passed")
    sys.exit(0)
