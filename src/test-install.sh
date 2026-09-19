#!/bin/bash
# Tests for install.sh and uninstall.sh.
#
# Neither script was covered before, which is how a dead `if` in the skill
# backup path shipped: the guard could never be true, so the `rm -rf` below it
# took a customised user skill with no backup and no warning.
#
# Every test runs against a throwaway CLAUDE_HOME and a throwaway copy of the
# source tree, never the real ~/.claude: install.sh also populates
# $SCRIPT_DIR/.claude/hooks, and uninstall.sh deletes it.
set -uo pipefail
# The same nullglob the scripts under test use, so an unmatched `*.bak.*`
# yields an empty array here rather than the literal pattern -- counting the
# pattern as a match is how the bug this file exists to catch stayed hidden.
shopt -s nullglob

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/test-install.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT

PASSED=0
FAILED=0

assert() {
    local name="$1" actual="$2" expected="$3"
    if [ "$actual" = "$expected" ]; then
        echo "  PASS: $name"
        PASSED=$((PASSED + 1))
    else
        echo "  FAIL: $name"
        echo "    expected: $expected"
        echo "    actual:   $actual"
        FAILED=$((FAILED + 1))
    fi
}

# A fresh copy of the source tree plus an empty CLAUDE_HOME, so each test
# starts from the same place and no test can see another's leftovers.
new_case() {
    local name="$1"
    CASE_DIR="$SANDBOX/$name"
    SRC="$CASE_DIR/src-tree"
    HOME_DIR="$CASE_DIR/claude-home"
    mkdir -p "$SRC" "$HOME_DIR"
    tar -c -C "$REPO_ROOT" --exclude=.git --exclude=tmp --exclude=node_modules . \
        | tar -x -C "$SRC"
}

echo "install.sh / uninstall.sh tests"
echo "==============================="

# Test 1: the backup guard. A user-scope skill that differs from the shipped
# one must be copied aside before install overwrites it.
echo ""
echo "Customised user skill is backed up:"
new_case customised
mkdir -p "$HOME_DIR/skills/plan-spec"
echo '# MY CUSTOMISED plan-spec' > "$HOME_DIR/skills/plan-spec/SKILL.md"
echo 'my notes' > "$HOME_DIR/skills/plan-spec/my-notes.md"
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > "$CASE_DIR/out.txt" 2>&1
assert "install exits 0" "$?" "0"
baks=("$HOME_DIR/backups/plan-spec".bak.*)
assert "a backup was taken" "${#baks[@]}" "1"
if [ "${#baks[@]}" -eq 1 ]; then
    assert "backup holds the user's version" \
        "$(cat "${baks[0]}/SKILL.md")" '# MY CUSTOMISED plan-spec'
    assert "backup keeps the user's extra file" \
        "$(cat "${baks[0]}/my-notes.md")" 'my notes'
fi
assert "install said so" \
    "$(grep -c 'backing up existing plan-spec' "$CASE_DIR/out.txt")" "1"
assert "shipped version is now in place" \
    "$(head -1 "$HOME_DIR/skills/plan-spec/SKILL.md" | cut -c1-3)" "---"
# The assertion this file was missing. Claude Code discovers skills by scanning
# the skills directory, so a backup left in there is loaded as a second skill
# with the same name -- observed in a real session. Nothing that is not a shipped
# skill may appear under skills/.
stray=("$HOME_DIR/skills"/*.bak.*)
assert "no backup left inside skills/" "${#stray[@]}" "0"
assert "backup is under backups/ instead" \
    "$([ -d "$HOME_DIR/backups" ] && echo yes || echo no)" "yes"

# Test 2: an identical skill is not backed up, and a second install does not
# pile up backups of its own output.
echo ""
echo "Unchanged skill is not backed up:"
new_case unchanged
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
baks=("$HOME_DIR/backups/plan-spec".bak.*)
assert "no backup on re-install" "${#baks[@]}" "0"

# Test 2b: every divergence is backed up, not just the first. Guarding on "a
# .bak. already exists" would protect the first customisation and destroy every
# later one -- and a .bak. left by another project installing the same skill
# would disable the protection outright.
echo ""
echo "Second customisation is also backed up:"
new_case recustomise
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
echo 'V1 CUSTOM' > "$HOME_DIR/skills/plan-spec/SKILL.md"
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
echo 'V2 CUSTOM SECOND EDIT' > "$HOME_DIR/skills/plan-spec/SKILL.md"
sleep 1  # distinct `date +%s`, so the assertion reads two names not one
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > "$CASE_DIR/out.txt" 2>&1
baks=("$HOME_DIR/backups/plan-spec".bak.*)
assert "two backups after two customisations" "${#baks[@]}" "2"
assert "V1 survives somewhere" \
    "$(grep -rl 'V1 CUSTOM' "$HOME_DIR" | wc -l)" "1"
assert "V2 survives somewhere" \
    "$(grep -rl 'V2 CUSTOM SECOND EDIT' "$HOME_DIR" | wc -l)" "1"
assert "second install said so" \
    "$(grep -c 'backing up existing plan-spec' "$CASE_DIR/out.txt")" "1"

# Test 2c: a .bak. from another project must not disable the protection.
echo ""
echo "Foreign backup does not disable the guard:"
new_case foreignbak
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
mkdir -p "$HOME_DIR/skills/plan-spec.bak.999999999"
echo 'someone elses backup' > "$HOME_DIR/skills/plan-spec.bak.999999999/SKILL.md"
echo 'MY CUSTOM WORK' > "$HOME_DIR/skills/plan-spec/SKILL.md"
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
assert "our customisation was backed up too" \
    "$(grep -rl 'MY CUSTOM WORK' "$HOME_DIR" | wc -l)" "1"
assert "the foreign backup is untouched" \
    "$(cat "$HOME_DIR/skills/plan-spec.bak.999999999/SKILL.md")" 'someone elses backup'

# Test 3: --dry-run writes nothing, for both scripts.
echo ""
echo "--dry-run writes nothing:"
new_case dryrun
mkdir -p "$HOME_DIR/skills/mine"
echo 'untouched' > "$HOME_DIR/skills/mine/SKILL.md"
before="$(find "$HOME_DIR" | sort | md5sum)"
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" --dry-run > /dev/null 2>&1
assert "install --dry-run leaves the tree identical" \
    "$(find "$HOME_DIR" | sort | md5sum)" "$before"
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
installed="$(find "$HOME_DIR" -type f | sort | xargs md5sum 2>/dev/null | md5sum)"
CLAUDE_HOME="$HOME_DIR" "$SRC/uninstall.sh" --dry-run --yes > /dev/null 2>&1
assert "uninstall --dry-run leaves the tree identical" \
    "$(find "$HOME_DIR" -type f | sort | xargs md5sum 2>/dev/null | md5sum)" "$installed"

# Test 4: the round trip. A user's own CLAUDE.md and their own foreign hook
# must come back byte-for-byte after install then uninstall.
echo ""
echo "install then uninstall restores the user's files:"
new_case roundtrip
printf '# User instructions\n\n## My Own Section\n\nSomething I wrote.\n' > "$HOME_DIR/CLAUDE.md"
md_before="$(md5sum < "$HOME_DIR/CLAUDE.md")"
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
assert "install added our sections" \
    "$(grep -c '^## Auto Code Review Triggers' "$HOME_DIR/CLAUDE.md")" "1"
CLAUDE_HOME="$HOME_DIR" "$SRC/uninstall.sh" --yes > /dev/null 2>&1
assert "CLAUDE.md restored byte-for-byte" "$(md5sum < "$HOME_DIR/CLAUDE.md")" "$md_before"
assert "no hooks left behind" "$(ls "$HOME_DIR/hooks" 2>/dev/null | wc -l)" "0"
assert "no agents left behind" "$(ls "$HOME_DIR/agents" 2>/dev/null | wc -l)" "0"
assert "settings.json has no hooks key" \
    "$(node -e 'const s=require(process.argv[1]);console.log(s.hooks?"yes":"no")' "$HOME_DIR/settings.json")" "no"

# Test 5: the ordering that matters. A settings.json the user hand-edited into
# invalid JSON must stop the uninstall while the hook scripts are still on
# disk, so settings.json points at files that exist and the gates keep gating.
# The other order deletes the scripts first, and a hook command that cannot run
# is a non-blocking error -- the gates would fail open in silence.
echo ""
echo "Unparseable settings.json aborts before anything is deleted:"
new_case badjson
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
hooks_before="$(ls "$HOME_DIR/hooks" | wc -l)"
printf '{\n  "model": "opus",\n}\n' > "$HOME_DIR/settings.json"
CLAUDE_HOME="$HOME_DIR" "$SRC/uninstall.sh" --yes > "$CASE_DIR/out.txt" 2>&1
assert "uninstall exits non-zero" "$([ $? -ne 0 ] && echo yes || echo no)" "yes"
assert "hook scripts still present" "$(ls "$HOME_DIR/hooks" | wc -l)" "$hooks_before"
assert "settings.json untouched" \
    "$(md5sum < "$HOME_DIR/settings.json")" "$(printf '{\n  "model": "opus",\n}\n' | md5sum)"
assert "explains itself without a stack trace" \
    "$(grep -c 'not valid JSON' "$CASE_DIR/out.txt")" "1"
assert "no node stack trace" \
    "$(grep -c 'node:internal' "$CASE_DIR/out.txt")" "0"

# Test 6: install and uninstall must agree on the file list. A file installed
# but never removed leaves litter; one removed but never installed reaches
# outside what this project owns.
echo ""
echo "install and uninstall cover the same files:"
new_case symmetry
CLAUDE_HOME="$HOME_DIR" "$SRC/install.sh" > /dev/null 2>&1
mapfile -t leftover < <(cd "$HOME_DIR" && find . -type f \
    ! -name 'settings.json' ! -name 'CLAUDE.md' \
    ! -name '*.backup.*' ! -name 'hygiene-repos.json' ! -name 'review-policy.json' | sort)
CLAUDE_HOME="$HOME_DIR" "$SRC/uninstall.sh" --yes > /dev/null 2>&1
mapfile -t still < <(cd "$HOME_DIR" && find . -type f \
    ! -name 'settings.json' ! -name 'CLAUDE.md' \
    ! -name '*.backup.*' ! -name 'hygiene-repos.json' ! -name 'review-policy.json' | sort)
assert "install deployed files" "$([ ${#leftover[@]} -gt 0 ] && echo yes || echo no)" "yes"
assert "uninstall removed all of them" "${#still[@]}" "0"

# Test 7: a path with spaces survives both scripts.
echo ""
echo "Path containing spaces:"
new_case spaces
SPACED="$CASE_DIR/claude home with spaces"
mkdir -p "$SPACED"
CLAUDE_HOME="$SPACED" "$SRC/install.sh" > /dev/null 2>&1
assert "install works" "$([ -f "$SPACED/hooks/pre-commit-review.js" ] && echo yes || echo no)" "yes"
CLAUDE_HOME="$SPACED" "$SRC/uninstall.sh" --yes > /dev/null 2>&1
assert "uninstall works" "$([ -d "$SPACED/hooks" ] && echo yes || echo no)" "no"

echo ""
echo "==============================="
echo "Results: $PASSED passed, $FAILED failed"
[ "$FAILED" -gt 0 ] && exit 1
exit 0
