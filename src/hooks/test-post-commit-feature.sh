#!/bin/bash
# Tests for post-commit-feature.js
# Run: bash src/hooks/test-post-commit-feature.sh
set -e

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/post-commit-feature.js"
PASS=0
FAIL=0

TIMING_LOG="$(mktemp)"
export TIMING_LOG_PATH="$TIMING_LOG"

# seed_repo is called as $(seed_repo), so anything it assigns dies with the
# subshell. It appends to this file instead, which does not. cleanup ends in
# an unconditional success: under `set -e` a trap that ends on a false test
# exits the script with 1 whatever the tests reported.
TEMP_LIST="$(mktemp)"

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

track() { echo "$1" >> "$TEMP_LIST"; }

assert_contains() {
    local name="$1" output="$2" expected="$3"
    if echo "$output" | grep -q -- "$expected" 2>/dev/null; then
        echo "  PASS: $name"; PASS=$((PASS + 1))
    else
        echo "  FAIL: $name"; echo "    Expected: $expected"; echo "    Got: $output"
        FAIL=$((FAIL + 1))
    fi
}

assert_not_contains() {
    local name="$1" output="$2" unexpected="$3"
    if echo "$output" | grep -q -- "$unexpected" 2>/dev/null; then
        echo "  FAIL: $name"; echo "    Did not expect: $unexpected"; echo "    Got: $output"
        FAIL=$((FAIL + 1))
    else
        echo "  PASS: $name"; PASS=$((PASS + 1))
    fi
}

assert_file_contains() {
    local name="$1" file="$2" expected="$3"
    if [ ! -f "$file" ]; then
        echo "  FAIL: $name (file missing: $file)"; FAIL=$((FAIL + 1))
        return
    fi
    if grep -q -- "$expected" "$file" 2>/dev/null; then
        echo "  PASS: $name"; PASS=$((PASS + 1))
    else
        echo "  FAIL: $name"; echo "    In $file, expected: $expected"
        echo "    Got:"; sed 's/^/      /' "$file"
        FAIL=$((FAIL + 1))
    fi
}

assert_absent() {
    local name="$1" path="$2"
    if [ -e "$path" ]; then
        echo "  FAIL: $name"; echo "    Should not exist: $path"
        FAIL=$((FAIL + 1))
    else
        echo "  PASS: $name"; PASS=$((PASS + 1))
    fi
}

seed_repo() {
    local repo
    repo=$(mktemp -d)
    track "$repo"
    git init -q "$repo"
    git -C "$repo" config user.email t@t.t
    git -C "$repo" config user.name t
    git -C "$repo" checkout -q -b main 2>/dev/null || true
    echo "readme" > "$repo/README.md"
    git -C "$repo" add README.md
    git -C "$repo" commit -q -m "init"
    echo "$repo"
}

seed_feature_branch() {
    local repo="$1" slug="$2" requirement="$3"
    git -C "$repo" checkout -q -b "$slug"
    mkdir -p "$repo/features"
    cat > "$repo/features/$slug.md" <<EOF
# $(echo "$slug" | tr '-' ' ')

**Requirement**: $requirement

**Started**: 2026-05-12
**Last updated**: 2026-05-12
**Branch**: $slug

## Files involved

<!-- populated on commit -->

## History

<!-- populated on commit -->
EOF
    git -C "$repo" add "features/$slug.md"
    git -C "$repo" commit -q -m "seed stub" || true
}

echo "=== post-commit-feature.js tests ==="

# --- Non-commit command ---
echo ""
echo "Non-commit commands"
out=$(CLAUDE_TOOL_INPUT='git status' node "$HOOK" 2>&1)
assert_not_contains "git status -> no stderr message" "$out" "\[feature\]"

# --- Amend ---
echo ""
echo "Amend skipped"
out=$(CLAUDE_TOOL_INPUT='git commit --amend' node "$HOOK" 2>&1)
assert_not_contains "amend -> no stderr" "$out" "\[feature\]"

# --- Feature branch with stub, source file committed ---
echo ""
echo "Feature branch with stub -> append"
REPO1=$(seed_repo)
seed_feature_branch "$REPO1" "add-widget" "Ship widget feature"
echo "print('x')" > "$REPO1/widget.py"
git -C "$REPO1" add widget.py
git -C "$REPO1" commit -q -m "add widget skeleton"

out=$(cd "$REPO1" && CLAUDE_TOOL_INPUT='git commit -m "add widget skeleton"' node "$HOOK" 2>&1)
assert_contains "append message on stderr" "$out" "features/add-widget.md updated"
assert_file_contains "stub lists widget.py" "$REPO1/features/add-widget.md" "widget.py"
assert_file_contains "stub has history entry" "$REPO1/features/add-widget.md" "add widget skeleton"

# Verify the stub was staged for next commit
staged=$(git -C "$REPO1" diff --cached --name-only)
if echo "$staged" | grep -q "features/add-widget.md"; then
    echo "  PASS: stub staged for next commit"; PASS=$((PASS + 1))
else
    echo "  FAIL: stub not staged"; echo "    Staged: $staged"; FAIL=$((FAIL + 1))
fi

# --- A commit MESSAGE that mentions --amend is still a commit ---
echo ""
echo "Message mentioning --amend still appends"
REPO_MSG=$(seed_repo)
seed_feature_branch "$REPO_MSG" "gate-amend" "Gate amend like any commit"
echo "print('y')" > "$REPO_MSG/gate.py"
git -C "$REPO_MSG" add gate.py
git -C "$REPO_MSG" commit -q -m "Gate --amend like any other commit"
out=$(cd "$REPO_MSG" && CLAUDE_TOOL_INPUT='git commit -m "Gate --amend like any other commit"' node "$HOOK" 2>&1)
assert_contains "append despite --amend in the message" "$out" "features/gate-amend.md updated"
assert_file_contains "history entry recorded" "$REPO_MSG/features/gate-amend.md" "Gate --amend like any other commit"

# --- Shapes the pre-commit hooks refuse still record once committed ---
echo ""
echo "Unreliable-shaped commands that did commit still append"
REPO_A=$(seed_repo)
seed_feature_branch "$REPO_A" "all-flag" "Record commit -a"
echo "print('a')" > "$REPO_A/a.py"
git -C "$REPO_A" add a.py
git -C "$REPO_A" commit -q -m "add a"
out=$(cd "$REPO_A" && CLAUDE_TOOL_INPUT='git commit -a -m "add a"' node "$HOOK" 2>&1)
assert_contains "commit -a -> append" "$out" "features/all-flag.md updated"
REPO_B=$(seed_repo)
seed_feature_branch "$REPO_B" "add-and-commit" "Record add && commit"
echo "print('b')" > "$REPO_B/b.py"
git -C "$REPO_B" add b.py
git -C "$REPO_B" commit -q -m "add b"
out=$(cd "$REPO_B" && CLAUDE_TOOL_INPUT='git add -A && git commit -m "add b"' node "$HOOK" 2>&1)
assert_contains "add && commit -> append" "$out" "features/add-and-commit.md updated"

# --- Idempotent re-run ---
echo ""
echo "Idempotent"
before=$(cat "$REPO1/features/add-widget.md")
out=$(cd "$REPO1" && CLAUDE_TOOL_INPUT='git commit -m "add widget skeleton"' node "$HOOK" 2>&1)
after=$(cat "$REPO1/features/add-widget.md")
# File list should be stable (already sorted/deduped). History gets another entry but with same sha/subject — acceptable duplication for v1.
if echo "$after" | grep -c "widget.py" | grep -q "^[1-3]$"; then
    echo "  PASS: widget.py not duplicated excessively"; PASS=$((PASS + 1))
else
    echo "  FAIL: widget.py count unexpected"; FAIL=$((FAIL + 1))
fi

# --- Feature branch without stub -> skip-no-stub ---
echo ""
echo "Feature branch without stub -> skip"
REPO2=$(seed_repo)
git -C "$REPO2" checkout -q -b orphan-feature
echo "print('y')" > "$REPO2/a.py"
git -C "$REPO2" add a.py
git -C "$REPO2" commit -q -m "add a.py"

out=$(cd "$REPO2" && CLAUDE_TOOL_INPUT='git commit -m "add a.py"' node "$HOOK" 2>&1)
assert_contains "skip-no-stub message" "$out" "No features/orphan-feature.md stub found"

if [ ! -f "$REPO2/features/orphan-feature.md" ]; then
    echo "  PASS: post-commit does NOT create stub"; PASS=$((PASS + 1))
else
    echo "  FAIL: stub was created by post-commit"; FAIL=$((FAIL + 1))
fi

# --- Non-source-file commit (README only) ---
echo ""
echo "Non-source file commit"
REPO3=$(seed_repo)
seed_feature_branch "$REPO3" "docs-only" "Update docs"
echo "more" >> "$REPO3/README.md"
git -C "$REPO3" add README.md
git -C "$REPO3" commit -q -m "tweak readme"

out=$(cd "$REPO3" && CLAUDE_TOOL_INPUT='git commit -m "tweak readme"' node "$HOOK" 2>&1)
assert_not_contains "readme-only -> skipped" "$out" "updated"

# --- Features-only commit (loop guard) ---
echo ""
echo "Features-only commit (loop guard)"
REPO4=$(seed_repo)
seed_feature_branch "$REPO4" "loop-test" "Avoid recursion"
echo "extra content" >> "$REPO4/features/loop-test.md"
git -C "$REPO4" add features/loop-test.md
git -C "$REPO4" commit -q -m "update loop-test stub"

out=$(cd "$REPO4" && CLAUDE_TOOL_INPUT='git commit -m "update loop-test stub"' node "$HOOK" 2>&1)
assert_not_contains "features-only commit -> no update" "$out" "updated"

# --- Opt-out ---
echo ""
echo "Opt-out"
REPO5=$(seed_repo)
seed_feature_branch "$REPO5" "ignored-feature" "should-be-ignored"
mkdir -p "$REPO5/.claude"
touch "$REPO5/.claude/feature-tracking.disabled"
echo "print('z')" > "$REPO5/z.py"
git -C "$REPO5" add z.py
git -C "$REPO5" commit -q -m "add z"

out=$(cd "$REPO5" && CLAUDE_TOOL_INPUT='git commit -m "add z"' node "$HOOK" 2>&1)
assert_not_contains "opt-out -> no update" "$out" "updated"

# --- On main branch with substantive commit -> uses subject slug ---
echo ""
echo "Main branch with subject-slug fallback"
REPO6=$(seed_repo)
echo "print('q')" > "$REPO6/q.py"
git -C "$REPO6" add q.py
git -C "$REPO6" commit -q -m "implement q lookup service"

# No stub pre-exists, so we should see skip-no-stub with the derived slug
out=$(cd "$REPO6" && CLAUDE_TOOL_INPUT='git commit -m "implement q lookup service"' node "$HOOK" 2>&1)
assert_contains "subject-slug fallback" "$out" "implement-q-lookup-service"

# --- Merge commit skipped ---
echo ""
echo "Merge commit"
REPO7=$(seed_repo)
seed_feature_branch "$REPO7" "merge-test" "Test merge"
echo "print('a')" > "$REPO7/a.py"
git -C "$REPO7" add a.py
git -C "$REPO7" commit -q -m "a"
git -C "$REPO7" checkout -q main
echo "print('b')" > "$REPO7/b.py"
git -C "$REPO7" add b.py
git -C "$REPO7" commit -q -m "b"
git -C "$REPO7" merge --no-ff -q -m "merge merge-test" merge-test || true

out=$(cd "$REPO7" && CLAUDE_TOOL_INPUT='git commit -m "merge merge-test"' node "$HOOK" 2>&1)
assert_not_contains "merge -> skipped" "$out" "updated"

# --- Branch name is data, never shell -------------------------------------
# git accepts `$`, backticks and parentheses in a ref name, and the branch is
# the slug. Any git call built as a shell string therefore executes it.
echo ""
echo "Metacharacter branch name"
INJ_BRANCH='feat$(touch${IFS}INJECTED)'
REPO8=$(seed_repo)
seed_feature_branch "$REPO8" "$INJ_BRANCH" "a real requirement, not a stub"
echo "print('x')" > "$REPO8/a.py"
git -C "$REPO8" add a.py "features/$INJ_BRANCH.md"
git -C "$REPO8" commit -q -m "add a"

out=$(cd "$REPO8" && CLAUDE_TOOL_INPUT='git commit -m "add a"' node "$HOOK" 2>&1)
assert_absent "branch name is not executed by a shell" "$REPO8/INJECTED"
assert_contains "record is staged despite metacharacters" \
    "$(git -C "$REPO8" diff --cached --name-only)" "features/"
assert_contains "reports the update" "$out" "updated"

# --- Staging can fail, and the hook must not claim it did not --------------
# The record is rewritten before it is staged, so an add that fails leaves the
# file updated and unstaged. Reporting "staged for next commit" there is how a
# record silently stops shipping.
echo ""
echo "Stage failure is reported, not claimed as success"
REPO9=$(seed_repo)
seed_feature_branch "$REPO9" "stage-fail-post" "a real requirement, not a stub"
echo "print('x')" > "$REPO9/a.py"
git -C "$REPO9" add a.py "features/stage-fail-post.md"
git -C "$REPO9" commit -q -m "add a"
SHIM9=$(mktemp -d)
track "$SHIM9"
REAL_GIT="${REAL_GIT:-$(command -v git)}"
cat > "$SHIM9/git" <<EOF
#!/bin/bash
for a in "\$@"; do
  if [ "\$a" = "add" ]; then echo "fatal: simulated stage failure" >&2; exit 128; fi
done
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$SHIM9/git"
out=$(cd "$REPO9" && CLAUDE_TOOL_INPUT='git commit -m "add a"' \
    PATH="$SHIM9:$PATH" node "$HOOK" 2>&1)
assert_contains "stage failure is reported" "$out" "NOT staged"
assert_contains "stage failure reports git's own error" \
    "$out" "simulated stage failure"
assert_not_contains "stage failure does not claim success" "$out" "staged for next commit"
assert_not_contains "and nothing is staged" \
    "$(git -C "$REPO9" diff --cached --name-only)" "features/"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
