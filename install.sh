#!/bin/bash
# Install script for sdlc-claude-skills
# Deploys the SDLC toolchain -- workflow skills, review agents, pre-commit
# hooks, slash commands and the CLAUDE.md sections that drive them -- to the
# user-level .claude directory.
#
# Usage: ./install.sh [--dry-run]
#
# Source of truth is this repository. Nothing is edited in ~/.claude by hand;
# re-run this script instead.

set -euo pipefail
shopt -s nullglob

DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
        *) echo "Unknown argument: $arg" >&2; exit 2 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

USER_CLAUDE_DIR="${CLAUDE_HOME:-$HOME/.claude}"
USER_SKILLS_DIR="$USER_CLAUDE_DIR/skills"
USER_HOOKS_DIR="$USER_CLAUDE_DIR/hooks"
USER_AGENTS_DIR="$USER_CLAUDE_DIR/agents"
USER_COMMANDS_DIR="$USER_CLAUDE_DIR/commands"
USER_TOOLS_DIR="$USER_CLAUDE_DIR/tools"
# Skill backups live OUTSIDE the skills directory. Claude Code discovers skills by
# scanning it, so a backup kept there as `plan-spec.bak.<ts>/` is itself loaded as
# a skill: observed in a real session, where it appeared in the skill list next to
# the real one, with the same name and description.
USER_BACKUP_DIR="$USER_CLAUDE_DIR/backups"
LOCAL_HOOKS_DIR="$SCRIPT_DIR/.claude/hooks"

run() {
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "    [dry-run] $*"
    else
        "$@"
    fi
}

echo "========================================="
echo "Installing sdlc-claude-skills"
echo "========================================="
echo ""
echo "Source: $SCRIPT_DIR"
echo "Target: $USER_CLAUDE_DIR"
[ "$DRY_RUN" -eq 1 ] && echo "Mode:   DRY RUN (no files written)"
echo ""

command -v node >/dev/null 2>&1 || {
    echo "ERROR: node is required (the hooks and the merge scripts are Node)." >&2
    exit 1
}

run mkdir -p "$USER_SKILLS_DIR" "$USER_HOOKS_DIR" "$USER_AGENTS_DIR" \
             "$USER_COMMANDS_DIR" "$USER_TOOLS_DIR"

# --------------------------------------------------------- install record ---
# What this install put in $USER_CLAUDE_DIR, so uninstall.sh removes exactly
# that and nothing added later. installed.tsv lists every file deployed, one
# `<path>\t<cksum>` per line, paths relative to $USER_CLAUDE_DIR. backups.tsv
# lists every file or skill moved aside to make room, `<kind>\t<path>\t<backup>`:
# `original` was the user's before we ever installed there, and uninstall puts
# it back; `edited` was our own file the user changed, kept but not restored.
RECORD_DIR="$USER_BACKUP_DIR/sdlc-claude-skills"
INSTALLED="$RECORD_DIR/installed.tsv"
BACKUPS="$RECORD_DIR/backups.tsv"

file_sum() { cksum < "$1" | awk '{print $1 "-" $2}'; }

# The previous install's record: a file still matching it is our own older
# output, replaced without a backup.
declare -A PREV=()
if [ -f "$INSTALLED" ]; then
    while IFS=$'\t' read -r rel sum; do
        [ -n "$rel" ] && PREV["$rel"]="$sum"
    done < "$INSTALLED"
fi
declare -A NEW=()

# An install made before the record existed: no record, but settings.json
# already wires our hooks. Its files are our own older versions, so one that
# differs from the source is logged `edited` (kept, never restored) rather
# than `original` -- uninstall must not put an old copy of this project back.
FIRST_KIND=original
if [ ! -f "$INSTALLED" ] && [ -f "$USER_CLAUDE_DIR/settings.json" ] &&
   grep -q 'hooks/pre-commit-review\.js' "$USER_CLAUDE_DIR/settings.json"; then
    FIRST_KIND=edited
fi

# Move $1 (relative path) aside into $USER_BACKUP_DIR and log it as kind $2.
# Into $USER_BACKUP_DIR, never beside the original: a copy left in
# $USER_SKILLS_DIR is discovered and loaded as a duplicate skill. A free name,
# not just a timestamped one: `date +%s` is per-second, and `cp -r` onto an
# existing directory copies *into* it rather than failing, which would bury one
# backup inside another.
backup() {
    local rel="$1" kind="$2" name bak suffix=1
    name="${rel#skills/}"
    bak="$USER_BACKUP_DIR/$name.bak.$(date +%s)"
    while [ -e "$bak" ]; do
        bak="$USER_BACKUP_DIR/$name.bak.$(date +%s)-$suffix"
        suffix=$((suffix + 1))
    done
    echo "  - backing up existing $name -> backups/${bak#"$USER_BACKUP_DIR/"}"
    run mkdir -p "$(dirname "$bak")" "$RECORD_DIR"
    run cp -r "$USER_CLAUDE_DIR/$rel" "$bak"
    if [ "$DRY_RUN" -eq 0 ]; then
        printf '%s\t%s\t%s\n' "$kind" "$rel" "${bak#"$USER_CLAUDE_DIR/"}" >> "$BACKUPS"
    fi
}

# Is every file under $1 (relative dir) one the last install wrote, unchanged?
# 0 = yes, 1 = some file changed or added (an edit of ours), 2 = none of it was
# ever ours.
dir_ownership() {
    local rel="$1" f r any=0 all=0
    while IFS= read -r -d '' f; do
        r="$rel/${f#"$USER_CLAUDE_DIR/$rel/"}"
        if [ -n "${PREV[$r]:-}" ]; then
            any=1
            [ "${PREV[$r]}" = "$(file_sum "$f")" ] || all=1
        else
            all=1
        fi
    done < <(find "$USER_CLAUDE_DIR/$rel" -type f -print0)
    [ "$any" -eq 0 ] && return 2
    return "$all"
}

# Deploy one file to $2 (relative path), backing up whatever differs there
# unless it is our own previous version.
deploy_file() {
    local src="$1" rel="$2" dest="$USER_CLAUDE_DIR/$2"
    if [ -L "$dest" ]; then
        # A symlink (a dotfiles setup) is never ours and never written through:
        # the link itself is moved aside and put back on uninstall, and its
        # target is not touched.
        backup "$rel" original
        run rm "$dest"
    elif [ -e "$dest" ] && ! cmp -s "$src" "$dest"; then
        if [ -z "${PREV[$rel]:-}" ]; then
            backup "$rel" "$FIRST_KIND"
        elif [ "${PREV[$rel]}" != "$(file_sum "$dest")" ]; then
            backup "$rel" edited
        fi
    fi
    run cp "$src" "$dest"
    NEW["$rel"]="$(file_sum "$src")"
}

# Deploy a directory skill. It is replaced rather than merged: `cp -r` onto an
# existing directory leaves behind files the source has since deleted -- a
# renamed reference, a retired helper -- and the skill then loads with both.
# So whatever differs is backed up whole first, every time it differs: guarding
# on "a .bak. already exists" would protect the first customisation and destroy
# every later one.
deploy_dir() {
    local src="$1" rel="$2" dest="$USER_CLAUDE_DIR/$2" f
    if [ -L "$dest" ]; then
        backup "$rel" original
        run rm "$dest"
    elif [ -e "$dest" ] && ! diff -rq "$src" "$dest" >/dev/null 2>&1; then
        local own=0
        dir_ownership "$rel" || own=$?
        case "$own" in
            1) backup "$rel" edited ;;
            2) backup "$rel" "$FIRST_KIND" ;;
        esac
    fi
    [ -d "$dest" ] && run rm -rf "$dest"
    run cp -r "$src" "$(dirname "$dest")/"
    while IFS= read -r -d '' f; do
        NEW["$rel/${f#"$src/"}"]="$(file_sum "$f")"
    done < <(find "$src" -type f -print0)
}

# ---------------------------------------------------------------- skills ---
echo "Copying skills..."
for skill in "$SCRIPT_DIR/skills"/*; do
    [ -e "$skill" ] || continue
    skill_name=$(basename "$skill")
    echo "  - $skill_name"
    if [ -d "$skill" ]; then
        deploy_dir "$skill" "skills/$skill_name"
    else
        deploy_file "$skill" "skills/$skill_name"
    fi
done

# ---------------------------------------------------------------- agents ---
# The sub-agents the review skills dispatch by subagent_type. Without these,
# /code-review-pre-commit has nothing to hand the diff to.
echo ""
echo "Copying agents..."
for agent in "$SCRIPT_DIR/agents"/*.md; do
    [ -e "$agent" ] || continue
    echo "  - $(basename "$agent")"
    deploy_file "$agent" "agents/$(basename "$agent")"
done

# -------------------------------------------------------------- commands ---
echo ""
echo "Copying commands..."
for cmd in "$SCRIPT_DIR/commands"/*.md; do
    [ -e "$cmd" ] || continue
    echo "  - $(basename "$cmd")"
    deploy_file "$cmd" "commands/$(basename "$cmd")"
done

# ----------------------------------------------------------------- tools ---
# /review-timing resolves the analyser here when $PWD is outside this repo.
echo ""
echo "Copying tools..."
for tool in "$SCRIPT_DIR/tools"/*.py; do
    [ -e "$tool" ] || continue
    echo "  - $(basename "$tool")"
    deploy_file "$tool" "tools/$(basename "$tool")"
done

# ----------------------------------------------------------------- hooks ---
# Source is src/hooks/. Deployed both to ~/.claude/hooks (what settings.json
# points at) and to .claude/hooks (gitignored, for project-level testing).
HOOKS_SRC_DIR="$SCRIPT_DIR/src/hooks"
echo ""
echo "Copying hooks..."
run mkdir -p "$LOCAL_HOOKS_DIR" "$LOCAL_HOOKS_DIR/lib" "$USER_HOOKS_DIR/lib"
for hook in "$HOOKS_SRC_DIR"/*.js; do
    [ -e "$hook" ] || continue
    hook_name=$(basename "$hook")
    # Test harnesses live next to the code they exercise but are not hooks.
    [[ "$hook_name" == test-* ]] && continue
    echo "  - $hook_name"
    run cp "$hook" "$LOCAL_HOOKS_DIR/"
    deploy_file "$hook" "hooks/$hook_name"
done
for libfile in "$HOOKS_SRC_DIR"/lib/*.js; do
    [ -e "$libfile" ] || continue
    echo "  - lib/$(basename "$libfile")"
    run cp "$libfile" "$LOCAL_HOOKS_DIR/lib/"
    deploy_file "$libfile" "hooks/lib/$(basename "$libfile")"
done

# Remove what the last install deployed but this one no longer ships -- only
# while it is still exactly what we wrote -- plus any test-* harness deployed
# by an older script. Files this project never owned are left alone.
echo ""
echo "Cleaning up files no longer shipped..."
for rel in "${!PREV[@]}"; do
    [ -n "${NEW[$rel]:-}" ] && continue
    dest="$USER_CLAUDE_DIR/$rel"
    if [ -f "$dest" ] && [ "$(file_sum "$dest")" = "${PREV[$rel]}" ]; then
        echo "  - Removing $rel (no longer in source)"
        run rm "$dest"
    fi
done
for target_dir in "$LOCAL_HOOKS_DIR" "$USER_HOOKS_DIR"; do
    [ -d "$target_dir" ] || continue
    for installed_hook in "$target_dir"/*.js; do
        [ -e "$installed_hook" ] || continue
        hook_name=$(basename "$installed_hook")
        # Only a harness this source ships: a test-*.js of the user's own is theirs.
        if [[ "$hook_name" == test-* ]] && [ -e "$HOOKS_SRC_DIR/$hook_name" ]; then
            echo "  - Removing $hook_name from $(basename "$target_dir") (test harness, never a runtime hook)"
            run rm "$installed_hook"
        elif [ ! -e "$HOOKS_SRC_DIR/$hook_name" ] && [ "$target_dir" = "$LOCAL_HOOKS_DIR" ]; then
            echo "  - Removing $hook_name from $(basename "$target_dir") (no longer in source)"
            run rm "$installed_hook"
        fi
    done
done

if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$RECORD_DIR"
    for rel in "${!NEW[@]}"; do
        printf '%s\t%s\n' "$rel" "${NEW[$rel]}"
    done | LC_ALL=C sort > "$INSTALLED"
fi

# ---------------------------------------------------------------- config ---
# Seeded on first install only: these files are the user's to edit afterwards,
# and an install must never clobber a tuned threshold or a repo opt-in.
seed_config() {
    local template="$1" dest="$2" label="$3"
    if [ -f "$template" ] && [ ! -f "$dest" ]; then
        echo "  - $label -> $dest"
        run cp "$template" "$dest"
    elif [ -f "$dest" ]; then
        echo "  - $label already present, left untouched"
    fi
}
# The review markers used to live in $HOME, shared by every repository on the
# machine. They are per repository and per worktree now (lib/review-markers.js), so
# the old global files are inert -- but a stale one would sit in the user's home
# directory forever, unread, so sweep them on install.
echo ""
echo "Removing superseded global review markers..."
for stale in "$HOME/.claude-pending-review" \
             "$HOME/.claude-review-in-progress" \
             "$HOME/.claude-last-review"; do
    if [ -f "$stale" ]; then
        echo "  - $stale (now kept per repository)"
        run rm -f "$stale"
    fi
done

echo ""
echo "Seeding config (first install only)..."
seed_config "$SCRIPT_DIR/.claude/hygiene-repos.json.example" \
            "$USER_CLAUDE_DIR/hygiene-repos.json" "hygiene-repos.json"
seed_config "$SCRIPT_DIR/.claude/review-policy.json.example" \
            "$USER_CLAUDE_DIR/review-policy.json" "review-policy.json"
# The TDD mandate is on by default; this file only lists exemptions, so seeding
# it empty changes nothing. It exists so there is somewhere obvious to add one.
seed_config "$SCRIPT_DIR/.claude/tdd-mandate.json.example" \
            "$USER_CLAUDE_DIR/tdd-mandate.json" "tdd-mandate.json"

# ------------------------------------------------------------- CLAUDE.md ---
# Each snippet owns exactly one `## ` section; the merge replaces that section
# in place if present, appends it if not. Other sections are untouched.
echo ""
echo "Merging CLAUDE.md sections..."
USER_CLAUDE_MD="$USER_CLAUDE_DIR/CLAUDE.md"
for snippet in "$SCRIPT_DIR/.claude/claude-md-snippet.md" \
               "$SCRIPT_DIR/.claude/tdd-mandate-snippet.md" \
               "$SCRIPT_DIR/.claude/hygiene-snippet.md" \
               "$SCRIPT_DIR/.claude/feature-workflow-snippet.md"; do
    if [ -f "$snippet" ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            echo "    [dry-run] merge $(basename "$snippet") into $USER_CLAUDE_MD"
        else
            node "$SCRIPT_DIR/src/merge-claude-md.js" "$USER_CLAUDE_MD" "$snippet"
            mkdir -p "$RECORD_DIR/snippets"
            cp "$snippet" "$RECORD_DIR/snippets/"
        fi
    else
        echo "  WARNING: $(basename "$snippet") not found, skipping"
    fi
done

# ----------------------------------------------------------- settings.json -
echo ""
echo "Merging hooks into settings.json..."
USER_SETTINGS="$USER_CLAUDE_DIR/settings.json"
HOOKS_CONFIG="$SCRIPT_DIR/.claude/hooks-config.json"
if [ -f "$HOOKS_CONFIG" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "    [dry-run] merge hooks-config.json into $USER_SETTINGS"
    else
        # Kept so uninstall strips the hooks this install wired, even once the
        # source's config has moved on. Copied before the merge, so a record
        # never describes hooks that settings.json has but it does not.
        cp "$HOOKS_CONFIG" "$RECORD_DIR/hooks-config.json"
        [ -f "$USER_SETTINGS" ] || echo '{}' > "$USER_SETTINGS"
        node "$SCRIPT_DIR/src/merge-hooks.js" "$USER_SETTINGS" "$HOOKS_CONFIG"
    fi
else
    echo "  WARNING: hooks-config.json not found, skipping settings merge"
fi

echo ""
echo "========================================="
echo "Installation complete!"
echo "========================================="
if [ "$DRY_RUN" -eq 0 ]; then
    echo ""
    echo "Installed skills:"
    ls -1 "$USER_SKILLS_DIR" 2>/dev/null | sed 's/^/  - /'
    echo ""
    echo "Installed agents:"
    ls -1 "$USER_AGENTS_DIR" 2>/dev/null | sed 's/^/  - /'
    echo ""
    echo "Installed commands:"
    ls -1 "$USER_COMMANDS_DIR" 2>/dev/null | sed 's/^/  - /'
    echo ""
    echo "Installed hooks:"
    ls -1 "$USER_HOOKS_DIR" 2>/dev/null | sed 's/^/  - /'
fi
echo ""
echo "Restart Claude Code for changes to take effect."
