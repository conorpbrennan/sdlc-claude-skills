#!/usr/bin/env bash
# Run this repo's test suites in parallel, isolated from the real timing log.
# Usage: bash tools/run-tests.sh [-j N] [ROOT]
#   -j N   parallelism (default: nproc)
#   ROOT   directory the test globs resolve against (default: the repo root)
# Prints one "rc=<n> <file>" line per file and the total elapsed time. Exits
# non-zero if any file did. To run one suite, use its own command, for example
# `node src/hooks/test-X.js` or `bash src/hooks/test-X.sh`.
set -u

N="$(nproc 2>/dev/null || echo 4)"
while getopts "j:" opt; do
    case "$opt" in
        j) N="$OPTARG" ;;
        *) echo "usage: run-tests.sh [-j N] [ROOT]" >&2; exit 2 ;;
    esac
done
shift $((OPTIND - 1))
ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT" || { echo "run-tests.sh: cannot cd to $ROOT" >&2; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
# One scratch timing log for the whole run: suites that never set their own
# TIMING_LOG_PATH write here, not to ~/.claude/code-review-timing.jsonl.
TIMING_LOG_PATH="$WORK/timing.jsonl"
export TIMING_LOG_PATH
: > "$TIMING_LOG_PATH"

shopt -s nullglob
JS_FILES=(src/hooks/test-*.js src/test-*.js tools/test-*.js)
SH_FILES=(src/hooks/test-*.sh src/test-*.sh tools/test-*.sh)

START=$(date +%s%N)

# node --test runs each file in its own subprocess; TAP gives one top-level
# "ok"/"not ok" line per file.
if [ "${#JS_FILES[@]}" -gt 0 ]; then
    (
        node --test --test-reporter=tap --test-concurrency="$N" "${JS_FILES[@]}" > "$WORK/node.tap" 2>&1
        node_rc=$?
        grep -E '^(not )?ok [0-9]+ - ' "$WORK/node.tap" | while read -r line; do
            file="${line#* - }"
            case "$line" in
                "not ok"*) echo "rc=1 $file" ;;
                *) echo "rc=0 $file" ;;
            esac
        done > "$WORK/node.rc"
        # node failed but no file was reported failing: do not swallow it.
        if [ "$node_rc" -ne 0 ] && ! grep -q '^rc=[1-9]' "$WORK/node.rc"; then
            echo "rc=$node_rc node --test (no per-file result)" >> "$WORK/node.rc"
        fi
    ) &
    NODE_PID=$!
else
    NODE_PID=""
fi

# Bash suites: one process per file, N at a time. Output goes to a per-file log.
if [ "${#SH_FILES[@]}" -gt 0 ]; then
    export WORK
    printf '%s\n' "${SH_FILES[@]}" | xargs -P "$N" -n1 bash -c '
        f="$1"
        log="$WORK/$(echo "$f" | tr / _).log"
        bash "$f" > "$log" 2>&1
        echo "rc=$? $f" >> "$WORK/sh.rc"
    ' _
fi

[ -n "$NODE_PID" ] && wait "$NODE_PID"

PYTEST_RC=0
if python3 -c "import pytest" 2>/dev/null; then
    python3 -m pytest -q skills/plan-spec > "$WORK/pytest.log" 2>&1
    PYTEST_RC=$?
    echo "rc=$PYTEST_RC python3 -m pytest skills/plan-spec" >> "$WORK/py.rc"
else
    echo "WARNING: pytest is not installed; skipped skills/plan-spec"
fi

END=$(date +%s%N)

cat "$WORK"/node.rc "$WORK"/sh.rc "$WORK"/py.rc 2>/dev/null | sort -k2 > "$WORK/all.rc"
cat "$WORK/all.rc"
FAILED=$(grep -c '^rc=[^0]\|^rc=0[0-9]' "$WORK/all.rc")

if [ "$FAILED" -gt 0 ]; then
    echo ""
    echo "Failing output:"
    grep '^not ok' "$WORK/node.tap" 2>/dev/null | sed 's/^/  node: /'
    grep '^rc=[^0]' "$WORK/sh.rc" 2>/dev/null | while read -r l; do
        f="${l#* }"
        echo "  --- $f (tail)"
        tail -n 15 "$WORK/$(echo "$f" | tr / _).log" | sed 's/^/  /'
    done
fi

echo ""
echo "Files: $(wc -l < "$WORK/all.rc")  failed: $FAILED  elapsed: $(( (END - START) / 1000000 )) ms (-j $N)"
[ "$FAILED" -eq 0 ]
