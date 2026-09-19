#!/usr/bin/env bash
set -euo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-commit-hygiene.js"
PASS=0
FAIL=0

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

# ---------------------------------------------------------------------------
# Helper: run the hook with a given config file path, cwd, and command.
# Uses HYGIENE_REPOS_CONFIG env var to override the default config path.
# Pipes JSON to the hook via stdin (matching production behaviour).
# ---------------------------------------------------------------------------
run_hook() {
    local config_file="$1"
    local cwd="$2"
    local command_str="$3"
    local input
    input=$(printf '{"tool_input":{"command":"%s"}}' "$command_str")
    (cd "$cwd" && export HYGIENE_REPOS_CONFIG="$config_file" && printf '%s' "$input" | node "$HOOK" 2>&1) || true
}

check() {
    local desc="$1"
    local output="$2"
    local expected="$3"
    if echo "$output" | grep -q "\"decision\":\"$expected\"" || \
       echo "$output" | grep -q "\"decision\": \"$expected\""; then
        echo "PASS: $desc"
        PASS=$((PASS + 1))
    elif [ -z "$output" ] && [ "$expected" = "approve" ]; then
        echo "PASS: $desc (silent approve)"
        PASS=$((PASS + 1))
    else
        echo "FAIL: $desc"
        echo "  Expected decision: $expected"
        echo "  Got: $output"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== pre-commit-hygiene.js tests ==="

# ---------------------------------------------------------------------------
# Case 1: Repo not opted in -> approve (empty repos map)
# ---------------------------------------------------------------------------
CFG1="$TMPROOT/cfg1.json"
echo '{"version":1,"repos":{}}' > "$CFG1"

REPO1="$TMPROOT/repo1"
git init -q "$REPO1"
printf 'file\n' > "$REPO1/a.txt"
git -C "$REPO1" add a.txt

OUT=$(run_hook "$CFG1" "$REPO1" "git commit -m test")
check "not opted in -> approve" "$OUT" "approve"

# ---------------------------------------------------------------------------
# Case 2: Opted in, all checks pass -> approve and writes marker
# ---------------------------------------------------------------------------
REPO2="$TMPROOT/repo2"
git init -q "$REPO2"
printf 'file\n' > "$REPO2/a.txt"
git -C "$REPO2" add a.txt

# Compute the staged-diff hash for repo2 so we can verify the marker
EXPECTED_HASH=$(git -C "$REPO2" diff --cached -- ':(top,exclude)features/*.md' | git -C "$REPO2" hash-object --stdin)

REPO2_TOPLEVEL="$(git -C "$REPO2" rev-parse --show-toplevel)"
CFG2="$TMPROOT/cfg2.json"
cat > "$CFG2" <<EOF
{
  "version": 1,
  "repos": {
    "$REPO2_TOPLEVEL": {
      "shell": "bash",
      "setup": [],
      "checks": [
        { "name": "always-pass", "command": "true" }
      ],
      "timeoutMs": 10000
    }
  }
}
EOF

OUT=$(run_hook "$CFG2" "$REPO2" "git commit -m test")
check "opted in, passing check -> approve" "$OUT" "approve"

# Verify marker was written with correct content
MARKER2="$REPO2/.git/.claude-last-hygiene"
if [ -f "$MARKER2" ]; then
    MARKER_VERDICT=$(head -1 "$MARKER2")
    MARKER_HASH=$(tail -1 "$MARKER2")
    if [ "$MARKER_VERDICT" = "PASS" ] && [ "$MARKER_HASH" = "$EXPECTED_HASH" ]; then
        echo "PASS: marker written with correct PASS verdict and hash"
        PASS=$((PASS + 1))
    else
        echo "FAIL: marker content wrong (verdict='$MARKER_VERDICT', hash='$MARKER_HASH', expected='$EXPECTED_HASH')"
        FAIL=$((FAIL + 1))
    fi
else
    echo "FAIL: marker file not written after passing run"
    FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Case 3: Opted in, check fails -> block with check name in message
# ---------------------------------------------------------------------------
REPO3="$TMPROOT/repo3"
git init -q "$REPO3"
printf 'file\n' > "$REPO3/a.txt"
git -C "$REPO3" add a.txt

REPO3_TOPLEVEL="$(git -C "$REPO3" rev-parse --show-toplevel)"
CFG3="$TMPROOT/cfg3.json"
cat > "$CFG3" <<EOF
{
  "version": 1,
  "repos": {
    "$REPO3_TOPLEVEL": {
      "shell": "bash",
      "setup": [],
      "checks": [
        { "name": "always-fail", "command": "false" }
      ],
      "timeoutMs": 10000
    }
  }
}
EOF

OUT=$(run_hook "$CFG3" "$REPO3" "git commit -m test")
check "opted in, failing check -> block" "$OUT" "block"

# Also verify the systemMessage contains the check name
if echo "$OUT" | grep -q "always-fail"; then
    echo "PASS: block output contains failing check name"
    PASS=$((PASS + 1))
else
    echo "FAIL: block output missing check name"
    echo "  Got: $OUT"
    FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Case 4: Marker fresh and hash matches -> approve without running checks
# A check that would write a sentinel file is used; sentinel must NOT appear
# after approval via marker skip.
# ---------------------------------------------------------------------------
REPO4="$TMPROOT/repo4"
git init -q "$REPO4"
printf 'file\n' > "$REPO4/a.txt"
git -C "$REPO4" add a.txt

STAGED_HASH=$(git -C "$REPO4" diff --cached -- ':(top,exclude)features/*.md' | git -C "$REPO4" hash-object --stdin)
SENTINEL="$TMPROOT/sentinel-was-touched"

REPO4_TOPLEVEL="$(git -C "$REPO4" rev-parse --show-toplevel)"
CFG4="$TMPROOT/cfg4.json"
cat > "$CFG4" <<EOF
{
  "version": 1,
  "repos": {
    "$REPO4_TOPLEVEL": {
      "shell": "bash",
      "setup": [],
      "checks": [
        { "name": "would-touch-sentinel", "command": "touch '$SENTINEL'" }
      ],
      "timeoutMs": 10000
    }
  }
}
EOF

# Pre-write a fresh marker with the matching hash
MARKER4="$REPO4/.git/.claude-last-hygiene"
printf 'PASS\n%s' "$STAGED_HASH" > "$MARKER4"

OUT=$(run_hook "$CFG4" "$REPO4" "git commit -m test")
check "fresh marker with matching hash -> approve (skip checks)" "$OUT" "approve"

if [ ! -f "$SENTINEL" ]; then
    echo "PASS: checks skipped (sentinel not created)"
    PASS=$((PASS + 1))
else
    echo "FAIL: checks ran despite fresh marker (sentinel found)"
    FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Case 5: Staged .py file -> STAGED_PY non-empty in check env, STAGED_PY_PKGS
#         contains its parent directory.
# ---------------------------------------------------------------------------
REPO5="$TMPROOT/repo5"
git init -q "$REPO5"
mkdir -p "$REPO5/mypackage"
printf 'x = 1\n' > "$REPO5/mypackage/foo.py"
git -C "$REPO5" add mypackage/foo.py

REPO5_TOPLEVEL="$(git -C "$REPO5" rev-parse --show-toplevel | sed 's|\\\\|/|g')"
SENTINEL5_PY="$TMPROOT/sentinel5-staged-py"
SENTINEL5_PKGS="$TMPROOT/sentinel5-staged-pkgs"

CFG5="$TMPROOT/cfg5.json"
# The check writes STAGED_PY and STAGED_PY_PKGS to sentinel files so we can inspect them.
cat > "$CFG5" <<EOF
{
  "version": 1,
  "repos": {
    "$REPO5_TOPLEVEL": {
      "shell": "bash",
      "setup": [],
      "checks": [
        { "name": "capture-env", "command": "printf '%s' \"\$STAGED_PY\" > '$SENTINEL5_PY'; printf '%s' \"\$STAGED_PY_PKGS\" > '$SENTINEL5_PKGS'" }
      ],
      "timeoutMs": 10000
    }
  }
}
EOF

run_hook "$CFG5" "$REPO5" "git commit -m test" > /dev/null

if [ -f "$SENTINEL5_PY" ] && grep -q "foo.py" "$SENTINEL5_PY" 2>/dev/null; then
    echo "PASS: STAGED_PY contains staged .py file"
    PASS=$((PASS + 1))
else
    echo "FAIL: STAGED_PY missing or did not contain staged .py file"
    echo "  STAGED_PY content: $(cat "$SENTINEL5_PY" 2>/dev/null || echo '(missing)')"
    FAIL=$((FAIL + 1))
fi

if [ -f "$SENTINEL5_PKGS" ] && grep -q "mypackage" "$SENTINEL5_PKGS" 2>/dev/null; then
    echo "PASS: STAGED_PY_PKGS contains package dir of staged .py file"
    PASS=$((PASS + 1))
else
    echo "FAIL: STAGED_PY_PKGS missing or did not contain expected package dir"
    echo "  STAGED_PY_PKGS content: $(cat "$SENTINEL5_PKGS" 2>/dev/null || echo '(missing)')"
    FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Case 6: Only a staged .md file -> STAGED_PY empty, STAGED_PY_PKGS empty.
# ---------------------------------------------------------------------------
REPO6="$TMPROOT/repo6"
git init -q "$REPO6"
printf '# readme\n' > "$REPO6/README.md"
git -C "$REPO6" add README.md

REPO6_TOPLEVEL="$(git -C "$REPO6" rev-parse --show-toplevel | sed 's|\\\\|/|g')"
SENTINEL6_PY="$TMPROOT/sentinel6-staged-py"
SENTINEL6_PKGS="$TMPROOT/sentinel6-staged-pkgs"

CFG6="$TMPROOT/cfg6.json"
cat > "$CFG6" <<EOF
{
  "version": 1,
  "repos": {
    "$REPO6_TOPLEVEL": {
      "shell": "bash",
      "setup": [],
      "checks": [
        { "name": "capture-env", "command": "printf '%s' \"\$STAGED_PY\" > '$SENTINEL6_PY'; printf '%s' \"\$STAGED_PY_PKGS\" > '$SENTINEL6_PKGS'" }
      ],
      "timeoutMs": 10000
    }
  }
}
EOF

run_hook "$CFG6" "$REPO6" "git commit -m test" > /dev/null

PY6_CONTENT="$(cat "$SENTINEL6_PY" 2>/dev/null || echo '')"
PKGS6_CONTENT="$(cat "$SENTINEL6_PKGS" 2>/dev/null || echo '')"

if [ -z "$PY6_CONTENT" ]; then
    echo "PASS: STAGED_PY is empty when no .py files staged"
    PASS=$((PASS + 1))
else
    echo "FAIL: STAGED_PY should be empty for non-.py staged files, got: '$PY6_CONTENT'"
    FAIL=$((FAIL + 1))
fi

if [ -z "$PKGS6_CONTENT" ]; then
    echo "PASS: STAGED_PY_PKGS is empty when no .py files staged"
    PASS=$((PASS + 1))
else
    echo "FAIL: STAGED_PY_PKGS should be empty for non-.py staged files, got: '$PKGS6_CONTENT'"
    FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Case 7: Staging in the same command as the commit -> block, even when the
# repo is not opted in. The checks would otherwise run against the wrong
# staged set.
# ---------------------------------------------------------------------------
CFG7="$TMPROOT/cfg7.json"
echo '{"version":1,"repos":{}}' > "$CFG7"
REPO7="$TMPROOT/repo7"
git init -q "$REPO7"
printf 'file\n' > "$REPO7/a.txt"

OUT=$(run_hook "$CFG7" "$REPO7" "git add a.txt && git commit -m test")
check "git add && git commit -> block (not opted in)" "$OUT" "block"
OUT=$(run_hook "$CFG7" "$REPO7" "git commit -a -m test")
check "git commit -a -> block" "$OUT" "block"
OUT=$(run_hook "$CFG7" "$REPO7" "git commit -m test")
check "plain commit, not opted in -> approve" "$OUT" "approve"

# ---------------------------------------------------------------------------
# Case 8: Opted in, index unreadable -> block before any check runs. The
# canonical checks are guarded by `if [ -n "$STAGED_PY" ]`, so an empty
# context would pass them vacuously.
# ---------------------------------------------------------------------------
REPO8="$TMPROOT/repo8"
git init -q "$REPO8"
printf 'x = 1\n' > "$REPO8/m.py"
git -C "$REPO8" add m.py
REPO8_TOPLEVEL="$(git -C "$REPO8" rev-parse --show-toplevel)"
SENTINEL8="$TMPROOT/ran8"
CFG8="$TMPROOT/cfg8.json"
cat > "$CFG8" <<EOF
{
  "version": 1,
  "repos": {
    "$REPO8_TOPLEVEL": {
      "shell": "bash",
      "setup": [],
      "checks": [
        { "name": "touch-sentinel", "command": "touch $SENTINEL8" }
      ],
      "timeoutMs": 10000
    }
  }
}
EOF
SHIM8="$TMPROOT/git-shim"
mkdir -p "$SHIM8"
REAL_GIT=$(command -v git)
cat > "$SHIM8/git" <<EOF
#!/bin/bash
for a in "\$@"; do
  if [ "\$a" = "diff" ]; then echo "fatal: simulated index read failure" >&2; exit 128; fi
done
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$SHIM8/git"
OUT=$(cd "$REPO8" && export HYGIENE_REPOS_CONFIG="$CFG8" && printf '{"tool_input":{"command":"git commit -m test"}}' | PATH="$SHIM8:$PATH" node "$HOOK" 2>&1) || true
check "unreadable index -> block" "$OUT" "block"
if [ -f "$SENTINEL8" ]; then
    echo "FAIL: checks ran over an unreadable index"; FAIL=$((FAIL + 1))
else
    echo "PASS: no check ran over an unreadable index"; PASS=$((PASS + 1))
fi
if [ -f "$REPO8/.git/.claude-last-hygiene" ]; then
    echo "FAIL: marker written for an unreadable index"; FAIL=$((FAIL + 1))
else
    echo "PASS: no marker written for an unreadable index"; PASS=$((PASS + 1))
fi

# ---------------------------------------------------------------------------
# Case 9: bad GIT_DIR -> block (not "no toplevel -> approve"); a genuine
# non-repo cwd still approves.
# ---------------------------------------------------------------------------
OUT=$(cd "$REPO8" && export HYGIENE_REPOS_CONFIG="$CFG8" && printf '{"tool_input":{"command":"git commit -m test"}}' | GIT_DIR="/nonexistent/git-dir-$$" node "$HOOK" 2>&1) || true
check "bad GIT_DIR -> block" "$OUT" "block"
NOREPO9="$TMPROOT/norepo9"
mkdir -p "$NOREPO9"
OUT=$(run_hook "$CFG8" "$NOREPO9" "git commit -m test")
check "genuine non-repo -> approve" "$OUT" "approve"

# ---------------------------------------------------------------------------
# Case 10: cd out of the repo before the commit -> block
# ---------------------------------------------------------------------------
OTHER10="$TMPROOT/other10"
mkdir -p "$OTHER10"
OUT=$(run_hook "$CFG8" "$REPO8" "cd $OTHER10 && git commit -m test")
check "cd out of the repo -> block" "$OUT" "block"

# ---------------------------------------------------------------------------
# Case 11: --amend is gated like any commit (opted in, failing check -> block)
# ---------------------------------------------------------------------------
REPO11="$TMPROOT/repo11"
git init -q "$REPO11"
printf 'x = 1\n' > "$REPO11/m.py"
git -C "$REPO11" add m.py
REPO11_TOPLEVEL="$(git -C "$REPO11" rev-parse --show-toplevel)"
CFG11="$TMPROOT/cfg11.json"
cat > "$CFG11" <<EOF
{
  "version": 1,
  "repos": {
    "$REPO11_TOPLEVEL": {
      "shell": "bash",
      "setup": [],
      "checks": [
        { "name": "always-fail", "command": "false" }
      ],
      "timeoutMs": 10000
    }
  }
}
EOF
OUT=$(run_hook "$CFG11" "$REPO11" "git commit --amend --no-edit")
check "amend with a failing check -> block" "$OUT" "block"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
