#!/usr/bin/env node
// Reports the shape of the tests added over a git range.
//
// Usage:
//   node tools/measure-tests.js --range A..B [--repo PATH] [--json]
//
// Example:
//   node tools/measure-tests.js --range a9a685e~40..a9a685e
//
// For each non-merge commit in the range that touches a source extension, runs
// `git show --unified=0` and folds countAddedTests over it. Prints the median
// test functions per code commit, test lines per source line, the parametrised
// and single-assert shares, the mock-only total and the five commits with the
// highest test:source ratio.
'use strict';

const path = require('path');
const { gitRead } = require('../src/hooks/lib/git-read');
const sourceFiles = require('../src/hooks/lib/source-files');
const { countAddedTests } = require('../src/hooks/lib/added-tests');

const TOP_N = 5;
const SHORT_SHA = 8;
const USAGE = 'usage: measure-tests.js --range A..B [--repo PATH] [--json]';

/**
 * Parses argv.
 *
 * Args:
 *   argv: Arguments after the script name.
 *
 * Returns:
 *   { range, repo, json } or null when --range is missing.
 */
function parseArgs(argv) {
    const o = { range: null, repo: process.cwd(), json: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--range') o.range = argv[++i];
        else if (argv[i] === '--repo') o.repo = path.resolve(argv[++i]);
        else if (argv[i] === '--json') o.json = true;
    }
    return o.range ? o : null;
}

/**
 * Runs git in the repo and exits on failure.
 *
 * Args:
 *   args: git argv.
 *   repo: Repository directory.
 *
 * Returns:
 *   Output text.
 */
function git(args, repo) {
    const r = gitRead(args, { cwd: repo });
    if (r.out === null) {
        console.error('git ' + args.join(' ') + ': ' + r.error);
        process.exit(2);
    }
    return r.out;
}

/**
 * Median of a list of numbers.
 *
 * Args:
 *   xs: Numbers.
 *
 * Returns:
 *   The median, or null for an empty list.
 */
function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Measures every code commit in the range.
 *
 * Args:
 *   range: `A..B`.
 *   repo: Repository directory.
 *
 * Returns:
 *   The summary object that is printed (or dumped with --json).
 */
function measure(range, repo) {
    const shas = git(['rev-list', '--no-merges', range], repo).split('\n').filter(Boolean);
    const commits = [];
    for (const sha of shas) {
        const files = git(['show', '--format=', '--name-only', sha], repo).split('\n').filter(Boolean);
        if (!files.some(f => sourceFiles.isSourcePath(f))) continue;
        const r = countAddedTests(git(['show', '--format=', '--unified=0', sha], repo));
        const python = Object.values(r.byFile).filter(f => f.python).reduce((n, f) => n + f.testFunctions, 0);
        commits.push({ sha, ...r, pythonTestFunctions: python });
    }
    const sum = k => commits.reduce((n, c) => n + (c[k] || 0), 0);
    const share = (num, den) => (den ? num / den : null);
    const pyFns = sum('pythonTestFunctions');
    return {
        range,
        codeCommits: commits.length,
        medianTestFunctionsPerCommit: median(commits.map(c => c.testFunctions)),
        testLines: sum('testLines'),
        sourceLines: sum('sourceLines'),
        testLinesPerSourceLine: share(sum('testLines'), sum('sourceLines')),
        parametrisedShare: share(sum('parametrised'), sum('testFunctions')),
        singleAssertShare: share(sum('singleAssert'), pyFns),
        mockOnlyTotal: sum('mockOnly'),
        highestRatio: commits.filter(c => c.sourceLines > 0)
            .map(c => ({ sha: c.sha.slice(0, SHORT_SHA), ratio: c.testLines / c.sourceLines,
                testLines: c.testLines, sourceLines: c.sourceLines }))
            .sort((a, b) => b.ratio - a.ratio).slice(0, TOP_N),
    };
}

/**
 * Formats a possibly-null number.
 *
 * Args:
 *   x: Number or null.
 *
 * Returns:
 *   Two-decimal text, or `n/a`.
 */
function fmt(x) {
    return x === null ? 'n/a' : (Number.isInteger(x) ? String(x) : x.toFixed(2));
}

function main() {
    const o = parseArgs(process.argv.slice(2));
    if (!o) {
        console.error(USAGE);
        process.exit(2);
    }
    const s = measure(o.range, o.repo);
    if (o.json) {
        console.log(JSON.stringify(s, null, 2));
        return;
    }
    console.log(`range: ${s.range}`);
    console.log(`code commits: ${s.codeCommits}`);
    console.log(`median test functions per code commit: ${fmt(s.medianTestFunctionsPerCommit)}`);
    console.log(`test lines per source line: ${fmt(s.testLinesPerSourceLine)} (${s.testLines} / ${s.sourceLines})`);
    console.log(`parametrised share: ${fmt(s.parametrisedShare)}`);
    console.log(`single-assert share (python): ${fmt(s.singleAssertShare)}`);
    console.log(`mock-only total: ${s.mockOnlyTotal}`);
    console.log('highest test:source ratio:');
    for (const c of s.highestRatio) console.log(`  ${c.sha}  ${fmt(c.ratio)}  (${c.testLines} / ${c.sourceLines})`);
}

main();
