# Statusline Pending Model

**Requirement**: After /sdlc:main-model sets a model, the status line shows the pending model beside the running one, and the command tells the user to run /model for the current session.

**Started**: 2026-11-03
**Last updated**: 2026-11-03
**Branch**: statusline-pending-model

## Acceptance

1. `node src/test-statusline.js` exits 0, and its pending-model table shows `Sonnet 5.5 → opus next session` only when the configured model differs from the running one.
2. With `SDLC_REVIEW_CONFIG_USER` pointing at a file holding `{"mainModel":"opus"}`, piping a Sonnet status line JSON into `node src/statusline.js` prints `→ opus next session`. With `"off"` or malformed JSON it prints no note.
3. `node src/test-statusline-install.js` exits 0, and `lib/pending-model.js` is copied next to the installed script.
4. `commands/main-model.md` step 5 tells the user to type `/model <model>` to switch the current session.

## Files involved

- .claude-plugin/plugin.json
- commands/main-model.md
- src/lib/pending-model.js
- src/statusline-install.js
- src/statusline.js
- src/test-statusline-install.js
- src/test-statusline.js

## History

<!-- populated on commit -->
