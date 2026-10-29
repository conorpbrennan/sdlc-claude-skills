"""Check a plan against the caps in reference.md section 17.

A plan over a cap is split by phase, each phase its own plan. A longer plan
is not the fix: on 19 Oct 2026, plans of 150-450 KB went 3-5 review rounds
and never converged.

Usage:
    python3 check_size.py [--tier t0|t1] <plan>

The tier defaults to t1. Exit codes: 0 within all blocking caps (prints the
measurements, then any NOTE lines), 1 over a blocking cap (prints one line
per breach, then any NOTE lines), 2 bad usage or the plan cannot be read.

Blocking, every tier (a breach line starts `OVER:` or `BREACH:`):
    * a line over MAX_LINE_CHARS characters. Table rows (a line beginning
      `|`) and fenced code (``` or ~~~, closed only by its own marker; an
      unterminated fence runs to the end of the file) are exempt.
    * more than MAX_STEPS steps.
    * a pointer to plan text: a path under `plans/` or `docs/plans/` ending
      `.md`, anywhere but a line beginning `ASSUMES LANDED`. Plan text is
      never a pointer target; a cross-plan dependency is stated there.
Blocking, `--tier t0` only:
    * a level-2 heading outside T0_SECTIONS.
Advisory (a line starts `NOTE:`; the exit code is unchanged): a step over
STEP_BUDGET_BYTES, a plan over PLAN_BUDGET_BASE + STEP_BUDGET_BYTES * steps.

Step block: a line that opens a step, to the next step line or the next
heading of the same or a higher level. A step line is a markdown heading
(`##`, `###`, ...) or a bold line (`**S5**`, `**S5. Title**`) whose first
token is a step id, optionally after "Step ". An id is up to two letters, digits
and an optional lowercase suffix: S5, 78, S10a, 78b, B0a. A heading whose id is
bare digits followed by a period (`## 5. Steps`) is a section heading, not a
step; a bold `**5. Title**` or `Step 5.` still opens one. Fenced code blocks
are skipped. A bold step line has no heading level, so any heading ends it.
"""
import re
import sys

MAX_LINE_CHARS = 110  # characters per line, not bytes (D1)
MAX_STEPS = 10
STEP_BUDGET_BYTES = 2500  # advisory
PLAN_BUDGET_BASE = 10000  # advisory; plan budget = base + step budget * steps
# Section numbers a T0 plan may head with `## N.`: 1 what this delivers and
# what it does not, 2 working constraints, 7 definition of done. Step blocks
# are bold (`**1. Title**`) so they need no heading.
T0_SECTIONS = (1, 2, 7)

TIER_T0 = "t0"
TIER_T1 = "t1"
_TIERS = (TIER_T0, TIER_T1)
_TIER_FLAG = "--tier"
_ASSUMES_LANDED = "ASSUMES LANDED"
_PREFIX_OVER = "OVER:"
_PREFIX_BREACH = "BREACH:"
_PREFIX_NOTE = "NOTE:"

_ID = r"[A-Za-z]{0,2}\d+[a-z]?"
_HEADING = re.compile(r"^(#{1,6})[ \t]+(.*)$")
_BOLD = re.compile(r"^[ \t]{0,3}\*\*(.*)$")
_STEP_ID = re.compile(r"^(?:Step[ \t]+)?(" + _ID + r")(?!\w)")
_FENCE = re.compile(r"^[ \t]{0,3}(```|~~~)")
_SECTION_ID = re.compile(r"^\d+\.(?:\s|$)")  # `5. Steps`: a section, not a step
_SECTION_HEADING = re.compile(r"^##[ \t]+(\d+)\.(?:\s|$)")
_POINTER = re.compile(r"(?<![\w-])plans/[\w./-]*\.md\b")  # also matches docs/plans/
_BOLD_LEVEL = 7  # deeper than any heading, so only a heading or step ends it


def _step_start(line):
    """Return (id, level) if the line opens a step block, else None.

    Args:
        line: One line of the plan, without its newline.

    Returns:
        A tuple of the step id and its heading level (7 for a bold line), or
        None.
    """
    m = _HEADING.match(line)
    if m:
        title = m.group(2).lstrip("*").strip()
        if _SECTION_ID.match(title):
            return None
        s = _STEP_ID.match(title)
        return (s.group(1), len(m.group(1))) if s else None
    m = _BOLD.match(line)
    if m:
        s = _STEP_ID.match(m.group(1))
        return (s.group(1), _BOLD_LEVEL) if s else None
    return None


def _fenced(lines):
    """Flag the lines that are inside fenced code or are fence lines.

    A fence closes only on the marker that opened it. An unterminated fence
    runs to the end of the file.

    Args:
        lines: The plan's lines.

    Returns:
        A list of bools, one per line, True when the line is fenced.
    """
    flags = []
    marker = None
    for line in lines:
        m = _FENCE.match(line)
        if marker is None:
            flags.append(bool(m))
            if m:
                marker = m.group(1)
        else:
            flags.append(True)
            if m and m.group(1) == marker:
                marker = None
    return flags


def step_blocks(text):
    """Split a plan into step blocks.

    Args:
        text: The plan text.

    Returns:
        A list of (step id, line count, byte count) in document order. The
        counts include the opening line.
    """
    blocks = []
    cur = None  # [id, level, lines, bytes]
    lines = text.split("\n")
    for line, in_fence in zip(lines, _fenced(lines)):
        start = None if in_fence else _step_start(line)
        if start:
            if cur:
                blocks.append((cur[0], cur[2], cur[3]))
            cur = [start[0], start[1], 1, len(line.encode("utf-8")) + 1]
            continue
        h = None if in_fence else _HEADING.match(line)
        if cur and h and len(h.group(1)) <= cur[1]:
            blocks.append((cur[0], cur[2], cur[3]))
            cur = None
        elif cur:
            cur[2] += 1
            cur[3] += len(line.encode("utf-8")) + 1
    if cur:
        blocks.append((cur[0], cur[2], cur[3]))
    return blocks


def _plan_text(data):
    """Decode a plan and drop one trailing newline.

    Args:
        data: The plan as bytes.

    Returns:
        The plan text.
    """
    text = data.decode("utf-8", errors="replace")
    return text[:-1] if text.endswith("\n") else text


def check(data):
    """Measure a plan and list its blocking breaches (every tier).

    Args:
        data: The plan as bytes.

    Returns:
        A tuple of (measurements line, list of breach lines).
    """
    text = _plan_text(data)
    lines = text.split("\n")
    blocks = step_blocks(text)
    longest = max((n for _, n, _ in blocks), default=0)
    summary = "%d bytes, %d steps, longest step block %d lines" % (
        len(data), len(blocks), longest)
    breaches = []
    if len(blocks) > MAX_STEPS:
        breaches.append("%s %d steps, cap %d" % (_PREFIX_OVER, len(blocks), MAX_STEPS))
    for i, (line, in_fence) in enumerate(zip(lines, _fenced(lines)), 1):
        line = line.rstrip("\r")
        if not in_fence and not line.lstrip().startswith("|") and len(line) > MAX_LINE_CHARS:
            breaches.append("%s line %d is %d characters, cap %d" % (
                _PREFIX_OVER, i, len(line), MAX_LINE_CHARS))
        if not line.startswith(_ASSUMES_LANDED):
            m = _POINTER.search(line)
            if m:
                breaches.append("%s line %d points at plan text %s; state the dependency "
                                "on an %s line" % (_PREFIX_BREACH, i, m.group(0), _ASSUMES_LANDED))
    return summary, breaches


def t0_breaches(data):
    """List the level-2 headings a T0 plan may not carry.

    Args:
        data: The plan as bytes.

    Returns:
        A list of breach lines. A `## N.` heading is allowed when N is in
        T0_SECTIONS. Any other level-2 heading is a breach, except a step
        heading such as `## S1`. Fenced lines are skipped.
    """
    lines = _plan_text(data).split("\n")
    breaches = []
    for i, (line, in_fence) in enumerate(zip(lines, _fenced(lines)), 1):
        if in_fence or not re.match(r"^##[ \t]", line):
            continue
        m = _SECTION_HEADING.match(line)
        if m and int(m.group(1)) in T0_SECTIONS:
            continue
        if not m and _step_start(line):
            continue
        breaches.append("%s line %d heading is outside the T0 sections %s: %s" % (
            _PREFIX_BREACH, i, ", ".join(str(n) for n in T0_SECTIONS), line.strip()))
    return breaches


def budget_notes(data):
    """List the advisory byte-budget overruns.

    Args:
        data: The plan as bytes.

    Returns:
        A list of NOTE lines: one per step over STEP_BUDGET_BYTES, and one
        if the plan is over PLAN_BUDGET_BASE + STEP_BUDGET_BYTES * steps.
    """
    blocks = step_blocks(_plan_text(data))
    notes = []
    for sid, _, size in blocks:
        if size > STEP_BUDGET_BYTES:
            notes.append("%s step %s is %d bytes, budget %d" % (
                _PREFIX_NOTE, sid, size, STEP_BUDGET_BYTES))
    budget = PLAN_BUDGET_BASE + STEP_BUDGET_BYTES * len(blocks)
    if len(data) > budget:
        notes.append("%s plan is %d bytes, budget %d for %d steps" % (
            _PREFIX_NOTE, len(data), budget, len(blocks)))
    return notes


def main(argv):
    """Run the check.

    Args:
        argv: Command line arguments, without the program name:
            `[--tier t0|t1] <plan>`.

    Returns:
        The exit code.
    """
    usage = "usage: check_size.py [--tier t0|t1] <plan>"
    args = list(argv)
    tier = TIER_T1
    if args[:1] == [_TIER_FLAG] and len(args) >= 2:
        tier = args[1]
        args = args[2:]
    if len(args) != 1 or tier not in _TIERS:
        print(usage, file=sys.stderr)
        return 2
    try:
        with open(args[0], "rb") as f:
            data = f.read()
    except OSError as e:
        print("cannot read %s: %s" % (args[0], e), file=sys.stderr)
        return 2
    summary, breaches = check(data)
    if tier == TIER_T0:
        breaches += t0_breaches(data)
    notes = budget_notes(data)
    print("\n".join(breaches + notes if breaches else [summary] + notes))
    return 1 if breaches else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
