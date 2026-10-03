#!/bin/bash
# Migration for sdlc-claude-skills: removes a pre-plugin install (the retired
# install.sh deployed into ~/.claude), and nothing else. Run once, then install
# the plugin. Usage: ./uninstall.sh [--dry-run] [--purge-config] [--yes]
#
#   --dry-run        list what would be removed, write nothing
#   --purge-config   also delete hygiene-repos.json, review-policy.json and
#                    tdd-mandate.json
#                    (your tuned thresholds and repo opt-ins -- kept by default)
#   --yes            skip the confirmation prompt
#
# What is removed is read from the install record install.sh wrote to
# ~/.claude/backups/sdlc-claude-skills/: each file it deployed, and only while
# that file is still exactly what was deployed. Anything added or changed since
# -- by you or by another tool -- is left alone, and files of yours that install
# moved aside are put back. (An install older than the record falls back to
# this tree's file list and legacy/hooks-config.json.) Left behind on purpose:
# the marker files in each repo's .git/ (they expire on their own), and the
# timing log at ~/.claude/code-review-timing.jsonl (it is your data). The
# plugin itself is removed with `claude plugin uninstall`, not by this script.

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
        -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
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

remove_if_owned() {
    local target="$1" label="$2"
    if [ -e "$target" ]; then
        echo "  - $label"
        run rm -rf "$target"
    fi
}

file_sum() { cksum < "$1" | awk '{print $1 "-" $2}'; }

USER_BACKUP_DIR="$USER_CLAUDE_DIR/backups"
RECORD_DIR="$USER_BACKUP_DIR/sdlc-claude-skills"
INSTALLED="$RECORD_DIR/installed.tsv"
BACKUPS="$RECORD_DIR/backups.tsv"

# What to remove, as `<path>\t<cksum>` relative to $USER_CLAUDE_DIR, plus the
# hooks config and CLAUDE.md snippets that were merged. From the install record
# when there is one. Without one -- an install older than the record -- from
# this source tree, with an empty cksum meaning "remove whatever is there".
HOOKS_SRC_DIR="$SCRIPT_DIR/src/hooks"
if [ -f "$INSTALLED" ]; then
    FILE_LIST="$(cat "$INSTALLED")"
    HOOKS_CONFIG="$RECORD_DIR/hooks-config.json"
    SNIPPETS=("$RECORD_DIR/snippets"/*.md)
    # A record from an interrupted install may lack these; the source tree's
    # copies are the next best description of what was merged.
    [ -f "$HOOKS_CONFIG" ] || HOOKS_CONFIG="$SCRIPT_DIR/legacy/hooks-config.json"
    if [ "${#SNIPPETS[@]}" -eq 0 ]; then
        SNIPPETS=("$SCRIPT_DIR/instructions/claude-md-snippet.md"
                  "$SCRIPT_DIR/instructions/tdd-mandate-snippet.md"
                  "$SCRIPT_DIR/instructions/hygiene-snippet.md"
                  "$SCRIPT_DIR/instructions/feature-workflow-snippet.md")
    fi
else
    echo "No install record at $INSTALLED -- removing the files this source tree ships."
    echo ""
    FILE_LIST="$(
        cd "$SCRIPT_DIR"
        { find skills -type f
          for f in agents/*.md; do echo "agents/${f##*/}"; done
          for f in commands/*.md; do echo "commands/${f##*/}"; done
          for f in tools/*.py; do echo "tools/${f##*/}"; done
          for f in src/hooks/*.js; do [[ "${f##*/}" == test-* ]] || echo "hooks/${f##*/}"; done
          for f in src/hooks/lib/*.js; do echo "hooks/lib/${f##*/}"; done
        } | sed 's/$/\t/'
    )"
    HOOKS_CONFIG="$SCRIPT_DIR/legacy/hooks-config.json"
    SNIPPETS=("$SCRIPT_DIR/instructions/claude-md-snippet.md"
              "$SCRIPT_DIR/instructions/tdd-mandate-snippet.md"
              "$SCRIPT_DIR/instructions/hygiene-snippet.md"
              "$SCRIPT_DIR/instructions/feature-workflow-snippet.md")
fi

# ----------------------------------------------------------- settings.json -
# Strips only the entries naming this project's hook scripts; hooks added from
# elsewhere stay. A backup is written before any change.
#
# Both node rewrites run BEFORE any file is deleted. A rewrite that fails -- a
# hand-edited settings.json that will not parse, say -- aborts under `set -e`,
# and what that abort leaves behind is the point: the hook scripts are still
# on disk, so settings.json still points at scripts that exist and the commit
# gates keep gating. The other order deletes the scripts first, leaving
# settings.json wiring ten commands to files that are not there -- and a
# PreToolUse command that cannot run is a non-blocking error, so every commit
# gate would fail open in silence.
echo "Removing hooks from settings.json..."
USER_SETTINGS="$USER_CLAUDE_DIR/settings.json"
if [ -f "$HOOKS_CONFIG" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "    [dry-run] strip this project's hooks from $USER_SETTINGS"
    else
        node "$SCRIPT_DIR/src/unmerge-hooks.js" "$USER_SETTINGS" "$HOOKS_CONFIG"
    fi
else
    # Without it the hooks cannot be unwired, and deleting the scripts below
    # would leave settings.json pointing at files that are gone -- every commit
    # gate failing open in silence. Stop while everything is still in place.
    echo "  ERROR: no hooks-config.json in the install record or the source tree." >&2
    echo "  Nothing has been removed." >&2
    exit 1
fi

# ------------------------------------------------------------- CLAUDE.md ---
echo ""
echo "Removing CLAUDE.md sections..."
USER_CLAUDE_MD="$USER_CLAUDE_DIR/CLAUDE.md"
for snippet in "${SNIPPETS[@]}"; do
    [ -f "$snippet" ] || continue
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "    [dry-run] remove $(head -1 "$snippet") from $USER_CLAUDE_MD"
    else
        node "$SCRIPT_DIR/src/unmerge-claude-md.js" "$USER_CLAUDE_MD" "$snippet"
    fi
done

# ----------------------------------------------------------------- files ---
# Each file goes only while it is still what install wrote. One changed since
# -- edited by you, or overwritten by another tool's install -- is no longer
# ours to delete. Directories this left empty go too.
echo ""
echo "Removing installed files..."
declare -A EMPTIED=()
while IFS=$'\t' read -r rel sum; do
    [ -n "$rel" ] || continue
    dest="$USER_CLAUDE_DIR/$rel"
    [ -f "$dest" ] || continue
    if [ -n "$sum" ] && [ "$(file_sum "$dest")" != "$sum" ]; then
        echo "  - keeping $rel (changed since install)"
        continue
    fi
    echo "  - $rel"
    run rm "$dest"
    d="$(dirname "$rel")"
    while [ "$d" != "." ]; do EMPTIED["$d"]=1; d="$(dirname "$d")"; done
done <<< "$FILE_LIST"
# Deepest first, so a skill's subdirectory goes before the skill.
while IFS= read -r d; do
    [ -n "$d" ] || continue
    dir="$USER_CLAUDE_DIR/$d"
    if [ -d "$dir" ] && [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
        run rmdir "$dir"
    fi
done < <(printf '%s\n' "${!EMPTIED[@]}" | awk '{print gsub("/","/") "\t" $0}' | sort -rn | cut -f2-)

# --------------------------------------------------------------- restore ---
# Put back what install moved aside, where the path is free again. An
# `original` was the user's before this project was ever installed; an
# `edited` backup is our own file with the user's changes, left in backups/.
if [ -f "$BACKUPS" ]; then
    echo ""
    echo "Restoring files install.sh replaced..."
    declare -A RESTORED=()
    while IFS=$'\t' read -r kind rel bak; do
        [ "$kind" = original ] || continue
        [ -z "${RESTORED[$rel]:-}" ] || continue
        RESTORED["$rel"]=1
        src="$USER_CLAUDE_DIR/$bak"
        dest="$USER_CLAUDE_DIR/$rel"
        [ -e "$src" ] || continue
        if [ -e "$dest" ]; then
            echo "  - $rel is in use; your original stays at $bak"
            continue
        fi
        echo "  - $rel"
        run mkdir -p "$(dirname "$dest")"
        run mv "$src" "$dest"
    done < "$BACKUPS"
fi

# The record itself, then any backups/ directory the restores emptied.
if [ -d "$RECORD_DIR" ]; then
    run rm -rf "$RECORD_DIR"
fi
if [ -d "$USER_BACKUP_DIR" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "    [dry-run] remove empty directories under $USER_BACKUP_DIR"
    else
        find "$USER_BACKUP_DIR" -depth -type d -empty -delete
    fi
fi

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
    remove_if_owned "$USER_CLAUDE_DIR/tdd-mandate.json" "tdd-mandate.json"
else
    echo "Config kept (pass --purge-config to delete):"
    for f in hygiene-repos.json review-policy.json tdd-mandate.json; do
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
echo "  - anything in ~/.claude added or changed since the install"
echo "  - ~/.claude/backups/ (edited copies, and originals whose path is in use)"
echo ""
echo "Restart Claude Code for changes to take effect."
