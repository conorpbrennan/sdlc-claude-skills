# Feature Seed / Requirement Capture

Create or update a feature stub under `features/<slug>.md`. This is the
command Claude invokes after the user answers the session-start
requirement prompt, and the command the user runs manually to seed a
feature.

## Arguments: $ARGUMENTS

`<slug> "<requirement>" ["<criterion>" ...]`

1. `<slug>` — kebab-case identifier (matches the feature branch name).
2. `"<requirement>"` — one-sentence requirement in quotes.
3. `"<criterion>"` — zero or more acceptance criteria in quotes. Each is
   one statement that can be checked by running something.

## Instructions

1. Parse `$ARGUMENTS`. If the slug or requirement is missing, ask the
   user to supply them — do not invent either.
   Criteria are not invented either (see step 2a).
2. Validate the slug:
   - Lowercase letters, digits, hyphens only.
   - No slashes, no spaces, length 1-60.
   - Reject and ask for a corrected slug if invalid.
2a. Settle the acceptance criteria:
   - With no criteria in `$ARGUMENTS`, ask the user for 2-5 criteria, each
     checkable by running something. A user who says "later" gets the
     heading and the placeholder
     `<!-- 2-5 checkable criteria; /sdlc:verify reads these -->`.
   - With fewer than 2 or more than 5, say so and ask again.
3. Resolve `features/<slug>.md` relative to the repo root
   (`git rev-parse --show-toplevel`).
4. If the file exists:
   - Replace the `**Requirement**:` line with the supplied requirement.
   - Update `**Last updated**:` to today's date.
   - Write or replace the `## Acceptance` section immediately above
     `## Files involved`, one `N. <criterion>` line each (see the example
     below). If the user said "later" and a section already exists, leave
     it as it is.
   - Never edit an existing `## Verification` section. `/sdlc:verify`
     owns it.
   - Do not touch `## Files involved` or `## History`.
5. If the file does not exist:
   - Create `features/` if needed.
   - Write a fresh stub using this template:

     ```markdown
     # <Title Case of slug>

     **Requirement**: <requirement>

     **Started**: <today>
     **Last updated**: <today>
     **Branch**: <slug>

     ## Acceptance

     1. <criterion>
     2. <criterion>

     ## Files involved

     <!-- populated on commit -->

     ## History

     <!-- populated on commit -->
     ```
   The `## Acceptance` section of a filled record looks like this:

```markdown
## Acceptance

1. Running `node src/hooks/test-feature-file.js` exits 0.
2. `gh pr create` in a scratch repo with no marker is denied and the reason names /sdlc:verify.
3. A record with no numbered line under the heading reads back as no criteria.
```

   With no criteria yet, the template's two numbered lines are replaced by
   the placeholder comment from step 2a.
6. Stage the file: `git add features/<slug>.md`.
7. Print the absolute path and the final file contents.

## Examples

```
/sdlc:feature-new add-user-auth "Ship login and session screens for the web app"
/sdlc:feature-new add-user-auth "Ship login and session screens" "npm test exits 0" "POST /login with a bad password returns 401"
/sdlc:feature-new rename-widget "Replace 'Widget' naming with 'Component' across the UI"
```

## Notes

- The `## Acceptance` section is read by `parseAcceptance` in
  `src/hooks/lib/feature-file.js`: numbered lines only, up to the next
  `## ` heading.
- The post-commit-feature hook appends history entries automatically; do
  not edit `## Files involved` or `## History` from this command.
- If the user is not on a branch matching the slug, warn them but proceed
  — the branch may be renamed later.
