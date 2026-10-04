#!/usr/bin/env bash
# Drop git's repository-locating variables: inherited from a git hook, they
# would aim every git call here at the outer repository (src/test-suite-isolation.js).
unset $(env -i PATH="$PATH" git rev-parse --local-env-vars)
set -euo pipefail

HOOK="$(cd "$(dirname "$0")" && pwd)/claude-attribution-note.js"
PASS=0
FAIL=0

# Create a temporary git repo for testing
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

cd "$TMPDIR"
git init --quiet
git config user.email "test@test.com"
git config user.name "Test"

# Create initial commit
echo "hello" > file.txt
git add file.txt
git commit -m "Initial commit" --quiet

echo "=== claude-attribution-note.js tests ==="

# Test 1: Note is added after git commit
echo "change" >> file.txt
git add file.txt
git commit -m "Test commit" --quiet
CLAUDE_TOOL_INPUT='{"command":"git commit -m \"Test commit\""}' node "$HOOK" 2>&1 || true

NOTE=$(git notes --ref=claude-attribution show HEAD 2>/dev/null) || NOTE=""
if echo "$NOTE" | grep -q "ai-generated: true"; then
    echo "PASS: Note contains ai-generated flag"
    PASS=$((PASS + 1))
else
    echo "FAIL: Note missing ai-generated flag"
    echo "  Got: $NOTE"
    FAIL=$((FAIL + 1))
fi

if echo "$NOTE" | grep -q "tool: claude-code"; then
    echo "PASS: Note contains tool identifier"
    PASS=$((PASS + 1))
else
    echo "FAIL: Note missing tool identifier"
    echo "  Got: $NOTE"
    FAIL=$((FAIL + 1))
fi

if echo "$NOTE" | grep -q "model: claude-opus-4-6"; then
    echo "PASS: Note contains model identifier"
    PASS=$((PASS + 1))
else
    echo "FAIL: Note missing model identifier"
    echo "  Got: $NOTE"
    FAIL=$((FAIL + 1))
fi

if echo "$NOTE" | grep -q "timestamp:"; then
    echo "PASS: Note contains timestamp"
    PASS=$((PASS + 1))
else
    echo "FAIL: Note missing timestamp"
    echo "  Got: $NOTE"
    FAIL=$((FAIL + 1))
fi

# Test 2: Non-commit commands don't add notes
echo "another" >> file.txt
git add file.txt
git commit -m "Another commit" --quiet
CLAUDE_TOOL_INPUT='{"command":"git status"}' node "$HOOK" 2>&1 || true

NOTE2=$(git notes --ref=claude-attribution show HEAD 2>/dev/null) || NOTE2=""
if [ -z "$NOTE2" ]; then
    echo "PASS: No note added for non-commit command"
    PASS=$((PASS + 1))
else
    echo "FAIL: Note was added for non-commit command"
    echo "  Got: $NOTE2"
    FAIL=$((FAIL + 1))
fi

# Test 3: Amend commands don't add notes
CLAUDE_TOOL_INPUT='{"command":"git commit --amend -m \"Amended\""}' node "$HOOK" 2>&1 || true
NOTE3=$(git notes --ref=claude-attribution show HEAD 2>/dev/null) || NOTE3=""
if [ -z "$NOTE3" ]; then
    echo "PASS: No note added for amend command"
    PASS=$((PASS + 1))
else
    echo "FAIL: Note was added for amend command"
    echo "  Got: $NOTE3"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
