#!/usr/bin/env python3
"""Check a plan against the size caps in reference.md section 17.

A plan over a cap is split by phase, each phase its own plan. A longer plan
is not the fix: on 19 Oct 2026, plans of 150-450 KB went 3-5 review rounds
and never converged.

Usage:
    python3 check_size.py <plan>

Exit codes: 0 within all caps (prints the three measurements), 1 over a cap
(prints one line per breach), 2 the plan cannot be read.

Step block: a line that opens a step, to the next step line or the next
heading of the same or a higher level. A step line is a markdown heading
(`##`, `###`, ...) or a bold line (`**S5**`, `**S5. Title**`) whose first
token is a step id, optionally after "Step ". An id is up to two letters, digits
and an optional lowercase suffix: S5, 78, S10a, 78b, B0a. Fenced code blocks
are skipped. A bold step line has no heading level, so any heading ends it.
"""
import re
import sys

MAX_BYTES = 40000
MAX_STEPS = 15
MAX_BLOCK_LINES = 80

_ID = r"[A-Za-z]{0,2}\d+[a-z]?"
_HEADING = re.compile(r"^(#{1,6})[ \t]+(.*)$")
_BOLD = re.compile(r"^[ \t]{0,3}\*\*(.*)$")
_STEP_ID = re.compile(r"^(?:Step[ \t]+)?(" + _ID + r")(?!\w)")
_FENCE = re.compile(r"^[ \t]{0,3}(```|~~~)")
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
        s = _STEP_ID.match(m.group(2).lstrip("*").strip())
        return (s.group(1), len(m.group(1))) if s else None
    m = _BOLD.match(line)
    if m:
        s = _STEP_ID.match(m.group(1))
        return (s.group(1), _BOLD_LEVEL) if s else None
    return None


def step_blocks(text):
    """Split a plan into step blocks.

    Args:
        text: The plan text.

    Returns:
        A list of (step id, line count) in document order. The count includes
        the opening line.
    """
    blocks = []
    cur = None  # [id, level, lines]
    in_fence = False
    for line in text.split("\n"):
        if _FENCE.match(line):
            in_fence = not in_fence
        start = None if in_fence else _step_start(line)
        if start:
            if cur:
                blocks.append((cur[0], cur[2]))
            cur = [start[0], start[1], 1]
            continue
        h = None if in_fence else _HEADING.match(line)
        if cur and h and len(h.group(1)) <= cur[1]:
            blocks.append((cur[0], cur[2]))
            cur = None
        elif cur:
            cur[2] += 1
    if cur:
        blocks.append((cur[0], cur[2]))
    return blocks


def check(data):
    """Measure a plan and list its breaches.

    Args:
        data: The plan as bytes.

    Returns:
        A tuple of (measurements line, list of breach lines).
    """
    text = data.decode("utf-8", errors="replace")
    if text.endswith("\n"):
        text = text[:-1]
    blocks = step_blocks(text)
    longest = max((n for _, n in blocks), default=0)
    summary = "%d bytes, %d steps, longest step block %d lines" % (
        len(data), len(blocks), longest)
    breaches = []
    if len(data) > MAX_BYTES:
        breaches.append("OVER: %d bytes, cap %d" % (len(data), MAX_BYTES))
    if len(blocks) > MAX_STEPS:
        breaches.append("OVER: %d steps, cap %d" % (len(blocks), MAX_STEPS))
    for sid, n in blocks:
        if n > MAX_BLOCK_LINES:
            breaches.append("OVER: step %s is %d lines, cap %d" % (sid, n, MAX_BLOCK_LINES))
    return summary, breaches


def main(argv):
    """Run the check.

    Args:
        argv: Command line arguments, without the program name.

    Returns:
        The exit code.
    """
    if len(argv) != 1:
        print("usage: check_size.py <plan>", file=sys.stderr)
        return 2
    try:
        with open(argv[0], "rb") as f:
            data = f.read()
    except OSError as e:
        print("cannot read %s: %s" % (argv[0], e), file=sys.stderr)
        return 2
    summary, breaches = check(data)
    if breaches:
        print("\n".join(breaches))
        return 1
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
