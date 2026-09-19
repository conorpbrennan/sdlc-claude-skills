#!/bin/bash
# Tests for session-start-feature.js
# Run: bash src/hooks/test-session-start-feature.sh
set -e

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/session-start-feature.js"
PASS=0
FAIL=0

# Route timing log to a scratch file so these tests don't pollute the real one.
TIMING_LOG="$(mktemp)"
export TIMING_LOG_PATH="$TIMING_LOG"

# seed_repo is called as $(seed_repo), so anything it assigns dies with the
# subshell. Everything to remove is appended to this file instead, which does
# not. cleanup ends in an unconditional success: under `set -e` a trap that
# ends on a false test exits the script with 1 whatever the tests reported.
TEMP_LIST="$(mktemp)"
track() { echo "$1" >> "$TEMP_LIST"; }

cleanup() {
    rm -f "$TIMING_LOG"
    if [ -s "$TEMP_LIST" ]; then
        while read -r d; do
            [ -n "$d" ] && rm -rf "$d"
        done < "$TEMP_LIST"
    fi
    rm -f "$TEMP_LIST"
    return 0
}
trap cleanup EXIT

assert_contains() {
    local name="$1" output="$2" expected="$3"
    if echo "$output" | grep -q -- "$expected" 2>/dev/null; then
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name"
        echo "    Expected to contain: $expected"
        echo "    Got: $output"
        FAIL=$((FAIL + 1))
    fi
}

assert_not_contains() {
    local name="$1" output="$2" unexpected="$3"
    if echo "$output" | grep -q -- "$unexpected" 2>/dev/null; then
        echo "  FAIL: $name"
        echo "    Did not expect: $unexpected"
        echo "    Got: $output"
        FAIL=$((FAIL + 1))
    else
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    fi
}

assert_file_exists() {
    local name="$1" file="$2"
    if [ -f "$file" ]; then
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name"
        echo "    Expected file to exist: $file"
        FAIL=$((FAIL + 1))
    fi
}

assert_file_missing() {
    local name="$1" file="$2"
    if [ ! -e "$file" ]; then
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name"
        echo "    Expected file to NOT exist: $file"
        FAIL=$((FAIL + 1))
    fi
}

seed_repo() {
    # Create a new git repo with an initial commit so HEAD is valid.
    local repo
    repo=$(mktemp -d)
    track "$repo"
    git init -q "$repo"
    git -C "$repo" config user.email t@t.t
    git -C "$repo" config user.name t
    # Git on Windows defaults init.defaultBranch differently per machine — pin it.
    git -C "$repo" checkout -q -b main 2>/dev/null || true
    echo "readme" > "$repo/README.md"
    git -C "$repo" add README.md
    git -C "$repo" commit -q -m "init"
    echo "$repo"
}

echo "=== session-start-feature.js tests ==="

# run_hook REPO — cd into repo, feed empty stdin. Matches how Claude Code
# invokes the hook (process inherits cwd from the session).
run_hook() {
    local repo="$1"
    (cd "$repo" && node "$HOOK" < /dev/null 2>/dev/null)
}

# --- Non-git directory ---
echo ""
echo "Non-git directory"
NON_GIT=$(mktemp -d)
track "$NON_GIT"
out=$(run_hook "$NON_GIT")
assert_not_contains "non-git -> no additionalContext" "$out" "additionalContext"

# --- On main branch ---
echo ""
echo "On main branch"
REPO1=$(seed_repo)
out=$(run_hook "$REPO1")
assert_contains "main branch -> unfeatured nudge" "$out" "Feature tracking records context per feature branch"
assert_file_missing "main branch -> no stub created" "$REPO1/features/main.md"

# --- On feature branch, no stub ---
echo ""
echo "Feature branch without stub"
REPO2=$(seed_repo)
git -C "$REPO2" checkout -q -b add-user-auth
out=$(run_hook "$REPO2")
assert_contains "feature branch -> stub-created message" "$out" "A feature stub has been created"
assert_contains "message contains slug" "$out" "add-user-auth"
assert_contains "message tells Claude to ask user" "$out" "ask the user"
assert_file_exists "feature stub file written" "$REPO2/features/add-user-auth.md"
assert_contains "stub has TBD requirement" "$(cat "$REPO2/features/add-user-auth.md")" "_TBD"
assert_contains "stub has branch name" "$(cat "$REPO2/features/add-user-auth.md")" "Branch\*\*: add-user-auth"

# --- Feature branch, stub already exists with TBD ---
echo ""
echo "Existing stub with TBD"
out=$(run_hook "$REPO2")
assert_contains "existing-tbd -> nudges for requirement" "$out" "still"
assert_contains "existing-tbd -> suggests /feature-new" "$out" "/feature-new add-user-auth"

# --- Feature branch, stub filled ---
echo ""
echo "Existing stub with requirement"
sed -i 's/_TBD.*/Ship auth screens and session handling/' "$REPO2/features/add-user-auth.md"
out=$(run_hook "$REPO2")
assert_contains "existing -> context available message" "$out" "Feature context available"
assert_not_contains "existing -> no TBD nudge" "$out" "still"

# --- Opt-out file ---
echo ""
echo "Opt-out"
REPO3=$(seed_repo)
git -C "$REPO3" checkout -q -b some-feature
mkdir -p "$REPO3/.claude"
touch "$REPO3/.claude/feature-tracking.disabled"
out=$(run_hook "$REPO3")
assert_not_contains "disabled -> no additionalContext" "$out" "additionalContext"
assert_file_missing "disabled -> no stub created" "$REPO3/features/some-feature.md"

# --- Blocklist branches ---
echo ""
echo "Blocklist branches"
for branch in develop trunk; do
    REPO=$(seed_repo)
    git -C "$REPO" checkout -q -b "$branch" 2>/dev/null || git -C "$REPO" branch -m "$branch"
    out=$(run_hook "$REPO")
    assert_contains "$branch -> unfeatured nudge" "$out" "Feature tracking records"
    assert_file_missing "$branch -> no stub" "$REPO/features/$branch.md"
done

# --- Release branch prefix ---
echo ""
echo "Release branches"
REPO4=$(seed_repo)
git -C "$REPO4" checkout -q -b release/2026.05
out=$(run_hook "$REPO4")
assert_contains "release/* -> unfeatured" "$out" "Feature tracking records"

# --- Branch name with slash (e.g. feature/<slug>) ---
# Regression for the ENOENT bug: branches like "feature/foo" used to fail
# silently because mkdirSync only created "features/" instead of
# "features/feature/", so writeFileSync hit ENOENT.
echo ""
echo "Branch name with slash"
REPO5=$(seed_repo)
git -C "$REPO5" checkout -q -b feature/insurance-loan
out=$(run_hook "$REPO5")
assert_contains "slash branch -> stub-created message" "$out" "A feature stub has been created"
assert_file_exists "slash branch -> stub at nested path" "$REPO5/features/feature/insurance-loan.md"
assert_contains "slash branch -> stub references full branch name" "$(cat "$REPO5/features/feature/insurance-loan.md" 2>/dev/null || echo '')" "feature/insurance-loan"

# --- Subdirectory scanning when cwd is not a git repo ---
# Regression for the not-a-repo bug: when a session starts from a workspace
# root (e.g. ~/Workspace/X) that isn't itself a git repo but contains nested
# repos, the hook used to bail silently. It now scans subdirs up to depth 4.
echo ""
echo "Subdir scanning (cwd is parent of git repo)"
WORKSPACE=$(mktemp -d)
track "$WORKSPACE"
NESTED_REPO="$WORKSPACE/nested/project-x"
mkdir -p "$NESTED_REPO"
git init -q "$NESTED_REPO"
git -C "$NESTED_REPO" config user.email t@t.t
git -C "$NESTED_REPO" config user.name t
git -C "$NESTED_REPO" checkout -q -b main 2>/dev/null || true
echo "readme" > "$NESTED_REPO/README.md"
git -C "$NESTED_REPO" add README.md
git -C "$NESTED_REPO" commit -q -m "init"
git -C "$NESTED_REPO" checkout -q -b add-feature-y
out=$(run_hook "$WORKSPACE")
assert_contains "subdir scan -> stub-created message" "$out" "A feature stub has been created"
assert_contains "subdir scan -> message names branch" "$out" "add-feature-y"
assert_file_exists "subdir scan -> stub written in nested repo" "$NESTED_REPO/features/add-feature-y.md"

# --- Subdir scanning skips noise dirs ---
echo ""
echo "Subdir scanning skips node_modules and dotfiles"
WORKSPACE2=$(mktemp -d)
track "$WORKSPACE2"
# A "fake" git dir buried under node_modules that should be skipped entirely.
mkdir -p "$WORKSPACE2/node_modules/some-package/.git"
mkdir -p "$WORKSPACE2/.cache/buried-repo"
git init -q "$WORKSPACE2/.cache/buried-repo" 2>/dev/null
out=$(run_hook "$WORKSPACE2")
assert_not_contains "node_modules ignored -> no stub message" "$out" "feature stub has been created"
assert_not_contains "dotfile dir ignored -> no stub message" "$out" "buried-repo"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
