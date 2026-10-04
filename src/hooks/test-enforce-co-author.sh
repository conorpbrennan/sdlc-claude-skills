#!/usr/bin/env bash
set -euo pipefail

HOOK="$(cd "$(dirname "$0")" && pwd)/enforce-co-author.js"
PASS=0
FAIL=0

# `input` is the tool_input object as JSON. The hook reads the PreToolUse
# payload from stdin and takes `tool_input.command`, so the harness wraps it
# as Claude Code does and pipes it in. A payload that is not valid JSON fails
# the case outright: the hook would read it as no command and approve, which
# passes every "approves" case for the wrong reason.
run_test() {
    local desc="$1" input="$2" expected="$3" cwd="${4:-.}"
    local payload output
    payload="{\"tool_input\":$input}"
    if ! printf '%s' "$payload" | node -e 'JSON.parse(require("fs").readFileSync(0, "utf-8"))' 2>/dev/null; then
        echo "FAIL: $desc"
        echo "  Payload is not valid JSON: $payload"
        FAIL=$((FAIL + 1))
        return
    fi
    output=$(cd "$cwd" && printf '%s' "$payload" | node "$HOOK" 2>&1) || true

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

# Should block: --amend with -m replaces the message, so nothing is inherited.
run_test "amend with a new message and no trailer blocks" \
    '{"command":"git commit --amend -m \"Fix bug\""}' \
    "block"

# Should approve: --amend --no-edit keeps the message it amends
run_test "amend without a new message approves" \
    '{"command":"git commit --amend --no-edit"}' \
    "approve"

# Should approve: heredoc commit with trailer
run_test "heredoc commit with trailer approves" \
    '{"command":"git commit -m \"$(cat <<'"'"'EOF'"'"'\nFix bug\n\nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>\nEOF\n)\""}' \
    "approve"

# Should approve: not using -m flag (e.g. merge commit)
run_test "commit without -m flag approves" \
    '{"command":"git commit --allow-empty"}' \
    "approve"

# Should approve: non-git command containing 'commit' word
run_test "non-git command with commit word approves" \
    '{"command":"echo commit message"}' \
    "approve"

# --- Message files ----------------------------------------------------------
# The message is read from the file, wherever it lives. The paths below hold
# no "-m": the old substring check passed any such -F commit unread.
MSG_DIR="$(mktemp -d)"
trap 'rm -rf "$MSG_DIR"' EXIT
printf 'Fix bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n' > "$MSG_DIR/with.txt"
printf 'Fix bug\n' > "$MSG_DIR/without.txt"
cmd_json() { node -e 'console.log(JSON.stringify({command: process.argv[1]}))' "$1"; }

run_test "-F file with the trailer approves" "$(cmd_json "git commit -F $MSG_DIR/with.txt")" "approve"
run_test "-F file without the trailer blocks" "$(cmd_json "git commit -F $MSG_DIR/without.txt")" "block"
run_test "--file= without the trailer blocks" "$(cmd_json "git commit --file=$MSG_DIR/without.txt")" "block"
run_test "-F of a missing file blocks" "$(cmd_json "git commit -F $MSG_DIR/missing.txt")" "block"
run_test "-F without it, --trailer with it, approves" \
    "$(cmd_json "git commit -F $MSG_DIR/without.txt --trailer 'Co-Authored-By: Claude <noreply@anthropic.com>'")" "approve"
run_test "--trailer of another key does not count" \
    "$(cmd_json "git commit -F $MSG_DIR/without.txt --trailer 'Signed-off-by: x <x@y>'")" "block"

# --- Other message shapes ----------------------------------------------------
run_test "a second -m carrying the trailer approves" \
    "$(cmd_json "git commit -m 'Fix bug' -m 'Co-Authored-By: Claude <noreply@anthropic.com>'")" "approve"
run_test "the trailer named mid-line does not count" \
    "$(cmd_json "git commit -m 'Fix bug, add Co-Authored-By: later'")" "block"
run_test "-F - from a heredoc with the trailer approves" \
    "$(cmd_json "git commit -F - <<'EOF'
Fix bug

Co-Authored-By: Claude <noreply@anthropic.com>
EOF")" "approve"
run_test "-F - from a heredoc without the trailer blocks" \
    "$(cmd_json "git commit -F - <<'EOF'
Fix bug
EOF")" "block"
run_test "-C reuses a message and approves" "$(cmd_json "git commit -C HEAD")" "approve"

# --- Abbreviated long options --------------------------------------------------
# git takes any unique prefix: --mess is --message, --fil is --file.
run_test "--mess= without the trailer blocks" "$(cmd_json "git commit --mess=hello")" "block"
run_test "--fil= without the trailer blocks" "$(cmd_json "git commit --fil=$MSG_DIR/without.txt")" "block"
run_test "--fil= with the trailer approves" "$(cmd_json "git commit --fil=$MSG_DIR/with.txt")" "approve"

# --- The message git actually uses ---------------------------------------------
# git reads only the last -F, and --no-message / --no-file drop what came
# before. Checking every value named let a discarded one carry the trailer.
run_test "a later -F without the trailer blocks" \
    "$(cmd_json "git commit -F $MSG_DIR/with.txt -F $MSG_DIR/without.txt")" "block"
run_test "a later -F with the trailer approves" \
    "$(cmd_json "git commit -F $MSG_DIR/without.txt -F $MSG_DIR/with.txt")" "approve"
run_test "--no-message drops an earlier -m carrying the trailer" \
    "$(cmd_json "git commit -m 'Co-Authored-By: Claude <noreply@anthropic.com>' --no-message -m bad")" "block"
run_test "--no-file drops an earlier -F carrying the trailer" \
    "$(cmd_json "git commit -F $MSG_DIR/with.txt --no-file -m bad")" "block"
run_test "--no-mes, a prefix of --no-message, drops it too" \
    "$(cmd_json "git commit -m 'Co-Authored-By: Claude <noreply@anthropic.com>' --no-mes -m bad")" "block"

# --- The message file must exist before the command runs ----------------------
# The hook reads the file when it runs, before any earlier part of the command
# can write it, so a file written in the same command is refused either way.
run_test "a message file overwritten in the same command blocks" \
    "$(cmd_json "printf 'bad' > $MSG_DIR/with.txt && git commit -F $MSG_DIR/with.txt")" "block"
run_test "a message file written by a heredoc in the same command blocks" \
    "$(cmd_json "cat > $MSG_DIR/new.txt <<'EOF'
Fix bug

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
git commit -F $MSG_DIR/new.txt")" "block"
run_test "a \$-valued -F path blocks" "$(cmd_json 'git commit -F "$MSG_FILE"')" "block"
# The write may name the file by another path; its name is what they share.
run_test "a message file written under its bare name after a cd blocks" \
    "$(cmd_json "cd $MSG_DIR && printf 'bad' > with.txt && git commit -F $MSG_DIR/with.txt")" "block"
# A name counts as a whole word only: the t in "git" and "commit" is not t.
printf 'Fix bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n' > "$MSG_DIR/t"
run_test "a short -F name inside other words approves" "$(cmd_json "git commit -F t")" "approve" "$MSG_DIR"
run_test "a name attached to -F still counts as named" \
    "$(cmd_json "printf 'bad' > with.txt && git commit -Fwith.txt")" "block" "$MSG_DIR"
run_test "a name attached to a -sF cluster still counts as named" \
    "$(cmd_json "printf 'bad' > with.txt && git commit '-sFwith.txt'")" "block" "$MSG_DIR"

# --- Relative -F paths -----------------------------------------------------------
run_test "a relative -F path is read from the working directory" \
    "$(cmd_json "git commit -F with.txt")" "approve" "$MSG_DIR"
run_test "a relative -F path without the trailer blocks" \
    "$(cmd_json "git commit -F without.txt")" "block" "$MSG_DIR"
run_test "a relative -F path after a cd blocks" \
    "$(cmd_json "cd sub && git commit -F with.txt")" "block" "$MSG_DIR"
# git -C runs git from another directory, so it reads a relative -F there.
run_test "a relative -F path under git -C blocks" \
    "$(cmd_json "git -C sub commit -F with.txt")" "block" "$MSG_DIR"
run_test "an absolute -F path under git -C is read" \
    "$(cmd_json "git -C sub commit -F $MSG_DIR/with.txt")" "approve" "$MSG_DIR"

# --- Only a message the hook can read is approved -------------------------------
# A process substitution is a file only bash knows.
run_test "-F <( ) blocks" "$(cmd_json "git commit -F <(cat $MSG_DIR/without.txt)")" "block"
run_test "-F<( ) attached blocks" "$(cmd_json "git commit -F<(cat $MSG_DIR/without.txt)")" "block"
run_test "-F <( ) blocks even when it would carry the trailer" \
    "$(cmd_json "git commit -F <(cat $MSG_DIR/with.txt)")" "block"
# git reads stdin from the last redirection of fd 0, so a heredoc counts only
# when it is the one stdin source.
run_test "a second heredoc on -F - blocks" \
    "$(cmd_json "git commit -F - <<'A' <<'B'
Co-Authored-By: Claude <noreply@anthropic.com>
A
bad
B")" "block"
run_test "a heredoc and a < file on -F - blocks" \
    "$(cmd_json "git commit -F - <<'A' < $MSG_DIR/without.txt
Co-Authored-By: Claude <noreply@anthropic.com>
A")" "block"
run_test "a heredoc and a 0< file on -F /dev/stdin blocks" \
    "$(cmd_json "git commit -F /dev/stdin <<'A' 0<$MSG_DIR/without.txt
Co-Authored-By: Claude <noreply@anthropic.com>
A")" "block"
run_test "a heredoc with an output redirection approves" \
    "$(cmd_json "git commit -F - <<'A' 2>/dev/null
Fix bug

Co-Authored-By: Claude <noreply@anthropic.com>
A")" "approve"
# A piped message cannot be read; a trailer elsewhere in the command is not it.
run_test "a piped -F - blocks" "$(cmd_json "cat $MSG_DIR/with.txt | git commit -F -")" "block"
run_test "a piped -F - with a trailer elsewhere in the command blocks" \
    "$(cmd_json "cat $MSG_DIR/without.txt | git commit -F -
: <<'X'
Co-Authored-By: Claude <noreply@anthropic.com>
X")" "block"

# --- Values only the shell knows -------------------------------------------------
run_test "-m \"\$MSG\" with no trailer in the command blocks" "$(cmd_json 'git commit -m "$MSG"')" "block"
run_test "-F /dev/stdin from a heredoc with the trailer approves" \
    "$(cmd_json "git commit -F /dev/stdin <<'EOF'
Fix bug

Co-Authored-By: Claude <noreply@anthropic.com>
EOF")" "approve"

# --- What counts as the trailer --------------------------------------------------
# git reads an indented line as a continuation, not a trailer.
run_test "an indented Co-Authored-By line blocks" \
    "$(cmd_json "git commit -m 'Fix bug

   Co-Authored-By: Claude <noreply@anthropic.com>'")" "block"
run_test "a commit text inside an echo approves" "$(cmd_json "echo 'git commit -m x'")" "approve"

# --- A crash blocks ----------------------------------------------------------
# The hook now loads the commit-command parser. A broken copy of it (a partial
# install) must block: a hook that dies silently reads as "proceed".
HOOK_COPY="$(mktemp -d)"
trap 'rm -rf "$MSG_DIR" "$HOOK_COPY"' EXIT
mkdir -p "$HOOK_COPY/lib"
cp "$HOOK" "$HOOK_COPY/"
printf 'this is not javascript (' > "$HOOK_COPY/lib/commit-command.js"
REAL_HOOK="$HOOK"
HOOK="$HOOK_COPY/enforce-co-author.js"
run_test "a broken lib blocks rather than passing silently" '{"command":"git commit -m \"x\""}' "block"
HOOK="$REAL_HOOK"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
