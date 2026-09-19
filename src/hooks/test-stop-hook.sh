#!/bin/bash
# Tests for stop-review-trigger.js
# Run from the project root: bash .claude/hooks/test-stop-hook.sh

set -e

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/stop-review-trigger.js"
PASS=0
FAIL=0
MARKER_FILE="$HOME/.claude-last-review"
LOCK_FILE="$HOME/.claude-review-in-progress"

# Save and clean state
save_state() {
    if [ -f "$MARKER_FILE" ]; then cp "$MARKER_FILE" "$MARKER_FILE.bak"; fi
    if [ -f "$LOCK_FILE" ]; then cp "$LOCK_FILE" "$LOCK_FILE.bak"; fi
    return 0
}

restore_state() {
    rm -f "$MARKER_FILE" "$LOCK_FILE"
    if [ -f "$MARKER_FILE.bak" ]; then mv "$MARKER_FILE.bak" "$MARKER_FILE"; fi
    if [ -f "$LOCK_FILE.bak" ]; then mv "$LOCK_FILE.bak" "$LOCK_FILE"; fi
    return 0
}

assert_approve() {
    local test_name="$1"
    local output="$2"
    if echo "$output" | grep -q '"decision":\s*"approve"' 2>/dev/null || echo "$output" | grep -q '"decision": "approve"' 2>/dev/null; then
        echo "  PASS: $test_name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $test_name"
        echo "    Expected: approve"
        echo "    Got: $output"
        FAIL=$((FAIL + 1))
    fi
}

assert_block() {
    local test_name="$1"
    local output="$2"
    if echo "$output" | grep -q '"decision":\s*"block"' 2>/dev/null || echo "$output" | grep -q '"decision": "block"' 2>/dev/null; then
        echo "  PASS: $test_name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $test_name"
        echo "    Expected: block"
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

assert_not_contains() {
    local test_name="$1"
    local output="$2"
    local unexpected="$3"
    if echo "$output" | grep -q "$unexpected" 2>/dev/null; then
        echo "  FAIL: $test_name"
        echo "    Did not expect: $unexpected"
        echo "    Got: $output"
        FAIL=$((FAIL + 1))
    else
        echo "  PASS: $test_name"
        PASS=$((PASS + 1))
    fi
}

echo "=== Stop Hook Tests ==="
echo ""

save_state
trap restore_state EXIT

# --- Gate 1: Lock file circuit breaker ---
echo "Gate 1: Lock file circuit breaker"

rm -f "$MARKER_FILE" "$LOCK_FILE"
touch "$LOCK_FILE"
output=$(node "$HOOK" 2>/dev/null)
assert_approve "Fresh lock file -> approve (circuit breaker)" "$output"

rm -f "$LOCK_FILE"

# Stale lock file (>5 min) should NOT trigger circuit breaker
# We can't easily test a 5-min-old file, so we test absence instead
rm -f "$MARKER_FILE" "$LOCK_FILE"

# --- Gate 2: Non-git directory ---
echo ""
echo "Gate 2: Git repo check"

rm -f "$MARKER_FILE" "$LOCK_FILE"
output=$(cd /tmp && node "$HOOK" 2>/dev/null)
assert_approve "Non-git directory -> approve" "$output"

# --- Gate 3: No code changes ---
echo ""
echo "Gate 3: Code file detection"

# Create a temp git repo with no code changes
TEMP_REPO=$(mktemp -d)
git init "$TEMP_REPO" > /dev/null 2>&1
# Create and commit a non-code file so there's a valid HEAD
echo "readme" > "$TEMP_REPO/README.md"
git -C "$TEMP_REPO" add README.md > /dev/null 2>&1
git -C "$TEMP_REPO" commit -m "init" > /dev/null 2>&1

rm -f "$MARKER_FILE" "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_approve "No code changes in clean repo -> approve" "$output"

# Modify only a README (not a code extension)
echo "updated" > "$TEMP_REPO/README.md"
rm -f "$MARKER_FILE" "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_approve "Only README changed -> approve" "$output"

# Modify only .claude/ files
mkdir -p "$TEMP_REPO/.claude"
echo "{}" > "$TEMP_REPO/.claude/settings.json"
git -C "$TEMP_REPO" add .claude/settings.json > /dev/null 2>&1
rm -f "$MARKER_FILE" "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_approve "Only .claude/ files changed -> approve" "$output"

# Add a .py file modification (should trigger block)
echo "print('hello')" > "$TEMP_REPO/main.py"
git -C "$TEMP_REPO" add main.py > /dev/null 2>&1
git -C "$TEMP_REPO" commit -m "add py" > /dev/null 2>&1
echo "print('changed')" > "$TEMP_REPO/main.py"
rm -f "$MARKER_FILE" "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_block "Modified .py file -> block" "$output"

# --- Gate 4: Marker file check ---
echo ""
echo "Gate 4: Marker file (recent review)"

touch "$MARKER_FILE"
rm -f "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_approve "Fresh marker file -> approve" "$output"

# --- Block output format ---
echo ""
echo "Block output format"

rm -f "$MARKER_FILE" "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_block "Block when no marker, no lock, code changes" "$output"
assert_contains "Block includes REVIEW_REQUIRED" "$output" "REVIEW_REQUIRED"
assert_contains "Block includes --context" "$output" "\-\-context"
assert_not_contains "Block does NOT include --fresh" "$output" "\-\-fresh"
assert_contains "Block includes systemMessage" "$output" "systemMessage"

# Verify lock file was created by the block
if [ -f "$LOCK_FILE" ]; then
    echo "  PASS: Lock file created on block"
    PASS=$((PASS + 1))
else
    echo "  FAIL: Lock file NOT created on block"
    FAIL=$((FAIL + 1))
fi

# --- Circuit breaker prevents re-block ---
echo ""
echo "Circuit breaker re-entry prevention"

# Lock file should still be fresh from previous block
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_approve "Immediate re-run after block -> approve (circuit breaker)" "$output"

# Cleanup temp repo
rm -rf "$TEMP_REPO"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
