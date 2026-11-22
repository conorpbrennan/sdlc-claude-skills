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

<!-- populated on commit -->

## History

<!-- populated on commit -->
