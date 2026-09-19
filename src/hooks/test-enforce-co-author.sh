#!/usr/bin/env bash
set -euo pipefail

HOOK="$(cd "$(dirname "$0")" && pwd)/enforce-co-author.js"
PASS=0
FAIL=0

run_test() {
    local desc="$1" input="$2" expected="$3"
    local output
    output=$(CLAUDE_TOOL_INPUT="$input" node "$HOOK" 2>&1) || true

    if echo "$output" | grep -q "\"decision\":\"$expected\"" || \
       echo "$output" | grep -q "\"decision\": \"$expected\""; then
        echo "PASS: $desc"
        PASS=$((PASS + 1))
    elif [ -z "$output" ] && [ "$expected" = "approve" ]; then
        # Empty output with exit(0) means approve (early exit)
        echo "PASS: $desc (silent approve)"
        PASS=$((PASS + 1))
    else
        echo "FAIL: $desc"
        echo "  Expected: $expected"
        echo "  Got: $output"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== enforce-co-author.js tests ==="

# Should approve: not a git commit
run_test "non-commit command approves" \
    '{"command":"git status"}' \
    "approve"

# Should approve: git commit with Co-Authored-By
run_test "commit with trailer approves" \
    '{"command":"git commit -m \"Fix bug\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>\""}' \
    "approve"

# Should block: git commit without Co-Authored-By
run_test "commit without trailer blocks" \
    '{"command":"git commit -m \"Fix bug\""}' \
    "block"

# Should approve: git commit --amend (inherits message)
run_test "amend commit approves" \
    '{"command":"git commit --amend -m \"Fix bug\""}' \
    "approve"

# Should approve: heredoc commit with trailer
run_test "heredoc commit with trailer approves" \
    "git commit -m \"\$(cat <<'EOF'\nFix bug\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>\nEOF\n)\"" \
    "approve"

# Should approve: not using -m flag (e.g. merge commit)
run_test "commit without -m flag approves" \
    '{"command":"git commit --allow-empty"}' \
    "approve"

# Should approve: non-git command containing 'commit' word
run_test "non-git command with commit word approves" \
    '{"command":"echo commit message"}' \
    "approve"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
