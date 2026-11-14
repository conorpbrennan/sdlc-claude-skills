---
name: english-prose
description: Write or rewrite text in plain, simple English in Conor's tone (terse, direct, finding first). Use for anything another person will read - reports, DBA or infra messages, incident write-ups, summaries, emails, Teams or chat replies, docs sent under Conor's name. Trigger on "rewrite this in plain English", "tidy this message", "draft this for the DBA team", "make this shorter", "sound like me", "simplify this write-up", or /english-prose with text or a file path. Not for internal working notes, code, or commit messages.
argument-hint: "[text or file path]"
---

# english-prose

Write plain, simple English in Conor's tone. Terse. Direct. Straight to the point.

## When to use
- Drafting or rewriting anything a person other than Conor will read.
- Input can be pasted text, a file path (read it, rewrite it, keep the facts), or a topic to draft from.
- Skip for internal working notes, code, and logs.

## Rules
- [ ] Lead with the finding. First sentence is the answer, not the background.
- [ ] Short sentences. One idea each.
- [ ] Short, common words. "Use", not "utilise". "Fix", not "remediate".
- [ ] Cut hedges: "it appears that", "it's possible that", "it seems", "might potentially".
- [ ] Cut fluff and filler: no "I hope this finds you well", no "please don't hesitate", no "going forward".
- [ ] Numbers and evidence over adjectives. "Query ran 705 s", not "very slow".
- [ ] Say what is confirmed and what is not, in plain words ("Confirmed: ..." / "Not confirmed: ...").
- [ ] No consultant words: "leverage", "align", "stakeholders", "caveats", "onboarded", "escalation path".
- [ ] Messages to colleagues: short paragraphs, contractions ("it's", "I'd"), casual asks. Not bullet-heavy or colon-labelled.
- [ ] Labels ("Confirmed:" / "Not confirmed:") are for reports and write-ups. In chat and short messages, use plain sentences instead.
- [ ] Reports: bullets and tables are fine for facts. Keep the finding on top.
- [ ] Keep every fact, name, number and date from the source. Never add facts. Mark gaps as unknown.

## Example
Before:
> I hope you're well. It appears that there may potentially be an issue with the nightly load, which seems to have experienced some significant delays. It was due at 02:00 ET but only seems to have finished at 03:34 ET, so roughly 94 minutes late. I'm not sure what caused it. It might possibly be blocking on the staging table between 01:00 and 03:30 ET, but nobody has checked. We would appreciate it if you could kindly investigate at your earliest convenience.

After:
> The nightly load finished 94 minutes late. It was due 02:00 ET and finished 03:34 ET. The cause is not confirmed. Blocking on the staging table between 01:00 and 03:30 ET is not checked. Can you check it?

## Self-check before returning
1. First sentence states the finding or the ask.
2. No sentence is longer than about 20 words.
3. No hedging words and no filler pleasantries left.
4. Every claim has a number, name or source, or is marked not confirmed.
5. Confirmed and unconfirmed items are separated.
6. No fact was added, dropped or changed against the source.
7. It reads like Conor talking to a colleague, not a consultant.
8. Return only the text (plus one line on anything unknown). No preamble.
