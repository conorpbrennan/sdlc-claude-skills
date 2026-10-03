#!/usr/bin/env bash
# Tests for uninstall.sh: the migration that removes a pre-plugin install from
# ~/.claude. install.sh is gone, so each legacy home is built here by hand:
# the files the installer deployed, settings.json and CLAUDE.md merged with
# the frozen legacy/merge-*.js, and the install record install.sh wrote
# (backups/sdlc-claude-skills/installed.tsv, backups.tsv, hooks-config.json,
# snippets/). Every run uses scratch HOME and CLAUDE_HOME, never ~/.claude,
# and a scratch copy of this tree, since uninstall.sh also clears the source
# tree's .claude/hooks deploy target.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; [ -n "${2:-}" ] && echo "    $2"; FAIL=$((FAIL + 1)); }
assert_true() { if eval "$2"; then pass "$1"; else fail "$1" "condition: $2"; fi; }
assert_eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected [$3], got [$2]"; fi; }

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

# A copy of the pieces uninstall.sh reads from its own tree.
SRC="$SCRATCH/src-tree"
mkdir -p "$SRC"
for d in src legacy instructions skills agents commands tools; do
    cp -R "$REPO/$d" "$SRC/$d"
done
cp "$REPO/uninstall.sh" "$SRC/uninstall.sh"

SNIPPETS=(claude-md-snippet.md tdd-mandate-snippet.md hygiene-snippet.md feature-workflow-snippet.md)
HEADINGS=("## Auto Code Review Triggers" "## TDD Mandate" "## Pre-Commit Hygiene Gate" "## Feature Tracking")

file_sum() { cksum < "$1" | awk '{print $1 "-" $2}'; }

# Every file the legacy installer deployed, as `<source>\t<dest>` relative to
# the source tree and to ~/.claude respectively.
shipped() {
    (
        cd "$SRC" || exit 1
        find skills -type f | while IFS= read -r f; do printf '%s\t%s\n' "$f" "$f"; done
        for f in agents/*.md commands/*.md tools/*.py; do printf '%s\t%s\n' "$f" "$f"; done
        for f in src/hooks/*.js; do
            case "${f##*/}" in test-*) ;; *) printf '%s\thooks/%s\n' "$f" "${f##*/}" ;; esac
        done
        for f in src/hooks/lib/*.js; do printf '%s\thooks/lib/%s\n' "$f" "${f##*/}"; done
    )
}

USER_TEXT="My own instructions, which stay."
TUNED='{"tuned": true}'

# build_home <home> <record: full|none|partial>: a ~/.claude as the legacy
# installer left it, plus things of the user's that must survive.
build_home() {
    local home="$1" record="$2" claude="$1/.claude"
    mkdir -p "$claude"
    while IFS=$'\t' read -r src dest; do
        mkdir -p "$(dirname "$claude/$dest")"
        cp "$SRC/$src" "$claude/$dest"
    done < <(shipped)

    printf '%s\n' '{"model": "opus", "env": {"KEEP": "1"}, "hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "node /opt/foreign/hook.js"}]}]}}' \
        > "$claude/settings.json"
    node "$SRC/legacy/merge-hooks.js" "$claude/settings.json" "$SRC/legacy/hooks-config.json" > /dev/null
    printf '# Mine\n\n%s\n' "$USER_TEXT" > "$claude/CLAUDE.md"
    local s
    for s in "${SNIPPETS[@]}"; do
        node "$SRC/legacy/merge-claude-md.js" "$claude/CLAUDE.md" "$SRC/instructions/$s" > /dev/null
    done

    echo "user notes" > "$claude/skills/plan-spec/my-notes.md"
    echo "user agent" > "$claude/agents/my-agent.md"
    for s in hygiene-repos.json review-policy.json tdd-mandate.json; do
        printf '%s\n' "$TUNED" > "$claude/$s"
    done

    [ "$record" = none ] && return 0
    local rec="$claude/backups/sdlc-claude-skills"
    mkdir -p "$rec"
    while IFS=$'\t' read -r src dest; do
        printf '%s\t%s\n' "$dest" "$(file_sum "$claude/$dest")"
    done < <(shipped) | LC_ALL=C sort > "$rec/installed.tsv"
    [ "$record" = partial ] && return 0
    cp "$SRC/legacy/hooks-config.json" "$rec/hooks-config.json"
    mkdir -p "$rec/snippets"
    for s in "${SNIPPETS[@]}"; do cp "$SRC/instructions/$s" "$rec/snippets/"; done
}

run_uninstall() {
    local home="$1"; shift
    HOME="$home" CLAUDE_HOME="$home/.claude" bash "$SRC/uninstall.sh" "$@" > "$SCRATCH/out.log" 2>&1
}

# Does settings.json still carry anything naming ~/.claude/hooks/?
settings_check() {
    node -e '
        const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf-8"));
        const all = JSON.stringify(s.hooks || {});
        const out = [
            /\.claude\/hooks\//.test(all) ? "ours" : "",
            all.includes("/opt/foreign/hook.js") ? "foreign" : "",
            s.model === "opus" && s.env && s.env.KEEP === "1" ? "keys" : "",
        ];
        console.log(out.filter(Boolean).join(","));
    ' "$1"
}

# The removal and survival checks shared by (a), (b), (c) and (f).
assert_clean() {
    local label="$1" home="$2" claude="$2/.claude" left=0 dest h s
    while IFS=$'\t' read -r _ dest; do
        [ -e "$claude/$dest" ] && { left=1; echo "    still there: $dest"; }
    done < <(shipped)
    assert_eq "$label: every installed file removed" "$left" 0
    assert_true "$label: emptied skill directory removed" "[ ! -e '$claude/skills/code-review-implementer' ]"
    assert_true "$label: emptied hooks/ removed" "[ ! -e '$claude/hooks' ]"
    assert_eq "$label: settings.json keeps the foreign hook and other keys, loses ours" \
        "$(settings_check "$claude/settings.json")" "foreign,keys"
    for h in "${HEADINGS[@]}"; do
        assert_true "$label: CLAUDE.md loses '$h'" "! grep -qxF '$h' '$claude/CLAUDE.md'"
    done
    assert_true "$label: CLAUDE.md keeps the user's text" "grep -qxF '$USER_TEXT' '$claude/CLAUDE.md'"
    assert_eq "$label: user file in skills/plan-spec/ survives" "$(cat "$claude/skills/plan-spec/my-notes.md" 2>/dev/null)" "user notes"
    assert_eq "$label: user file in agents/ survives" "$(cat "$claude/agents/my-agent.md" 2>/dev/null)" "user agent"
    for s in hygiene-repos.json review-policy.json tdd-mandate.json; do
        assert_eq "$label: tuned $s kept" "$(cat "$claude/$s" 2>/dev/null)" "$TUNED"
    done
    assert_true "$label: install record removed" "[ ! -e '$claude/backups/sdlc-claude-skills' ]"
}

# A listing of every file's checksum and every directory, for byte-identity.
snapshot() {
    ( cd "$1" && find . -type f -exec cksum {} + | LC_ALL=C sort && find . -type d | LC_ALL=C sort )
}

echo "=== uninstall.sh tests ==="

echo ""
echo "(a) With a full install record:"
H="$SCRATCH/home-a"; build_home "$H" full
run_uninstall "$H" --yes; rc=$?
assert_eq "(a) exits 0" "$rc" 0
assert_clean "(a)" "$H"

echo ""
echo "(b) With no record (the source-tree fallback):"
H="$SCRATCH/home-b"; build_home "$H" none
run_uninstall "$H" --yes; rc=$?
assert_eq "(b) exits 0" "$rc" 0
assert_true "(b) says it fell back to the source tree" "grep -q 'No install record' '$SCRATCH/out.log'"
assert_clean "(b)" "$H"

echo ""
echo "(c) With a record lacking hooks-config.json and snippets/:"
H="$SCRATCH/home-c"; build_home "$H" partial
run_uninstall "$H" --yes; rc=$?
assert_eq "(c) exits 0" "$rc" 0
assert_clean "(c)" "$H"

echo ""
echo "(d) --dry-run writes nothing:"
H="$SCRATCH/home-d"; build_home "$H" full
mkdir -p "$H/.claude/backups/commands"
echo "my own feature command" > "$H/.claude/backups/commands/feature.md.bak.1"
printf 'original\tcommands/feature.md\tbackups/commands/feature.md.bak.1\n' > "$H/.claude/backups/sdlc-claude-skills/backups.tsv"
before="$(snapshot "$H")"
run_uninstall "$H" --dry-run; rc=$?
assert_eq "(d) exits 0" "$rc" 0
assert_eq "(d) home byte-identical after --dry-run" "$(snapshot "$H")" "$before"

echo ""
echo "(e) An invalid settings.json aborts before anything is deleted:"
H="$SCRATCH/home-e"; build_home "$H" full
printf '{ not json\n' > "$H/.claude/settings.json"
before="$(snapshot "$H")"
run_uninstall "$H" --yes; rc=$?
assert_true "(e) exits non-zero" "[ '$rc' -ne 0 ]"
assert_eq "(e) home unchanged" "$(snapshot "$H")" "$before"

echo ""
echo "(f) A HOME path with a space:"
H="$SCRATCH/home f/with space"; mkdir -p "$H"; build_home "$H" full
run_uninstall "$H" --yes; rc=$?
assert_eq "(f) exits 0" "$rc" 0
assert_clean "(f)" "$H"

echo ""
echo "(g) backups.tsv originals are restored once their path is free:"
H="$SCRATCH/home-g"; build_home "$H" full
C="$H/.claude"
mkdir -p "$C/backups/commands" "$C/backups/agents"
echo "my own feature command" > "$C/backups/commands/feature.md.bak.100"
echo "my own reviewer" > "$C/backups/agents/code-reviewer.md.bak.100"
echo "edited copy" > "$C/backups/commands/review-timing.md.bak.100"
# The user edited this installed file afterwards, so it stays, and the
# original behind it has nowhere to go.
echo "user edit after install" >> "$C/agents/code-reviewer.md"
printf '%s\t%s\t%s\n' \
    original commands/feature.md backups/commands/feature.md.bak.100 \
    original agents/code-reviewer.md backups/agents/code-reviewer.md.bak.100 \
    edited commands/review-timing.md backups/commands/review-timing.md.bak.100 \
    > "$C/backups/sdlc-claude-skills/backups.tsv"
run_uninstall "$H" --yes; rc=$?
assert_eq "(g) exits 0" "$rc" 0
assert_eq "(g) original restored to its free path" "$(cat "$C/commands/feature.md" 2>/dev/null)" "my own feature command"
assert_true "(g) restored backup no longer in backups/" "[ ! -e '$C/backups/commands/feature.md.bak.100' ]"
assert_true "(g) installed file changed since install is kept" "grep -q 'user edit after install' '$C/agents/code-reviewer.md'"
assert_eq "(g) original behind an occupied path stays in backups/" \
    "$(cat "$C/backups/agents/code-reviewer.md.bak.100" 2>/dev/null)" "my own reviewer"
assert_true "(g) edited backup is not restored" "[ ! -e '$C/commands/review-timing.md' ]"
assert_eq "(g) edited backup stays in backups/" \
    "$(cat "$C/backups/commands/review-timing.md.bak.100" 2>/dev/null)" "edited copy"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
