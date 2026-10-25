# Steps Config Block

**Requirement**: A `steps` block in `sdlc-review.json` (user file and repo file) lets each sdlc workflow area and each step inside it be turned off, with a shared resolver every hook consults and a `/sdlc:steps` command that lists every step with its state and source and toggles one. Everything defaults to on, a bad file never switches a gate off, the commit-guarding areas (tdd, review, commit-conventions) switch off from the user file only, and the existing `.disabled` files and opt-ins keep working as aliases.

**Started**: 2026-10-25
**Last updated**: 2026-10-25
**Branch**: steps-config-block
**Plan**: docs/plans/steps-config-block.md

## Acceptance

1. `bash tools/run-tests.sh` exits 0 with every file `rc=0`.
2. `claude plugin validate .` exits 0.
3. `node src/hooks/steps-cli.js list` prints one line per step id in the plan's Section 1 table and the guard footer.
4. With `{"steps":{"features":false}}` in the user `sdlc-review.json`, `node src/hooks/steps-cli.js list` shows the three features steps off with source `user`.
5. With `{"steps":{"tdd":false}}` only in a repo `sdlc-review.json`, the tdd step stays on and a one-line warning names the file and key.
6. With invalid JSON in the user `sdlc-review.json`, every step stays on and a warning is printed.
7. `grep -ln "feature-tracking.disabled')\|mandateInForce(" src/hooks/*.js | grep -v /test-` prints nothing: no hook reads an alias itself.

## Files involved

- .claude-plugin/plugin.json
- docs/plans/steps-config-block/reports/1-implementer-1.md
- docs/plans/steps-config-block/tracker.md
- src/hooks/lib/review-config.js
- src/hooks/lib/steps.js
- src/hooks/test-steps.js
- tools/run-tests.sh

## History

<!-- populated on commit -->
