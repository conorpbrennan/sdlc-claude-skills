#!/usr/bin/env bash
# Drop git's repository-locating variables: inherited from a git hook, they
# would aim every git call here at the outer repository (src/test-suite-isolation.js).
unset $(env -i PATH="$PATH" git rev-parse --local-env-vars)
set -euo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pre-commit-hygiene.js"
PASS=0
FAIL=0

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT
# Isolate the user-level config from the real ~/.claude for every case.
export SDLC_REVIEW_CONFIG_USER="$TMPROOT/no-user-sdlc-review.json"
export CLAUDE_CONFIG_DIR="$TMPROOT/claude-config"
export TDD_MANDATE_CONFIG="$TMPROOT/no-tdd-mandate.json"

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

# Claude sees permissionDecisionReason, not systemMessage: the failing check's
# name and output must be in what it sees, or it cannot fix them.
if echo "$OUT" | node -e 'const j = JSON.parse(require("fs").readFileSync(0, "utf-8"));
    const h = j.hookSpecificOutput || {};
    process.exit(h.permissionDecision === "deny" && /always-fail/.test(h.permissionDecisionReason || "") ? 0 : 1);'; then
    echo "PASS: the deny reason Claude sees names the failing check"
    PASS=$((PASS + 1))
else
    echo "FAIL: the deny reason Claude sees does not name the failing check"
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
# Cases 12-15: the example config's targeted pytest-cov + diff-cover recipe.
# The harness runs whatever commands a config names, so the recipe is lifted
# from .claude/hygiene-repos.json.example and run in a fixture package with a
# fake pytest and diff-cover on PATH that log their arguments.
#   12 staged module with a matching test -> only that test runs, with --cov
#      and coverage.xml, then diff-cover
#   13 staged module with no matching test -> says so, runs the smoke marker,
#      writes no coverage.xml, skips diff-cover
#   14 staged test file -> that file runs
#   15 no matching test and no smoke marker (pytest exit 5) -> passes with a
#      warning
# ---------------------------------------------------------------------------
EXAMPLE_CFG="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.claude/hygiene-repos.json.example"

FAKEBIN="$TMPROOT/fakebin"
mkdir -p "$FAKEBIN"
cat > "$FAKEBIN/pytest" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOG_DIR/pytest.log"
case " $* " in *" -m smoke "*) [ "${FAKE_SMOKE:-yes}" = "none" ] && exit 5;; esac
case " $* " in *" --cov-report=xml "*) : > coverage.xml;; esac
exit 0
EOF
cat > "$FAKEBIN/diff-cover" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOG_DIR/diff-cover.log"
exit 0
EOF
chmod +x "$FAKEBIN/pytest" "$FAKEBIN/diff-cover"

# Usage: targeted_case <name> <file to stage> <smoke: yes|none>
# Leaves the hook output in TOUT, the pytest log in TPYLOG, the diff-cover log
# in TDCLOG and the repo path in TREPO.
targeted_case() {
    local name="$1" staged="$2" smoke="$3"
    TREPO="$TMPROOT/targeted-$name"
    git init -q "$TREPO"
    mkdir -p "$TREPO/pkg" "$TREPO/tests"
    printf 'x = 1\n' > "$TREPO/pkg/mod.py"
    printf 'y = 1\n' > "$TREPO/pkg/other.py"
    printf 'def test_mod():\n    pass\n' > "$TREPO/tests/test_mod.py"
    git -C "$TREPO" add "$staged"
    local top
    top="$(git -C "$TREPO" rev-parse --show-toplevel | sed 's|\\\\|/|g')"
    local cfg="$TMPROOT/targeted-$name.json"
    EXAMPLE_CFG="$EXAMPLE_CFG" TOP="$top" node -e '
        const ex = JSON.parse(require("fs").readFileSync(process.env.EXAMPLE_CFG, "utf-8"));
        const entry = Object.values(ex.repos)[0];
        entry.setup = [];
        entry.checks = entry.checks.filter(c => /cov|diff-cover/.test(c.name));
        entry.timeoutMs = 30000;
        console.log(JSON.stringify({ version: 1, repos: { [process.env.TOP]: entry } }));
    ' > "$cfg"
    export FAKE_LOG_DIR="$TMPROOT/log-$name" FAKE_SMOKE="$smoke"
    mkdir -p "$FAKE_LOG_DIR"
    TOUT=$(PATH="$FAKEBIN:$PATH" run_hook "$cfg" "$TREPO" "git commit -m test")
    TPYLOG="$(cat "$FAKE_LOG_DIR/pytest.log" 2>/dev/null || true)"
    TDCLOG="$(cat "$FAKE_LOG_DIR/diff-cover.log" 2>/dev/null || true)"
}

targeted_case match pkg/mod.py yes
check "targeted recipe, matching test -> approve" "$TOUT" "approve"
if [ "$(printf '%s\n' "$TPYLOG" | wc -l)" -eq 1 ] \
   && grep -q 'tests/test_mod.py' <<<"$TPYLOG" \
   && grep -q -- '--cov=pkg' <<<"$TPYLOG" \
   && grep -q -- '--cov-report=xml' <<<"$TPYLOG" \
   && [ -f "$TREPO/coverage.xml" ] \
   && grep -q -- '--fail-under=95' <<<"$TDCLOG"; then
    echo "PASS: matching test runs alone with --cov, then diff-cover"
    PASS=$((PASS + 1))
else
    echo "FAIL: matching test did not run alone with --cov, then diff-cover"
    echo "  pytest log: $TPYLOG"
    echo "  diff-cover log: $TDCLOG"
    FAIL=$((FAIL + 1))
fi

targeted_case nomatch pkg/other.py yes
check "targeted recipe, no matching test -> approve" "$TOUT" "approve"
if grep -q -- '-m smoke' <<<"$TPYLOG" \
   && ! grep -q 'test_mod' <<<"$TPYLOG" \
   && [ ! -f "$TREPO/coverage.xml" ] \
   && [ -z "$TDCLOG" ]; then
    echo "PASS: no matching test runs the smoke marker, no coverage.xml, no diff-cover"
    PASS=$((PASS + 1))
else
    echo "FAIL: no-match path did not run only the smoke marker"
    echo "  pytest log: $TPYLOG"
    echo "  diff-cover log: $TDCLOG"
    FAIL=$((FAIL + 1))
fi

targeted_case testfile tests/test_mod.py yes
if grep -q 'tests/test_mod.py' <<<"$TPYLOG" \
   && ! grep -q -- '-m smoke' <<<"$TPYLOG"; then
    echo "PASS: a staged test file runs itself"
    PASS=$((PASS + 1))
else
    echo "FAIL: a staged test file did not run itself"
    echo "  pytest log: $TPYLOG"
    FAIL=$((FAIL + 1))
fi

# No smoke marker: run the pytest-cov command directly to read its output.
targeted_case nosmoke pkg/other.py none
check "targeted recipe, no test and no smoke marker -> approve" "$TOUT" "approve"
SMOKE_CMD=$(EXAMPLE_CFG="$EXAMPLE_CFG" node -e '
    const ex = JSON.parse(require("fs").readFileSync(process.env.EXAMPLE_CFG, "utf-8"));
    console.log(Object.values(ex.repos)[0].checks.find(c => /cov/.test(c.name)).command);
')
SMOKE_OUT=$(cd "$TREPO" && PATH="$FAKEBIN:$PATH" STAGED_PY="$TREPO/pkg/other.py" STAGED_PY_PKGS=pkg bash -c "$SMOKE_CMD" 2>&1 || true)
if grep -q 'no tests match' <<<"$SMOKE_OUT" && grep -q 'WARNING' <<<"$SMOKE_OUT"; then
    echo "PASS: no test and no smoke marker says so and warns"
    PASS=$((PASS + 1))
else
    echo "FAIL: no-smoke path did not say so and warn"
    echo "  output: $SMOKE_OUT"
    FAIL=$((FAIL + 1))
fi

# Case 16: the targeted pytest call is parallel when xdist imports and serial
# with a WARNING when it does not. A fake python on PATH answers `import xdist`
# (exit 0, then exit 1), so the case does not depend on the real install.
# One table of expected substrings: "<run>|<in pytest log: yes/no>|<in stderr: yes/no>|<substring>".
targeted_case xdist pkg/mod.py yes
XD_CMD=$(EXAMPLE_CFG="$EXAMPLE_CFG" node -e '
    const ex = JSON.parse(require("fs").readFileSync(process.env.EXAMPLE_CFG, "utf-8"));
    console.log(Object.values(ex.repos)[0].checks.find(c => /cov/.test(c.name)).command);
')
XD_FAIL=0
for XD_RUN in present absent smoke; do
    XD_PY="$TMPROOT/fakepy-$XD_RUN"
    mkdir -p "$XD_PY"
    # The smoke run stages a module with no matching test, so the fallback runs.
    XD_STAGED=pkg/mod.py
    [ "$XD_RUN" = smoke ] && XD_STAGED=pkg/other.py
    printf '#!/usr/bin/env bash\nexit %s\n' "$([ "$XD_RUN" = absent ] && echo 1 || echo 0)" > "$XD_PY/python"
    chmod +x "$XD_PY/python"
    export FAKE_LOG_DIR="$TMPROOT/log-xdist-$XD_RUN"
    mkdir -p "$FAKE_LOG_DIR"
    XD_ERR=$(cd "$TREPO" && PATH="$XD_PY:$FAKEBIN:$PATH" STAGED_PY="$TREPO/$XD_STAGED" STAGED_PY_PKGS=pkg bash -c "$XD_CMD" 2>&1 >/dev/null || true)
    XD_LOG="$(cat "$FAKE_LOG_DIR/pytest.log" 2>/dev/null || true)"
    while IFS='|' read -r run in_log in_err needle; do
        [ "$run" = "$XD_RUN" ] || continue
        if grep -qF -- "$needle" <<<"$XD_LOG"; then got_log=yes; else got_log=no; fi
        if grep -qF -- "$needle" <<<"$XD_ERR"; then got_err=yes; else got_err=no; fi
        if [ "$got_log" != "$in_log" ] || [ "$got_err" != "$in_err" ]; then
            XD_FAIL=1
            echo "  $run: '$needle' log=$got_log (want $in_log) stderr=$got_err (want $in_err)"
            echo "  pytest log: $XD_LOG"
        fi
    done <<'TABLE'
present|yes|no|-n auto --dist loadfile
present|no|no|WARNING
absent|no|no|-n auto
absent|no|yes|WARNING: pytest-xdist missing
absent|yes|no|tests/test_mod.py
smoke|yes|no|-n auto --dist loadfile -m smoke
TABLE
done
if [ "$XD_FAIL" -eq 0 ]; then
    echo "PASS: pytest runs -n auto when xdist imports, serial with a WARNING when it does not"
    PASS=$((PASS + 1))
else
    echo "FAIL: xdist present/absent behaviour of the pytest-cov recipe"
    FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Steps block: pre-commit-hygiene honours its step. The repo is opted in with
# a failing check, so the default blocks and an off step approves.
# Rows: name|user file JSON ("-" for none)|repo file JSON ("-" for none)|expected
# ---------------------------------------------------------------------------
STEP_FAIL=0
STEP_N=0
while IFS='|' read -r sname suser srepo sexpect; do
    STEP_N=$((STEP_N + 1))
    SDIR="$TMPROOT/step-$STEP_N"
    mkdir -p "$SDIR"
    SREPO="$SDIR/repo"
    git init -q "$SREPO"
    printf 'file\n' > "$SREPO/a.txt"
    git -C "$SREPO" add a.txt
    STOP="$(git -C "$SREPO" rev-parse --show-toplevel)"
    SCFG="$SDIR/hygiene.json"
    printf '{"version":1,"repos":{"%s":{"shell":"bash","setup":[],"checks":[{"name":"always-fail","command":"false"}],"timeoutMs":10000}}}' "$STOP" > "$SCFG"
    SUSER="$SDIR/user.json"
    [ "$suser" = "-" ] || printf '%s' "$suser" > "$SUSER"
    if [ "$srepo" != "-" ]; then
        mkdir -p "$SREPO/.claude"
        printf '%s' "$srepo" > "$SREPO/.claude/sdlc-review.json"
    fi
    SOUT=$(cd "$SREPO" && export HYGIENE_REPOS_CONFIG="$SCFG" SDLC_REVIEW_CONFIG_USER="$SUSER" \
        CLAUDE_CONFIG_DIR="$SDIR/claude-config" TDD_MANDATE_CONFIG="$SDIR/no-mandate.json" \
        && printf '%s' '{"tool_input":{"command":"git commit -m test"}}' | node "$HOOK" 2>&1) || true
    if ! echo "$SOUT" | grep -q "\"decision\":\"$sexpect\""; then
        STEP_FAIL=1
        echo "  step row '$sname': expected $sexpect, got: $SOUT"
    fi
done <<'TABLE'
default: blocks|-|-|block
hygiene area off in the user file: approves|{"steps":{"hygiene":false}}|-|approve
step off inside an on area: approves|{"steps":{"hygiene":{"pre-commit-hygiene":false}}}|-|approve
repo file off beats user on: approves|{"steps":{"hygiene":true}}|{"steps":{"hygiene":{"pre-commit-hygiene":false}}}|approve
TABLE
if [ "$STEP_FAIL" -eq 0 ]; then
    echo "PASS: steps block table (default, area off, step off, repo off beats user on)"
    PASS=$((PASS + 1))
else
    echo "FAIL: steps block table"
    FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
