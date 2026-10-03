---
name: plan-spec
description: Write an implementation plan that sub-agents can build unattended - one step per commit, one review per commit - or run a plan that already exists. Use when work is large enough to need a plan before code, when asked to plan or orchestrate a multi-step build, or when dispatching implementers and reviewers step by step. Carries the step form, the plan skeleton, the pre-run review loop and the four dispatch prompts. Not for search-shaped work (research, exploration, prototyping to find the design), where the step list cannot be fixed before dispatch.
user_invocable: true
arg_spec: "[write <slug> | run <plan path> | check <plan path>]"
---

# Plan specification

Everything below is condensed from `reference.md` in this directory, which is
the authority and cites the run each rule came from. Read the reference
section named beside a rule before applying it; do not re-derive a form from
memory.

## 0. First, does this work fit?

Two assumptions run under every rule. Check them before writing anything.

1. **Done can be written as a closed, checkable list before the first step.**
2. **The step list can be fixed before dispatch.**

- Deterministic artefacts (a file, a report, a figure) satisfy both. Strongest case.
- Services, libraries, hooks, CLIs: fit, with §3's substitute target.
- Behaviour-preserving refactors: fit, and need the characterisation set of §3 as step zero.
- User-facing work: fits where judgement calls are named-reader conditions batched at breaks (§16, §18.1, §20.3).
- **Search-shaped work does not fit.** Research, exploratory analysis,
  prototyping to find the design: step five is a function of step four's
  result. Say so rather than forcing it; what transfers is §3's ordering
  (freeze the evaluation before the first experiment), §6 and §13.

Then size it. **Three steps or fewer, no two steps sharing a file, one
sitting, no frozen target?** Use the reduced form in §22 — a one-page plan,
one review round, four fields per step — and skip most of what follows. The
gates never scale down; the paperwork does.

## 1. Mode: write a plan

1. **Ask the owner decisions first (§2, §20.3).** Every point only the owner
   can settle, each with its options priced and the step it blocks. Three
   recur on every plan and are easy to miss because they are about process:
   - the cap on the review loop below (an input, never a constant);
   - standing authorisation to stage, commit and dispatch fixes unattended,
     quoting the harness rules it overrides — otherwise the run stalls at
     the first commit;
   - which steps carry a named-reader condition, and at which breaks the
     owner clears them.
2. **Draft the ten sections (§20).** Sections 1, 2, 3, 4 and 7 are written
   and reviewed before any step is dispatched. Section 2 (working
   constraints) carries the class-level guards, the exact commit command, the
   single owners, the implementer's tier, the always-permitted paths, and
   the three harness facts in §20.2 — get these wrong and every step pays.
3. **Write each step to the §16 template.** Ten fields. The two that decide
   whether the step is buildable: **GATE** (conditions any reader settles
   the same way twice, by running something) and **REVIEW** (numbered
   questions plus a closed FAIL list — everything whose answer could differ
   between two competent readers goes here, never in GATE).
4. **Size each step against §17's four tests.** One step is one reviewable
   diff, one commit, one GATE, one implementer pass. A step that fails a
   test splits, and the split is written into the plan before dispatch.
5. **Run the review loop (§2a).** See below.

### The pre-run review loop (§2a)

Iterate until one of two conditions, then dispatch step one.

- One **fresh** independent reviewer per round, heavy tier, given the
  document and **exactly one input** to hold it against (§21.4's prompt). Do
  not tell it what earlier rounds found, what changed, or which round it is.
- Disposition every finding as the round closes — folded in, or rejected
  with the reason — into §20.8, before the next round starts.
- **Stop on: no new criteria** (every finding names a defect class already
  dispositioned) **or the declared cap.**

**The fold-in is the least-checked text (§2b).** The finding was verified;
the fix that closes it is new text no round has read, and a correction flag
makes it look more checked, not less.

- Run `check_citations.py` in this skill's base directory, as
  `python3 <that path> <plan> <branch>`, before every round and before dispatch — it is a gate, not a criterion. A
  `NEW` file set exempts paths and symbols; a `TESTS FIRST` field exempts
  symbols only, so the test's file must still resolve.
- Apply a batch of edits with `edit_doc.py` in this skill's base directory — `apply_edits` for one file,
  `apply_edits_multi` across several — never a read-substitute-write loop: a
  loop leaves earlier edits on disk when a later anchor misses and reports
  only the miss (§20.2).
- Cite by symbol first, line second; give both branches where a plan spans two.
- Prefer a fix that removes a claim over one that adds one. A fix longer than
  its finding is a smell.
- The round after an internal-consistency round is always a source round —
  generally, never follow a fold-in with an input blind to what it wrote.
- Treat a flagged claim about code as unverified until a source round or the
  checker has seen it.

**The materiality bar.** Raise a finding only if it would change what gets
built: a step's file set, a signature, a gate, the step order, or what an
implementer does on reading the plan. Ask "and then what would be built
differently?" — if the answer is nothing, it is not a finding. A round whose
findings all fall below the bar **is a converged round**: record them as
noted-not-actioned, stop, dispatch. Do not fold them in and run another
round to check the fold-in.

## 2. Mode: run a plan

Hold the state in the tracker (§19a) — committed, one step behind, and
sufficient for a fresh orchestrator holding only the plan and the tracker to
resume from cold. Anything you know that is not in it is state the run will
lose.

Per step:

1. **Dispatch the implementer** with §21.1's prompt: the step verbatim, the
   working constraints verbatim, what landed before it, and the preceding
   step's NEXT. It does not stage and does not commit.
2. **Read the report in full** (§19) and write it to
   `run/reports/<step>-implementer-<round>.md`. Append DISAGREEMENTS and
   DECISIONS to the tracker before dispatching anything else.
3. **Stage everything** — the step's files, the plan if DECISIONS-OPEN was
   written, the previous step's tracker block and reports — then **attempt
   the commit once and expect the block.** That block message is the only
   source of the marker recipe. Nothing staged after the marker is written
   can be in the commit.
4. **Dispatch the reviewer** with §21.2's prompt, into a throwaway worktree:
   `git worktree add <dir> HEAD`, then pipe `git diff --cached` into
   `git apply --index` there. `--index` is not optional. Tell it which paths
   in the diff are not the step's work.
5. **On PASS:** run the printf recipe from the block message verbatim, log
   the round with `step=<id>`, retry the commit.
6. **On FAIL:** §18.3. Check what the finding *rests on* before choosing the
   remedy — a claim about what the repository already contains is what
   decides between a fix and a remediation, and it is as unchecked as a
   fold-in (§2b). A fresh implementer fixes — never the reviewer, never you.
   Its worktree is destroyed with the export; **a worktree serves one
   round.** Round two reviews the whole staged diff, not the delta. After
   two FAILs stop and ask the owner.
7. **A real finding outside the closed FAIL list is a step, not an advisory**
   (§18.6). Give it its predecessor's id with a letter suffix and a full §16
   block written into the plan *before* dispatch. That block is the one
   piece of the plan no review round will ever see (§2b), so state its GATE
   as commands with expected output, and tell the implementer the block is
   unreviewed: a disagreement with it is a DISAGREEMENTS entry (§19), not an
   error to work around. Never absorb the work into the step that provoked
   it — that is how a file set grows during implementation (§17).
8. **Close the step against §18.1's five conditions**, then the next.

Overlap the review of step N with the implementation of N+1 only when their
file sets are disjoint (§7a), and never two implementers or two reviewers at
once. A fix round ends the overlap.

## 3. What never scales down

At any size, on any shape:

1. The design is settled before dispatch (§1).
2. Every step has a mechanically checkable GATE (§16).
3. Every commit is reviewed (§9) — small local defects are what per-commit
   review catches, so this is the size it is *for*.
4. The file set is declared and does not grow (§16, §17).
5. The gate tooling fails closed (§12) — run its own tests first, and write
   the red baseline into §20.4.
6. Decisions taken and disagreements found are written down (§13, §18.5),
   even when the record is three lines.
7. A measurement against real material is reported as ordinals, counts and
   shapes, never as identifiers (§14) — §19's reports and §19a's tracker are
   committed files, so they are inside the no-client-data boundary.

## 4. Where to look in `reference.md`

| Need | Section |
|---|---|
| Terms (single owner, class-level guard, READY, the marker) | Terms |
| Why the plan does the design | §1 |
| Owner decisions; the review loop | §2, §2a |
| Why a review fix is the least-checked text | §2b |
| Frozen targets, substitutes, characterisation sets | §3 |
| Client data, and redacting the run's own reports | §14 |
| The signed spec and amendments | §4 |
| Parallelism, worktrees, commit order | §7, §7a |
| The commit protocol, staging, the first attempt | §8 |
| Review tiers, rounds policy, implementer tier | §9 |
| The step template, GATE vs REVIEW | §16 |
| How big a step is | §17 |
| Done; gate fails; review fails; step wrong; decision mid-run; step inserted | §18.1-18.6 |
| The implementer's report; where reports live | §19 |
| The orchestrator's tracker | §19a |
| The plan's ten sections | §20 |
| The four dispatch prompts | §21 |
| The reduced form for small changes | §22 |
