"""Tests for check_size.py. Run: python3 skills/plan-spec/test_check_size.py"""
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "check_size.py")
FIX = os.path.join(HERE, "fixtures")


def run(path):
    p = subprocess.run([sys.executable, SCRIPT, path], capture_output=True, text=True)
    return p.returncode, p.stdout


def run_text(text):
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "plan.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return run(path)


def block(heading, body_lines):
    """A step block of exactly 1 + body_lines lines, ending in a blank-free tail."""
    return heading + "\n" + "".join("body\n" for _ in range(body_lines))


class FixtureTests(unittest.TestCase):
    def test_under_cap(self):
        code, out = run(os.path.join(FIX, "size-under.md"))
        self.assertEqual(code, 0, out)
        for word in ("bytes", "steps", "lines"):
            self.assertIn(word, out)

    def test_over_bytes(self):
        code, out = run(os.path.join(FIX, "size-over-bytes.md"))
        self.assertEqual(code, 1, out)
        self.assertEqual(len(out.strip().splitlines()), 1, out)
        self.assertIn("40000", out)

    def test_over_steps(self):
        code, out = run(os.path.join(FIX, "size-over-steps.md"))
        self.assertEqual(code, 1, out)
        self.assertEqual(len(out.strip().splitlines()), 1, out)
        self.assertIn("15", out)

    def test_over_lines(self):
        code, out = run(os.path.join(FIX, "size-over-lines.md"))
        self.assertEqual(code, 1, out)
        self.assertEqual(len(out.strip().splitlines()), 1, out)
        self.assertIn("S2", out)


class CountingTests(unittest.TestCase):
    def test_suffixed_ids_count_once_each(self):
        text = "".join(block(f"## {i}", 2) for i in ("S10a", "78b", "B0a", "S10"))
        code, out = run_text(text)
        self.assertEqual(code, 0, out)
        self.assertIn("4 steps", out)

    def test_fifteen_ok_sixteen_breach(self):
        ok = "".join(block(f"## S{i}", 1) for i in range(15))
        self.assertEqual(run_text(ok)[0], 0)
        bad = ok + block("## S15", 1)
        self.assertEqual(run_text(bad)[0], 1)

    def test_heading_forms(self):
        for fmt in ("## S5. T", "### S5. T", "#### S5: T", "**S5**", "**S5. T**",
                    "## Step S5", "### 5. T"):
            code, out = run_text("# Plan\n\n" + block(fmt, 1))
            self.assertIn("1 steps", out, fmt)

    def test_mixed_forms_each_counted(self):
        text = block("## S1", 1) + block("### S2", 1) + block("**S3**", 1)
        self.assertIn("3 steps", run_text(text)[1])

    def test_non_step_headings_not_counted(self):
        text = "# Plan\n## Working constraints\n## Steps\n" + block("## S1", 1)
        self.assertIn("1 steps", run_text(text)[1])

    def test_subheading_stays_in_block(self):
        # A deeper heading inside a step does not end it.
        text = "## S1\n" + "a\n" * 40 + "### Notes\n" + "b\n" * 45 + "## S2\nx\n"
        code, out = run_text(text)
        self.assertEqual(code, 1, out)
        self.assertIn("S1", out)

    def test_steps_in_code_fence_ignored(self):
        text = "```\n" + "".join(block(f"## S{i}", 1) for i in range(20)) + "```\n"
        self.assertEqual(run_text(text)[0], 0)

    def test_line_cap_boundary(self):
        self.assertEqual(run_text(block("## S1", 79))[0], 0)  # 80 lines
        self.assertEqual(run_text(block("## S1", 80))[0], 1)  # 81 lines

    def test_byte_cap_boundary(self):
        base = block("## S1", 1)
        pad = 40000 - len(base.encode())
        self.assertEqual(run_text(base + "x" * pad)[0], 0)
        self.assertEqual(run_text(base + "x" * (pad + 1))[0], 1)

    def test_bytes_not_characters(self):
        # 14000 three-byte characters = 42000 bytes but 14000 characters.
        self.assertEqual(run_text("## S1\n" + "€" * 14000)[0], 1)

    def test_missing_file(self):
        code, _ = run("/nonexistent/plan.md")
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
