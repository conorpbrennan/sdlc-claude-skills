# Opus Reason Categories

**Requirement**: An Opus or Fable sub-agent dispatch runs only for plan writing, plan source review or failure triage; one the owner asked for raises a confirm prompt; any other reason is denied, so volume work stays on Sonnet.

**Started**: 2026-10-22
**Last updated**: 2026-10-22
**Branch**: opus-reason-categories

## Acceptance

1. `node src/hooks/test-agent-tier-gate.js` exits 0, and an Opus dispatch whose prompt carries `TIER: opus: design judgement` is denied with a reason that names the allowed categories.
2. An Opus dispatch whose prompt carries `TIER: opus: plan source review`, `TIER: opus: plan writing` or `TIER: opus: fail triage` (with or without trailing text) is allowed unchanged.
3. An Opus or Fable dispatch whose prompt carries `TIER: opus: user asked` (or `TIER: fable: user asked`) gets `permissionDecision: "ask"` with a reason naming the model.
4. `grep -rn "TIER: opus: <reason>" skills/ README.md` prints nothing: every doc names the categories instead.
5. `bash tools/run-tests.sh` exits 0 and `claude plugin validate .` exits 0.

## Files involved

- .claude-plugin/plugin.json
- README.md
- commands/model-spend.md
- docs/plans/opus-reason-categories-fix-1.md
- docs/plans/opus-reason-categories-implementer-1.md
- skills/plan-spec/SKILL.md
- skills/plan-spec/reference.md
- src/hooks/agent-tier-gate.js
- src/hooks/test-agent-tier-gate.js

## History

- 2026-10-22 `945122a` — agent-tier-gate: Opus/Fable only for plan writing, plan source review, fail triage; user asked prompts
  - .claude-plugin/plugin.json
  - README.md
  - commands/model-spend.md
  - docs/plans/opus-reason-categories-fix-1.md
  - docs/plans/opus-reason-categories-implementer-1.md
  - skills/plan-spec/SKILL.md
  - skills/plan-spec/reference.md
  - src/hooks/agent-tier-gate.js
  - src/hooks/test-agent-tier-gate.js
