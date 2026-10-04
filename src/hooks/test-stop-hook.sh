#!/bin/bash
# Tests for stop-review-trigger.js
# Run from the project root: bash .claude/hooks/test-stop-hook.sh
# Drop git's repository-locating variables: inherited from a git hook, they
# would aim every git call here at the outer repository (src/test-suite-isolation.js).
unset $(env -i PATH="$PATH" git rev-parse --local-env-vars)

set -e

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/stop-review-trigger.js"
PASS=0
FAIL=0
# The markers are per repository and per worktree (lib/review-markers.js), so the
# fixtures live in the temp repo this suite creates -- set below, once TEMP_REPO
# exists. They used to be $HOME/.claude-last-review and
# $HOME/.claude-review-in-progress, which meant this suite backed up, deleted and
# restored the user's real review state on every run, and that state was shared
# with every other repository on the machine.
MARKER_FILE=""
LOCK_FILE=""

save_state() { return 0; }
restore_state() { return 0; }

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

# One fixture repo for the whole suite, created before the first assertion because
# the marker fixtures now live inside it -- see the note at the top of this file.
TEMP_REPO=$(mktemp -d)
git init "$TEMP_REPO" > /dev/null 2>&1
echo "readme" > "$TEMP_REPO/README.md"
git -C "$TEMP_REPO" add README.md > /dev/null 2>&1
git -C "$TEMP_REPO" -c core.hooksPath=/dev/null commit -m init > /dev/null 2>&1
# The session gate's own names, distinct from the commit gate's marker and lock.
# Sharing them would mean a BLOCK record written by the commit gate approves a
# session end, since this gate approved on freshness alone.
MARKER_FILE="$TEMP_REPO/.git/.claude-last-session-review"
LOCK_FILE="$TEMP_REPO/.git/.claude-post-review-in-progress"
trap 'rm -rf "$TEMP_REPO"' EXIT

# --- Gate 1: Lock file circuit breaker ---
echo "Gate 1: Lock file circuit breaker"

rm -f "$MARKER_FILE" "$LOCK_FILE"
touch "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
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

# Freshness alone is not evidence of a pass. A marker also records failures, and
# approving on presence let a recorded BLOCK end the session as if reviewed.
printf 'BLOCK\n%s\nreview-required: Code review required before commit' "deadbeef" > "$MARKER_FILE"
rm -f "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_block "Fresh marker with a BLOCK body -> block" "$output"

printf 'PASS\n%s\nnone\ncode-reviewer:round1:PASS' "deadbeef" > "$MARKER_FILE"
rm -f "$LOCK_FILE"
output=$(cd "$TEMP_REPO" && node "$HOOK" 2>/dev/null)
assert_approve "Fresh marker with a PASS body -> approve" "$output"

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
