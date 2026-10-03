# Plan specification: what a plan must contain to be built autonomously, one step at a time, with a review on every commit

Written 3 Sep 2026 from the first run that did this end to end: Assay Phase 15
(`docs/phase-15-plan.md`, revision 16, 23 steps), driven by one orchestrating
agent, each step implemented by a fresh sub-agent, each commit reviewed by a
separate reviewer before it landed. Twelve steps had landed when this was
first written; the run has since finished all 23 and written its as-built
section. Every step reproduced its frozen targets on the first implementation
pass — which is not the same claim as landing in one commit, and three did
not: 78b took three commits, 83 and 96 two each, in every case because a
review asked for more (§18.6). What follows is what made that possible, what
nearly broke it, and what the next plan has to carry so the same run costs
less.

Everything in the original text was observed in that run. Where a rule comes
from a specific incident, the incident is named. Amendments dated after 3 Sep
2026 come from later runs and say so in their own first line, so "that run"
always means Assay Phase 15 and never a reader's guess; the first of them,
4 Sep 2026, is from a run building a parser against client material, and
touched §§1, 2b, 14 and 18.6.

**How a section grows, and how it stops.** A rule earns its first incident
because the incident is the evidence: strip it and the rule is an assertion.
But a section carrying two full narratives is already harder to use than the
rule it states, and §2b explicitly invites a third — it asks for a second run
as worth more than any argument in it. So: when a later run *reproduces* a
rule, the earlier incident compresses to a clause and only the new one is
written at length, because the sentence worth keeping is that the rule held
twice, not the detail of the first time it held. When a later run
*contradicts* it, both stay in full until the disagreement is resolved — that
is the case the detail is for. A section should not carry three worked
examples of equal weight. The division of labour that makes this document
usable is that the reference accretes incidents and `SKILL.md` carries the
rules stripped of them; it holds only while the reference stays readable, and
a rule that has to be rediscovered under its own evidence has failed the same
way an unstated one does.

**What this specifies, and what it does not.** Two assumptions run under
every rule below, and leaving them unsaid is how a reader for different work
follows the letter and builds the wrong plan: that the definition of done can
be written as a closed, checkable list before the first step, and that the
step list can be fixed before dispatch. Deterministic artefacts satisfy both
most strongly and are what this was measured on. Services, libraries, hooks
and behaviour-preserving refactors fit with the substitutions in §3 and
§20.4. User-facing work fits where its judgement calls are written as
named-reader conditions and batched at breaks (§16, §18.1, §20.3).
Search-shaped work — research, exploratory analysis, prototyping to find the
design — does not fit, because its second assumption fails outright: step
five is a function of step four's result, and §§1, 17 and 22 all forbid
discovering it. What transfers to that shape is §3's ordering (freeze the
evaluation before the first experiment), §6 and §13. A plan for it wants a
different document, not a waiver from this one.

Sections 1-15 are the rules, §2a, §2b and §7a among them. Sections 16-21 are the
forms those rules are written in: the step, its size, its close, the
implementer's report, the orchestrator's tracker, the plan's own skeleton, and
the four dispatch prompts. The Terms block below defines the words the rules
use that were house words in the run. If you are writing a plan from scratch,
read §20 first and §16 second; if you are running one, read §19a and §21. If
the change is small — three steps or fewer, one sitting, no two steps sharing
a file — read §22 first: it says which of these forms you carry and which you
do not, and it is a page.

Reviewed twice on 3 Sep 2026 against the plan this describes. The first
review found that every artefact the rules govern was tribal: the Assay plan
named its own house style as "matches `docs/aprime-plan.md`", so a reader of
the rules alone could not produce a step. §§16-19 closed that. The second
review found that the fix had specified the step and not the document that
holds it, and that three of the new rules were stricter than the run they
came from. §20 and the corrections in §16 and §17 close those.

Reviewed a third time on 3 Sep 2026 by an independent reviewer given only
this document. It found that the document specified the step, the report and
the plan and left the run loop unspecified — no dispatch prompt, no tracker,
no fix path, and a contradiction between §7a and §10 exactly where the fix
path should be — and that §16 presented as observed eight fields the run
never carried. The Terms block, §19a, §21 and the corrections in §3, §4, §7,
§10, §16, §18.3 and §20 close those.

Reviewed a fourth time on 3 Sep 2026, again by a reviewer given only this
document, which checked its claims against the plan, the signed spec, the
reviewer agent definition, the hook source and the timing log. It found the
new forms sound in themselves and broken at their seams: a tracker that
could not be committed in the step it described, a reviewer worktree whose
diff was invisible to the reviewer, reports that three prompts pasted from
and nothing wrote down, and failure paths that ended at "ask the owner". It
also found this document's own provenance stale in five places. §18.6, the
report paths in §19, §21.4 and the corrections in §4, §7a, §19, §19a, §20,
§21 and Terms close those.

A fifth round, 3 Sep 2026, held the document against a new input: not a
reading but an attempt to execute it. The reviewer picked two real defects in
the harness this document lives in, wrote them up as steps to §16, filled the
plan, the prompts and the tracker, then cloned the repository and drove the
real gates through the whole loop — block, worktree, marker, FAIL, fix round,
commit. Everything the document claims about the marker, the lock, the hash
exclusion, the worktree and the fix export held under that test. What did not
was the seams with the harness: a reused worktree that would have shown round
two the diff that already failed, a per-commit consent rule the document
never asks the owner to waive, and a first commit attempt that is the only
source of the marker command and was nowhere described. §§2, 7a, 8, 9, 12,
18.1, 18.3, 19a, 20.2, 20.3, 20.4, 21.1, 21.2, 21.3 and Terms close those and
the twelve smaller silences found with them. It is the only round so far that
found what it found; a document cannot be read into telling you that your
sub-agent's shell is gated.

A sixth round, 3 Sep 2026, held it against a project shape it was not written
from — a user-facing feature, a search-shaped research task, a
behaviour-preserving refactor — and found one defect wearing three faces: the
two assumptions now stated at the top of this document were unstated, so an
author whose work broke either followed the letter and built the wrong plan.
Judgement-based acceptance had a gate form in §16 and was then made an
illegitimate stall by §18.1 and §18.5; search-shaped work had no exit in §18
for a step that ran correctly and returned a negative result; and a refactor
was offered a substitute frozen target that its own suite already failed to
provide. The scope statement, §1's named exception, §3's characterisation-set
paragraph, and the corrections in §16, §18.1, §19a, §20.3 and §20.4 close
those. It let four further observations go as below the bar (§2a), which is
the first round to do so.

## Terms used throughout

Five of these were house words in the run this came from, resolvable only by
reading the plan it came from. The rules below are unusable without them.

- **`[A]`**, in the run's step headings — a scheduling tag, not a tier. It
  comes from the previous plan (`docs/aprime-plan.md`), whose legend reads
  "[T] tonight, [Th] Thursday-provable, [A] after", and means authorised but
  not scheduled. All 23 steps of the Assay plan carry it, so there it
  conveys nothing; it survived as house style. A plan either gives its tags
  a legend in its working constraints (§20.2) and uses them to mean
  something, or omits them. It is not in the §16 template for that reason.
- **Single owner** — the one module that may implement a given thing, which
  every other caller imports rather than reimplements. The plan lists them
  in §20.2, each with the search that found the candidates, so
  "reimplemented an owner" is a finding a reviewer can settle rather than an
  opinion.
- **Class-level guard** — a test whose subject set is discovered by scanning
  the repository rather than by import: it asserts a property over every
  module, fixture or artefact of a class, so a new member of that class is
  in scope the moment it lands and the guard covers it without being edited.
  These are the tests a step can break without touching their file, which is
  the §5 incident. Find a repository's by searching its suite for
  collection-time iteration over modules or paths (`iter_modules`, `walk`,
  `glob`, `rglob`) rather than for fixtures.
- **READY** — the verdict of an independent review of a *document* (the
  plan, the spec): it can be dispatched or signed as it stands. Distinct from
  PASS, which is a verdict on a diff.
- **STOP-AND-REPORT** — a finding the agent must not work around: it stops
  before committing and reports it (§18.2, §18.4).

Three more name this project's harness rather than a general one. A run on
different infrastructure substitutes its own, and must meet the contract
stated with each.

- **The marker command** — the `printf` line a blocking pre-commit hook
  prints, which binds a review PASS to the hash of the exact staged diff
  that was reviewed. Contract: a commit cannot land without a PASS bound to
  the index as it stands, and the binding is computed by the tool, never
  typed by an agent. Here it is `pre-commit-review.js`, and the verdict
  trailer it consumes is `TDD_GATE: PASS` or `TDD_GATE: FAIL` as a report's
  last line.
- **The timing-log CLI** — `node timing-log.js <event> key=value ...`
  (`src/hooks/timing-log.js`, deployed to `~/.claude/hooks/`), appending
  JSONL to `~/.claude/code-review-timing.jsonl`. A round is recorded as
  `review.completed agent=<name> round=<n> verdict=<PASS|FAIL> critical=<n>
  important=<n> advisory=<n> repo=<path>`. Note what that does not carry:
  elapsed time. The minutes exist only in the hook's own
  `review.completed_inferred`, derived from the lock-to-retry delta, so a
  run that wants a round's duration joined to its verdict logs it itself.
  The CLI takes arbitrary keys, so a run adds `step=<id>` — without it the
  record says a round happened and not what it reviewed. Contract: every
  review round leaves a durable record of agent, round, verdict and the step
  it belongs to, joinable to the commit afterwards. §8 and §18.1 mean that
  contract, not this file.
- **The feature record** — `features/<branch>.md`, which a pre-commit hook
  merges the touched-file list into and restages *during* the commit
  attempt, and a post-commit hook appends the sha to. Contract: a file the
  commit machinery rewrites underneath the agent, so it appears in a step's
  diff without being in the step's file set (§20.2).

## 1. The plan does the design; the implementer executes

The single biggest factor. The plan had been through eight independent review
rounds before a line of code existed, each round asking a different input
(source, the plan itself, the run artefact, the policy register). What drove
those rounds and what ended them is §2a. Implementers therefore found the
design settled and spent their budget on building and measuring, not choosing.

The two places implementers had to design anyway were exactly where the plan
was silent: the per-pass function signature (the plan sketched
`derive_groups(run, axes)`; the spec required a slot in every subject, which a
run artefact cannot supply) and which group an outlier is quoted from when it
separates in several. Both were resolved conservatively and recorded. A
thinner plan multiplies those calls, and they do not all go the same way.

This is the rule with an exception, and it is the one named above: where the
work is a search, the step *is* the design and cannot precede it. §9's
"a step that looks as though it needs the heavy tier to build is a step the
plan under-specified" inverts for that shape. Everywhere else, a thinner plan
multiplies the calls below.

**Rule.** Every step states its function signatures, its input and output
shapes, and the single owners it must import rather than reimplement. A step
that says "add X" without saying what X's callers pass is a step that will be
designed by whoever picks it up. The form is §16; the test of whether a step
is small enough to be one commit is §17.

**Amendment, 4 Sep 2026: not everything the plan *can* specify should be.**
A rule the implementer can check against ground truth is a rule the plan
should state as a property, not as an implementation. One run put three
versions of a single parser regex into its plan document. The first was wrong
on the real data (dropped three rows); the replacement fixed three of the
four cases; the version that worked stated the requirement and the measured
geometry and left the pattern to the implementer, who designed it against the
fixture and the real file and reported 117 of 117.

**Rule.** Where a rule can be checked against ground truth, the plan states
the property and the measurement, not the implementation. A pattern written
into a plan is the least-executed text in the document: reviewers read it and
prompts quote it, but nothing runs it until a step is dispatched. State what
must hold, state the evidence it must satisfy, and require the implementer to
report the measurement (§19 MEASUREMENTS). This does not thin the step —
§16's signatures, shapes and single owners still bind. It moves one class of
detail out of prose that cannot fail and into a gate that can.

## 2. Owner decisions are resolved before the run starts

The plan named its wait states (S1, the signature on the spec; D1, where a
computation lives) in one section with where each bites. The owner answered
them, plus the smaller sign-offs, in three question rounds before any agent
was dispatched, and pre-authorised the orchestrator to complete a signature
block once an independent review said READY.

Result: zero wait states in twelve steps. That is the whole reason the run
could proceed unattended.

**Rule.** A section named "Owner decisions" listing every point only the
owner can settle, each with its options priced and the step it blocks. Ask
them all up front. Record the answers in the plan (Assay put them under §3 as
D2) so the record of why is in the same document as the work.

Two of those points are the same on every plan and are easy to forget
because they are about the process rather than the work.

The first is the cap on the pre-run review loop (§2a). The second is standing
authorisation to run unattended: §7a.3 and §8 have the orchestrator stage and
commit without asking, and §18.3 has it dispatch a fix round the same way,
and the harness the run sits in may forbid exactly that — the one this
document was written in instructs its agent to stop once a review passes and
wait for the user. Where the two disagree the orchestrator can only break the
harness's rule at every commit or stall at every commit, and neither is a
run. So the authorisation is asked as a decision, with the rules it overrides
quoted, and answered before step one, the way §2 pre-authorised the signature
block. Unanswered, it is not a wait state that bites at step 14: it bites at
the first commit.

## 2a. The pre-run review loop

Added on the owner's instruction, 3 Sep 2026, after the fourth review of this
document. §1 credits eight independent review rounds before a line of code
existed and never said what drove them, how they ended, or what a round was.
This is that loop, and it is the reason §1's implementers found the design
settled.

**When it starts.** The plan and the spec are drafted and §2's owner
questions are asked and answered. Not before: a round spent on a document
with open owner decisions spends its budget rediscovering them, and the
answers change the text it is reviewing.

**One iteration.**

1. One independent reviewer, the heavy tier (§9 — Opus at the time of
   writing), fresh context, given the document and exactly one input to hold
   it against (§21.4). It is not told what the previous rounds found, what
   changed since, or that it is round n. A reviewer handed the prior findings
   reviews the fix list; a reviewer handed the document reviews the document.
2. Every finding is dispositioned as the round closes: folded into the
   document, or rejected with the reason. Both go to the plan's review-
   findings section (§20.8) — accepted and where it landed, rejected and
   why. A round whose findings are read and not recorded has bought nothing
   the next round will not have to buy again.
3. The next iteration starts on the revised document, with a fresh reviewer.

**When it stops.** Either condition ends it, whichever comes first.

- **No new criteria.** Every finding of the round names a defect class
  already dispositioned in §20.8: restatements, re-finds of items already
  closed, or preferences already rejected with a reason. This is the real
  stopping rule, and note what it is not — it is not "no findings". A heavy
  reviewer given a large document will almost always find something; the
  question the loop asks is whether it found a *kind* of thing that is new.
- **The declared cap.** Not a constant in this document: the maximum number
  of iterations is an input, named by the owner before the loop starts,
  asked with §2's other decisions and recorded with them (§20.3). The run
  this document describes converged in eight, which is the only calibration
  point there is — a long plan against a novel design will want more, a
  one-page plan against a well-understood change one or two (§22). As a
  floor rather than a rule: a plan of five steps or fewer that has not
  converged in two rounds is being rewritten, not reviewed. A loop with no
  declared cap has no failure boundary; a cap named once the rounds are
  under way is named to fit how the rounds are going.

**The bar for raising a finding.** Convergence is the goal and the cap is a
failure boundary, not a target: a loop that runs to its cap has usually spent
its last rounds finding better wording rather than new criteria. So the
reviewer is given the bar before it starts, and the bar is materiality. A
finding clears it if it would change what gets built — a step's file set, a
signature, a gate, the order of the steps, or what an implementer does on
reading the plan. It fails if the answer to "and then what would be built
differently?" is nothing: a better sentence, a preference between two
workable forms, a section that would read better reordered, a rule that is
right and could be stated more strongly.

The asymmetry sets the bar high. A material defect missed costs an amendment
mid-run or a step built wrong. A minor one raised costs a round from every
party, and its fix creates the next round's seam — which is exactly how a
loop runs to its cap without converging. Converging on a document with three
known blemishes beats four more rounds spent removing them and introducing a
fourth.

**A round below the bar is a converged round.** If every finding of a round
fails the materiality test, the loop is finished: record them in §20.8 as
noted and not actioned, stop, and dispatch step one. Do not fold them in and
run another round to see whether the fold-in was clean. That move is what the
cap exists to catch, and taking it deliberately is worse than hitting the cap
by accident.

**Rule.** The loop runs to one of those two conditions before the first step
is dispatched, one fresh independent reviewer per iteration, one input per
iteration, every finding dispositioned in §20.8 before the next iteration
starts. The plan's loop closes on READY; the spec's closes on the signature
(§4). Log each round the way a diff review is logged (§8) — the run recorded
its plan rounds through the same CLI, with the agent field naming the tier
rather than a step's reviewer — so that "eight rounds" is a record rather
than a recollection.

**Three failure modes, all seen.** *Churn*: each round's fix creates the next
round's seam, and this document's fourth round found little else — seams
where the third round's new forms met the old rules. That is the loop
working, and it is also why a cap exists at all: a document still turning up
new criteria one round short of its cap is being rewritten rather than
reviewed, and the right move on reaching the cap is to dispatch step one and
let the run find the rest.
*Confirmation*: the fresh-context rule above, which is the whole reason a
round is worth more than a reply to the last round. *The unreviewed fix*: no
round reviews its own fold-in — the next round reviews the document that
contains it, which is the only reason the loop converges on the document
rather than on the reviewer's opinion of the patch. That last one holds only
where the next round's input can see the kind of claim the fix wrote, which is
a condition on it rather than a retraction of it: §2b.

## 2b. The fold-in is the least-checked text in the document

Added 3 Sep 2026 from one run: four rounds on an Assay plan for release-note
ingestion. Twice in that run, the text a round added was itself the next
round's defect.

Round 2 found that round 1's fix asserted how an egress guard works, taken
from a comment in the repository rather than from the code. Round 4 found that
round 3's fix named a module as the emitter of an artefact it does not emit,
and declared a function NEW that had existed all along. Neither defect was in
the plan before its review. Both arrived as corrections.

**The mechanism.** A finding is verified — that is what a round is for. The
fix is not. It writes a new claim that no round has seen: the round that asked
for it has already reported, and the next round reads a document where the
claim sits under a correction flag, which makes it look more checked than the
prose around it rather than less. A reader who trusts anything in a reviewed
document trusts its corrections most, and they are the only sentences in it
that nothing has read.

**Why §2a's answer is weaker than it sounds.** §2a says no round reviews its
own fold-in, and the next round reviews the document that contains it. That is
true, and it is why the loop converges. But it holds only where the next
round's one input can see the *kind* of claim the fix introduced. Round 3's
input was internal consistency, and a factual claim about code is invisible to
that input — so round 3's own fixes passed through it untouched and survived
until round 4, which happened to be a source round. That was luck. The rules
below make it a property.

**Rules.**

1. **Run the checker before every round and before dispatch.**
   `check_citations.py` in this skill's base directory, run as
   `python3 <that path> <plan> <branch>`, resolves every citation against the branch the work will land on. It is
   mechanical, so it is a gate (§16), not a review criterion, and it costs
   seconds. Two fields exempt what a step has not written yet: a `NEW` file
   set exempts the paths and symbols in it, and a `TESTS FIRST` field exempts
   symbols only — the test file itself must still resolve, because a step
   writing a test into a file that is not there has a file-set defect worth
   catching. A citation reported that you believe is fine is usually in
   neither field: move it, rather than reading the gate as broken.
2. **Cite by symbol first, line second.** A symbol survives an edit above it
   and a line number does not. Where a plan is written on one branch and
   dispatched against another, give both.
3. **A fix that removes a claim beats one that adds a claim.** The finding
   already established that something was wrong, so deleting it is verified by
   the finding itself; replacing it introduces text nothing has read. A fix
   longer than the finding it closes is a smell.
4. **If a further round runs, the round after an internal-consistency round
   is a source round.** Generally: a round whose one input cannot see the
   class of claim the last round's fixes introduced is a round that lets them
   through, so choose the next input from what the last fold-in wrote rather
   than from a fixed rota. This selects the input of a round that was going to
   happen; it never adds one, and §2a's stopping rule still ends the loop —
   including on a fold-in nothing has re-read, which the checker in rule 1
   covers precisely because no round will.
5. **A correction flag means "reviewed, then rewritten".** Treat a flagged
   claim about code as unverified until a source round or the checker has seen
   it. The flag records that a sentence changed; it says nothing about whether
   the new one is true.

**What none of this promises.** The checker resolves a citation; it cannot
tell you that the claim attached to it is true. The wrongly-named module in
round 3's fix existed, and naming it was still false — a resolving citation
and a correct one are different properties, and only the first is mechanical.
These rules tighten the loop. They do not shorten it, and none of them
replaces a round.

**One calibration point.** All of the above is from a single run, in the same
way §16 is explicit that its template is two observed fields and eight
promoted. A second run that failed to reproduce it would be worth more than
any argument here. The amendment below is that second run, and it neither
reproduced nor contradicted the mechanism: it found the same defect with two
authors this section had not named, which is why rules 1-5 and their incident
stand unchanged beneath it.

**Amendment, 4 Sep 2026: two more authors write unchecked text.** The
mechanism above is about a review round's fold-in. Two adjacent cases from a
later run behave identically and are not covered by rules 1-5 as written.

*The orchestrator writing into the plan mid-run.* Inserting a step under
§18.6 means writing a full §16 block that no review round will ever see — the
pre-run loop closed before the step existed. Two such blocks in one run were
wrong: a TESTS FIRST clause naming two drift tests when only one of them
detects drift, and a GATE saying a count would "return to its unpolluted
value" when the count had never moved. Both were caught by implementers who
checked the block rather than complying with it.

*A reviewer's supporting claims.* A FAIL carries authority, and its findings
get verified — but the facts a finding rests on do not. One round-one FAIL
read "zero at HEAD, no precedent, this diff opens the door". Both halves were
false: three real identifiers were already committed. That changed the action
from prevent to remediate, and the remedy from a fix round to a history
rewrite.

**Rules, continued.**

6. **An inserted step's §16 block is dispatched unreviewed, so write it to be
   checked.** State its GATE as commands with expected output, and say in the
   dispatch that the block has had no review round: a disagreement with it is
   a DISAGREEMENTS entry (§19), not an error for the implementer to work
   around.
7. **A finding's supporting facts are as unchecked as a fix.** Verify the
   claims a FAIL rests on before acting on it, not only the defect it names —
   especially any claim about what the repository already contains, which is
   what decides whether the remedy is a fix or a remediation.

## 3. Freeze the target before building against it

The scoring target (a fixture of 94 assertions translated from a model-written
review) was verified by an independent harness and frozen at step 82, before
the first deriver existed at step 83. Every later step reproduced its slice of
the frozen target byte for byte, and a third independent producer landing on
the harness's figures rather than the model's was the strongest evidence the
run produced.

**Rule.** Where the deliverable is a deterministic artefact — a file, a
figure, a table reproducible byte for byte — the harness that checks the
output is written first and never imports the thing it checks. The target
freezes in its own commit. After that, a change to it is an amendment with a
date.

The import isolation is itself a committed test: one assertion that the
harness module's import graph excludes the package under test. Any form that
goes red when someone adds the import will do. It has to be committed rather
than observed, because in this run it had to be strengthened mid-session when
the generator's own tests began importing the generator.

**Where the deliverable has no such target.** A service, a UI, a model, a
hooks repository: nothing in them is reproducible byte for byte, and this
section does not transfer as written. What transfers is the ordering, and the
substitute is the acceptance-criteria set — written, independently reviewed
and frozen in its own commit before the implementation exists, with the thing
that checks it unable to import the thing it checks. What freezes is the
assertion set rather than the bytes; the amendment rule (§4) applies to it
unchanged. A plan whose deliverable has no frozen target says which artefact
plays this role, in §20.2. A plan that says nothing has quietly dropped the
strongest evidence this method produced.

**Where the deliverable is unchanged behaviour.** A migration, a large move,
any refactor whose whole claim is that nothing observable differs: the
acceptance criteria are "everything currently true stays true", which is not
a closed list, and an author who reaches for the paragraph above lands on the
suite baseline (§12) and has addressed nothing. The suite is what already
failed to cover the code being moved; that is why the code can be moved
wrongly and stay green. The frozen target for this shape is a characterisation
set: golden outputs and a snapshot of the public surface, captured at HEAD
over the code the plan will move, with its coverage *of that code* measured
and the command quoted (§6), frozen in its own commit before step one, and
named in every move step's GATE. It is step zero, and a refactor plan without
it has no gate on the risk that defines it.

One caveat on the sentence above about not importing what it checks. It is
literal for a byte-artefact harness and it is not literal here: a
characterisation test calls the moved function, and a component test mounts
the component. The property to keep is that the check observes the
deliverable through the interface the acceptance criteria are written in,
never through its internals.

## 4. The signed specification, and how amendments happen

The spec was signed at step 79 and amended four times by step 87, each
amendment dated in its final section: one before the freeze for a rule arm
the plan left undecided, one before the freeze for a reading the harness
found under-specified, one before the freeze for a worked example that
disagreed with its own rule, and one after the freeze for a worked example
that quoted the wrong artefact. None moved a fixture byte. Two more landed
by step 93, on the same pattern.

**Rule.** Sign the spec once, early, after an independent review. Expect
amendments; make them cheap by requiring only a dated line in the signature
section and a note of what moved. Never let an example in a signed document
disagree with the rule beside it: two of the first four amendments were
worked examples, and that is the single most common defect a signed document
has.

**What the spec is.** Three documents, three jobs, and the rules above lean
on all three while defining only one. The **spec** says what the deliverable
must be true of, in the deliverable's own terms. The **harness** checks the
spec's claims against an artefact and may not import what it checks (§3).
The **plan** says what to build, in what order, by whom (§20). A plan that
also defines correctness has no spec, and its amendments are indistinguishable
from its revisions — which is what makes the four amendments below auditable
and a plan revision not. One person signs the spec: the owner of §2.

The signature section, at the end of the spec:

```
SIGNED: <name>, <date>, against spec revision <n>, after independent
        review (READY, <reviewer>, <date>)

AMENDMENTS
- <date>: <what moved>. <why>. Fixtures moved: <none | the list>.
```

That block is a reduced form and not a transcription: the run's own
signature section is a prose paragraph, a six-row table (specification,
phase and step, name, role, organisation, signed on) and dated amendment
paragraphs. What is promoted here is `Fixtures moved:` as a field — the run
carried that fact in the amendment prose, where it has to be read for rather
than read off.

An amendment is that one line plus the edit it describes; nothing else is
required, which is what makes it cheap enough to actually do. "Fixtures
moved" is the field that makes it auditable: four amendments by step 87,
none moved a fixture byte, and that is the sentence that let the frozen
target stay trusted across all four. An amendment that moves a fixture byte
is a re-freeze (§3) and is reviewed as one — the run's spec states that
rule more strictly still ("amending any of the above after signature ...
re-freezes the fixture"), and where the two readings differ, take the
spec's.

## 5. Every step's gate includes every class-level guard in the repository

The incident. Step 83's gate ran only the review tests. A class-level guard in
`tests/test_mechanisms.py` scans every module reading field diffs for a
presence check, and the new module had none. The suite was red at HEAD for
two commits; step 84's agent found it by running its own gate. The fix was
twelve lines. The lesson is structural.

**Rule.** The plan enumerates the repository's class-level guard tests once,
in its working-constraints section, and every step's GATE line includes them.
Not "the step's own test file" but "the step's own test file plus the guards".
A step that extends a module must be told which invariants the repository
already enforces on that module's shape.

## 6. Never write a count before the measurement exists

Assay's plan already had this rule ("all TRUE targets of type X as frozen at
step 82", never "the 6"). It held. Where the plan did quote numbers it had
measured, two were wrong (a per-file id split; an estimate of a sweep's size)
and both were caught by the implementer measuring again.

**Rule.** Gates name the property, not the number. Where a number is quoted
as a fact, the step says how it was measured so the implementer can re-run
it, and the implementer does.

## 7. Sequential, one sub-agent at a time

The owner's instruction, given after two agents had been started in parallel.
Kept for the rest of the run. Parallel steps on one working tree risk
colliding edits, and two agents running test suites on one box is how this
host has been killed before. The cost is wall clock; the benefit is that every
report is read before the next step starts, and every step sees the tree its
predecessor left.

**Rule.** At most one implementer and at most one reviewer at any moment,
and never two of either. Strict alternation was the run's first twelve steps;
the single permitted overlap and the three rules that make it safe are §7a,
which supersedes the stricter reading of this sentence. The orchestrator holds
the state — the tracker, §19a — and reads every report in full before
dispatching the next.

## 7a. Where parallelism is allowed, and the rule that keeps it safe

Decided mid-run, 3 Sep 2026, after twelve strictly sequential steps. The
question was whether the review of step N can run while step N+1 is being
implemented. It can, under three rules, and the third is the one that makes
the first two safe.

1. **Overlap only when the file sets are disjoint.** The next step's declared
   files are checked against the diff under review before dispatch. If they
   touch, the pair runs sequentially. In the Assay run, steps 89, 90 and 91
   all extend the same module and test file and stayed sequential; the
   overlap began at 92 (a scoring tool against the CLI and its reference),
   then 93 (corpus artefacts against the scorer), then the second cross-run
   pin's fixtures against the first.
2. **Reviewers always run in a throwaway worktree** at HEAD with the staged
   diff applied (`git worktree add <dir> HEAD`, then pipe `git diff --cached`
   from the main tree into `git apply --index` in the worktree), and run their
   tests there. `--index` is not optional: without it the worktree's index
   still equals HEAD, and a reviewer that reads the diff the way the agent
   definition here does — `git diff --cached -U10` — sees nothing at all and
   reviews an empty change. The prompt says where the diff is anyway (§21.2),
   because a reviewer should not have to infer it. The main tree never sees
   the reviewer, and the reviewer never sees the next implementer's
   half-written code. This holds even when nothing is overlapping: it keeps
   every test result attributable to one diff, and it removes the option one
   reviewer once took of stashing a file in the main tree. A worktree serves
   one round and is destroyed with it — see the fix path below for what
   reusing one costs.
3. **Commits are strictly sequential, by construction.** Step N's commit is
   made from the index, which holds N's staged diff and nothing else. Step
   N+1's edits stay unstaged in the working tree until N has landed; only then
   is N+1 staged. Commit order therefore follows step order whatever the
   agents' finishing order.

**When an overlapped review fails.** The reviewer does not make the fix; it
cannot (§10). A fresh implementer sub-agent is dispatched into the reviewer's
worktree with the step, the original report and the findings (§21.3), fixes
it there and re-runs the step's whole GATE in that worktree. The fix is then
exported with `git diff` there and applied to the main tree twice:
`git apply --cached <patch>` for the index and `git apply <patch>` for the
working tree. It conflicts only if the next implementer edited the same
lines, in which case that pair falls back to sequential.

**A worktree serves one round.** The fixed worktree is destroyed with the
export, and round two gets a fresh one from HEAD with the new
`git diff --cached` applied. This is not tidiness. A fix agent's edits land
in that worktree's *working tree*, unstaged, so its `git diff --cached` is
still round one's diff — and `git diff --cached` is how a reviewer reads a
diff. Reuse the worktree and round two reviews the code that already failed,
then returns a PASS that binds, through the main tree's index, to a diff
nobody read. That is §12's incident again, arrived at through hygiene rather
than a buffer.

A fix agent is an implementer, so §7's "never two of either" binds it: the
overlap ends when a review fails. If step N+1's implementer is still running
when N's FAIL arrives, the fix waits for it to report; nothing else is
dispatched until N has landed. This is the entanglement cost §7a's last
paragraph prices, and it is why overlap is not worth reaching for on steps
that share a file.

**What it buys.** Reviews took three to five minutes and implementations ten
to twenty-five, so the overlap saves roughly a sixth of wall clock on the
steps where it applies, at no cost to attribution. It is not worth reaching
for on steps that share a file: the entanglement cost on a FAIL exceeds the
saving.

## 8. The commit protocol

Stage in one shell call, commit in the next. The pre-commit hooks classify
the shell command and refuse one-breath forms; they also read the index, so
staging and committing together shows them the wrong index. The feature
hook merges touched files into the feature record and restages it during the
commit attempt, which changes the staged diff; the review hook now hashes
past that file, but the recipe changed mid-run and cost one blocked commit.

**The first commit attempt is part of the protocol, not a mistake.** Nothing
else produces the marker command: the recipe, with the hash pipeline already
written out for this index, is printed by the hook's own block message, and
so is the lock recording that a review was asked for this diff. The sequence
is therefore stage, attempt the commit once and expect the block, take the
recipe from the message, dispatch the review, run the recipe verbatim on
PASS, attempt the commit again. A run that reviews first and then goes
looking for a marker command has to compose the hash by hand, which is the
one thing the rule below forbids.

**What is staged, and by whom.** The orchestrator stages, and the list is
longer than the step's own files: the step's file set, the plan file where an
implementer wrote to DECISIONS-OPEN or an amendment landed, the previous
step's tracker block and report files (§19, §19a — they run one step behind),
and whatever the commit machinery has already restaged on its own. All of it
goes in before the commit attempt that produces the marker, because anything
staged afterwards changes the hash the marker is bound to and the commit
blocks. §19a carries this as a STAGE line per step, so it is a list to read
rather than a thing to remember.

**The commit command itself** is written out in the plan (§20.2), in full,
checked once against every gate the harness runs. This repository's, for
one, refuses a `-m` commit that carries no `Co-Authored-By:` trailer, so the
forms that pass are `-F <file>` or a second `-m`. One blocked commit per run
while someone works that out is cheap; one per step is not.

**Rule.** Use the marker command the hook's block message prints, verbatim,
with the fourth line naming the reviewer agent and round. Never compose the
hash by hand. Record every review round through the timing-log CLI, with the
step id as a key on the record (`step=<id>`), so a round can be joined to the
step and the commit afterwards: agent, round and verdict alone do not say
what was reviewed.

## 9. Review on every commit, sized to the diff

What the per-commit reviews caught that the step's own tests had passed:

- a real client trade id in a test comment, used as the "example shape" in
  the file whose job was the no-client-data guard;
- a review-queue census whose total and counts could disagree when one
  withheld id carried two findings;
- a zero-median group silently suppressing a member that moved 400 percent,
  the exact case the spec's null-ratio clause anticipated;
- a spec worked example quoting the policy file where the fixture and the
  generator quote the run-embedded policy.

Each was small, local, and would have been buried under later steps by the
time a phase-level review looked. That is the case for per-commit.

**Rule.** Round one on the everyday reviewer (Sonnet). The deep reviewer
(Opus) only after a FAIL with a critical or a correctness finding in a
parser, gate or shell hunk. After two FAILs, stop and ask. The heavy tier
(Opus) is for the plan text and the signed spec, where a defect costs an
amendment; it earned its cost there twice, which is why it is the default
there and an escalation, not a default, on a 50-line diff. The loop it runs
in, before the first step is dispatched, is §2a.

**The implementer's tier.** This section prices reviewers and says nothing
about the other side, which is how the run's own choice went unrecorded. The
rule is that the plan records it, in §20.2, and the default is the everyday
tier: a step written to §16 is execution, because §1 has already made the
design. A step that looks as though it needs the heavy tier to build is a
step the plan under-specified — spend the tier on the plan, where §2a is
already spending it, not on the step.

Reviewers are handed: the repo, the staged diff, the step's intent in one
paragraph, the single owners it must not duplicate, the specific things to
check numbered, and the FAIL criteria stated as a closed list. A reviewer
asked to "review this" finds style; a reviewer asked "does the emission loop
drop a non-tie-out" finds the loop.

## 10. Reviewers are read-only, and the definition makes it so

One reviewer stashed and restored a file to inspect the pre-diff state,
harmlessly, and disclosed it. It should not have had the option.

**Rule.** The reviewer agent definition forbids stash, add, checkout and
edits; the pre-diff state is read with `git show HEAD:<path>`. The
orchestrator verifies the index after every review that touched git at all.

Closed since: `agents/code-reviewer.md` forbids
`git stash/checkout/add/reset/restore` and any edit, so §15.4 is done rather
than pending. The consequence is the one this document used to leave open —
a reviewer that cannot edit cannot fix, so the fix path has to name someone
else, and does (§7a, §18.3, §21.3).

## 11. Red first, and say how

Every step asked for red-first evidence on its refusal tests and got it,
usually by the implementer removing the guard and quoting the failure text.
Twice the reviewer reproduced the red independently by mutation. This is
cheap and it is the only thing that separates a conservation check from a
comment.

**Rule.** Every test that asserts a refusal is run red first, and the report
quotes the failing assertion. Reviewers are told the claimed red and asked to
confirm it from the test body or by mutation.

## 12. The gating tools are part of the system under test

The first commit of the run skipped review entirely: a 13 MB diff overflowed
the hook's read buffer, the catch returned an empty string, an empty diff
scored as trivial, and a PASS marker was written for code nobody had read.
Three passes on the hooks followed the same day; the incident is now a test.

**Rule.** Before a run of this kind, run the hooks' own test suites and read
their fail-open paths. A gate that fails open on large input is worse than no
gate, because it writes the marker.

Write the result down rather than merely reading it. Every suite red at HEAD
before step one goes in §20.4 with, for each, the step that turns it green or
the reason it is out of scope. Two things go wrong without that baseline: a
suite found red mid-run is indistinguishable from a suite this step broke,
and a GATE line naming a suite that was already red cannot be passed by the
step that names it — which is discovered by the implementer, mid-step, as a
plan defect (§18.2).

## 13. As-built is recorded as it happens, not reconstructed

Every implementer report ended with "where the plan, the spec, the harness
and the code disagreed" and "decisions the spec left open". The orchestrator
appended those to a tracker after every step. By step 88 there were some
forty such lines, each with a path and a reason. The closing documentation
step will be assembled from them, not from memory.

**Rule.** The report template asks for disagreements and open decisions by
name (§19). The orchestrator writes them down before dispatching the next
step. The plan's final step is the as-built record, and it is written from
the tracker.

## 14. Client data never enters the repository, and the guard is committed

Real material lives in a gitignored directory; generators read it and emit
obfuscated fixtures; the map from real to synthetic ids lives beside the real
material, never in the repo. The committed half of the guard is a shape test
(every synthetic id matches a pattern no real id can) so the test never holds
a real value. One real id still reached a comment, as an example of the real
shape, and the review caught it.

**Rule.** No committed file names a scratch path as a dependency. The
no-client-data guard is a test in the repository, over every fixture that
shares the obfuscation map. Examples of a real identifier's shape are written
as a pattern, never as an instance.

**Amendment, 4 Sep 2026: the run's own paperwork is inside the boundary.**
§19 makes implementer and reviewer reports files in the repository, and §19a
makes the tracker a committed file. Both are surfaces §14 predates, and an
implementer measuring against real material writes its findings there. One
run's inserted step transcribed ten real rows — identifier, page number and
module name each time — into a tracked report, and that was the run's only
review FAIL. The fixtures were clean: swept against 7.7 GB of client material
twice, by two parties, with no collisions. The leak came through a door the
guard did not have.

**Rule.** A measurement taken against real material is reported as ordinals,
counts, lengths and shapes — never as identifiers. "Row 3 of 10, 143
characters, 21 tokens, header-shaped" carries the whole argument and none of
the source. §19's reports and §19a's tracker are committed files, so they sit
inside §14's boundary rather than outside it: the guard that covers fixtures
covers the run's own paperwork.

The test of a redaction is that the argument survives it. A reader with
access to the source must be able to rebuild every number without the
redacted text; if they cannot, the redaction removed evidence rather than
identifiers. That is measurable, and it was measured — the round-two reviewer
of the offending report re-derived all forty of its numbers from the source
without reading the redacted text, and they matched cell for cell.

## 15. What to change in the next plan

1. Put the class-level guard tests into every GATE line at plan-writing time
   (§5).
2. State every deriver's full signature and the convention shared across them
   (§1).
3. List the owner decisions in one section and ask them before dispatch (§2).
4. Make reviewer read-only-ness a property of the agent definition (§10).
   Done: the agent definition forbids it, and the fix path names a separate
   implementer (§18.3).
5. Run the hooks' own tests before the run and after any hook install (§12).
6. Budget by the measured cost: roughly one implementer plus two reviewer
   rounds per step, Sonnet for the gate, the heavy tier only for the plan and
   the spec (§9).
7. Declare each step's file set in the plan, so the orchestrator can decide
   overlap by reading it rather than by guessing; reviewers in a worktree
   always; commits from the index only, in step order (§7a).
8. Write every step to the template in §16, including the fields the Assay
   run carried only by house style: the id, the file set, the owners, GATE
   and ROLLBACK. A step missing GATE cannot be closed; a step missing
   ROLLBACK cannot be undone by the next agent, which is the one that will
   have to.
9. Give the plan a DECISIONS-OPEN section (§18.5) so a choice discovered at
   step 14 has somewhere to go that is not a stall and not a silent call.
10. Write the plan itself to the ten-section skeleton in §20. The Assay plan
    had those sections and this document did not name them, which is how a
    reader could follow every rule here and still produce a document with no
    working-constraints section and no definition of done.

## 16. The step, literally

The template below has ten fields. Two of them were fields in the Assay run:
`GATE:` and `ROLLBACK:`, on every step. The id, the file set and the owners
were carried in each step's prose. WHY NOW, WHAT TO BUILD, IMPORTS, ASSUMES
LANDED, MUST NOT TOUCH, TESTS FIRST, REVIEW and BUDGET were not fields at
all — they are promoted here, each one because §§1-15 names an incident a
field would have caught. That is the honest provenance: two observed and
eight promoted, not ten observed. §15.8 says as much, and this section used
to contradict it.

A step that omits a field names the decision its implementer will have to
make instead. A field that genuinely does not apply says so in one word
("ROLLBACK: none, additive"), so that a reader can tell a considered
omission from a forgotten one.

```
**<id>. <one sentence: what exists after this step that did not before>**
<NEW|EXTEND> <every path this step may touch, exhaustively>. The plan file,
the feature record and the tracker are never listed and never counted
(§20.2). No tag on the id unless §20.2 gives it a legend (see Terms).

WHY NOW (optional, one paragraph): the defect or the gap, measured, with
the command that measured it. A number here says how it was measured (§6).

WHAT TO BUILD:
- <the decisions, already made>: signatures with argument and return
  shapes; the owners to import rather than reimplement, by path; the
  convention shared with sibling steps; what happens in the edge case
  the reviewer will ask about.

IMPORTS (single owners; reimplementing one is a FAIL):
- <path>: <what it owns>

ASSUMES LANDED: <step ids, or "nothing beyond HEAD">
MUST NOT TOUCH: <the declared file sets of the sibling steps this one
could plausibly be confused with, by step id and path; or "none". Not a
guess at what a reader might expect: the list is drawn from the other
steps' file sets, which is why they are declared — and which is why this
field is filled last, after every step has one.>

TESTS FIRST: <the test files and the assertions that must be red before
the implementation exists, and how red is shown (§11)>

GATE: <every condition, each mechanically checkable by a reader with a
shell, joined by "and". Includes the repository's class-level guards
(§5). Names properties, never counts (§6).>

REVIEW: <the reviewer's brief for this step (§9): the specific things to
check, numbered as questions a reviewer answers one by one, and the FAIL
criteria as a closed list. Everything whose answer could differ between
two competent readers belongs here rather than in GATE. This field is
pasted into the reviewer's prompt verbatim (§21.2), so it is written to be
read by the reviewer, not about it.>

ROLLBACK: <"a single `git revert` of this step's commit" where the step is
additive and self-contained — those words, not a sha, which does not exist
when the step is written — or, where a single revert is not enough, the
revert order, what must be reverted with it, and why a partial revert is
worse than none>

BUDGET: <the wall clock this step is expected to cost and the number of
reviewer rounds expected. The run's baseline: implementations ten to
twenty-five minutes, reviews three to five, one implementer pass and one
or two rounds (§7a). The field earns its place on the steps that break
that baseline, so name any measurement, sweep or regeneration that will
take materially longer, with its expected duration and what it is waiting
on. A step that reads "1 + 2" like every other step has said nothing.>
```

**GATE, defined.** A GATE line is a conjunction of conditions, each of which
a reader can settle the same way twice. Most are settled by running
something and comparing: "the suite is green" is not a gate, `pytest -q
tests/test_x.py` exiting zero is; "coverage is good" is not, "diff-cover
reports no uncovered line in the step's file set" is.

A step whose output is prose or visual — the as-built record, a reference
page, a signed spec, a screen a person has to look at — cannot be gated that
way, and the run's closing step was exactly that. Its gate is a named reader
confirming a closed list of properties: "an independent reviewer confirms
that every entry in the tracker appears in the record, that every path named
resolves, and that no number appears without the command that produced it".
The list is the gate; "reads well" is not, and neither is "looks right". The
named reader may be the owner, and for user-facing work usually is. Where
such a step also has a mechanical half, both halves are in the GATE line, and
they close at different times: see §18.1.

What a named-reader condition must not become is a screenshot pinned as a
byte target. That converts the half of the work most likely to change into a
frozen artefact, and every later step then fails a gate for being an
improvement.

What does not belong in a gate is a condition whose answer could differ
between two competent readers. That is a review criterion, and it goes in
the step's REVIEW field, which *is* the reviewer's brief for that step: §9
says what a brief contains, §16's template holds it, and §21.2 is the prompt
it is pasted into. Before this had a field, "goes in the reviewer's brief"
named no artefact and the brief was whatever the orchestrator typed.

**Rule.** Every step is written to this template. The eight promoted fields
are the point of it: each closes an incident named above, and the run that
carried only the other two is the run in which those incidents happened.

## 17. How big a step is

The Assay run's steps ranged from a twelve-line fix to a full day's re-pin
sweep, and the sweep step said in its own text that it was "likely TWO
commits". That is the right instinct written in the wrong place: the step was
too big, and knew it.

**Rule.** One step is one reviewable diff: one commit, one GATE, one
implementer pass. The test an author applies before writing it:

- Its file set is declared and does not grow during implementation. A step
  that discovers a new file it must touch has found a missing prerequisite,
  and says so rather than absorbing it.
- Its GATE can be checked without running anything the step did not build or
  name.
- A reviewer can hold the whole diff in view. Count the implementation
  only: tests, fixtures and generated artefacts are excluded, because a
  hook and its suite in this repository routinely pass 500 changed lines
  together and are still one step. If the implementation alone approaches a
  few hundred lines, ask what the second step is. The other three tests
  decide more often than this one; where they disagree with the count, they
  win.
- Its ROLLBACK is a single revert, or the step declares the revert order and
  why a partial revert is worse than none. The run's re-pin step was the
  second kind: reverting the regeneration without the sweep leaves the
  re-pinned numbers asserting against the old bytes, which is a red suite
  rather than a rollback. That is permitted and it is also a signal, since
  that step said in its own text that it was likely two commits.

A step that fails any of these splits, and the split is written into the plan
before dispatch, not discovered by the implementer. Two commits from one step
is the signal that the plan owed the run another step.

## 18. Done, and what to do when it is not

### 18.1 Done

A step is complete when all of these hold. The orchestrator checks them
before dispatching the next step; the list is short enough to check.

1. GATE passes, every condition, run by the implementer and quoted in the
   report.
2. The review returned `TDD_GATE: PASS`, and the review round is recorded
   against this step's id (§8, the timing-log CLI).
3. The commit landed, made from the index alone, in step order (§7a.3).
4. The feature record carries the step's files. Its history line for this
   commit is not part of this check and cannot be: the sha does not exist
   until the commit does, so the line lands with the next commit — the same
   one step behind as the tracker block (§19a).
5. The report's disagreements and open decisions are in the tracker (§13).

Nothing here is "the owner has seen it" as a feeling. A closed list of
properties that a named reader confirms *is* checkable and is a gate (§16);
what is not checkable is unstated approval, which is why the Assay plan's own
definition of done says so explicitly rather than listing it.

**A named-reader condition does not hold up the commit.** The mechanical half
of the step's GATE closes the step and the commit lands on it; the reader's
half becomes an AWAITING READER entry in the tracker (§19a), cleared at the
break where §20.3 says those are batched. This is the one place where a step
is done for the purpose of §7a.3's commit order and not yet done for the
purpose of the plan, and the tracker is what holds the difference. Without
it, a step waiting on a person blocks every commit behind it, and an author
avoiding that pushes all judgement into a closing acceptance step — the
phase-level review §9 exists to argue against.

### 18.2 The GATE fails

The implementer reports, and does not commit. A failing gate is one of three
things, and the report says which: the implementation is wrong (fix and
re-run); the gate was wrong (a STOP-AND-REPORT finding, because a wrong gate
is a plan defect and the plan is amended, §18.5); or a prerequisite did not
land (the step was dispatched too early, and ordering is the orchestrator's
error to fix).

### 18.3 The review fails

Round one is the everyday reviewer. Escalate to the deep reviewer only after
a FAIL carrying a critical or a correctness finding in a parser, gate or
shell hunk. Any other FAIL — a scope breach, a missing test, an artefact
that disagrees with the plan — reruns on the everyday reviewer. After
two FAILs, stop: do not dispatch a third review. Show the open items and ask
the owner to choose between fixing and accepting with the gap named in the
commit message (§9). The run has a bounded number of rounds per step by
construction, which is what stops a step consuming a day of reviewer time.

**Who makes the fix.** Not the reviewer: it cannot edit (§10). Not the
original implementer: its context is gone by the time a review returns, and
re-establishing it costs more than the fix. A fresh implementer sub-agent is
dispatched with the step, the original report and the findings verbatim
(§21.3). It fixes, re-runs the step's *whole* GATE rather than the failing
condition, and reports to §19 with the round number. Under §7a it works in the
reviewer's worktree, which is destroyed when its fix is exported — a worktree
serves one round, and round two gets a fresh one (§7a); otherwise it works in
the main tree, with the diff still staged. The orchestrator does not make the
fix itself: an edit with no report behind it is the unauditable move §18.4
exists to prevent, and it is worse here because a review round is attached to
it.

**What round two reviews.** The whole staged diff, not the fix delta. A
reviewer shown only the delta cannot see what the fix broke, and the marker
binds a PASS to the hash of the entire staged diff in any case (see Terms),
so a PASS earned on a delta is a PASS bound to a diff nobody read — §12's
incident with the read buffer replaced by a choice. Round two is dispatched
with the same REVIEW field plus the round-one findings and the fix report, so
the reviewer can check the specific claim that each finding is closed as well
as the diff as a whole.

**Committing an owner-accepted gap.** The other exit from two FAILs is the
owner accepting the gap, and nothing had said how that commit happens: after
a FAIL there is no PASS marker, and the gate blocks — correctly, because
nothing passed. An acceptance is therefore an override of the gate, and it is
written down three times or it is indistinguishable from a review that never
ran, which is §12's failure with a person where the read buffer was. The
owner authorises the marker; it is written by the same tool command as a
PASS, with the tag naming the acceptance rather than a pass
(`code-reviewer:round2:ACCEPTED`, the tag being free text on the marker's
last line); the gap is named in the commit message; and the tracker's step
block records ACCEPTED WITH GAP and quotes the finding verbatim (§19a). No
agent may take this exit on its own: an accepted gap with no owner behind it
is a gate that failed open.

### 18.4 The step turns out to be wrong

Not "the implementation is wrong" but "the step should not be built as
written". The implementer stops before committing, reports what it found
with the evidence, and proposes the amendment. It does not redesign the step
and build the redesign: that is the one move that makes a run unauditable,
because the plan and the tree then disagree with nobody recording it.

**The boundary with 18.5.** A choice inside the step's stated scope is 18.5:
take the conservative option, record it, continue. A choice that changes
what the step delivers, its file set, its signatures, or its gate is 18.4:
stop and report. The test is whether the step as written is still true after
the choice. If it is, you chose; if it is not, the plan did, and the plan
has to say so.

### 18.5 A decision surfaces mid-run

§2 resolves the owner's decisions before dispatch, and in the Assay run that
was worth twelve steps with no wait states. It will not catch every one.

**Rule.** The plan carries a DECISIONS-OPEN section, empty at the start. An
implementer that hits a choice it cannot make from the plan writes the
question there, with the options and what it would cost to be wrong, takes
the conservative option, records the call in its report, and continues. The
orchestrator surfaces the question to the owner at the next natural break,
not mid-step. A decision that cannot be taken conservatively is a stop: those
are rare, and they are the only legitimate stall.

Amendments to the plan follow the spec's rule (§4): a dated line saying what
moved and why, in the plan, in the same commit as the code that depends on it
where there is such code.

### 18.6 A step is inserted mid-run

§17 says two commits from one step "is the signal that the plan owed the run
another step", and this run produced that signal three times: a guard the
review of step 83 asked for, a set of engine fixes before 96, and a third
commit on 78b that its own sweep's review demanded. The signal needs
somewhere to go, or the insertion lands as an unrecorded commit and the plan
and the history part company.

**Rule.** An inserted step is a step. It gets an id formed from its
predecessor's with a letter suffix, so that no existing cross-reference
moves — the run's plan already carries ids of that shape (78b, 94b, 96b),
which is what makes a suffix cheap. It gets a full §16 block written into
the plan *before* it is dispatched, a dated line under §18.5 saying what
asked for it, its own GATE, its own review, and its own tracker block. What
it must not be is an enlarged predecessor: absorbing the work into the step
that provoked it is how a step's file set grows during implementation, which
§17 forbids for this reason.

**Amendment, 4 Sep 2026: insertion is the normal case, not the exception.** A
later run inserted three steps and every one came from a review finding or an
owner decision rather than from an author's afterthought — the same signal
§17 describes, arriving earlier. The stronger form: a review finding that is
real but outside the closed FAIL list is an inserted step, not an advisory to
carry forward. One step passed with three "should fix" findings; folding them
into the next step would have enlarged an unrelated step's file set (§17),
and leaving them would have shipped a defect that put a 165-character
sentence into a field a later step validates against.

## 19. The implementer's report

§13 requires this and never gave it. Every field below but one was in the
Assay reports and each was read. The exception is BUDGET USED, promoted here
alongside the step's BUDGET field (§16): the run's steps carried no budget,
so its reports cannot have reported against one.

```
STEP: <id>
GATE: <each condition, the command run, the result>
RED FIRST: <the assertion, the failure text before the implementation>
FILES: <touched, against the declared set; any difference is a finding>
DISAGREEMENTS: <where the plan, the spec, the harness and the code
disagreed, each with a path and what was done>
DECISIONS THE PLAN LEFT OPEN: <each, the option taken, why it is the
conservative one>
MEASUREMENTS: <every number this step quotes, and the command that
produced it>
BUDGET USED: <against the step's stated budget>
NEXT: <anything the next step should know that the plan does not say>
```

**Rule.** The orchestrator reads every report in full before dispatching the
next step (§7), and appends DISAGREEMENTS and DECISIONS to the tracker
before it does (§13). A report that says only "done" has cost the run its
as-built record.

**Where reports live.** A report that exists only in a sub-agent's final
message is gone the moment the orchestrator's context turns over, and three
prompts paste from it after that point: the reviewer is given RED FIRST
(§21.2), a fix round is given the whole report and the findings (§21.3), and
the next implementer is given NEXT (§21.1). So reports are files in the
repository, beside the tracker, one directory for the run:

```
run/tracker.md                                  (§19a)
run/reports/<step id>-implementer-<round>.md    (this template)
run/reports/<step id>-review-<round>.md         (the reviewer's report)
```

The orchestrator writes each file from the agent's final message as it
arrives, before dispatching anything else, and they land with the tracker,
one step behind (§19a). The tracker's step block names the files rather than
repeating them, which is why it carries no RED FIRST, MEASUREMENTS or NEXT
of its own. A prompt that says "verbatim" means from these files.

## 19a. The orchestrator's tracker

§7 gives the orchestrator the run's state and the run itself kept it in a
scratch file; §13 says the as-built record is assembled from that file, and
§20.10 is written from it. This is that file, which the run never specified.
Scratch space was the wrong home for it: forty-odd lines of as-built record
for twelve steps lived in a directory nothing backs up, and a fresh
orchestrator handed the plan alone could not have said which step was in
flight.

One header block for the run, one block per step appended as the step closes:

```
RUN: <plan path>, revision <n>. Branch: <branch>. Started: <date>.
BUDGET: <the plan's total (§20.7), and what is spent>
IN FLIGHT: <step id and what is dispatched — implementer, reviewer, fix
  round n — or "nothing">
TREE: staged <step id | nothing>; unstaged <step id | clean>. Worktrees
  open: <path, whose step, whose round | none> (§7a.2)

STEP <id>: <state, from the list below>
  commit:  <sha, once it exists>
  gate:    <each condition and the report's quoted result>
  reviews: <agent, round, verdict, minutes> per round (§8; the log carries
           no minutes, so these come from the orchestrator's own clock —
           see Terms)
  reports: <the report file per round> (§19)
  stage:   <everything the orchestrator stages for this commit: the file
           set, the plan if it was written to, the previous step's tracker
           block and reports, whatever the machinery restaged> (§8)
  files:   <touched, against declared; any difference and what was done>
  disagreements: <each, with a path and what was done> (§13)
  decisions:     <each, the option taken, why it is conservative> (§18.5)
  budget:  <used against stated>
```

The states are exactly the exits §18 produces, and no others: IN FLIGHT;
GATE FAILED (§18.2, not yet reviewed); STOPPED — PLAN (§18.4, awaiting the
owner); FAILED ROUND n (§18.3, in the fix loop); ACCEPTED WITH GAP (§18.3,
the owner's override, with the finding quoted); AWAITING READER (§18.1, the
mechanical half landed, the named-reader condition open, with the break it is
batched to); PASS; SUPERSEDED (the plan was amended and the step reissued,
§18.5, naming the id that replaced it).
A state not on that list is a state no rule in §18 can produce, which means
either the run has left the method or §18 owes it an exit.

**Rule.** The tracker is sufficient to resume the run from cold. A fresh
orchestrator given the plan and the tracker and nothing else knows which step
is in flight, what is staged, which worktrees are open, which review round it
is on, and what every landed step decided — without reading a transcript.
Anything an orchestrator knows that is not in the tracker is state the run
will lose, and a 21-step run outlives any single orchestrator's context, so
it will lose it.

**It is committed, and it lands one step behind.** The tracker is written
into the repository, not scratch, so the as-built record (§13, §20.10) grows
in the history rather than in a temporary directory. But a step's block
cannot ship in that step's own commit, and the reason is the marker: `commit:`
and `reviews:` are only known once the review has passed and the commit
exists, and staging anything after the marker is written changes the staged
diff the marker's hash is bound to — the commit then blocks, which is §8's
feature-record incident with a different file. So step N's block is appended
once N has landed and ships with N+1's commit, exactly as the feature
record's own history line does (§18.1.4); the last step's block ships with
the as-built commit. The header block is not subject to this — the
orchestrator rewrites it before each dispatch, while nothing of the next
step is staged — which is not the same as nothing being staged at all, since
the machinery's own files are routinely sitting in the index by then.

The alternative is to exclude the tracker from the hash the marker binds,
and it is worth knowing why that was not the rule: the hook here excludes
exactly one pathspec (`':(top,exclude)features/*.md'`, in
`src/hooks/lib/git-read.js`), so a run that wants its tracker staged late
must give the file a fixed path and add it there. One step behind needs no
hook change and no exclusion to go stale.

Like the plan file and the feature record, the tracker is never listed in a
step's file set and never counted against it (§20.2). On a small change there
is no separate tracker at all: the plan file carries a status line per step
(§22).

## 20. The plan's own skeleton

The step form (§16) says nothing about the document that holds it. The run's
plan had nine numbered sections (1 to 8, plus an 8a added by a revision
delta check) and an unnumbered as-built section, and the rules above lean on
five of them by name without ever listing any. This is that list. The
numbering below is this document's, not the run's; the names are what each
section had to do. Nine of the ten were in that plan — item 9,
DECISIONS-OPEN, is a promotion, which is why §15.9 asks for it rather than
citing it.

1. **What this delivers, and what it does not.** The second half is the one
   that gets skipped and the one that stops scope drift at step 12.
2. **Working constraints — read before the first step, they apply to every
   step.** The repository's class-level guard tests (§5), the commit
   protocol (§8) written out as the exact commit command that passes every
   gate this harness runs, the single owners nothing may reimplement, the
   implementer's tier (§9), the no-client-data rule (§14), and anything true
   of every step. A step repeating a working constraint is a step that will
   drift from it.
   Four facts about the harness belong here too, because a step is
   dispatched into a harness and not into a vacuum. Which file extensions
   the gates actually see: a step whose whole diff is invisible to them gets
   no review at all, and a step is not written where the gate cannot see it.
   That the gates read every Bash command in the session, a sub-agent's
   included: so an agent writes files with a file tool rather than a
   heredoc, and keeps `$(` out of any command that also names a commit.
   And that a sub-agent's working directory resets between commands, so
   every command outside the repository root carries its own `cd`. Each of
   these otherwise costs one blocked command and one puzzled reading of a
   hook message, per agent, for the length of the run.

   The fourth costs more than a blocked command, which is why it ships as
   code rather than as advice: a script that applies several anchored edits
   by reading, substituting and writing one file at a time leaves the
   earlier edits on disk when a later anchor misses, and exits reporting
   only the anchor that failed. The document is half-edited and nothing says
   which half. Use `edit_doc.py` in this skill's base directory, which validates
   every anchor before writing anything: `apply_edits` for one file, and
   `apply_edits_multi` when the change touches several, because the
   single-file form decides one file at a time and two calls to it can still
   half-apply a change. An implementer writing to DECISIONS-OPEN, an
   orchestrator writing the tracker and every review fold-in all edit
   documents this way, and under an unattended authorisation nobody is
   watching when one goes wrong.
   Four paths belong here by name, as always permitted, never listed in a
   step's file set and never counted against it: the plan itself (an
   implementer writes to its DECISIONS-OPEN, §18.5), the feature record (the
   commit machinery rewrites it mid-commit, see Terms), the tracker, and the
   run's report directory (the orchestrator writes both, one step behind,
   §19 and §19a). Each appears in some step's diff without being any step's
   work — nothing "rewrites" the tracker but the orchestrator, which is
   exactly why it needs naming here — and without this line every step's
   FILES field is a finding against itself (§19). If the plan tags its step
   ids, the legend goes here, or the tag goes (see Terms).
3. **Owner decisions — named, with where each bites.** Every point only the
   owner can settle, each with its options priced and the step it blocks
   (§2). Answered before dispatch; the answers recorded here, in this
   document, so the record of why sits beside the work. Two answers are
   recorded here on every plan: the review-loop cap (§2a), whatever its
   value, because a cap that lives only in the orchestrator's head is not a
   boundary; and the standing authorisation to stage, commit and dispatch
   fixes unattended, quoting the harness rules it overrides (§2). Where any
   step carries a named-reader condition (§16), a third: which steps those
   are and at which breaks the owner clears them. Unbatched, they are read
   one at a time and the run waits on a person per step; unnamed, they are
   discovered at the end, which is the acceptance-step failure §18.1
   describes.
4. **Prerequisites and ordering.** What must exist before step one, and the
   order the steps run in with the reason where it is not obvious. This is
   where a step's ASSUMES LANDED is checked against reality. Where the
   deliverable has a frozen target (§3), the first three steps are named
   here in order — the spec signed (§4), the harness written with its
   import-isolation test committed, the target frozen in its own commit —
   and every later step's ASSUMES LANDED names the freeze. Where it has no
   such target, this section names what plays that role instead (§3) — and
   where the deliverable is unchanged behaviour, that role is played by the
   characterisation set of §3, captured and frozen as step zero before any
   move, with its measured coverage of the code to be moved quoted here. It
   also carries the suite baseline (§12), which is a different thing and
   does not substitute for it: every test suite red at HEAD
   before step one, each with the step that turns it green or a note that it
   is out of scope. §20.7 then excludes the out-of-scope ones by name, so
   the definition of done does not rest on a suite nobody intended to fix.
5. **The steps.** Each to the §16 template.
6. **What NOT to do.** The plausible wrong turns, named, with why each is
   wrong. Cheaper here than in a review of the diff that took one.
7. **Definition of done.** For the plan as a whole, in the same style as a
   step's GATE: literal commands and their expected results, grouped if the
   plan lands in stages, with the one full-suite run named and placed. The
   run's plan put its three blocks in reading order and said which held the
   single full-suite run.
8. **Review findings — disposition.** Each finding from each plan review,
   and what was done: accepted and where it landed, rejected and why,
   grouped by round. This is what makes the eight review rounds of §1
   auditable rather than folklore, and it is also the loop's own stopping
   rule: §2a ends when a round's findings all name classes already in this
   section, which is a question this section answers and memory does not.
9. **DECISIONS-OPEN.** Empty at the start; §18.5 fills it mid-run.
10. **As built.** Written last, from the tracker, never from memory (§13).

**Rule.** A plan carries all ten. Sections 1, 2, 3, 4 and 7 are written and
independently reviewed before the first step is dispatched; 8 grows with
each review round; 9 and 10 are filled during and after the run. A plan
missing section 2 will have its constraints rediscovered per step, which is
the §5 incident; a plan missing section 7 cannot be finished, only abandoned.

## 21. The four dispatch prompts

§9 says what a reviewer is handed and §16 says a step names the decision its
implementer must make, which together imply that the step text is the prompt.
It is not, and treating it as one left this run's prompts as whatever the
orchestrator typed that time — the one artefact of the run with no form at
all, and dispatched at least twice per step for every step of the run. These
are the forms. Each names what is
pasted and from where: an orchestrator filling one in is copying, not
composing, and anything an agent needs that is not in its prompt is state the
run is carrying in someone's memory (§19a).

### 21.1 The implementer

```
You are implementing one step of <plan path>, revision <n>. You implement
this step and nothing else.

THE STEP, verbatim:
<the step's §16 block, every field, unedited>

WORKING CONSTRAINTS, verbatim:
<the plan's §20.2>

WHAT LANDED BEFORE YOU:
<each step id in ASSUMES LANDED, with its commit sha from the tracker>

WHAT THE PRECEDING STEP LEFT YOU:
<the NEXT field of the preceding step's report, verbatim (§19), or
"nothing">

Rules for you specifically:
- Touch only the paths in the step's file set. It does not grow during
  implementation (§17). A file you must touch that is not listed is a
  missing prerequisite or a step the plan owes the run: stop and report it
  (§18.4, and §18.6 if the answer is a new step). Do not absorb it.
- Do not stage and do not commit. Leave the work in the working tree; the
  orchestrator stages and commits, in step order (§7a.3, §8).
- Write files with the file tool, not a heredoc, and keep `$(` out of any
  command that also names a commit: this harness's gates read your Bash
  commands and refuse those shapes (§20.2).
- Your working directory resets between commands. Every command outside the
  repository root carries its own `cd`.
- Run TESTS FIRST red before the implementation exists, and quote the failure
  text (§11).
- Run the whole GATE yourself and quote each condition's command and result.
- A choice inside the step's stated scope: take the conservative option,
  record it in your report and in the plan's DECISIONS-OPEN, continue
  (§18.5). A choice that changes what the step delivers, its file set, its
  signatures or its gate: stop before committing and propose the amendment
  (§18.4). The test is whether the step as written is still true after the
  choice.
- Report to this template, every field:
<the §19 block>
```

### 21.2 The reviewer

```
You are reviewing one commit's staged diff against the step it implements.

You are read-only. No edits, and no stash, add, checkout, reset or restore
(§10). Read the pre-diff state with `git show HEAD:<path>`.

Work in the worktree at <path>: it is HEAD with this step's staged diff
applied to both its tree and its index, so the diff under review is
`git diff --cached` there. Run every test in that worktree, never in the
main tree (§7a.2). Your working directory resets between commands, so every
command carries its own `cd <path> &&`.

PATHS IN THIS DIFF THAT ARE NOT THE STEP'S WORK:
<the always-permitted paths from §20.2 that appear in this diff — the
feature record, the tracker, the previous step's reports, the plan. The
commit machinery and the orchestrator put them there. They are not scope
creep and finding them is not a FAIL.>

THE STEP'S INTENT, one paragraph:
<the step's id line, its WHY NOW if it has one, and one sentence from the
orchestrator if it has not>

WHAT THE STEP WAS TOLD TO BUILD:
<the step's WHAT TO BUILD field — the signatures and conventions this diff
is supposed to have, which is what makes "it works" and "it is what was
asked for" separable>

ITS GATE, which the implementer claims passes:
<the step's GATE field, and the report's quoted result for each condition>

SINGLE OWNERS THIS DIFF MUST NOT DUPLICATE:
<the step's IMPORTS field, plus the owners in §20.2>

WHAT TO CHECK — answer each, numbered:
<the numbered questions from the step's REVIEW field, verbatim>

FAIL CRITERIA FOR THIS STEP — a closed list; nothing outside it is a
step-specific FAIL:
<the closed list from the step's REVIEW field>

That list is in addition to the FAIL rule in your own agent definition and
does not override it: any CRITICAL finding still forces FAIL whether or not
it appears above. The closed list exists to stop a reviewer inventing
step-specific criteria, never to license passing a critical defect.

THE CLAIMED RED: <the report's RED FIRST field>. Confirm it from the test
body or by mutation; do not take it on the report's word (§11).

End with the verdict trailer the commit gate consumes (see Terms).
```

The reviewer's tier is chosen by §9, not by this prompt, and the prompt does
not tell the reviewer which tier it is: a reviewer told it is the cheap pass
reviews like one.

### 21.3 The fix

Dispatched after a review FAIL (§18.3), including an overlapped one (§7a).
It is §21.1 with three substitutions and nothing else new:

1. The tree is the one the review failed in — the reviewer's worktree under
   §7a, otherwise the main tree with the diff still staged.
2. The prompt carries, verbatim, the original implementer's report and the
   review's findings.
3. The instruction replaces "implement this step" with: close these
   findings and nothing else. Re-run the step's whole GATE, not the failing
   condition. A fix that changes what the step delivers is §18.4 — stop and
   report rather than redesign.

Its worktree is destroyed once the fix is exported, and round two is
dispatched into a fresh one (§7a). A fix agent leaves its edits unstaged in
the worktree it was given, so a reused worktree would show round two the
diff that failed.

It reports to §19 with the round number, and the whole staged diff goes back
for review, not the delta (§18.3).

### 21.4 The document review

§1's eight rounds before a line of code, §4's review before the signature and
§20.8's disposition all require a review of a *document*, and the three
prompts above are all reviews of a diff. This is the fourth. Its verdict is
READY or NOT YET with findings (see Terms), never PASS: there is no diff for a
PASS to bind to.

```
You are reviewing <document path>, revision <n>, as a document. You are
read-only.

WHAT IS BUILT FROM IT: <one paragraph: what this document is dispatched to,
and by whom>

THE ONE INPUT YOU HOLD IT AGAINST:
<exactly one of: the source material it claims to describe; the document
itself, for internal consistency; a run artefact; the policy or spec
register; the rules it claims to satisfy>

WHAT TO CHECK — answer each, numbered:
<this round's questions>

THE BAR FOR RAISING ANYTHING. Raise a finding only if it would change what
gets built: a step's file set, a signature, a gate, the order of the steps,
or what an implementer does on reading this. Ask of each one "and then what
would be built differently?" — if the answer is nothing, it is not a
finding. A better sentence, a preference between two workable forms, a rule
that could be stated more strongly: say the section is sound and move on.
Reaching a settled document is worth more than a complete list, because the
next round pays for every item on it.

Verdict: READY, or NOT YET with every finding as — where, what is wrong,
why it matters, and the smallest change that closes it. Rank them. Say
which sections are sound rather than manufacturing findings to fill a
list. If nothing you found clears the bar, the verdict is READY: say what
you noticed, name it as below the bar, and let it go.
```

This is the prompt §2a's loop dispatches, once per iteration, to a fresh
reviewer. One input per round is the whole method, not a formality: the run's
eight rounds each held the plan against a different input, which is why they
found different things and why the eighth still found something. A round asked
to check everything checks nothing. Every finding and its disposition goes to
§20.8 as it is answered, which is what makes the rounds auditable rather than
folklore.

**Rule.** These four prompts are the orchestrator's only interface to a
sub-agent, and every field in them is a paste from the plan, the step, a
report or the tracker. An orchestrator that has to write prose to dispatch a
step has found a field the plan owes it.

## 22. Scaling down: what a small change carries

Added 3 Sep 2026 on the owner's instruction, after a review of this document
observed that at sixty kilobytes the forms will be skipped wholesale rather
than trimmed. Everything in §§16-21 was sized for a 23-step run whose plan
ran to a quarter of a megabyte and whose orchestrator outlived several
contexts. Carried whole onto a three-step change, they cost more than the
change. The failure that actually follows is not that someone trims them —
it is that at this length they are dropped entire, and the gates go out with
the paperwork. So the trim is specified here rather than left to the moment.

**What "small" means.** All four hold, or the change is not small:

- Three steps or fewer.
- No two steps share a file, so §7a's overlap question never arises and
  every step runs sequentially.
- One sitting: the run finishes inside the orchestrator's own context, so
  nothing has to survive a cold start.
- No frozen target and no signed spec (§3, §4): the acceptance criteria fit
  in the plan.

A change failing any of the four carries the full form. A small run that
grows past the threshold mid-flight adopts the full form at the step where it
crossed — the temptation to finish a nine-step run on the three-step subset
is the one this section creates, and the one it forbids.

**What never scales down.** These are not paperwork, and a small change is
where they are cheapest to keep:

1. The design is settled before dispatch (§1). Three steps with an unsettled
   signature are three steps designed by whoever picks them up.
2. Every step has a GATE, mechanically checkable (§16).
3. Every commit is reviewed (§9). The four defects §9 lists were all small
   and all local — this is the size of change per-commit review was invented
   for, not the size at which it can be skipped.
4. The file set is declared and does not grow (§16, §17).
5. The gate tooling fails closed (§12).
6. Decisions taken and disagreements found are written down (§13, §18.5),
   even when the record is three lines.

**What collapses.**

*The plan (§20).* Sections 1, 2 and 7 only: what this delivers and what it
does not, the working constraints, the definition of done. Section 3 becomes
a line rather than a register — a small change with an unanswered owner
question is still a wait state, so the question is still asked, but three
answers do not need a section. Sections 4, 6, 8, 9 and 10 fold into the step
blocks and the closing entry.

*The review loop (§2a).* The cap is asked as always, and on a one-page plan
the answer is one or two. One independent reviewer
holding the plan against the source it proposes to change. A second round
only if the first returns NOT YET on something that changes a step. The
convergence rule is unchanged and simply arrives sooner: a one-page plan runs
out of new criteria fast, and that is the signal, not the round count.

*The step (§16).* Four fields survive: the file set, WHAT TO BUILD, GATE and
REVIEW. IMPORTS and MUST NOT TOUCH read "none" when no two steps share a file
— written, not deleted, so a reader can tell. TESTS FIRST survives only where
the step asserts a refusal (§11). ROLLBACK is "revert the commit" and says
so. BUDGET is dropped: at this size an estimate carries nothing the plan does
not already say.

*The report (§19).* GATE results, FILES, DISAGREEMENTS, DECISIONS. RED FIRST
where TESTS FIRST applied, MEASUREMENTS where the step quotes a number. NEXT
and BUDGET USED are dropped.

*The tracker (§19a).* The plan file is the tracker. A status line under each
step block — state, sha, review verdict, and the decisions and disagreements
as they arrive — with no separate file and no report directory: at three
steps the reports fit inline under the step they belong to. "One step behind"
becomes "the next commit carries the previous step's line", which is what the
feature hook does with its own history line anyway (§18.1.4).

*The prompts (§21).* §21.1 and §21.2 unchanged, and §21.3 unchanged if a
review fails. They are pastes, so they cost nothing to fill, and they are
what keeps a dispatch from becoming a conversation. §21.4 is the single loop
round above.

The whole of it, for a two-step change:

```
# <what this delivers>. NOT: <what it does not>.

CONSTRAINTS, every step: <the class-level guards; the single owners; the
commit protocol; the always-permitted paths (§20.2)>
DONE, the whole change: <the commands and their expected results>

**1. <what exists after this step that did not before>**
<NEW|EXTEND> <every path this step may touch>.
WHAT TO BUILD: <the decisions, already made: signatures, shapes, owners>
GATE: <conditions, each settled by running something>
REVIEW: <numbered questions; the FAIL criteria as a closed list>
ROLLBACK: revert the commit.
-- status: <state (§19a)> <sha> <agent:round:verdict> <decisions,
   disagreements, as they arrive>

**2. ...**
```

**Rule.** A small change carries a one-page plan (§20.1, §20.2, §20.7), one
review round on it, a step block of four fields per step, a review on every
commit, and its whole record in the plan file. Everything else in §§16-21
exists for runs that outlive a context or share a file. What scales with the
work is the paperwork; the gates are the same at every size.
