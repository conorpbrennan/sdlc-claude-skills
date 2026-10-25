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

# No case, old or new, may read the owner's real config files.
export SDLC_REVIEW_CONFIG_USER="$TMPDIR/no-user.json"
export CLAUDE_CONFIG_DIR="$TMPDIR/claude-config"
export TDD_MANDATE_CONFIG="$TMPDIR/no-mandate.json"

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

# Test 4: steps block. claude-attribution-note honours its step, from the user
# file only (area commit-conventions is a guard). Each row adds a fresh commit
# and runs the hook on it; a note on HEAD afterwards means the hook ran.
# Rows: name|user file JSON ("-" none)|repo file JSON ("-" none)|note expected (yes/no)|stderr needle ("-" none)
STEP_FAIL=0
STEP_N=0
while IFS='|' read -r sname suser srepo swant sneedle; do
    STEP_N=$((STEP_N + 1))
    git commit --allow-empty -m "step row $STEP_N" --quiet
    SUSER="$TMPDIR/user-$STEP_N.json"
    [ "$suser" = "-" ] || printf '%s' "$suser" > "$SUSER"
    rm -rf "$TMPDIR/.claude"
    if [ "$srepo" != "-" ]; then
        mkdir -p "$TMPDIR/.claude"
        printf '%s' "$srepo" > "$TMPDIR/.claude/sdlc-review.json"
    fi
    SERR=$(SDLC_REVIEW_CONFIG_USER="$SUSER" CLAUDE_TOOL_INPUT='{"command":"git commit -m x"}' node "$HOOK" 2>&1 >/dev/null) || true
    SNOTE=$(git notes --ref=claude-attribution show HEAD 2>/dev/null) || SNOTE=""
    got=no
    [ -z "$SNOTE" ] || got=yes
    if [ "$got" != "$swant" ]; then
        STEP_FAIL=1
        echo "  step row '$sname': note expected=$swant got=$got"
    fi
    if [ "$sneedle" = "-" ]; then
        if echo "$SERR" | grep -q "read from the user file only"; then
            STEP_FAIL=1
            echo "  step row '$sname': unexpected warning: $SERR"
        fi
    elif ! echo "$SERR" | grep -q "claude-attribution-note: .*sdlc-review.json: $sneedle is read from the user file only; ignored"; then
        STEP_FAIL=1
        echo "  step row '$sname': stderr lacks the repo file and key: $SERR"
    fi
done <<'TABLE'
default: adds the note|-|-|yes|-
commit-conventions area off in the user file: no note|{"steps":{"commit-conventions":false}}|-|no|-
step off inside an on area: no note|{"steps":{"commit-conventions":{"claude-attribution-note":false}}}|-|no|-
repo file off is ignored: note added and warns|-|{"steps":{"commit-conventions":{"claude-attribution-note":false}}}|yes|steps.commit-conventions.claude-attribution-note
TABLE
rm -rf "$TMPDIR/.claude"
if [ "$STEP_FAIL" -eq 0 ]; then
    echo "PASS: steps block table (default, area off, step off, repo file ignored)"
    PASS=$((PASS + 1))
else
    echo "FAIL: steps block table"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
