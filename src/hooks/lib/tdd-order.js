// TDD-order classifier for the pre-commit hook (Gate 3e).
//
// Mirrors the semantics of `python_src/recall/analyses/tdd_order.py` so the
// at-commit gate and the offline B5 metric agree on what test_first /
// code_first / no_tests / not_applicable mean.
//
// Pure functions, no deps, CommonJS. Loaded by pre-commit-review.js.

const fs = require('fs');
const path = require('path');
const os = require('os');
const sourceFiles = require('./source-files');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

// What counts as a test file. Breadth matters more than elegance here: a
// convention this misses is a repository whose tested commits are all called
// `no_tests` and blocked. The opt-in version matched `test_foo.py` but not
// `test-foo.js`, which made every one of this project's own test files invisible.
//
// The counterweight is the separator requirement. `test` must begin a path
// segment and be followed by `-` or `_`, or end one preceded by the same, or be
// a capitalised `Test`/`Spec` suffix. That is what keeps `latest.js`,
// `contest.py`, `protest/`, `attest.rb`, `testimony.ts` and `greatest.java` out,
// and those cases are asserted in test-tdd-mandate.js.
const TEST_PATH_RE = new RegExp(
    '(?:' +
        // directories
        '(?:^|/)tests?/' +
        '|(?:^|/)__tests__/' +
        '|(?:^|/)specs?/' +
        // Cucumber's own sub-paths, and only those. `features/` was EXEMPT, because
        // this project keeps its feature-tracking records there -- which made a whole
        // Cucumber suite invisible to the mandate, step definitions included.
        //
        // A bare `features/` is NOT the fix: "feature folder" / feature-sliced
        // architecture (Redux, Angular, NestJS) puts real business logic under
        // `src/features/<slug>/`, and calling that a test is worse than the exemption
        // it replaced. An exemption merely made the file invisible; a false test
        // supplies the pairing for other genuinely untested files in the same commit,
        // so `[src/features/checkout/reducer.js, src/api/other.js]` went from
        // correctly blocked to silently passed on the strength of a directory name.
        // `exempt_paths` is no remedy either -- it adds exemptions and has no lever to
        // un-match isTestFile, so such a repo would have to rename the directory.
        '|(?:^|/)features/step_definitions/' +
        '|(?:^|/)features/support/' +
        // `test_foo.py`, `test-foo.js`
        '|(?:^|/)test[-_][^/]+$' +
        // `foo_test.go`, `foo_test.py` -- underscore only. The hyphen suffix is not
        // a test convention anywhere (the hyphen PREFIX above is, and is this
        // project's own), while `t-test.py` is a statistical t-test and
        // `ab-test.js` is A/B testing -- both production code, and calling either a
        // test is the fail-open direction.
        '|(?:^|/)[^/]+_test\\.[^/]+$' +
        // `foo.test.js`, `foo.spec.ts`
        '|(?:^|/)[^/]+\\.(?:test|spec)\\.[^/]+$' +
        // `foo_spec.rb` -- Ruby's convention, and only Ruby's. Elsewhere
        // `api_spec.py` / `tensor_spec.py` are ordinary modules.
        '|(?:^|/)[^/]+[-_]spec\\.rb$' +
    ')'
);

// `FooTest.java`, `FooTests.cs`, `FooSpec.kt` are a test naming convention only
// inside a test directory. On its own the suffix is far too weak: JavaPoet's entire
// public API is `*Spec.java` (`TypeSpec`, `MethodSpec`, `FieldSpec`), KotlinPoet's
// is `*Spec.kt`, and `ColumnSpec.java` / `tensor_spec.py` / `api-spec.ts` are all
// production source. Calling one of those a test is the fail-OPEN direction: it
// moves the file out of implPaths AND into testPaths, so a commit of two
// production files with no test stops being `no_tests` and sails through the gate.
// Verified: classifyFromEvents(['.../TypeSpec.java', '.../CodeWriter.java'], [])
// returned not_applicable before this was narrowed.
//
// Maven and Gradle already put these under src/test/java/**, which the directory
// rules above match on their own, so requiring the context costs nothing real.
const TEST_DIR_RE = /(?:^|\/)(?:tests?|specs?|__tests__)\//;
const TEST_SUFFIX_RE = /(?:^|\/)[^/]+(?:Test|Tests|Spec|Specs)\.[^/]+$/;

// What needs no test. Inverted deliberately: rather than keeping a second list of
// exempt extensions, ask lib/source-files.js whether the path is code at all. Under
// the old opt-in gate (which never fired anywhere) a narrow allowlist of `.md`,
// `.json`, `.toml`, `.yaml`, `.yml`, `.lock` was harmless; default-on made it govern
// every commit on the machine, and it classified `styles.css`, `requirements.txt`,
// `docs/guide.rst`, `index.html`, `main.tf`, `data.csv` and `en.po` as
// implementation needing a paired test -- while the snippet merged into the user's
// CLAUDE.md promised "a documentation-only commit is never gated".
//
// One definition of "code" now serves both gates: if the review gate would not
// review it, the mandate does not demand a test for it.
//
// There is no hardcoded directory list. There was -- `.planning/`, `features/`,
// `tmp/` -- and inverting the rule above made it redundant for its own purpose,
// since everything it was protecting is `.md` or `.txt` and therefore not code. Its
// only remaining effect was to exempt CODE in those directories, which silently
// un-gated Cucumber suites. A repository that genuinely needs a path exempt says so
// in `exempt_paths`, rather than someone adding a project-specific prefix to a
// shared library, which is how `features/` got here.
function exemptPaths(opts) {
    const configPath = (opts && opts.configPath) || defaultMandateConfigPath();
    try {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return Array.isArray(parsed?.exempt_paths) ? parsed.exempt_paths : [];
    } catch (e) {
        return [];
    }
}

function norm(p) {
    return String(p || '').replace(/\\/g, '/');
}

function basename(p) {
    const n = norm(p);
    const i = n.lastIndexOf('/');
    return i >= 0 ? n.slice(i + 1) : n;
}

function isTestFile(p) {
    const n = norm(p);
    // A test must itself be code. The path rules below are about naming, and naming
    // alone sweeps in things that cannot test anything: risk-claude-skills has a
    // planning document at `.claude/plans/test-first-ordering-gate.md`, which the
    // `test-` prefix rule matched, so a commit of real Python plus that document
    // satisfied the mandate with no test in it. A JSON fixture under `tests/` did
    // the same. That is the fail-OPEN direction -- the file is counted as the paired
    // test AND excluded from the implementation set.
    if (!sourceFiles.isSourcePath(n)) return false;
    if (TEST_PATH_RE.test(n)) return true;
    // The weak capitalised suffixes, only with a test directory in the path.
    return TEST_SUFFIX_RE.test(n) && TEST_DIR_RE.test(n);
}

function isExemptPath(p, opts) {
    const n = norm(p);
    // Configured exemptions: a trailing slash is a directory prefix, anything else is
    // matched exactly. Compared case-insensitively, like the repo paths.
    const lower = n.toLowerCase();
    for (const entry of exemptPaths(opts)) {
        const e = norm(entry).toLowerCase();
        if (!e) continue;
        if (e.endsWith('/') ? (lower.startsWith(e) || lower.includes('/' + e)) : lower === e) {
            return true;
        }
    }
    // Not code -> no test required. Covers docs, data, markup, config, lockfiles,
    // dotfiles and extensionless files in one rule, and cannot drift from what the
    // review gate believes is code. The cost is that an extensionless executable
    // script is exempt; give scripts a `.sh` extension if you want them gated.
    return !sourceFiles.isSourcePath(n);
}

// True when `eventPath` (any form) refers to `commitPath` (repo-relative).
// Suffix match on a normalised form -- requires separator boundary so that
// `bar/foo.py` does not match `foo.py`.
function eventMatchesCommitPath(eventPath, commitPath) {
    const ev = norm(eventPath);
    const cp = norm(commitPath).replace(/^\/+/, '');
    if (!cp) return false;
    if (ev === cp) return true;
    return ev.endsWith('/' + cp);
}

function extractEventPath(toolInput) {
    if (!toolInput || typeof toolInput !== 'object') return '';
    for (const key of ['file_path', 'notebook_path', 'path']) {
        const v = toolInput[key];
        if (typeof v === 'string' && v) return v;
    }
    return '';
}

// Read a Claude Code session JSONL and return an ordered array of edit
// events: [{path, ts, ord}]. `ts` is a parseable ISO string (or null).
function readEditEvents(transcriptPath) {
    if (!transcriptPath) return [];
    let raw;
    try {
        raw = fs.readFileSync(transcriptPath, 'utf-8');
    } catch (e) {
        return [];
    }
    const events = [];
    let ord = 0;
    for (const line of raw.split('\n')) {
        if (!line) continue;
        let row;
        try {
            row = JSON.parse(line);
        } catch (e) {
            continue;
        }
        const message = row.message;
        if (!message || !Array.isArray(message.content)) continue;
        for (const block of message.content) {
            if (!block || block.type !== 'tool_use') continue;
            if (!EDIT_TOOLS.has(block.name)) continue;
            const path = extractEventPath(block.input);
            if (!path) continue;
            events.push({
                path,
                ts: row.timestamp || null,
                ord: ord++,
            });
        }
    }
    return events;
}

function compareEvents(a, b) {
    // Prefer timestamp, fall back to encounter order.
    if (a.ts && b.ts && a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
    return a.ord - b.ord;
}

// Classify TDD ordering for a commit's staged paths against a session
// transcript. Returns:
//   { status: 'test_first'|'code_first'|'no_tests'|'not_applicable',
//     firstTestPath: string, firstImplPath: string }
//
// `commitPaths` are repo-relative paths (e.g. 'tests/test_a.py'). `events`
// is the array from readEditEvents. Algorithm mirrors
// _analyse_commit_scoped in tdd_order.py.
function classifyFromEvents(commitPaths, events, opts) {
    const cleaned = (commitPaths || []).map(p => String(p || '').trim()).filter(Boolean);
    const testPaths = cleaned.filter(isTestFile);
    const implPaths = cleaned.filter(p => !isTestFile(p) && !isExemptPath(p, opts));

    if (implPaths.length === 0) {
        // No impl in the commit -- test-only or doc-only, not measurable.
        return { status: 'not_applicable', firstTestPath: '', firstImplPath: '' };
    }
    if (testPaths.length === 0) {
        return { status: 'no_tests', firstTestPath: '', firstImplPath: '' };
    }

    let firstTest = null;
    let firstImpl = null;
    for (const ev of events) {
        const matchedTest = testPaths.find(tp => eventMatchesCommitPath(ev.path, tp));
        const matchedImpl = !matchedTest
            ? implPaths.find(ip => eventMatchesCommitPath(ev.path, ip))
            : null;
        if (!matchedTest && !matchedImpl) continue;

        if (matchedTest && (!firstTest || compareEvents(ev, firstTest) < 0)) {
            firstTest = { ...ev, matchedPath: matchedTest };
        }
        if (matchedImpl && (!firstImpl || compareEvents(ev, firstImpl) < 0)) {
            firstImpl = { ...ev, matchedPath: matchedImpl };
        }
    }

    if (!firstTest && !firstImpl) {
        // Commit's files were never touched in this session (e.g. staged from
        // another session). Not measurable here.
        return { status: 'not_applicable', firstTestPath: '', firstImplPath: '' };
    }
    if (!firstTest) {
        return {
            status: 'code_first',
            firstTestPath: '',
            firstImplPath: firstImpl.matchedPath,
        };
    }
    if (!firstImpl) {
        return {
            status: 'test_first',
            firstTestPath: firstTest.matchedPath,
            firstImplPath: '',
        };
    }
    if (compareEvents(firstTest, firstImpl) <= 0) {
        return {
            status: 'test_first',
            firstTestPath: firstTest.matchedPath,
            firstImplPath: firstImpl.matchedPath,
        };
    }
    return {
        status: 'code_first',
        firstTestPath: firstTest.matchedPath,
        firstImplPath: firstImpl.matchedPath,
    };
}

// ---------------------------------------------------------------------------
// Is the mandate in force for this repository?
// ---------------------------------------------------------------------------
// On by default, everywhere. The previous shape was an allowlist in
// ~/.claude/tdd-order-repos.json, which meant the gate had to be switched on per
// repository -- and since that file was never created, and a read failure
// yielded an empty list, it never ran anywhere at all.
//
// Two ways out, both deliberate and visible:
//   - `<repo>/.claude/tdd-mandate.disabled`, matching the feature-tracking
//     opt-out convention already in use;
//   - `exempt_repos` in ~/.claude/tdd-mandate.json, for repositories you do not
//     control the contents of.
//
// A config file that will not parse does NOT disable the mandate. A typo in a
// global config should not silently switch off gating on every repository.
const MANDATE_OPT_OUT = path.join('.claude', 'tdd-mandate.disabled');

function defaultMandateConfigPath() {
    return process.env.TDD_MANDATE_CONFIG ||
        path.join(os.homedir(), '.claude', 'tdd-mandate.json');
}

function normRepo(p) {
    return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function mandateInForce(repoPath, opts) {
    const configPath = (opts && opts.configPath) || defaultMandateConfigPath();

    if (repoPath) {
        try {
            if (fs.existsSync(path.join(repoPath, MANDATE_OPT_OUT))) {
                return { inForce: false, reason: 'repo-opted-out' };
            }
        } catch (e) { /* unreadable repo dir: fall through, stay in force */ }
    }

    let exempt = [];
    try {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (Array.isArray(parsed?.exempt_repos)) exempt = parsed.exempt_repos;
    } catch (e) { /* absent or malformed: the mandate stands */ }

    // Only `exempt_repos` from tdd-mandate.json. The retired opt-IN allowlist at
    // ~/.claude/tdd-order-repos.json is NOT read: under default-on an opt-in list has
    // nothing left to say, and treating its entries as exemptions would invert their
    // meaning -- a repo that had deliberately asked for the gate would lose it.
    if (repoPath && exempt.some(r => normRepo(r) === normRepo(repoPath))) {
        return { inForce: false, reason: 'globally-exempt' };
    }
    return { inForce: true, reason: 'default-on' };
}

// Convenience: read transcript + classify in one call.
function classifyTddOrder({ stagedPaths, transcriptPath, configPath }) {
    const events = readEditEvents(transcriptPath);
    return classifyFromEvents(stagedPaths, events, configPath ? { configPath } : undefined);
}

module.exports = {
    isTestFile,
    isExemptPath,
    mandateInForce,
    MANDATE_OPT_OUT,
    eventMatchesCommitPath,
    extractEventPath,
    readEditEvents,
    classifyFromEvents,
    classifyTddOrder,
};
