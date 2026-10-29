# plan-spec history: why the rules exist

Dated evidence and provenance moved out of `reference.md`. One `##` heading per source section; each
entry reads `§N: <date>: <text>`. `reference.md` keeps the rule and points here with `(history.md §N)`.

Note: undated source text carries the document's written date, 3 Sep 2026, so a "3 Sep 2026"
stamp on an entry is not the incident date unless the text says so.

## Preamble

Preamble: 3 Sep 2026: Written 3 Sep 2026 from the first run that did this end to end: Assay Phase 15 (`docs/phase-15-plan.md`, revision 16, 23 steps), driven by one orchestrating agent, each step implemented by a fresh sub-agent, each commit reviewed by a separate reviewer before it landed. Twelve steps had landed when this was first written; the run has since finished all 23 and written its as-built section. Every step reproduced its frozen targets on the first implementation pass — which is not the same claim as landing in one commit, and three did not: 78b took three commits, 83 and 96 two each, in every case because a review asked for more (§18.6). What follows is what made that possible, what nearly broke it, and what the next plan has to carry so the same run costs less.

Preamble: 3 Sep 2026: Everything in the original text was observed in that run. Where a rule comes from a specific incident, the incident is named. Amendments dated after 3 Sep 2026 come from later runs and say so in their own first line, so "that run" always means Assay Phase 15 and never a reader's guess; the first of them, 4 Sep 2026, is from a run building a parser against client material, and touched §§1, 2b, 14 and 18.6.

Preamble: 3 Sep 2026: **How a section grows, and how it stops.** A rule earns its first incident because the incident is the evidence: strip it and the rule is an assertion. But a section carrying two full narratives is already harder to use than the rule it states, and §2b explicitly invites a third — it asks for a second run as worth more than any argument in it. So: when a later run *reproduces* a rule, the earlier incident compresses to a clause and only the new one is written at length, because the sentence worth keeping is that the rule held twice, not the detail of the first time it held. When a later run *contradicts* it, both stay in full until the disagreement is resolved — that is the case the detail is for. A section should not carry three worked examples of equal weight. The division of labour that makes this document usable is that the reference accretes incidents and `SKILL.md` carries the rules stripped of them; it holds only while the reference stays readable, and a rule that has to be rediscovered under its own evidence has failed the same way an unstated one does.

Preamble: 3 Sep 2026: Reviewed twice on 3 Sep 2026 against the plan this describes. The first review found that every artefact the rules govern was tribal: the Assay plan named its own house style as "matches `docs/aprime-plan.md`", so a reader of the rules alone could not produce a step. §§16-19 closed that. The second review found that the fix had specified the step and not the document that holds it, and that three of the new rules were stricter than the run they came from. §20 and the corrections in §16 and §17 close those.

Preamble: 3 Sep 2026: Reviewed a third time on 3 Sep 2026 by an independent reviewer given only this document. It found that the document specified the step, the report and the plan and left the run loop unspecified — no dispatch prompt, no tracker, no fix path, and a contradiction between §7a and §10 exactly where the fix path should be — and that §16 presented as observed eight fields the run never carried. The Terms block, §19a, §21 and the corrections in §3, §4, §7, §10, §16, §18.3 and §20 close those.

Preamble: 3 Sep 2026: Reviewed a fourth time on 3 Sep 2026, again by a reviewer given only this document, which checked its claims against the plan, the signed spec, the reviewer agent definition, the hook source and the timing log. It found the new forms sound in themselves and broken at their seams: a tracker that could not be committed in the step it described, a reviewer worktree whose diff was invisible to the reviewer, reports that three prompts pasted from and nothing wrote down, and failure paths that ended at "ask the owner". It also found this document's own provenance stale in five places. §18.6, the report paths in §19, §21.4 and the corrections in §4, §7a, §19, §19a, §20, §21 and Terms close those.

Preamble: 3 Sep 2026: A fifth round, 3 Sep 2026, held the document against a new input: not a reading but an attempt to execute it. The reviewer picked two real defects in the harness this document lives in, wrote them up as steps to §16, filled the plan, the prompts and the tracker, then cloned the repository and drove the real gates through the whole loop — block, worktree, marker, FAIL, fix round, commit. Everything the document claims about the marker, the lock, the hash exclusion, the worktree and the fix export held under that test. What did not was the seams with the harness: a reused worktree that would have shown round two the diff that already failed, a per-commit consent rule the document never asks the owner to waive, and a first commit attempt that is the only source of the marker command and was nowhere described. §§2, 7a, 8, 9, 12, 18.1, 18.3, 19a, 20.2, 20.3, 20.4, 21.1, 21.2, 21.3 and Terms close those and the twelve smaller silences found with them. It is the only round so far that found what it found; a document cannot be read into telling you that your sub-agent's shell is gated.

Preamble: 3 Sep 2026: A sixth round, 3 Sep 2026, held it against a project shape it was not written from — a user-facing feature, a search-shaped research task, a behaviour-preserving refactor — and found one defect wearing three faces: the two assumptions now stated at the top of this document were unstated, so an author whose work broke either followed the letter and built the wrong plan. Judgement-based acceptance had a gate form in §16 and was then made an illegitimate stall by §18.1 and §18.5; search-shaped work had no exit in §18 for a step that ran correctly and returned a negative result; and a refactor was offered a substitute frozen target that its own suite already failed to provide. The scope statement, §1's named exception, §3's characterisation-set paragraph, and the corrections in §16, §18.1, §19a, §20.3 and §20.4 close those. It let four further observations go as below the bar (§2a), which is the first round to do so.

## Terms

Terms: 3 Sep 2026: **`[A]`**, in the run's step headings — a scheduling tag, not a tier. It comes from the previous plan (`docs/aprime-plan.md`), whose legend reads "[T] tonight, [Th] Thursday-provable, [A] after", and means authorised but not scheduled. All 23 steps of the Assay plan carry it, so there it conveys nothing; it survived as house style. A plan either gives its tags a legend in its working constraints (§20.2) and uses them to mean something, or omits them. It is not in the §16 template for that reason.

## §1

§1: 3 Sep 2026: The single biggest factor. The plan had been through eight independent review rounds before a line of code existed, each round asking a different input (source, the plan itself, the run artefact, the policy register). What drove those rounds and what ended them is §2a. Implementers therefore found the design settled and spent their budget on building and measuring, not choosing.

§1: 3 Sep 2026: The two places implementers had to design anyway were exactly where the plan was silent: the per-pass function signature (the plan sketched `derive_groups(run, axes)`; the spec required a slot in every subject, which a run artefact cannot supply) and which group an outlier is quoted from when it separates in several. Both were resolved conservatively and recorded. A thinner plan multiplies those calls, and they do not all go the same way.

§1: 4 Sep 2026: **Amendment, 4 Sep 2026: not everything the plan *can* specify should be.** A rule the implementer can check against ground truth is a rule the plan should state as a property, not as an implementation. One run put three versions of a single parser regex into its plan document. The first was wrong on the real data (dropped three rows); the replacement fixed three of the four cases; the version that worked stated the requirement and the measured geometry and left the pattern to the implementer, who designed it against the fixture and the real file and reported 117 of 117.

## §2

§2: 3 Sep 2026: The plan named its wait states (S1, the signature on the spec; D1, where a computation lives) in one section with where each bites. The owner answered them, plus the smaller sign-offs, in three question rounds before any agent was dispatched, and pre-authorised the orchestrator to complete a signature block once an independent review said READY.

§2: 3 Sep 2026: Result: zero wait states in twelve steps. That is the whole reason the run could proceed unattended.

## §2a

§2a: 3 Sep 2026: Added on the owner's instruction, 3 Sep 2026, after the fourth review of this document. §1 credits eight independent review rounds before a line of code existed and never said what drove them, how they ended, or what a round was. This is that loop, and it is the reason §1's implementers found the design settled.

§2a: 3 Sep 2026: The asymmetry sets the bar high. A material defect missed costs an amendment mid-run or a step built wrong. A minor one raised costs a round from every party, and its fix creates the next round's seam — which is exactly how a loop runs to its cap without converging. Converging on a document with three known blemishes beats four more rounds spent removing them and introducing a fourth.

§2a: 3 Sep 2026: **Three failure modes, all seen.** *Churn*: each round's fix creates the next round's seam, and this document's fourth round found little else — seams where the third round's new forms met the old rules. That is the loop working, and it is also why a cap exists at all: a document still turning up new criteria one round short of its cap is being rewritten rather than reviewed, and the right move on reaching the cap is to dispatch step one and let the run find the rest. *Confirmation*: the fresh-context rule above, which is the whole reason a round is worth more than a reply to the last round. *The unreviewed fix*: no round reviews its own fold-in — the next round reviews the document that contains it, which is the only reason the loop converges on the document rather than on the reviewer's opinion of the patch. That last one holds only where the next round's input can see the kind of claim the fix wrote, which is a condition on it rather than a retraction of it: §2b.

## §2b

§2b: 3 Sep 2026: Added 3 Sep 2026 from one run: four rounds on an Assay plan for release-note ingestion. Twice in that run, the text a round added was itself the next round's defect.

§2b: 3 Sep 2026: Round 2 found that round 1's fix asserted how an egress guard works, taken from a comment in the repository rather than from the code. Round 4 found that round 3's fix named a module as the emitter of an artefact it does not emit, and declared a function NEW that had existed all along. Neither defect was in the plan before its review. Both arrived as corrections.

§2b: 3 Sep 2026: **Why §2a's answer is weaker than it sounds.** §2a says no round reviews its own fold-in, and the next round reviews the document that contains it. That is true, and it is why the loop converges. But it holds only where the next round's one input can see the *kind* of claim the fix introduced. Round 3's input was internal consistency, and a factual claim about code is invisible to that input — so round 3's own fixes passed through it untouched and survived until round 4, which happened to be a source round. That was luck. The rules below make it a property.

§2b: 3 Sep 2026: **What none of this promises.** The checker resolves a citation; it cannot tell you that the claim attached to it is true. The wrongly-named module in round 3's fix existed, and naming it was still false — a resolving citation and a correct one are different properties, and only the first is mechanical. These rules tighten the loop. They do not shorten it, and none of them replaces a round.

§2b: 3 Sep 2026: **One calibration point.** All of the above is from a single run, in the same way §16 is explicit that its template is two observed fields and eight promoted. A second run that failed to reproduce it would be worth more than any argument here. The amendment below is that second run, and it neither reproduced nor contradicted the mechanism: it found the same defect with two authors this section had not named, which is why rules 1-5 and their incident stand unchanged beneath it.

§2b: 4 Sep 2026: **Amendment, 4 Sep 2026: two more authors write unchecked text.** The mechanism above is about a review round's fold-in. Two adjacent cases from a later run behave identically and are not covered by rules 1-5 as written.

§2b: 4 Sep 2026: *The orchestrator writing into the plan mid-run.* Inserting a step under §18.6 means writing a full §16 block that no review round will ever see — the pre-run loop closed before the step existed. Two such blocks in one run were wrong: a TESTS FIRST clause naming two drift tests when only one of them detects drift, and a GATE saying a count would "return to its unpolluted value" when the count had never moved. Both were caught by implementers who checked the block rather than complying with it.

§2b: 4 Sep 2026: *A reviewer's supporting claims.* A FAIL carries authority, and its findings get verified — but the facts a finding rests on do not. One round-one FAIL read "zero at HEAD, no precedent, this diff opens the door". Both halves were false: three real identifiers were already committed. That changed the action from prevent to remediate, and the remedy from a fix round to a history rewrite.

## §3

§3: 3 Sep 2026: The scoring target (a fixture of 94 assertions translated from a model-written review) was verified by an independent harness and frozen at step 82, before the first deriver existed at step 83. Every later step reproduced its slice of the frozen target byte for byte, and a third independent producer landing on the harness's figures rather than the model's was the strongest evidence the run produced.

## §4

§4: 3 Sep 2026: The spec was signed at step 79 and amended four times by step 87, each amendment dated in its final section: one before the freeze for a rule arm the plan left undecided, one before the freeze for a reading the harness found under-specified, one before the freeze for a worked example that disagreed with its own rule, and one after the freeze for a worked example that quoted the wrong artefact. None moved a fixture byte. Two more landed by step 93, on the same pattern.

§4: 3 Sep 2026: That block is a reduced form and not a transcription: the run's own signature section is a prose paragraph, a six-row table (specification, phase and step, name, role, organisation, signed on) and dated amendment paragraphs. What is promoted here is `Fixtures moved:` as a field — the run carried that fact in the amendment prose, where it has to be read for rather than read off.

## §5

§5: 3 Sep 2026: The incident. Step 83's gate ran only the review tests. A class-level guard in `tests/test_mechanisms.py` scans every module reading field diffs for a presence check, and the new module had none. The suite was red at HEAD for two commits; step 84's agent found it by running its own gate. The fix was twelve lines. The lesson is structural.

## §6

§6: 3 Sep 2026: Assay's plan already had this rule ("all TRUE targets of type X as frozen at step 82", never "the 6"). It held. Where the plan did quote numbers it had measured, two were wrong (a per-file id split; an estimate of a sweep's size) and both were caught by the implementer measuring again.

## §7

§7: 3 Sep 2026: The owner's instruction, given after two agents had been started in parallel. Kept for the rest of the run. Parallel steps on one working tree risk colliding edits, and two agents running test suites on one box is how this host has been killed before. The cost is wall clock; the benefit is that every report is read before the next step starts, and every step sees the tree its predecessor left.

## §7a

§7a: 3 Sep 2026: **What it buys.** Reviews took three to five minutes and implementations ten to twenty-five, so the overlap saves roughly a sixth of wall clock on the steps where it applies, at no cost to attribution. It is not worth reaching for on steps that share a file: the entanglement cost on a FAIL exceeds the saving.

## §9

§9: 3 Sep 2026: What the per-commit reviews caught that the step's own tests had passed:

§9: 3 Sep 2026: a real client trade id in a test comment, used as the "example shape" in the file whose job was the no-client-data guard; - a review-queue census whose total and counts could disagree when one withheld id carried two findings; - a zero-median group silently suppressing a member that moved 400 percent, the exact case the spec's null-ratio clause anticipated; - a spec worked example quoting the policy file where the fixture and the generator quote the run-embedded policy.

§9: 3 Sep 2026: Each was small, local, and would have been buried under later steps by the time a phase-level review looked. That is the case for per-commit.

## §11

§11: 3 Sep 2026: Every step asked for red-first evidence on its refusal tests and got it, usually by the implementer removing the guard and quoting the failure text. This is cheap and it is the only thing that separates a conservation check from a comment.

§11: 19 Oct 2026: *Evidence, 19 Oct 2026.* 38 of 46 implementer reports in one run carried mutation tables, and one step ran 109 mutants. Implementer runs over 100 calls were 8% of runs and 77% of implementer spend.

## §12

§12: 3 Sep 2026: The first commit of the run skipped review entirely: a 13 MB diff overflowed the hook's read buffer, the catch returned an empty string, an empty diff scored as trivial, and a PASS marker was written for code nobody had read.

## §13

§13: 3 Sep 2026: Every implementer report ended with "where the plan, the spec, the harness and the code disagreed" and "decisions the spec left open". The orchestrator appended those to a tracker after every step. By step 88 there were some forty such lines, each with a path and a reason. The closing documentation step will be assembled from them, not from memory.

## §14

§14: 4 Sep 2026: **Amendment, 4 Sep 2026: the run's own paperwork is inside the boundary.** §19 makes implementer and reviewer reports files in the repository, and §19a makes the tracker a committed file. Both are surfaces §14 predates, and an implementer measuring against real material writes its findings there. One run's inserted step transcribed ten real rows — identifier, page number and module name each time — into a tracked report, and that was the run's only review FAIL. The fixtures were clean: swept against 7.7 GB of client material twice, by two parties, with no collisions. The leak came through a door the guard did not have.

§14: 4 Sep 2026: The test of a redaction is that the argument survives it. A reader with access to the source must be able to rebuild every number without the redacted text; if they cannot, the redaction removed evidence rather than identifiers. That is measurable, and it was measured — the round-two reviewer of the offending report re-derived all forty of its numbers from the source without reading the redacted text, and they matched cell for cell.

## §16

§16: 3 Sep 2026: The template below has ten fields. Two of them were fields in the Assay run: `GATE:` and `ROLLBACK:`, on every step. The id, the file set and the owners were carried in each step's prose. WHY NOW, WHAT TO BUILD, IMPORTS, ASSUMES LANDED, MUST NOT TOUCH, TESTS FIRST, REVIEW and BUDGET were not fields at all — they are promoted here, each one because §§1-15 names an incident a field would have caught. That is the honest provenance: two observed and eight promoted, not ten observed. §15.8 says as much, and this section used to contradict it.

## §17

§17: 3 Sep 2026: The Assay run's steps ranged from a twelve-line fix to a full day's re-pin sweep, and the sweep step said in its own text that it was "likely TWO commits". That is the right instinct written in the wrong place: the step was too big, and knew it.

## §18

§18: 19 Oct 2026: An inserted step is the exception, not the normal case. In three runs on 19 Oct 2026, inserted steps nearly doubled the commit count: 24 base steps plus 20 inserted; 20 plus 18; 32 plus 14. Most came from review findings that stayed inside the step's own file set and needed a fix round, not a step.

## §19

§19: 3 Sep 2026: §13 requires this and never gave it. Every field below but one was in the Assay reports and each was read. The exception is BUDGET USED, promoted here alongside the step's BUDGET field (§16): the run's steps carried no budget, so its reports cannot have reported against one.

## §19a

§19a: 3 Sep 2026: §7 gives the orchestrator the run's state and the run itself kept it in a scratch file; §13 says the as-built record is assembled from that file, and the AS BUILT field (§19a, formerly §20.10) is written from it. This is that file, which the run never specified. Scratch space was the wrong home for it: forty-odd lines of as-built record for twelve steps lived in a directory nothing backs up, and a fresh orchestrator handed the plan alone could not have said which step was in flight.

§19a: 3 Sep 2026: The alternative is to exclude the tracker from the hash the marker binds, and it is worth knowing why that was not the rule: the hook here excludes exactly one pathspec (`':(top,exclude)features/*.md'`, in `src/hooks/lib/git-read.js`), so a run that wants its tracker staged late must give the file a fixed path and add it there. One step behind needs no hook change and no exclusion to go stale.

## §20

§20: 3 Sep 2026: The step form (§16) says nothing about the document that holds it. The run's plan had nine numbered sections (1 to 8, plus an 8a added by a revision delta check) and an unnumbered as-built section, and the rules above lean on five of them by name without ever listing any. This is that list. The numbering below is this document's, not the run's; the names are what each section had to do. Nine of the ten were in that plan — item 9, DECISIONS-OPEN, is a promotion, which is why §15.9 asks for it rather than citing it.

## §21

§21: 3 Sep 2026: This is the prompt §2a's loop dispatches, once per iteration, to a fresh reviewer. One input per round is the whole method, not a formality: the run's eight rounds each held the plan against a different input, which is why they found different things and why the eighth still found something. A round asked to check everything checks nothing. Every finding and its disposition goes to the tracker's DISPOSITIONS field (§19a) as it is answered, which is what makes the rounds auditable rather than folklore.

## §22

§22: 3 Sep 2026: Added 3 Sep 2026 on the owner's instruction, after a review of this document observed that at sixty kilobytes the forms will be skipped wholesale rather than trimmed. Everything in §§16-21 was sized for a 23-step run whose plan ran to a quarter of a megabyte and whose orchestrator outlived several contexts. Carried whole onto a three-step change, they cost more than the change. The failure that actually follows is not that someone trims them — it is that at this length they are dropped entire, and the gates go out with the paperwork. So the trim is specified here rather than left to the moment.
