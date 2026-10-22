// What a unified diff adds in the way of tests.
//
// Usage:
//   const { countAddedTests } = require('./added-tests');
//   const r = countAddedTests(gitShowOutput);
//   // r = { testFunctions, testLines, sourceLines, parametrised,
//   //       singleAssert, mockOnly, byFile }
//
// Only added hunk lines count, and only inside a hunk, so a `+++ b/path` file
// header is never a line. Which paths are tests is decided by tdd-order.js, and
// which are source by source-files.js; neither convention is restated here.
//
// `singleAssert` and `mockOnly` are Python-only. They are null when the diff adds
// no Python test file. Everything else is a count over added lines.
'use strict';

const path = require('path');
const tddOrder = require('./tdd-order');
const sourceFiles = require('./source-files');

const NO_FILE = '/dev/null';
const DIFF_HEADER = 'diff --git ';
const HUNK_HEADER = '@@';
const FILE_HEADER = '+++ ';

// One table: the extensions each language owns, the line that starts one test,
// and the line that marks a test as parametrised (null where the language has no
// such marker). Anchored to the start of the line so `latest(` or `contest(` is
// not `test(`, and to a `Test` prefix so a helper `func testHelper` is not a test.
const LANGUAGES = Object.freeze([
    {
        name: 'python',
        extensions: ['.py'],
        test: /^\s*(?:async\s+)?def\s+test_/,
        parametrised: /\bparametrize\(/,
    },
    {
        name: 'javascript',
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        test: /^\s*(?:test|it)(?:\.(?:only|skip))?(?:\.each)?\(/,
        parametrised: /^\s*(?:test|it)(?:\.(?:only|skip))?\.each\(/,
    },
    {
        name: 'java',
        extensions: ['.java'],
        test: /^\s*@Test\b/,
        parametrised: null,
    },
    {
        name: 'csharp',
        extensions: ['.cs'],
        test: /^\s*\[(?:Fact|Theory)\b/,
        parametrised: /^\s*\[Theory\b/,
    },
    {
        name: 'go',
        extensions: ['.go'],
        test: /^func\s+Test(?!Main\()[A-Z0-9_]\w*\(/,
        parametrised: null,
    },
    {
        name: 'rust',
        extensions: ['.rs'],
        test: /^\s*#\[test\]/,
        parametrised: null,
    },
]);

// Python assertion shapes, applied to the lines of one added `def test_` body.
const MOCK_ASSERT_RE = /assert_(?:called|not_called|any_call|has_calls)\w*|\bcall_count\b/;
const PLAIN_ASSERT_RE = /^\s*assert\b|\.assert[A-Z]\w*\(/;
const INDENT_RE = /^(\s*)/;

/**
 * Finds the language row for a path.
 *
 * Args:
 *   file: Repository-relative path.
 *
 * Returns:
 *   The LANGUAGES row, or null when no row owns the extension.
 */
function languageOf(file) {
    const ext = path.extname(file).toLowerCase();
    return LANGUAGES.find(l => l.extensions.includes(ext)) || null;
}

/**
 * Splits a unified diff into the added lines of each file.
 *
 * Args:
 *   unifiedDiff: Text of `git show` / `git diff`.
 *
 * Returns:
 *   Array of { file, hunks }, hunks being arrays of added lines (without the
 *   leading `+`), one array per contiguous run in a hunk.
 */
function addedLinesByFile(unifiedDiff) {
    const files = [];
    let cur = null;
    let inHunk = false;
    let run = null;
    for (const raw of String(unifiedDiff).split('\n')) {
        if (raw.startsWith(DIFF_HEADER)) {
            cur = null;
            inHunk = false;
            run = null;
            continue;
        }
        if (!inHunk && raw.startsWith(FILE_HEADER)) {
            const p = raw.slice(FILE_HEADER.length).replace(/^b\//, '');
            cur = p === NO_FILE ? null : { file: p, hunks: [] };
            if (cur) files.push(cur);
            continue;
        }
        if (raw.startsWith(HUNK_HEADER)) {
            inHunk = true;
            run = null;
            continue;
        }
        if (!inHunk || !cur) continue;
        if (raw.startsWith('+')) {
            if (!run) {
                run = [];
                cur.hunks.push(run);
            }
            run.push(raw.slice(1));
        } else {
            run = null;
        }
    }
    return files;
}

/**
 * Counts assertion shapes in the added Python test bodies of one file.
 *
 * Args:
 *   hunks: Arrays of added lines, as from addedLinesByFile.
 *
 * Returns:
 *   { singleAssert, mockOnly } counts over the `def test_` bodies found.
 */
function pythonBodies(hunks) {
    const python = LANGUAGES[0];
    let singleAssert = 0;
    let mockOnly = 0;
    for (const lines of hunks) {
        let body = null;
        const close = () => {
            if (!body) return;
            if (body.plain + body.mock === 1) singleAssert++;
            if (body.mock > 0 && body.plain === 0) mockOnly++;
            body = null;
        };
        for (const line of lines) {
            if (python.test.test(line)) {
                close();
                body = { indent: INDENT_RE.exec(line)[1].length, plain: 0, mock: 0 };
                continue;
            }
            if (!body || !line.trim()) continue;
            if (INDENT_RE.exec(line)[1].length <= body.indent) {
                close();
                continue;
            }
            if (MOCK_ASSERT_RE.test(line)) body.mock++;
            else if (PLAIN_ASSERT_RE.test(line)) body.plain++;
        }
        close();
    }
    return { singleAssert, mockOnly };
}

/**
 * Counts the tests a unified diff adds.
 *
 * Args:
 *   unifiedDiff: Text of `git show --unified=0` or `git diff`.
 *
 * Returns:
 *   { testFunctions, testLines, sourceLines, parametrised, singleAssert,
 *     mockOnly, byFile }. testLines and sourceLines count added non-blank,
 *   non-comment lines in test and non-test source files. singleAssert and
 *   mockOnly are null unless the diff adds a Python test file. byFile maps path
 *   to { testFunctions, testLines, sourceLines, python }.
 */
function countAddedTests(unifiedDiff) {
    const total = { testFunctions: 0, testLines: 0, sourceLines: 0, parametrised: 0,
        singleAssert: null, mockOnly: null, byFile: {} };
    for (const { file, hunks } of addedLinesByFile(unifiedDiff)) {
        if (!sourceFiles.isSourcePath(file)) continue;
        const isTest = tddOrder.isTestFile(file);
        const lang = languageOf(file);
        const state = { doc: null };
        const entry = { testFunctions: 0, testLines: 0, sourceLines: 0,
            python: isTest && lang !== null && lang.name === 'python' };
        for (const lines of hunks) {
            state.doc = null;
            for (const line of lines) {
                if (!tddOrder.isNonCommentLine(line, state)) continue;
                if (!isTest) {
                    entry.sourceLines++;
                    continue;
                }
                entry.testLines++;
                if (!lang) continue;
                if (lang.test.test(line)) entry.testFunctions++;
                if (lang.parametrised && lang.parametrised.test(line)) total.parametrised++;
            }
        }
        if (entry.python) {
            const b = pythonBodies(hunks);
            total.singleAssert = (total.singleAssert || 0) + b.singleAssert;
            total.mockOnly = (total.mockOnly || 0) + b.mockOnly;
        }
        total.testFunctions += entry.testFunctions;
        total.testLines += entry.testLines;
        total.sourceLines += entry.sourceLines;
        total.byFile[file] = entry;
    }
    return total;
}

module.exports = { countAddedTests, LANGUAGES };
