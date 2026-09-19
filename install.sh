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

# ---------------------------------------------------------------- skills ---
# A directory skill is replaced rather than merged: `cp -r` onto an existing
# directory leaves behind files the source has since deleted -- a renamed
# reference, a retired helper -- and the skill then loads with both.
echo "Copying skills..."
for skill in "$SCRIPT_DIR/.claude/skills"/*; do
    [ -e "$skill" ] || continue
    skill_name=$(basename "$skill")
    target="$USER_SKILLS_DIR/$skill_name"

    # Back up an existing user skill that differs from the source, every time
    # it differs, so a customised user-scope skill is never lost to the
    # `rm -rf` below. Backing up only when no `.bak.` exists yet would protect
    # the first customisation and silently destroy every later one -- and a
    # `.bak.` left by another project installing the same skill would disable
    # the protection outright. `date +%s` keeps the names distinct.
    if [ -e "$target" ] && ! diff -rq "$skill" "$target" >/dev/null 2>&1; then
        # A free name, not just a timestamped one: `date +%s` is per-second, and
        # `cp -r` onto an existing directory copies *into* it rather than
        # failing, which would bury one backup inside another.
        bak="$target.bak.$(date +%s)"
        suffix=1
        while [ -e "$bak" ]; do
            bak="$target.bak.$(date +%s)-$suffix"
            suffix=$((suffix + 1))
        done
        echo "  - backing up existing $skill_name -> $(basename "$bak")"
        run cp -r "$target" "$bak"
    fi

    echo "  - $skill_name"
    if [ -d "$skill" ] && [ -d "$target" ]; then
        run rm -rf "$target"
    fi
    run cp -r "$skill" "$USER_SKILLS_DIR/"
done

# ---------------------------------------------------------------- agents ---
# The sub-agents the review skills dispatch by subagent_type. Without these,
# /code-review-pre-commit has nothing to hand the diff to.
echo ""
echo "Copying agents..."
for agent in "$SCRIPT_DIR/.claude/agents"/*.md; do
    [ -e "$agent" ] || continue
    echo "  - $(basename "$agent")"
    run cp "$agent" "$USER_AGENTS_DIR/"
done

# -------------------------------------------------------------- commands ---
echo ""
echo "Copying commands..."
for cmd in "$SCRIPT_DIR/commands"/*.md; do
    [ -e "$cmd" ] || continue
    echo "  - $(basename "$cmd")"
    run cp "$cmd" "$USER_COMMANDS_DIR/"
done

# ----------------------------------------------------------------- tools ---
# /review-timing resolves the analyser here when $PWD is outside this repo.
echo ""
echo "Copying tools..."
for tool in "$SCRIPT_DIR/tools"/*.py; do
    [ -e "$tool" ] || continue
    echo "  - $(basename "$tool")"
    run cp "$tool" "$USER_TOOLS_DIR/"
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
    run cp "$hook" "$USER_HOOKS_DIR/"
done
for libfile in "$HOOKS_SRC_DIR"/lib/*.js; do
    [ -e "$libfile" ] || continue
    echo "  - lib/$(basename "$libfile")"
    run cp "$libfile" "$LOCAL_HOOKS_DIR/lib/"
    run cp "$libfile" "$USER_HOOKS_DIR/lib/"
done

# Remove hooks this project deployed previously but no longer ships, plus any
# test-* harness deployed by an older script. Files this project never owned
# are left alone -- see uninstall.sh for the same rule.
echo ""
echo "Cleaning up stale hooks..."
for target_dir in "$LOCAL_HOOKS_DIR" "$USER_HOOKS_DIR"; do
    [ -d "$target_dir" ] || continue
    for installed_hook in "$target_dir"/*.js; do
        [ -e "$installed_hook" ] || continue
        hook_name=$(basename "$installed_hook")
        if [[ "$hook_name" == test-* ]]; then
            echo "  - Removing $hook_name from $(basename "$target_dir") (test harness, never a runtime hook)"
            run rm "$installed_hook"
        elif [ ! -e "$HOOKS_SRC_DIR/$hook_name" ] && [ "$target_dir" = "$LOCAL_HOOKS_DIR" ]; then
            echo "  - Removing $hook_name from $(basename "$target_dir") (no longer in source)"
            run rm "$installed_hook"
        fi
    done
done

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
echo ""
echo "Seeding config (first install only)..."
seed_config "$SCRIPT_DIR/.claude/hygiene-repos.json.example" \
            "$USER_CLAUDE_DIR/hygiene-repos.json" "hygiene-repos.json"
seed_config "$SCRIPT_DIR/.claude/review-policy.json.example" \
            "$USER_CLAUDE_DIR/review-policy.json" "review-policy.json"

# ------------------------------------------------------------- CLAUDE.md ---
# Each snippet owns exactly one `## ` section; the merge replaces that section
# in place if present, appends it if not. Other sections are untouched.
echo ""
echo "Merging CLAUDE.md sections..."
USER_CLAUDE_MD="$USER_CLAUDE_DIR/CLAUDE.md"
for snippet in "$SCRIPT_DIR/.claude/claude-md-snippet.md" \
               "$SCRIPT_DIR/.claude/hygiene-snippet.md" \
               "$SCRIPT_DIR/.claude/feature-workflow-snippet.md"; do
    if [ -f "$snippet" ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            echo "    [dry-run] merge $(basename "$snippet") into $USER_CLAUDE_MD"
        else
            node "$SCRIPT_DIR/src/merge-claude-md.js" "$USER_CLAUDE_MD" "$snippet"
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
