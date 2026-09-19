#!/usr/bin/env bash
# Shell-script integration test for ~/.claude/hooks/lib/tdd-order.js.
#
# Builds synthetic JSONL fixtures under a temp dir and verifies the
# classifier returns the expected status for each scenario:
#   - test_first       (test edited before impl in the session)
#   - code_first       (impl edited before test)
#   - no_tests         (commit has impl, no test in diff)
#   - not_applicable   (commit is doc-only)
#   - missing_path     (transcript_path does not exist)
#
# Run: bash ~/.claude/hooks/test-tdd-order.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/lib/tdd-order.js"
RAW_TMPDIR=$(mktemp -d)
trap 'rm -rf "$RAW_TMPDIR"' EXIT
# On Git-Bash for Windows, Node sees real Windows paths -- convert the
# mktemp path so the JSONL fixtures land somewhere Node can open.
if command -v cygpath >/dev/null 2>&1; then
    TMPDIR=$(cygpath -m "$RAW_TMPDIR")
    LIB=$(cygpath -m "$LIB")
else
    TMPDIR="$RAW_TMPDIR"
fi

PASSED=0
FAILED=0

assert_status() {
    local name="$1"
    local expected="$2"
    local got="$3"
    if [[ "$got" == "$expected" ]]; then
        printf 'PASS  %-32s %s\n' "$name" "$got"
        PASSED=$((PASSED + 1))
    else
        printf 'FAIL  %-32s expected=%s got=%s\n' "$name" "$expected" "$got"
        FAILED=$((FAILED + 1))
    fi
}

run_classify() {
    # $1 = transcript path, $2..$N = staged paths
    local tp="$1"
    shift
    node -e "
const tdd = require('$LIB');
const stagedPaths = process.argv.slice(1);
const r = tdd.classifyTddOrder({stagedPaths, transcriptPath: '$tp'});
process.stdout.write(r.status);
" "$@"
}

write_event() {
    # $1 = jsonl file, $2 = tool name, $3 = file_path, $4 = timestamp
    local f="$1"
    local tool="$2"
    local path="$3"
    local ts="$4"
    node -e "
const fs = require('fs');
const row = {
    type: 'assistant',
    timestamp: '$ts',
    message: { content: [{ type: 'tool_use', name: '$tool', input: { file_path: '$path' } }] }
};
fs.appendFileSync('$f', JSON.stringify(row) + '\n');
"
}

# ---------------------------------------------------------------------------
# Scenario 1: test_first -- test edited before impl
# ---------------------------------------------------------------------------
F1="$TMPDIR/s1.jsonl"
: > "$F1"
write_event "$F1" Write "tests/test_foo.py" "2026-05-13T10:00:00Z"
write_event "$F1" Edit  "src/foo.py"        "2026-05-13T10:05:00Z"
got=$(run_classify "$F1" "tests/test_foo.py" "src/foo.py")
assert_status "test_first"     "test_first"     "$got"

# ---------------------------------------------------------------------------
# Scenario 2: code_first -- impl edited before test
# ---------------------------------------------------------------------------
F2="$TMPDIR/s2.jsonl"
: > "$F2"
write_event "$F2" Edit  "src/foo.py"        "2026-05-13T10:00:00Z"
write_event "$F2" Write "tests/test_foo.py" "2026-05-13T10:05:00Z"
got=$(run_classify "$F2" "tests/test_foo.py" "src/foo.py")
assert_status "code_first"     "code_first"     "$got"

# ---------------------------------------------------------------------------
# Scenario 3: no_tests -- commit has impl, no test in diff
# ---------------------------------------------------------------------------
F3="$TMPDIR/s3.jsonl"
: > "$F3"
write_event "$F3" Edit  "src/foo.py"        "2026-05-13T10:00:00Z"
got=$(run_classify "$F3" "src/foo.py")
assert_status "no_tests"       "no_tests"       "$got"

# ---------------------------------------------------------------------------
# Scenario 4: not_applicable -- commit is exempt-only (markdown)
# ---------------------------------------------------------------------------
F4="$TMPDIR/s4.jsonl"
: > "$F4"
write_event "$F4" Write "README.md"         "2026-05-13T10:00:00Z"
got=$(run_classify "$F4" "README.md")
assert_status "not_applicable" "not_applicable" "$got"

# ---------------------------------------------------------------------------
# Scenario 5: missing transcript_path
# ---------------------------------------------------------------------------
got=$(run_classify "$TMPDIR/does-not-exist.jsonl" "tests/test_foo.py" "src/foo.py")
# When events are empty but commit has both test+impl paths, the analyser
# returns not_applicable (no session evidence at all).
assert_status "missing_path"   "not_applicable" "$got"

# ---------------------------------------------------------------------------
# Scenario 6: absolute Windows-style path matches repo-relative commit path
# ---------------------------------------------------------------------------
F6="$TMPDIR/s6.jsonl"
: > "$F6"
write_event "$F6" Write "C:\\\\Users\\\\dev\\\\proj\\\\tests\\\\test_foo.py" "2026-05-13T10:00:00Z"
write_event "$F6" Edit  "C:\\\\Users\\\\dev\\\\proj\\\\src\\\\foo.py"        "2026-05-13T10:05:00Z"
got=$(run_classify "$F6" "tests/test_foo.py" "src/foo.py")
assert_status "abs_paths_match" "test_first"    "$got"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "passed=$PASSED failed=$FAILED"
[[ $FAILED -eq 0 ]] || exit 1
