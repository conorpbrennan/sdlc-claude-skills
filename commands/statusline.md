---
description: Install or remove the sdlc status line, which shows context used, model, cost and branch
argument-hint: [install|remove|preview] [force]
---

<objective>
Run the status line installer and relay its output. A plugin cannot set the main `statusLine` itself, so this command is the explicit, opt-in step that does it for the user.
</objective>

<arguments>
Parse `$ARGUMENTS` for:

- empty or `preview` - dry run. Shows what an install would do and writes nothing.
- `install` - install the status line.
- `install force` - install and replace a `statusLine` that is already set.
- `remove` - remove the sdlc status line.

Any other argument: say the accepted forms and stop. Do not guess.
</arguments>

<steps>
1. Pick the flags:
   - `preview` or empty: `--dry-run`
   - `install`: none
   - `install force`: `--force`
   - `remove`: `--remove`
2. Run `node "${CLAUDE_PLUGIN_ROOT}/src/statusline-install.js"` with those flags. Do not pass `--settings` or `--data-dir`: the installer reads `CLAUDE_CONFIG_DIR` and `CLAUDE_PLUGIN_DATA` from the environment and has its own defaults.
3. Relay the installer's output verbatim. Do not paraphrase or summarise it.
4. If it exits non-zero, relay the message and say nothing was changed. Exit 2 is a refusal that wrote nothing. Exit 1 is an unexpected failure.
</steps>

<output>
The installer's output, verbatim. Then, after a successful install or remove, add these facts in plain short sentences:

- An existing `statusLine` is kept unless `force` is given.
- A backup `settings.json.backup.<UTC>-pre-sdlc-statusline` is written beside `settings.json` before any change.
- The status line appears from the next session or refresh.
</output>

<constraints>
- The command changes only the `statusLine` key of `settings.json` and the status line scripts in the plugin data directory. It does not push, merge or edit any other settings key.
- Do not run `install` or `remove` unless the user asked for it. An empty argument is a preview.
</constraints>
