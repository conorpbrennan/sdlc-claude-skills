# Feature Seed / Requirement Capture

Create or update a feature stub under `features/<slug>.md`. This is the
command Claude invokes after the user answers the session-start
requirement prompt, and the command the user runs manually to seed a
feature.

## Arguments: $ARGUMENTS

Two positional arguments:

1. `<slug>` — kebab-case identifier (matches the feature branch name).
2. `"<requirement>"` — one-sentence requirement in quotes.

## Instructions

1. Parse `$ARGUMENTS`. If the slug or requirement is missing, ask the
   user to supply them — do not invent either.
2. Validate the slug:
   - Lowercase letters, digits, hyphens only.
   - No slashes, no spaces, length 1-60.
   - Reject and ask for a corrected slug if invalid.
3. Resolve `features/<slug>.md` relative to the repo root
   (`git rev-parse --show-toplevel`).
4. If the file exists:
   - Replace the `**Requirement**:` line with the supplied requirement.
   - Update `**Last updated**:` to today's date.
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

     ## Files involved

     <!-- populated on commit -->

     ## History

     <!-- populated on commit -->
     ```
6. Stage the file: `git add features/<slug>.md`.
7. Print the absolute path and the final file contents.

## Examples

```
/sdlc:feature-new add-user-auth "Ship login and session screens for the web app"
/sdlc:feature-new rename-widget "Replace 'Widget' naming with 'Component' across the UI"
```

## Notes

- The post-commit-feature hook appends history entries automatically; do
  not edit `## Files involved` or `## History` from this command.
- If the user is not on a branch matching the slug, warn them but proceed
  — the branch may be renamed later.
