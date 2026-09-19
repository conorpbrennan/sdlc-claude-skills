#!/bin/bash
# Tests for post-commit-review.js
# Run from the project root: bash .claude/hooks/test-post-commit-hook.sh

set -e

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/post-commit-review.js"
PASS=0
FAIL=0

assert_empty() {
    local test_name="$1"
    local output="$2"
    if [ -z "$output" ]; then
        echo "  PASS: $test_name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $test_name"
        echo "    Expected: empty output"
        echo "    Got: $output"
        FAIL=$((FAIL + 1))
    fi
}

assert_has_system_message() {
    local test_name="$1"
    local output="$2"
    if echo "$output" | grep -q '"systemMessage"' 2>/dev/null; then
        echo "  PASS: $test_name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $test_name"
        echo "    Expected: JSON with systemMessage"
        echo "    Got: $output"
        FAIL=$((FAIL + 1))
    fi
}

assert_contains() {
    local test_name="$1"
    local output="$2"
    local expected="$3"
    if echo "$output" | grep -q "$expected" 2>/dev/null; then
        echo "  PASS: $test_name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $test_name"
        echo "    Expected to contain: $expected"
        echo "    Got: $output"
        FAIL=$((FAIL + 1))
    fi
}

assert_no_decision() {
    local test_name="$1"
    local output="$2"
    if echo "$output" | grep -q '"decision"' 2>/dev/null; then
        echo "  FAIL: $test_name"
        echo "    Did not expect: decision field (PostToolUse is non-blocking)"
        echo "    Got: $output"
        FAIL=$((FAIL + 1))
    else
        echo "  PASS: $test_name"
        PASS=$((PASS + 1))
    fi
}

echo "=== Post-Commit Hook Tests ==="
echo ""

# --- Non-commit input ---
echo "Non-commit input"

output=$(CLAUDE_TOOL_INPUT='{"command": "git status"}' node "$HOOK" 2>/dev/null)
assert_empty "git status -> no output" "$output"

output=$(CLAUDE_TOOL_INPUT='{"command": "echo hello"}' node "$HOOK" 2>/dev/null)
assert_empty "echo hello -> no output" "$output"

output=$(CLAUDE_TOOL_INPUT='' node "$HOOK" 2>/dev/null)
assert_empty "empty input -> no output" "$output"

# --- Amend ---
echo ""
echo "Amend detection"

output=$(CLAUDE_TOOL_INPUT='{"command": "git commit --amend"}' node "$HOOK" 2>/dev/null)
assert_empty "git commit --amend -> no output" "$output"

output=$(CLAUDE_TOOL_INPUT='{"command": "git commit --amend -m \"fix\""}' node "$HOOK" 2>/dev/null)
assert_empty "git commit --amend -m -> no output" "$output"

# --- Non-git directory ---
echo ""
echo "Non-git directory"

output=$(cd /tmp && CLAUDE_TOOL_INPUT='{"command": "git commit -m \"test\""}' node "$HOOK" 2>/dev/null)
assert_empty "commit in non-git dir -> no output" "$output"

# --- Commit with no code files ---
echo ""
echo "Commit with no code files"

TEMP_REPO=$(mktemp -d)
git init "$TEMP_REPO" > /dev/null 2>&1
echo "readme" > "$TEMP_REPO/README.md"
git -C "$TEMP_REPO" add README.md > /dev/null 2>&1
git -C "$TEMP_REPO" commit -m "init readme" > /dev/null 2>&1

output=$(cd "$TEMP_REPO" && CLAUDE_TOOL_INPUT='{"command": "git commit -m \"init readme\""}' node "$HOOK" 2>/dev/null)
assert_empty "commit with only README -> no output" "$output"

# --- Commit with code files ---
echo ""
echo "Commit with code files"

echo "print('hello')" > "$TEMP_REPO/main.py"
git -C "$TEMP_REPO" add main.py > /dev/null 2>&1
git -C "$TEMP_REPO" commit -m "add python file" > /dev/null 2>&1

output=$(cd "$TEMP_REPO" && CLAUDE_TOOL_INPUT='{"command": "git commit -m \"add python file\""}' node "$HOOK" 2>/dev/null)
assert_has_system_message "commit with .py file -> systemMessage" "$output"
assert_contains "Contains POST_COMMIT_REVIEW" "$output" "POST_COMMIT_REVIEW"
assert_contains "Contains --fresh" "$output" "\-\-fresh"
assert_no_decision "No decision field (PostToolUse)" "$output"
assert_contains "Lists the file" "$output" "main.py"

# --- First commit in repo (no HEAD~1) ---
echo ""
echo "First commit detection"

TEMP_REPO2=$(mktemp -d)
git init "$TEMP_REPO2" > /dev/null 2>&1
echo "fn main() {}" > "$TEMP_REPO2/main.rs"
git -C "$TEMP_REPO2" add main.rs > /dev/null 2>&1
git -C "$TEMP_REPO2" commit -m "first commit" > /dev/null 2>&1

output=$(cd "$TEMP_REPO2" && CLAUDE_TOOL_INPUT='{"command": "git commit -m \"first commit\""}' node "$HOOK" 2>/dev/null)
assert_has_system_message "first commit with code -> systemMessage" "$output"
assert_contains "Lists the file" "$output" "main.rs"

# --- Commit with excluded paths only ---
echo ""
echo "Excluded paths"

TEMP_REPO3=$(mktemp -d)
git init "$TEMP_REPO3" > /dev/null 2>&1
mkdir -p "$TEMP_REPO3/.claude"
echo "{}" > "$TEMP_REPO3/.claude/config.js"
git -C "$TEMP_REPO3" add .claude/config.js > /dev/null 2>&1
git -C "$TEMP_REPO3" commit -m "add claude config" > /dev/null 2>&1

output=$(cd "$TEMP_REPO3" && CLAUDE_TOOL_INPUT='{"command": "git commit -m \"add claude config\""}' node "$HOOK" 2>/dev/null)
assert_empty "commit with only .claude/ files -> no output" "$output"

# --- Mixed commit (code + excluded) ---
echo ""
echo "Mixed commit"

echo "class Foo {}" > "$TEMP_REPO/App.java"
mkdir -p "$TEMP_REPO/.vscode"
echo "{}" > "$TEMP_REPO/.vscode/settings.json"
git -C "$TEMP_REPO" add App.java .vscode/settings.json > /dev/null 2>&1
git -C "$TEMP_REPO" commit -m "add java and vscode" > /dev/null 2>&1

output=$(cd "$TEMP_REPO" && CLAUDE_TOOL_INPUT='{"command": "git commit -m \"add java and vscode\""}' node "$HOOK" 2>/dev/null)
assert_has_system_message "mixed commit -> systemMessage (has code files)" "$output"
assert_contains "Lists the code file" "$output" "App.java"

# Cleanup
rm -rf "$TEMP_REPO" "$TEMP_REPO2" "$TEMP_REPO3"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
