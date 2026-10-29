"""Tests for check_size.py. Run: python3 skills/plan-spec/test_check_size.py"""
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_size as cs  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "check_size.py")
FIX = os.path.join(HERE, "fixtures")


def run(path, tier=None):
    cmd = [sys.executable, SCRIPT] + (["--tier", tier] if tier else []) + [path]
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout


def run_text(text, tier=None):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "plan.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return run(path, tier)


def block(heading, body_lines):
    """A step block of exactly 1 + body_lines lines, ending in a blank-free tail."""
    return heading + "\n" + "".join("body\n" for _ in range(body_lines))


class FixtureTests(unittest.TestCase):
    def test_under_cap(self):
        code, out = run(os.path.join(FIX, "size-under.md"))
        self.assertEqual(code, 0, out)
        for word in ("bytes", "steps", "lines"):
            self.assertIn(word, out)

    def test_byte_budgets_are_advisory(self):
        # Formerly blocking fixtures: now NOTE lines and exit 0.
        for name, word in (("note-plan-budget.md", "plan"), ("note-step-budget.md", "step S2")):
            code, out = run(os.path.join(FIX, name))
            self.assertEqual(code, 0, out)
            notes = [l for l in out.splitlines() if l.startswith("NOTE:")]
            self.assertEqual(len(notes), 1, out)
            self.assertIn(word, notes[0])
        self.assertIn(str(cs.STEP_BUDGET_BYTES), out)

    def test_over_steps(self):
        for name in ("size-over-steps.md", "steps-eleven.md"):
            code, out = run(os.path.join(FIX, name))
            self.assertEqual(code, 1, name + out)
            self.assertEqual(len(out.strip().splitlines()), 1, out)
            self.assertTrue(out.startswith("OVER:"), out)
            self.assertIn(str(cs.MAX_STEPS), out)
        ok = "".join(block("## S%d" % i, 1) for i in range(cs.MAX_STEPS))
        self.assertEqual(run_text(ok)[0], 0)

    def test_pointer_breach(self):
        code, out = run(os.path.join(FIX, "pointer-breach.md"))
        self.assertEqual(code, 1, out)
        self.assertEqual(len(out.strip().splitlines()), 1, out)
        self.assertTrue(out.startswith("BREACH:"), out)
        self.assertIn("line 4", out)
        for path in ("plans/x.md", "docs/plans/x.md", "see docs/plans/a-b.md."):
            self.assertEqual(run_text("# P\nRead %s now\n" % path)[0], 1, path)
            landed = "# P\nASSUMES LANDED: %s\n" % path
            self.assertEqual(run_text(landed)[0], 0, path)
        for ok in ("plans/x.txt", "myplans/x.md", "src/plan.md"):
            self.assertEqual(run_text("# P\nRead %s now\n" % ok)[0], 0, ok)

    def test_tier_t0(self):
        self.assertEqual(run(os.path.join(FIX, "t0-clean.md"), "t0")[0], 0)
        code, out = run(os.path.join(FIX, "t0-extra-section.md"), "t0")
        self.assertEqual(code, 1, out)
        self.assertTrue(out.startswith("BREACH:"), out)
        self.assertIn("line 26", out)
        # The same file is fine as T1, which is the default tier.
        self.assertEqual(run(os.path.join(FIX, "t0-extra-section.md"))[0], 0)
        self.assertEqual(run(os.path.join(FIX, "t0-clean.md"), "t1")[0], 0)
        for n in cs.T0_SECTIONS:
            self.assertEqual(run_text("# P\n\n## %d. Title\n" % n, "t0")[0], 0)
        self.assertEqual(run_text("# P\n\n## Notes\n", "t0")[0], 1)
        self.assertEqual(run_text("# P\n\n```\n## 3. Title\n```\n", "t0")[0], 0)
        self.assertEqual(run("/nonexistent/plan.md", "t0")[0], 2)


class LineCapTests(unittest.TestCase):
    def test_line_cap(self):
        code, out = run(os.path.join(FIX, "line-over.md"))
        self.assertEqual(code, 1, out)
        self.assertEqual(len(out.strip().splitlines()), 1, out)
        self.assertTrue(out.startswith("OVER:"), out)
        self.assertIn("line 4", out)
        self.assertIn(str(cs.MAX_LINE_CHARS), out)
        at = "x" * cs.MAX_LINE_CHARS
        over = "x" * (cs.MAX_LINE_CHARS + 1)
        self.assertEqual(run_text("# P\n" + at + "\n")[0], 0)
        self.assertEqual(run_text("# P\n" + over + "\n")[0], 1)
        # Characters, not bytes.
        self.assertEqual(run_text("# P\n" + "\u20ac" * cs.MAX_LINE_CHARS + "\n")[0], 0)

    def test_exemptions(self):
        over = "x" * (cs.MAX_LINE_CHARS + 40)
        table = "| " + over + " |"
        cases = {
            "table": "# P\n" + table + "\n",
            "backtick fence": "# P\n```\n" + over + "\n```\n",
            "tilde fence": "# P\n~~~\n" + over + "\n~~~\n",
            "unterminated": "# P\n```\n" + over + "\n",
            "unterminated tilde": "# P\n~~~\n" + over + "\n",
            "info string": "# P\n```python\n" + over + "\n```\n",
        }
        for name, text in cases.items():
            self.assertEqual(run_text(text)[0], 0, name)
        # A fence closes only on its own marker; prose after it is checked.
        mixed = "# P\n~~~\n```\n~~~\n" + over + "\n"
        code, out = run_text(mixed)
        self.assertEqual(code, 1, out)
        self.assertIn("line 5", out)
        after = "# P\n```\n" + over + "\n```\n" + over + "\n"
        self.assertIn("line 5", run_text(after)[1])


class CountingTests(unittest.TestCase):
    def test_suffixed_ids_count_once_each(self):
        text = "".join(block(f"## {i}", 2) for i in ("S10a", "78b", "B0a", "S10"))
        code, out = run_text(text)
        self.assertEqual(code, 0, out)
        self.assertIn("4 steps", out)

    def test_heading_forms(self):
        for fmt in ("## S5. T", "### S5. T", "#### S5: T", "**S5**", "**S5. T**",
                    "## Step S5", "## Step 5. T", "**5. T**"):
            code, out = run_text("# Plan\n\n" + block(fmt, 1))
            self.assertIn("1 steps", out, fmt)

    def test_mixed_forms_each_counted(self):
        text = block("## S1", 1) + block("### S2", 1) + block("**S3**", 1)
        self.assertIn("3 steps", run_text(text)[1])

    def test_non_step_headings_not_counted(self):
        text = "# Plan\n## Working constraints\n## Steps\n" + block("## S1", 1)
        self.assertIn("1 steps", run_text(text)[1])
        # A `## N.` section heading is not a step; its bold steps are.
        text = ("# Plan\n## 1. What this delivers\n### 2. Sub\n## 5. Steps\n"
                + block("**1. A**", 1) + block("**2. B**", 1))
        self.assertIn("2 steps", run_text(text)[1])
        # Without the period it is still a step (existing plans use `## 78`).
        self.assertIn("1 steps", run_text(block("## 78", 1))[1])

    def test_steps_in_code_fence_ignored(self):
        text = "```\n" + "".join(block(f"## S{i}", 1) for i in range(20)) + "```\n"
        self.assertEqual(run_text(text)[0], 0)

    def test_missing_file(self):
        code, _ = run("/nonexistent/plan.md")
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
