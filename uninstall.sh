#!/bin/bash
# Uninstall script for sdlc-claude-skills
# Removes from ~/.claude everything install.sh deploys, and nothing else.
#
# Usage: ./uninstall.sh [--dry-run] [--purge-config] [--yes]
#
#   --dry-run        list what would be removed, write nothing
#   --purge-config   also delete hygiene-repos.json and review-policy.json
#                    (your tuned thresholds and repo opt-ins -- kept by default)
#   --yes            skip the confirmation prompt
#
# What is removed is derived from this source tree, so a file this project
# never shipped is never touched. Two things are deliberately left behind:
# the marker files in each repo's .git/ (they expire on their own), and the
# timing log at ~/.claude/code-review-timing.jsonl (it is your data).

set -euo pipefail
shopt -s nullglob

DRY_RUN=0
PURGE_CONFIG=0
ASSUME_YES=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        --purge-config) PURGE_CONFIG=1 ;;
        --yes|-y) ASSUME_YES=1 ;;
        -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
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

echo "========================================="
echo "Uninstalling sdlc-claude-skills"
echo "========================================="
echo ""
echo "Source: $SCRIPT_DIR"
echo "Target: $USER_CLAUDE_DIR"
[ "$DRY_RUN" -eq 1 ] && echo "Mode:   DRY RUN (no files written)"
echo ""
echo "NOTE: if another project (e.g. risk-claude-skills) installs the same"
echo "      hooks, agents or commands, this removes its deployed copies too."
echo "      Re-run that project's install script afterwards to restore them."
echo ""

if [ "$DRY_RUN" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
    read -r -p "Proceed? [y/N] " reply
    case "$reply" in
        [yY]|[yY][eE][sS]) ;;
        *) echo "Aborted."; exit 0 ;;
    esac
    echo ""
fi

run() {
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "    [dry-run] $*"
    else
        "$@"
    fi
}

# Remove $2 only if this source tree actually ships it.
remove_if_owned() {
    local target="$1" label="$2"
    if [ -e "$target" ]; then
        echo "  - $label"
        run rm -rf "$target"
    fi
}

# ---------------------------------------------------------------- skills ---
echo "Removing skills..."
for skill in "$SCRIPT_DIR/.claude/skills"/*; do
    [ -e "$skill" ] || continue
    remove_if_owned "$USER_SKILLS_DIR/$(basename "$skill")" "$(basename "$skill")"
done

# ---------------------------------------------------------------- agents ---
echo ""
echo "Removing agents..."
for agent in "$SCRIPT_DIR/.claude/agents"/*.md; do
    [ -e "$agent" ] || continue
    remove_if_owned "$USER_AGENTS_DIR/$(basename "$agent")" "$(basename "$agent")"
done

# -------------------------------------------------------------- commands ---
echo ""
echo "Removing commands..."
for cmd in "$SCRIPT_DIR/commands"/*.md; do
    [ -e "$cmd" ] || continue
    remove_if_owned "$USER_COMMANDS_DIR/$(basename "$cmd")" "$(basename "$cmd")"
done

# ----------------------------------------------------------------- tools ---
echo ""
echo "Removing tools..."
for tool in "$SCRIPT_DIR/tools"/*.py; do
    [ -e "$tool" ] || continue
    remove_if_owned "$USER_TOOLS_DIR/$(basename "$tool")" "$(basename "$tool")"
done
# Drop the directory only if this project left it empty.
if [ -d "$USER_TOOLS_DIR" ] && [ -z "$(ls -A "$USER_TOOLS_DIR" 2>/dev/null)" ]; then
    run rmdir "$USER_TOOLS_DIR"
fi

# ----------------------------------------------------------- settings.json -
# Strips only the entries naming this project's hook scripts; hooks added from
# elsewhere stay. A backup is written before any change.
#
# Both node rewrites run BEFORE the hook files are deleted. A rewrite that
# fails -- a hand-edited settings.json that will not parse, say -- aborts under
# `set -e`, and what that abort leaves behind is the point: the hook scripts
# are still on disk, so settings.json still points at scripts that exist and
# the commit gates keep gating. (Skills, agents, commands and tools are already
# gone by then; re-running install.sh restores them.) The other order deletes
# the scripts first, leaving settings.json wiring ten commands to files that
# are not there -- and a PreToolUse command that cannot run is a non-blocking
# error, so every commit gate would fail open in silence.
echo ""
echo "Removing hooks from settings.json..."
USER_SETTINGS="$USER_CLAUDE_DIR/settings.json"
HOOKS_CONFIG="$SCRIPT_DIR/.claude/hooks-config.json"
if [ -f "$HOOKS_CONFIG" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "    [dry-run] strip this project's hooks from $USER_SETTINGS"
    else
        node "$SCRIPT_DIR/src/unmerge-hooks.js" "$USER_SETTINGS" "$HOOKS_CONFIG"
    fi
else
    echo "  WARNING: hooks-config.json not found, leaving settings.json alone"
fi

# ------------------------------------------------------------- CLAUDE.md ---
echo ""
echo "Removing CLAUDE.md sections..."
USER_CLAUDE_MD="$USER_CLAUDE_DIR/CLAUDE.md"
for snippet in "$SCRIPT_DIR/.claude/claude-md-snippet.md" \
               "$SCRIPT_DIR/.claude/hygiene-snippet.md" \
               "$SCRIPT_DIR/.claude/feature-workflow-snippet.md"; do
    [ -f "$snippet" ] || continue
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "    [dry-run] remove $(head -1 "$snippet") from $USER_CLAUDE_MD"
    else
        node "$SCRIPT_DIR/src/unmerge-claude-md.js" "$USER_CLAUDE_MD" "$snippet"
    fi
done

# ----------------------------------------------------------------- hooks ---
echo ""
echo "Removing hooks..."
HOOKS_SRC_DIR="$SCRIPT_DIR/src/hooks"
for hook in "$HOOKS_SRC_DIR"/*.js; do
    [ -e "$hook" ] || continue
    hook_name=$(basename "$hook")
    [[ "$hook_name" == test-* ]] && continue
    remove_if_owned "$USER_HOOKS_DIR/$hook_name" "$hook_name"
done
for libfile in "$HOOKS_SRC_DIR"/lib/*.js; do
    [ -e "$libfile" ] || continue
    remove_if_owned "$USER_HOOKS_DIR/lib/$(basename "$libfile")" "lib/$(basename "$libfile")"
done
for dir in "$USER_HOOKS_DIR/lib" "$USER_HOOKS_DIR"; do
    if [ -d "$dir" ] && [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
        run rmdir "$dir"
    fi
done

# The project-local deploy target is gitignored and wholly ours.
if [ -d "$LOCAL_HOOKS_DIR" ]; then
    echo "  - .claude/hooks (local deploy target)"
    run rm -rf "$LOCAL_HOOKS_DIR"
fi

# ---------------------------------------------------------------- config ---
echo ""
if [ "$PURGE_CONFIG" -eq 1 ]; then
    echo "Purging config..."
    remove_if_owned "$USER_CLAUDE_DIR/hygiene-repos.json" "hygiene-repos.json"
    remove_if_owned "$USER_CLAUDE_DIR/review-policy.json" "review-policy.json"
else
    echo "Config kept (pass --purge-config to delete):"
    for f in hygiene-repos.json review-policy.json; do
        [ -f "$USER_CLAUDE_DIR/$f" ] && echo "  - $USER_CLAUDE_DIR/$f"
    done
fi

echo ""
echo "========================================="
echo "Uninstall complete."
echo "========================================="
echo ""
echo "Left in place on purpose:"
echo "  - ~/.claude/code-review-timing.jsonl (your timing data)"
echo "  - .git/.claude-last-review and .git/.claude-last-hygiene markers"
echo "    in individual repos (they expire on their own)"
echo "  - settings.json and CLAUDE.md backups written by this run"
echo ""
echo "Restart Claude Code for changes to take effect."
