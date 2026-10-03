#!/bin/bash
# Tests for pre-commit-feature.js
# Run: bash src/hooks/test-pre-commit-feature.sh
set -e

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-commit-feature.js"
PASS=0
FAIL=0

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

assert_staged() {
    local name="$1" repo="$2" pathspec="$3"
    local staged
    staged=$(git -C "$repo" diff --cached --name-only)
    if echo "$staged" | grep -q -- "$pathspec"; then
        echo "  PASS: $name"; PASS=$((PASS + 1))
    else
        echo "  FAIL: $name"; echo "    Staged: $staged"; FAIL=$((FAIL + 1))
    fi
}

# Run the hook inside $repo with a commit command, returning its stdout.
run_hook() {
    local repo="$1" cmd="${2:-git commit -m msg}"
    (cd "$repo" && printf '{"tool_input":{"command":"%s"}}' "$cmd" | node "$HOOK" 2>&1)
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

write_stub() {
    local repo="$1" slug="$2" requirement="$3"
    mkdir -p "$(dirname "$repo/features/$slug.md")"
    cat > "$repo/features/$slug.md" <<EOF
# Stub

**Requirement**: $requirement

**Started**: 2026-05-12
**Last updated**: 2026-05-12
**Branch**: $slug

## Files involved

<!-- populated on commit -->

## History

<!-- populated on commit -->
EOF
}

echo "=== pre-commit-feature.js tests ==="

# --- Pass-through cases ----------------------------------------------------
echo ""
echo "Pass-through"
out=$(printf '{"tool_input":{"command":"git status"}}' | node "$HOOK" 2>&1)
assert_contains "non-commit -> approve" "$out" '"approve"'

out=$(printf '{"tool_input":{"command":"git commit --amend --no-edit"}}' | node "$HOOK" 2>&1)
assert_contains "amend -> approve" "$out" '"approve"'

# --- Blocklisted branch with source files ----------------------------------
echo ""
echo "Source commit on main is blocked"
REPO1=$(seed_repo)
echo "print('x')" > "$REPO1/widget.py"
git -C "$REPO1" add widget.py
out=$(run_hook "$REPO1")
assert_contains "main + source -> block" "$out" '"block"'
assert_contains "block names the branch" "$out" 'main'
assert_contains "block suggests checkout -b" "$out" 'checkout -b'

# --- Docs-only commit on main is allowed -----------------------------------
echo ""
echo "Docs-only commit on main is allowed"
REPO2=$(seed_repo)
echo "docs" > "$REPO2/NOTES.md"
git -C "$REPO2" add NOTES.md
out=$(run_hook "$REPO2")
assert_contains "main + docs only -> approve" "$out" '"approve"'

# --- Feature-file-only commit is allowed (catch-up commit) ------------------
echo ""
echo "Feature-file-only commit is allowed"
REPO3=$(seed_repo)
write_stub "$REPO3" "catch-up" "Real requirement"
git -C "$REPO3" add features/catch-up.md
out=$(run_hook "$REPO3")
assert_contains "features-only on main -> approve" "$out" '"approve"'

# --- Opt-out marker --------------------------------------------------------
echo ""
echo "Opt-out marker disables the gate"
REPO4=$(seed_repo)
mkdir -p "$REPO4/.claude"
touch "$REPO4/.claude/feature-tracking.disabled"
echo "print('x')" > "$REPO4/widget.py"
git -C "$REPO4" add widget.py
out=$(run_hook "$REPO4")
assert_contains "disabled marker -> approve" "$out" '"approve"'

# --- Feature branch, missing stub ------------------------------------------
echo ""
echo "Feature branch with no stub is blocked and stub is created"
REPO5=$(seed_repo)
git -C "$REPO5" checkout -q -b add-widget
echo "print('x')" > "$REPO5/widget.py"
git -C "$REPO5" add widget.py
out=$(run_hook "$REPO5")
assert_contains "missing stub -> block" "$out" '"block"'
assert_contains "block mentions /sdlc:feature-new" "$out" '/sdlc:feature-new'
assert_file_contains "stub was created" "$REPO5/features/add-widget.md" "Requirement"

# --- Feature branch, TBD requirement ---------------------------------------
echo ""
echo "TBD requirement is blocked"
REPO6=$(seed_repo)
git -C "$REPO6" checkout -q -b add-parser
write_stub "$REPO6" "add-parser" "_TBD — Claude should capture this from the user at session start_"
echo "print('x')" > "$REPO6/parser.py"
git -C "$REPO6" add parser.py
out=$(run_hook "$REPO6")
assert_contains "TBD -> block" "$out" '"block"'
assert_contains "TBD block mentions /sdlc:feature-new" "$out" '/sdlc:feature-new'

# --- Feature branch, real requirement: approve and stage --------------------
echo ""
echo "Real requirement -> approve, feature file staged with file list"
REPO7=$(seed_repo)
git -C "$REPO7" checkout -q -b add-loader
write_stub "$REPO7" "add-loader" "Load things from disk"
echo "print('x')" > "$REPO7/loader.py"
git -C "$REPO7" add loader.py
out=$(run_hook "$REPO7")
assert_contains "real requirement -> approve" "$out" '"approve"'
assert_staged "feature file staged into this commit" "$REPO7" "features/add-loader.md"
assert_file_contains "file list updated" "$REPO7/features/add-loader.md" "loader.py"
# Only the History placeholder should survive — Files involved is now populated.
placeholders=$(grep -c "populated on commit" "$REPO7/features/add-loader.md")
if [ "$placeholders" -eq 1 ]; then
    echo "  PASS: Files involved placeholder replaced, History placeholder kept"
    PASS=$((PASS + 1))
else
    echo "  FAIL: expected 1 placeholder, found $placeholders"; FAIL=$((FAIL + 1))
fi
assert_not_contains "no double blank line after heading" \
    "$(sed -n '/## Files involved/,/^- /p' "$REPO7/features/add-loader.md" | tr '\n' '|')" \
    "involved||||"

# --- Worktree branches are exempt ------------------------------------------
echo ""
echo "Worktree branches are exempt"
REPO8=$(seed_repo)
git -C "$REPO8" checkout -q -b worktree-bridge-abc123
echo "print('x')" > "$REPO8/w.py"
git -C "$REPO8" add w.py
out=$(run_hook "$REPO8")
assert_contains "worktree branch -> approve" "$out" '"approve"'

# --- Explicit pathspec: gate still applies, staging skipped -----------------
echo ""
echo "Explicit pathspec skips staging but still gates"
REPO9=$(seed_repo)
echo "print('x')" > "$REPO9/p.py"
git -C "$REPO9" add p.py
out=$(run_hook "$REPO9" "git commit -m msg -- p.py")
assert_contains "pathspec on main still blocks" "$out" '"block"'

# --- Index unreliable at hook time -----------------------------------------
echo ""
echo "Staging in the same command as the commit is blocked"
REPO10=$(seed_repo)
git -C "$REPO10" checkout -q -b some-feature
echo "print('x')" > "$REPO10/p.py"
out=$(run_hook "$REPO10" "git add p.py && git commit -m msg")
assert_contains "git add && git commit -> block" "$out" '"block"'
assert_contains "block names git add" "$out" 'git add'
out=$(run_hook "$REPO10" "git commit -a -m msg")
assert_contains "git commit -a -> block" "$out" '"block"'
out=$(run_hook "$REPO10" "git checkout main && git commit -m msg")
assert_contains "git checkout main && git commit -> block" "$out" '"block"'
out=$(run_hook "$REPO10" "git commit -m msg")
assert_contains "plain commit with nothing staged -> approve" "$out" '"approve"'

# --- Unreadable index fails closed ------------------------------------------
echo ""
echo "Unreadable index fails closed"
REPO11=$(seed_repo)
echo "print('x')" > "$REPO11/u.py"
git -C "$REPO11" add u.py
SHIM_DIR=$(mktemp -d)
track "$SHIM_DIR"
REAL_GIT=$(command -v git)
cat > "$SHIM_DIR/git" <<EOF
#!/bin/bash
for a in "\$@"; do
  if [ "\$a" = "diff" ]; then echo "fatal: simulated index read failure" >&2; exit 128; fi
done
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$SHIM_DIR/git"
out=$(cd "$REPO11" && printf '{"tool_input":{"command":"git commit -m msg"}}' | PATH="$SHIM_DIR:$PATH" node "$HOOK" 2>&1)
assert_contains "unreadable index -> block" "$out" '"block"'
assert_contains "block says the list could not be read" "$out" 'could not read'
assert_contains "unreadable index logged as block-index-unreadable" "$(tail -1 "$TIMING_LOG")" 'block-index-unreadable'

# --- Repo and branch reads fail closed --------------------------------------
echo ""
echo "Repo and branch reads fail closed"
REPO12=$(seed_repo)
echo "print('x')" > "$REPO12/b.py"
git -C "$REPO12" add b.py
out=$(cd "$REPO12" && printf '{"tool_input":{"command":"git commit -m msg"}}' | GIT_DIR="/nonexistent/git-dir-$$" node "$HOOK" 2>&1)
assert_contains "bad GIT_DIR -> block" "$out" '"block"'
assert_contains "bad GIT_DIR names the repo" "$out" 'could not locate'
SHIM12=$(mktemp -d)
track "$SHIM12"
cat > "$SHIM12/git" <<EOF
#!/bin/bash
for a in "\$@"; do
  if [ "\$a" = "HEAD" ]; then echo "fatal: simulated branch read failure" >&2; exit 128; fi
done
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$SHIM12/git"
out=$(cd "$REPO12" && printf '{"tool_input":{"command":"git commit -m msg"}}' | PATH="$SHIM12:$PATH" node "$HOOK" 2>&1)
assert_contains "unreadable branch -> block" "$out" '"block"'
assert_contains "unreadable branch names the branch" "$out" 'branch name'
NOREPO=$(mktemp -d)
track "$NOREPO"
out=$(cd "$NOREPO" && printf '{"tool_input":{"command":"git commit -m msg"}}' | node "$HOOK" 2>&1)
assert_contains "genuine non-repo -> approve" "$out" '"approve"'

# --- Branch names never reach a shell ---------------------------------------
echo ""
echo "Branch names never reach a shell"
REPO13=$(mktemp -d)
track "$REPO13"
git init -q "$REPO13"
git -C "$REPO13" config user.email t@t.t
git -C "$REPO13" config user.name t
echo "readme" > "$REPO13/README.md"
git -C "$REPO13" add README.md
git -C "$REPO13" commit -q -m init
EVIL='feat-$(touch${IFS}PWNED)'
git -C "$REPO13" checkout -q -b "$EVIL"
mkdir -p "$REPO13/features"
printf '# Evil\n\n**Requirement**: A real requirement sentence for the injection test.\n\n## Files involved\n\n## History\n' > "$REPO13/features/$EVIL.md"
echo "print('x')" > "$REPO13/e.py"
git -C "$REPO13" add e.py
out=$(run_hook "$REPO13")
assert_contains "crafted branch name -> approve (feature file present)" "$out" '"approve"'
if [ -e "$REPO13/PWNED" ]; then
    echo "  FAIL: branch name executed shell code"; FAIL=$((FAIL + 1))
else
    echo "  PASS: branch name did not execute shell code"; PASS=$((PASS + 1))
fi
assert_staged "feature file with crafted name is staged" "$REPO13" 'features/feat-'

# --- Unborn HEAD (first commit of a new repository) -------------------------
echo ""
echo "Unborn HEAD is a readable branch"
REPO14=$(mktemp -d)
track "$REPO14"
git init -q "$REPO14"
git -C "$REPO14" checkout -q -b add-widget
mkdir -p "$REPO14/features"
printf '# Add Widget\n\n**Requirement**: Ship the widget on the first commit of a new repo.\n\n## Files involved\n\n## History\n' > "$REPO14/features/add-widget.md"
echo "print('w')" > "$REPO14/w.py"
git -C "$REPO14" add w.py
out=$(run_hook "$REPO14")
assert_contains "first commit on a feature branch -> approve" "$out" '"approve"'
assert_staged "feature file staged on unborn HEAD" "$REPO14" 'features/add-widget.md'

# --- cd before the commit ---------------------------------------------------
echo ""
echo "cd before the commit"
REPO15=$(seed_repo)
echo "print('x')" > "$REPO15/c.py"
git -C "$REPO15" add c.py
OTHER15=$(mktemp -d)
track "$OTHER15"
out=$(run_hook "$REPO15" "cd $OTHER15 && git commit -m msg")
assert_contains "cd out of the repo -> block" "$out" '"block"'
assert_contains "cd block names the repository" "$out" 'leaves the repository'

# --- --amend is gated like any commit ---------------------------------------
echo ""
echo "--amend is gated"
REPO16=$(seed_repo)
echo "print('x')" > "$REPO16/a.py"
git -C "$REPO16" add a.py
out=$(run_hook "$REPO16" "git commit --amend --no-edit")
assert_contains "amend with staged source on main -> block" "$out" '"block"'

# --- Timing log ------------------------------------------------------------
echo ""
echo "Timing log"
assert_contains "logged feature.pre_commit events" "$(cat "$TIMING_LOG")" "feature.pre_commit"

# --- Staging the record is the hook's whole job ----------------------------
# If `git add` of the record fails, the record does not ship with the commit.
# Approving there makes the gate advisory, which is the one thing it is not.
echo ""
echo "Stage failure blocks the commit"
REPO18=$(seed_repo)
git -C "$REPO18" checkout -q -b stage-fail
write_stub "$REPO18" stage-fail "a real requirement, not a stub"
echo "print('x')" > "$REPO18/c.py"
git -C "$REPO18" add c.py
SHIM18=$(mktemp -d)
track "$SHIM18"
REAL_GIT="${REAL_GIT:-$(command -v git)}"
cat > "$SHIM18/git" <<EOF
#!/bin/bash
for a in "\$@"; do
  if [ "\$a" = "add" ]; then echo "fatal: simulated stage failure" >&2; exit 128; fi
done
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$SHIM18/git"
out=$(cd "$REPO18" && printf '{"tool_input":{"command":"git commit -m msg"}}' \
    | PATH="$SHIM18:$PATH" node "$HOOK" 2>&1)
assert_contains "stage failure -> block" "$out" '"decision":"block"'
assert_contains "stage failure names the record" "$out" "could not be staged"
assert_contains "stage failure reports git's own error" \
    "$out" "simulated stage failure"

# --- An ignored record blocks, and the message carries a way out -----------
# `git add` of an ignored path exits 1 every time, so a message that offered
# only "retry" would send the user round in a circle forever. The hook does
# not try to tell this case from a stale lock; it names both.
echo ""
echo "Ignored feature record blocks, and the block names the opt-out"
REPO17=$(seed_repo)
git -C "$REPO17" checkout -q -b ignored-record
write_stub "$REPO17" ignored-record "a real requirement, not a stub"
echo "features/" > "$REPO17/.gitignore"
git -C "$REPO17" add .gitignore
echo "print('x')" > "$REPO17/z.py"
git -C "$REPO17" add z.py
out=$(run_hook "$REPO17")
assert_contains "ignored record -> block" "$out" '"decision":"block"'
assert_contains "ignored record names the opt-out" "$out" "feature-tracking.disabled"
assert_contains "ignored record names the record" "$out" "features/ignored-record.md"
out2=$(run_hook "$REPO17")
assert_contains "and it is the same on the retry" "$out2" '"decision":"block"'

# Same rule, but the record is already tracked: `git add` still refuses it,
# because the ignore rule is directory-level. This is the case that made
# classifying the failure not worth its cost -- the two `check-ignore` forms
# disagree here -- so the assertion is on the message, which does not have to
# know.
REPO19=$(seed_repo)
git -C "$REPO19" checkout -q -b tracked-ignored
write_stub "$REPO19" tracked-ignored "a real requirement, not a stub"
git -C "$REPO19" add -f "features/tracked-ignored.md"
echo "features/" > "$REPO19/.gitignore"
git -C "$REPO19" add .gitignore
echo "print('x')" > "$REPO19/z.py"
git -C "$REPO19" add z.py
out=$(run_hook "$REPO19")
assert_contains "tracked ignored record -> block" "$out" '"decision":"block"'
assert_contains "tracked ignored record names the opt-out" \
    "$out" "feature-tracking.disabled"
assert_contains "tracked ignored record names the record" \
    "$out" "features/tracked-ignored.md"

# --- A locked index is a locked index --------------------------------------
# This is the case the message used to get wrong: it asserted the record was
# ignored, and offered disabling the gate, when the real remedy was one `rm`.
# Git says which it is; the hook has to pass that on.
echo ""
echo "A locked index is reported as a locked index"
REPO20=$(seed_repo)
git -C "$REPO20" checkout -q -b locked-index
write_stub "$REPO20" locked-index "a real requirement, not a stub"
echo "print('x')" > "$REPO20/z.py"
git -C "$REPO20" add z.py
: > "$REPO20/.git/index.lock"
out=$(run_hook "$REPO20")
rm -f "$REPO20/.git/index.lock"
assert_contains "locked index -> block" "$out" '"decision":"block"'
# git's own words, not the hook's generic retry advice, which also says
# "index.lock" and would pass this vacuously.
assert_contains "locked index reports git's own error" "$out" "Unable to create"
assert_not_contains "locked index is not called an ignore rule" \
    "$out" "is ignored by this repository"
out2=$(run_hook "$REPO20")
assert_contains "and the retry succeeds once the lock is gone" "$out2" '"approve"'

echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
