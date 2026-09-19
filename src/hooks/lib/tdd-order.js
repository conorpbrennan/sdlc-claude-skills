// TDD-order classifier for the pre-commit hook (Gate 3e).
//
// Mirrors the semantics of `python_src/recall/analyses/tdd_order.py` so the
// at-commit gate and the offline B5 metric agree on what test_first /
// code_first / no_tests / not_applicable mean.
//
// Pure functions, no deps, CommonJS. Loaded by pre-commit-review.js.

const fs = require('fs');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const TEST_PATH_RE = new RegExp(
    '(?:' +
        '(?:^|/)tests/' +
        '|(?:^|/)__tests__/' +
        '|(?:^|/)spec/' +
        '|(?:^|/)test_[^/]+$' +
        '|(?:^|/)[^/]+_test\\.[^/]+$' +
        '|(?:^|/)[^/]+\\.test\\.[^/]+$' +
    ')'
);

const EXEMPT_GLOB_EXTS = new Set(['.md', '.json', '.toml', '.yaml', '.yml', '.lock']);
const EXEMPT_DIR_PREFIXES = ['.planning/', 'features/', 'tmp/'];
const EXEMPT_BASENAMES = new Set(['marketplace.json', 'plugin.json', 'package.json']);

function norm(p) {
    return String(p || '').replace(/\\/g, '/');
}

function basename(p) {
    const n = norm(p);
    const i = n.lastIndexOf('/');
    return i >= 0 ? n.slice(i + 1) : n;
}

function isTestFile(p) {
    return TEST_PATH_RE.test(norm(p));
}

function isExemptPath(p) {
    const n = norm(p);
    for (const prefix of EXEMPT_DIR_PREFIXES) {
        if (n.startsWith(prefix) || n.includes('/' + prefix)) return true;
    }
    const base = basename(n);
    if (EXEMPT_BASENAMES.has(base)) return true;
    const dot = base.lastIndexOf('.');
    if (dot >= 0 && EXEMPT_GLOB_EXTS.has(base.slice(dot).toLowerCase())) return true;
    return false;
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
function classifyFromEvents(commitPaths, events) {
    const cleaned = (commitPaths || []).map(p => String(p || '').trim()).filter(Boolean);
    const testPaths = cleaned.filter(isTestFile);
    const implPaths = cleaned.filter(p => !isTestFile(p) && !isExemptPath(p));

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

// Convenience: read transcript + classify in one call.
function classifyTddOrder({ stagedPaths, transcriptPath }) {
    const events = readEditEvents(transcriptPath);
    return classifyFromEvents(stagedPaths, events);
}

module.exports = {
    isTestFile,
    isExemptPath,
    eventMatchesCommitPath,
    extractEventPath,
    readEditEvents,
    classifyFromEvents,
    classifyTddOrder,
};
