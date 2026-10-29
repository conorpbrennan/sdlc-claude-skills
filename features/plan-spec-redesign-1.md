# Plan Spec Redesign 1

**Requirement**: Slim plan-spec: tiers, seam-scoped review loop, enforced size caps, and a smaller reference.md.

**Started**: 2026-10-29
**Last updated**: 2026-10-29
**Branch**: plan-spec-redesign-1

## Acceptance

1. Running `python3 -m pytest -q skills/plan-spec` exits 0.
2. Running `bash tools/run-tests.sh` exits 0 and `claude plugin validate .` exits 0.
3. `python3 skills/plan-spec/check_size.py tmp/plan-spec-redesign-phase1.md` exits 0 with no `OVER:` line.
4. `check_size.py` exits 1 on a fixture with a prose line over the line cap, on an 11-step plan, and on a pointer outside an `ASSUMES LANDED` line.
5. `wc -c < skills/plan-spec/reference.md` is under 65000 and `skills/plan-spec/history.md` exists.
6. `grep -rnE '40,000|15 steps|80 lines' skills/plan-spec/SKILL.md skills/plan-spec/reference.md` prints nothing outside §22's provenance sentence.

## Files involved

- .claude-plugin/plugin.json
- skills/plan-spec/check_size.py
- skills/plan-spec/fixtures/line-over.md
- skills/plan-spec/fixtures/note-plan-budget.md
- skills/plan-spec/fixtures/note-step-budget.md
- skills/plan-spec/fixtures/pointer-breach.md
- skills/plan-spec/fixtures/steps-eleven.md
- skills/plan-spec/fixtures/t0-clean.md
- skills/plan-spec/fixtures/t0-extra-section.md
- skills/plan-spec/test_check_size.py

## History

<!-- populated on commit -->
