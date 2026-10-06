## TDD Mandate

**Write the test first.** The `pre-commit-review` hook enforces this in every
repository by default -- it is not advisory, and there is no per-commit override.

The gate reads the session transcript to see which file you edited first, and
blocks two shapes:

- **`code_first`** -- an implementation file was edited before its test. Blocked.
- **`no_tests`** -- implementation files are staged with no test file in the diff
  at all. Blocked.

When edit order cannot be determined -- no transcript, or the files were staged in
an earlier session -- the order check is skipped, but a test must still be present.
An unverifiable order is not an excuse for a missing test.

So the working order for any code change is: write the failing test, then the
implementation, then stage both together. Splitting them across two commits also
works, test commit first.

**What is exempt.** Anything the review gate would not call code. The rule is
inverted rather than a second list: if a path is not in `SOURCE_EXTENSIONS`
(`src/hooks/lib/source-files.js`), no test is required. That covers docs, data,
markup and config -- `.md`, `.rst`, `.txt`, `.csv`, `.css`, `.html`, `.json`,
`.yaml`, `.toml`, lockfiles, dotfiles, and extensionless files such as `LICENSE`.

There is no exempt-directory list. `tmp/` and `.planning/` had one and lost it,
because the rule above already covers the docs they held and its only remaining
effect was exempting code. Everything that IS code needs a test, shell scripts
included: `uninstall.sh` is the most destructive code in this project.

A `features/` directory is Cucumber's, and its step definitions count as tests. If
this project's own feature records live there too, they are `.md` and therefore not
code, so they are exempt rather than mistaken for tests.

To exempt a path rather than a whole repository, add it to `exempt_paths` in
`~/.claude/tdd-mandate.json` -- a trailing slash makes it a directory prefix.

**What counts as a test** is a path convention, listed in
`src/hooks/lib/tdd-order.js`: a `test/`, `tests/`, `spec/` or `__tests__/`
directory; a `test-` or `test_` prefix; a `_test.` or `.test.` or `.spec.` infix;
`_spec.rb`; or a `*Test.java`-style suffix **inside** a test directory, where a
.NET `Tests/`, `<Name>.Tests/` or `<Name>.Specs/` folder (any case, plural only) also counts. That
last restriction matters -- a bare `*Spec.java` rule swept in whole public APIs
(JavaPoet's `TypeSpec`, KotlinPoet's `FileSpec`) and calling production code a test
is the fail-open direction.

If a commit is blocked and you believe the gate is wrong, say so rather than
working around it. To exempt a repository deliberately:
`touch .claude/tdd-mandate.disabled`, or add its path to `exempt_repos` in
`~/.claude/tdd-mandate.json`.
