# Fable Access Check

**Requirement**: sdlc checks whether Fable is reachable from the current session and, when it is not, disables Fable routing and falls back to Opus.

**Started**: 2026-11-22
**Last updated**: 2026-11-22
**Branch**: fable-access-check

## Acceptance

1. In a session where Fable is refused, the agent tier gate given a dispatch with model fable denies it, and the reason names Opus as the fallback.
2. In a session where Fable is reachable, the same dispatch is allowed unchanged.
3. The access check result is cached with a time limit; a second dispatch inside that window makes no new Fable API call.
4. When the check cannot decide (no readable signal), Fable stays disabled; it never fails open.
5. bash tools/run-tests.sh prints Files: N  failed: 0.

## Files involved

- .claude-plugin/plugin.json
- .claude/sdlc-review.json.example
- docs/plans/fable-access-check/tracker.md
- src/hooks/agent-tier-gate.js
- src/hooks/lib/fable-access.js
- src/hooks/lib/review-config.js
- src/hooks/test-agent-tier-gate.js
- src/hooks/test-fable-access.js
- src/hooks/test-review-config.js

## History

- 2026-11-22 `f1c0c94` — src/hooks/agent-tier-gate.js: deny a Fable dispatch when Fable is off or unreachable, naming Opus (S5)
  - .claude-plugin/plugin.json
  - docs/plans/fable-access-check/tracker.md
  - src/hooks/agent-tier-gate.js
  - src/hooks/test-agent-tier-gate.js

- 2026-11-22 `0390ddb` — src/hooks/lib/review-config.js: fableAccess key (auto, on, off) in the user config, and pins that config never names Fable (S4)
  - .claude-plugin/plugin.json
  - .claude/sdlc-review.json.example
  - docs/plans/fable-access-check/tracker.md
  - src/hooks/lib/review-config.js
  - src/hooks/test-review-config.js

- 2026-11-22 `6328488` — src/hooks/lib/fable-access.js: checkAccess caches the Fable verdict per session for 10 minutes (S3)
  - .claude-plugin/plugin.json
  - docs/plans/fable-access-check/tracker.md
  - src/hooks/lib/fable-access.js
  - src/hooks/test-fable-access.js

- 2026-11-22 `54506b0` — src/hooks/lib/fable-access.js: readAccessSignal reads the transcript tail for the Fable access verdict (S2)
  - .claude-plugin/plugin.json
  - docs/plans/fable-access-check/tracker.md
  - src/hooks/lib/fable-access.js
  - src/hooks/test-fable-access.js
