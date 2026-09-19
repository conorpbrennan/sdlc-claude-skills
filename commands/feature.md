# Feature Context Loader

Load feature tracking context from the `features/` folder at the repo
root.

## Arguments: $ARGUMENTS

## Instructions

Resolve `features/` relative to the repo root
(`git rev-parse --show-toplevel`). If the directory does not exist, tell
the user: "No features tracked yet. Start a feature branch and Claude
will create a stub on session start, or seed one now with
`/feature-new <slug> \"<requirement>\"`."

### Argument is "list" or empty

Print a table of every `features/*.md`. Columns:

- Feature name (from filename, kebab-case -> Title Case)
- Requirement (first line after `**Requirement**:`). If the requirement
  starts with `_TBD`, render it as `[no requirement]`.
- Last updated (from `**Last updated**:`)

After the table, if any row is `[no requirement]`, remind the user to
seed those with `/feature-new <slug> "<requirement>"`.

### Argument is a feature name or search term

1. Match against filenames and content under `features/*.md`.
2. For each match, print:
   - Feature name
   - Requirement
   - Started / Last updated
   - Branch
   - Files involved
   - Most recent 5 history entries (the file may contain many — truncate)
3. If the matching file's `**Requirement**:` line starts with `_TBD`:
   - Do not proceed with any build work yet.
   - Ask the user: "The `<slug>` feature has no recorded requirement.
     What's the one-sentence requirement?"
   - Once the user answers, invoke `/feature-new <slug> "<their answer>"`
     to persist it.
   - Then continue.

## Examples

- `/feature` or `/feature list` - table of all features
- `/feature add-user-auth` - load one feature's context
- `/feature auth` - load every feature matching "auth"
