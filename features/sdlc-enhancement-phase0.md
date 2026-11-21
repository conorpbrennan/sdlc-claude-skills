# Sdlc Enhancement Phase0

**Requirement**: Measure how sessions behave: correct the model prices and add orchestration signals and PARTIAL anatomy to /sdlc:model-spend, reproducing report 2 within tolerance, so later phases are judged on real numbers.

**Started**: 2026-11-21
**Last updated**: 2026-11-21
**Branch**: sdlc-enhancement-phase0

## Acceptance

1. Running `bash tools/run-tests.sh` prints `failed: 0`.
2. Running `claude plugin validate .` exits 0.
3. Running `node tools/model-spend.js --json --since 2026-10-19T00:00:00Z --until 2026-11-21T15:39:24Z --split 2026-10-25T00:00:00Z > tmp/sdlc-phase0/repro.json` then `node tmp/sdlc-phase0/repro-check.js tmp/sdlc-phase0/repro.json` exits 0 and prints `REPRO OK`.
4. Running `node tools/model-spend.js --days 7` exits 0 and prints sections 1 to 10.

## Files involved

- .claude-plugin/plugin.json
- CLAUDE.md
- README.md
- commands/model-spend.md
- docs/plans/sdlc-phase0.md
- docs/plans/sdlc-phase0/tracker.md
- tools/lib/orch-signals.js
- tools/lib/prices.js
- tools/model-spend.js
- tools/test-model-spend.js
- tools/test-orch-signals.js
- tools/test-prices.js
- tools/test-usage-fit.js

## History

- 2026-11-21 `35ebb68` — tools/lib/orch-signals.js: summarise groups scored sessions into report rows (Phase 0, S4)
  - .claude-plugin/plugin.json
  - docs/plans/sdlc-phase0/tracker.md
  - tools/lib/orch-signals.js
  - tools/test-orch-signals.js

- 2026-11-21 `587c363` — tools/lib/orch-signals.js: classify and signals score one session record (Phase 0, S3)
  - .claude-plugin/plugin.json
  - docs/plans/sdlc-phase0/tracker.md
  - tools/lib/orch-signals.js
  - tools/test-orch-signals.js

- 2026-11-21 `93d6762` — tools/lib/orch-signals.js: readSessions turns the transcript tree into session records (Phase 0, S2)
  - .claude-plugin/plugin.json
  - docs/plans/sdlc-phase0/tracker.md
  - tools/lib/orch-signals.js
  - tools/test-orch-signals.js

- 2026-11-21 `57e4cf9` — tools/lib/prices.js: price per model id from the live price page (Phase 0, S1)
  - .claude-plugin/plugin.json
  - docs/plans/sdlc-phase0.md
  - docs/plans/sdlc-phase0/tracker.md
  - tools/lib/prices.js
  - tools/model-spend.js
  - tools/test-prices.js
  - tools/test-usage-fit.js
