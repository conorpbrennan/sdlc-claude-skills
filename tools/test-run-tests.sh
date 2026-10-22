#!/usr/bin/env bash
# Tests for tools/run-tests.sh: the exit code follows the files, each file gets
# a per-file rc line, and every suite sees TIMING_LOG_PATH exported.
# Run: bash tools/test-run-tests.sh
unset $(env -i PATH="$PATH" git rev-parse --local-env-vars)
set -u

RUNNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run-tests.sh"
PASS=0
FAIL=0

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

# make_root DIR RC: a fixture root with one bash suite and one node suite, both
# exiting RC. Each suite records the TIMING_LOG_PATH it saw next to itself.
make_root() {
    local dir="$1" rc="$2"
    mkdir -p "$dir/src/hooks"
    printf '#!/usr/bin/env bash\nprintf "%%s" "${TIMING_LOG_PATH:-}" > "%s/seen-sh.txt"\nexit %s\n' "$dir" "$rc" > "$dir/src/hooks/test-fixture.sh"
    printf 'require("fs").writeFileSync("%s/seen-js.txt", process.env.TIMING_LOG_PATH || "");\nprocess.exit(%s);\n' "$dir" "$rc" > "$dir/src/hooks/test-fixture.js"
}

make_root "$TMPROOT/pass" 0
make_root "$TMPROOT/fail" 1

check() {
    local desc="$1" cond="$2"
    if [ "$cond" = "yes" ]; then
        echo "PASS: $desc"; PASS=$((PASS + 1))
    else
        echo "FAIL: $desc"; FAIL=$((FAIL + 1))
    fi
}

# Table: name | root | expected runner exit | expected rc for each file
ROWS="passing suite|pass|0|0
failing suite|fail|1|1"

while IFS='|' read -r name root want_exit want_rc; do
    out="$(bash "$RUNNER" -j 2 "$TMPROOT/$root" 2>&1)"
    got_exit=$?
    [ "$got_exit" = "$want_exit" ] && r=yes || r=no
    check "$name: runner exit is $want_exit (got $got_exit)" "$r"
    for f in src/hooks/test-fixture.sh src/hooks/test-fixture.js; do
        echo "$out" | grep -q "^rc=$want_rc $f\$" && r=yes || r=no
        check "$name: rc line 'rc=$want_rc $f'" "$r"
    done
    for s in sh js; do
        seen="$(cat "$TMPROOT/$root/seen-$s.txt" 2>/dev/null)"
        [ -n "$seen" ] && r=yes || r=no
        check "$name: $s suite saw TIMING_LOG_PATH exported" "$r"
        case "$seen" in "$HOME/.claude/"*) r=no ;; *) r=yes ;; esac
        check "$name: $s suite did not see the real timing log" "$r"
    done
done <<< "$ROWS"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
