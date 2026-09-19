// The one definition of "is this path code?", shared by every hook that needs to
// know.
//
// Four hooks each carried their own copy of these lists. At HEAD the copies were
// effectively identical -- and all four were blind to shell: none listed `.sh` or
// `.ps1`. So this change does two things at once, and the second is a behaviour
// change, not a repair:
//
//   1. It consolidates the four copies, because a list that decides whether code
//      gets reviewed will drift eventually and the drift is silent.
//   2. It ADDS `.sh` and `.ps1`. Before, no gate saw shell at all: a diff touching
//      only install.sh and uninstall.sh was approved by the review gate via
//      `staged-no-code` with no review requested, and read by the feature gate as a
//      docs-only commit, so it could go to `main` with no branch and no feature
//      file. Both of those now gate it, and the default-on TDD mandate requires a
//      test for it.
const path = require('path');

// Files the gates consider code. Shell and PowerShell are here because
// install.sh and uninstall.sh delete paths under ~/.claude and rewrite the user's
// global CLAUDE.md and settings.json, which makes them the most destructive code
// in this repository; post-commit-notify.js also runs a
// `claude-commit-notify.ps1` from the user's home if one exists.
const SOURCE_EXTENSIONS = Object.freeze([
    '.py', '.java', '.js', '.ts', '.tsx', '.jsx',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs',
    '.rb', '.php', '.swift', '.kt', '.scala', '.sql',
    '.sh', '.ps1',
    // Self-executing test files. Nobody writes application logic in these, but they
    // ARE code and they carry their own assertions, and lib/tdd-order.js requires a
    // test file to be code -- a rule that exists because a `test-*.md` plan and a
    // `tests/*.json` fixture were otherwise counted as the paired test. Before that
    // rule the `tests/` directory match recognised these regardless of extension, so
    // leaving them out flipped the failure to the blocking direction, calling a
    // genuinely tested commit `no_tests`. Neither belongs in CLASSIFIER_LANGUAGES, so
    // a diff of them cannot take a fast path either.
    //
    // `.feature` (Cucumber/Gherkin) is deliberately NOT here. Three reasons: a
    // `.feature` carries no assertions -- the step definitions do -- so counting it
    // as the test lets a commit pass the mandate with a specification that executes
    // nothing, which is the same error as accepting a `test-*.md` plan; this list is
    // shared by the review and feature-tracking gates, so adding it would also make a
    // Gherkin scenario reviewable and block it on `main` without a feature file, and
    // those files are often written by people who are not engineers; and it would not
    // even work for the standard Cucumber layout, because `features/` is an exempt
    // directory here (this project keeps its feature records there). That collision
    // is a real gap and wants its own fix -- a repo-configurable exemption -- not an
    // extension bolted on here.
    '.bats', '.robot'
]);

// What lib/diff-classifier.js can actually read. `isLineSemantic` recognises
// Python/JS-family keywords, assignments with a non-literal right-hand side, and
// `ident(...)` calls. A shell command is a bare word list, so `rm -rf
// "$HOME/.claude"`, `curl ... | sh` and `chmod 777 /etc/passwd` all score ZERO
// semantic lines -- which is why a file outside this set must never be allowed to
// take a "trivial diff" fast path. Adding shell to SOURCE_EXTENSIONS without this
// set moved a silent approval rather than removing it, and made it worse: the fast
// path writes a PASS marker crediting a review that never ran.
// Membership is measured, not assumed: test-source-files.js feeds a representative
// snippet of each language through classifyDiff and requires a non-zero semantic
// count. `.h` and `.sql` are deliberately absent because they fail that check --
// a C header is mostly `#define`, which isLineSemantic reads as a comment, and SQL
// is a bare keyword-verb language with no assignment or call shape. Left in the
// set, `DROP TABLE users; GRANT ALL ON *.* TO 'evil'@'%';` earned a `trivial-diff`
// PASS marker.
const CLASSIFIER_LANGUAGES = Object.freeze(new Set([
    '.py', '.java', '.js', '.ts', '.tsx', '.jsx',
    '.c', '.cpp', '.hpp', '.cs', '.go', '.rs',
    '.rb', '.php', '.swift', '.kt', '.scala'
]));

// What coverage.xml can measure. Keeps the coverage gate, and its staleness wait,
// away from commits it can say nothing about: a shell-only commit used to make
// coverage look stale, and since the hygiene cov check is itself guarded on
// staged Python, nothing would ever refresh it -- the hook waited out
// COV_WAIT_TIMEOUT_MS and then blocked with advice no one could act on.
const COVERAGE_LANGUAGES = Object.freeze(new Set(['.py']));

// Never reviewed, whatever the extension: dependency trees and vendored code
// nobody here wrote. Unanchored because a nested `node_modules` is the common
// case, but each pattern requires a whole path segment, so `vendoring/` and
// `buildkit/` are still reviewed.
//
// `dist/` and `build/` are NOT here. They were, briefly, on the reasoning that
// they hold generated output -- but they are real hand-written source directories
// in plenty of projects (Chromium keeps `build/*.py`; release scripts often live in
// `build/scripts/`), and excluding them by name un-gated `build/scripts/release.sh`
// containing `rm -rf "$HOME/.claude"`. An exclusion list is the one place where a
// wrong entry makes the gate quietly weaker, so it stays conservative: if a repo
// needs them ignored, that belongs in per-repo policy, not in a global default.
const EXCLUDE_PATTERNS = Object.freeze([
    /^\.claude\//, /^\.vscode\//, /^\.idea\//,
    /(?:^|\/)node_modules\//, /(?:^|\/)__pycache__\//,
    /(?:^|\/)vendor\//, /(?:^|\/)third_party\//,
    /(?:^|\/)\.venv\//, /(?:^|\/)venv\//
]);

function norm(file) {
    return String(file || '').replace(/\\/g, '/');
}

function isExcluded(file) {
    const n = norm(file);
    return EXCLUDE_PATTERNS.some(p => p.test(n));
}

// Exclusions win over the extension, and that order is load-bearing: installing
// this project copies its own hooks into `.claude/`, and gating those would make
// every install a reviewable change.
function isSourcePath(file) {
    if (isExcluded(file)) return false;
    return SOURCE_EXTENSIONS.includes(path.extname(norm(file)).toLowerCase());
}

function classifierUnderstands(file) {
    return CLASSIFIER_LANGUAGES.has(path.extname(norm(file)).toLowerCase());
}

function coverageMeasurable(file) {
    return COVERAGE_LANGUAGES.has(path.extname(norm(file)).toLowerCase());
}

module.exports = {
    SOURCE_EXTENSIONS,
    CLASSIFIER_LANGUAGES,
    COVERAGE_LANGUAGES,
    EXCLUDE_PATTERNS,
    isExcluded,
    isSourcePath,
    classifierUnderstands,
    coverageMeasurable,
};
