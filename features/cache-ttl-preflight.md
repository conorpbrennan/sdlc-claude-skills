# Cache Ttl Preflight

**Requirement**: On a per-token backend (custom ANTHROPIC_BASE_URL gateway, API key, Bedrock, Vertex), the sdlc plugin warns at session start when the main conversation will use the 5-minute prompt cache and names the one-line fix, and /sdlc:model-spend reports main-session cache TTL and 5-60 minute rebuild cost by backend.

**Started**: 2026-10-24
**Last updated**: 2026-10-24
**Branch**: cache-ttl-preflight

## Acceptance

1. The SessionStart hook, run with ANTHROPIC_BASE_URL set and neither CLAUDE_CODE_PROMPT_CACHE_TTL nor promptCacheTtl set, prints a warning naming `export CLAUDE_CODE_PROMPT_CACHE_TTL=1h`.
2. The same hook prints nothing when the TTL is set to 1h (env or settings), or when no per-token backend variables are set (claude.ai login).
3. `node tools/model-spend.js --days 7` prints a cache section: main-session 5m vs 1h cache writes and 5-60 minute rebuild cost, split by backend (`inference_geo`).
4. `bash tools/run-tests.sh` exits 0 and `claude plugin validate .` exits 0.

## Known gaps

- The write reformats settings.json as 2-space JSON and moves integer-like keys to the front (JSON.stringify order). No key is lost.
- Two sessions starting in the same second can both write; the last rename wins with the same value.
- A symlinked settings.json is never written; the hook warns instead.

## Files involved

- .claude-plugin/plugin.json
- README.md
- commands/model-spend.md
- src/hooks/session-start-instructions.js
- src/hooks/test-session-start-instructions.js
- tools/model-spend.js
- tools/test-model-spend.js

## History

- 2026-10-24 `dacd2c2` — Set a 1h prompt cache for the main session on a per-token backend
  - .claude-plugin/plugin.json
  - README.md
  - src/hooks/session-start-instructions.js
  - src/hooks/test-session-start-instructions.js
