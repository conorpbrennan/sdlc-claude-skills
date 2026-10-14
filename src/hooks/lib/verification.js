// The verification stage's single owner: the marker body, the two hashes it
// records, parsing of the verifier's report and rendering of the feature
// record's "## Verification" section.
//
// Everything here fails closed. A git read that errors yields null, never the
// hash of nothing and never an empty dirty list, so a caller cannot read a
// broken repository as "unchanged" or "clean". A report yields verdict PASS only
// when the trailer, the row set, every row and every row's evidence all agree;
// anything the parser cannot read is a FAIL with a problem, never a throw.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { gitRead, splitNul } = require('./git-read');
const { markerPaths } = require('./review-markers');
// Not require('./feature-file'): src/test-plugin-layout.js reads the string
// literal `/feature-file` as a bare `/feature` slash command.
const { isFeatureFile, parseAcceptance } = require(path.join(__dirname, 'feature-file'));

const PASS = 'PASS';
const FAIL = 'FAIL';
const UNVERIFIED = 'UNVERIFIED';
const RESULTS = [PASS, FAIL, UNVERIFIED];
const TRAILER = /^VERIFY_GATE: (PASS|FAIL)$/;
const TABLE_HEADER = /^\|\s*#\s*\|\s*Result\s*\|\s*Evidence\s*\|$/;
const NO_ROW_EVIDENCE = 'no row in report';

const FRESH = 'fresh';
const MISSING = 'missing';
const STALE = 'stale';
const NO_ACCEPTANCE = 'no-acceptance';
const ERROR = 'error';

// Args:
//   text: string to hash.
// Returns:
//   string: SHA-1 hex digest of the text.
function sha1(text) {
    return crypto.createHash('sha1').update(text).digest('hex');
}

// The path of one `git ls-tree -z` entry (`<mode> <type> <sha>\t<path>`).
//
// Args:
//   entry: string, one NUL-split ls-tree entry.
// Returns:
//   string: the path, or '' when the entry has no tab.
function lsTreePath(entry) {
    const tab = entry.indexOf('\t');
    return tab === -1 ? '' : entry.slice(tab + 1);
}

// Hash of the committed code: HEAD's tree with every feature record left out,
// so a commit that only edits features/*.md does not move it.
//
// Args:
//   cwd: string, a directory inside the repository.
// Returns:
//   string | null: SHA-1 hex of the remaining `git ls-tree -r -z --full-tree HEAD`
//   entries (mode, type, blob id and path, so a content, mode or path change all
//   move it). null on any read error, with no HEAD, and when no non-feature
//   entry remains: an empty read is never hashed as if it were a tree.
function codeTreeHash(cwd) {
    const r = gitRead(['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], { cwd });
    if (r.out === null) return null;
    const entries = splitNul(r.out).filter(e => !isFeatureFile(lsTreePath(e)));
    if (entries.length === 0) return null;
    return sha1(entries.join('\n') + '\n');
}

// Args:
//   criteria: string[], the acceptance criteria in file order.
// Returns:
//   string: SHA-1 hex of the criteria joined by newlines.
function acceptanceHash(criteria) {
    return sha1(criteria.join('\n'));
}

// Paths with uncommitted changes (staged, unstaged and untracked), feature
// records left out.
//
// Args:
//   cwd: string, a directory inside the repository.
// Returns:
//   string[] | null: paths from `git status --porcelain -z --untracked-files=all`
//   that are not feature files, in git's order, without duplicates. A rename or
//   copy contributes both its new and its old path. null on a read error.
function dirtyPaths(cwd) {
    const r = gitRead(['status', '--porcelain', '-z', '--untracked-files=all'], { cwd });
    if (r.out === null) return null;
    const entries = splitNul(r.out);
    const paths = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        paths.push(entry.slice(3));
        // A rename or copy is followed by one more entry: the path it came from.
        if (/[RC]/.test(entry.slice(0, 2)) && i + 1 < entries.length) paths.push(entries[++i]);
    }
    return Array.from(new Set(paths.filter(p => !isFeatureFile(p))));
}

// Splits one markdown table row into trimmed cells. A `\|` stays inside its cell.
//
// Args:
//   line: string, a line starting with `|`.
// Returns:
//   string[]: the cells, with `\|` unescaped to `|`.
function splitCells(line) {
    const parts = line.trim().slice(1).split(/(?<!\\)\|/);
    if (/(?<!\\)\|$/.test(line.trim())) parts.pop();
    return parts.map(p => p.trim().replace(/\\\|/g, '|'));
}

// Describes how `ns` departs from exactly 1..count, each once.
//
// Args:
//   ns: number[], the row numbers found.
//   count: number, how many criteria there are.
// Returns:
//   string: '' when the set is exact, otherwise one plain-English line.
function rowSetProblem(ns, count) {
    const seen = new Map();
    for (const n of ns) seen.set(n, (seen.get(n) || 0) + 1);
    const missing = [];
    for (let n = 1; n <= count; n++) if (!seen.has(n)) missing.push(n);
    const repeated = [...seen].filter(([, c]) => c > 1).map(([n]) => n);
    const unexpected = [...seen.keys()].filter(n => n < 1 || n > count);
    const parts = [];
    if (missing.length) parts.push('missing row ' + missing.join(', '));
    if (repeated.length) parts.push('repeated row ' + repeated.join(', '));
    if (unexpected.length) parts.push('unexpected row ' + unexpected.join(', '));
    return parts.length ? 'Rows are not exactly 1..' + count + ': ' + parts.join('; ') + '.' : '';
}

// Parses the verifier's report.
//
// Format: a markdown table with header `| # | Result | Evidence |`, one row per
// criterion, and a last non-blank line of `VERIFY_GATE: PASS` or
// `VERIFY_GATE: FAIL`. The verdict is PASS only when the trailer is PASS, the
// row numbers are exactly 1..count each once, every row is PASS and every PASS
// row has evidence. A PASS row with blank evidence is recorded as UNVERIFIED.
// Each unmet condition adds one line to `problems`. Never throws.
//
// Args:
//   text: string, the report. Anything else is read as empty.
//   count: number, how many acceptance criteria the feature has.
// Returns:
//   { verdict: 'PASS'|'FAIL',
//     rows: Array<{ n: number, result: 'PASS'|'FAIL'|'UNVERIFIED', evidence: string }>,
//     problems: string[] }
function parseReport(text, count) {
    const lines = (typeof text === 'string' ? text : '').split(/\r?\n/);
    const problems = [];

    const nonBlank = lines.filter(l => l.trim() !== '');
    const trailerMatch = nonBlank.length ? TRAILER.exec(nonBlank[nonBlank.length - 1].trim()) : null;
    const trailer = trailerMatch ? trailerMatch[1] : null;
    if (trailer === null) {
        problems.push('The report has no valid trailer: the last non-blank line is not VERIFY_GATE: PASS or VERIFY_GATE: FAIL.');
    } else if (trailer === FAIL) {
        problems.push('The verifier ended the report with VERIFY_GATE: FAIL.');
    }

    const rows = [];
    const header = lines.findIndex(l => TABLE_HEADER.test(l.trim()));
    if (header === -1) {
        problems.push('The report has no table with the header | # | Result | Evidence |.');
    } else {
        for (const line of lines.slice(header + 1)) {
            if (!line.trim().startsWith('|')) continue;
            const cells = splitCells(line);
            if (cells.length < 3 || !/^\d+$/.test(cells[0])) continue;
            rows.push({ n: Number(cells[0]), result: cells[1], evidence: cells.slice(2).join('|').trim() });
        }
    }

    const setProblem = rowSetProblem(rows.map(r => r.n), count);
    if (setProblem) problems.push(setProblem);

    for (const row of rows) {
        if (!RESULTS.includes(row.result)) {
            problems.push('Row ' + row.n + ' has the unrecognised result "' + row.result + '"; read as UNVERIFIED.');
            row.result = UNVERIFIED;
        } else if (row.result === PASS && row.evidence === '') {
            problems.push('Row ' + row.n + ' is PASS with no evidence; read as UNVERIFIED.');
            row.result = UNVERIFIED;
        } else if (row.result !== PASS) {
            problems.push('Row ' + row.n + ' is ' + row.result + '.');
        }
    }

    return { verdict: problems.length === 0 ? PASS : FAIL, rows, problems };
}

// One table cell: a newline would end the row and a bare `|` would split it.
//
// Args:
//   value: string, the cell text.
// Returns:
//   string: single-line text with each `|` written `\|`.
function cell(value) {
    return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

// Renders the feature record's verification section. The criterion text always
// comes from `criteria`, never from the report, so the verifier cannot reword it;
// the report supplies only each row's result and evidence. Where a number has
// several rows the first is used. A criterion with no row, or a PASS row with no
// evidence, renders as UNVERIFIED.
//
// Args:
//   section: object with
//     criteria: string[], the acceptance criteria in file order.
//     rows: Array<{ n: number, result: string, evidence: string }>, from parseReport.
//     verdict: string, 'PASS' or 'FAIL'.
//     date: string, the verification date.
//     shortSha: string, the short commit id verified.
//     problems: string[], one plain-English line each.
// Returns:
//   string: starts `## Verification`, ends with a newline.
function renderSection({ criteria, rows, verdict, date, shortSha, problems }) {
    const out = [
        '## Verification — ' + date + ' @ ' + shortSha,
        '',
        '| # | Criterion | Result | Evidence |',
        '| --- | --- | --- | --- |',
    ];
    criteria.forEach((text, i) => {
        const row = rows.find(r => r.n === i + 1);
        let result = row && RESULTS.includes(row.result) ? row.result : UNVERIFIED;
        let evidence = row ? String(row.evidence) : NO_ROW_EVIDENCE;
        if (result === PASS && evidence.trim() === '') result = UNVERIFIED;
        out.push('| ' + (i + 1) + ' | ' + cell(text) + ' | ' + result + ' | ' + cell(evidence) + ' |');
    });
    out.push('', '**Verdict**: ' + verdict);
    for (const p of problems) out.push('- ' + p);
    return out.join('\n') + '\n';
}

// Args:
//   tree: string, the codeTreeHash value.
//   acceptance: string, the acceptanceHash value.
// Returns:
//   string: the marker file body, `PASS\n<tree>\n<acceptance>\n`.
function markerBody(tree, acceptance) {
    return 'PASS\n' + tree + '\n' + acceptance + '\n';
}

// Args:
//   file: string, path of the verification marker.
// Returns:
//   { tree: string, acceptance: string } | null: null when the file is missing,
//   unreadable, truncated, or its first line is not PASS.
function readMarker(file) {
    let body;
    try {
        body = fs.readFileSync(file, 'utf-8');
    } catch (e) {
        return null;
    }
    const lines = body.split('\n');
    if (lines[0] !== PASS || !lines[1] || !lines[2]) return null;
    return { tree: lines[1], acceptance: lines[2] };
}

// Is the recorded verification still true of this repository and this record?
// Both hashes are always computed. Order of checks: no criteria, then an
// unreadable repository, then no PASS marker, then a hash mismatch.
//
// Args:
//   cwd: string, a directory inside the repository.
//   featureContent: string, the feature record's text.
// Returns:
//   { state: 'fresh'|'missing'|'stale'|'no-acceptance'|'error', detail: string }:
//   stale's detail names which hash moved (the code tree, the acceptance
//   criteria, or both).
function checkFresh(cwd, featureContent) {
    const criteria = parseAcceptance(featureContent);
    if (criteria.length === 0) {
        return { state: NO_ACCEPTANCE, detail: 'The feature record has no acceptance criteria.' };
    }
    const file = markerPaths(cwd).verify;
    if (file === null) return { state: ERROR, detail: 'Could not locate the repository.' };
    const tree = codeTreeHash(cwd);
    if (tree === null) return { state: ERROR, detail: 'Could not hash the committed code.' };
    const acceptance = acceptanceHash(criteria);
    const marker = readMarker(file);
    if (marker === null) return { state: MISSING, detail: 'No PASS verification marker.' };
    const moved = [];
    if (marker.tree !== tree) moved.push('the code tree');
    if (marker.acceptance !== acceptance) moved.push('the acceptance criteria');
    if (moved.length) {
        return { state: STALE, detail: 'Changed since the last verification: ' + moved.join(' and ') + '.' };
    }
    return { state: FRESH, detail: 'The marker matches the code tree and the acceptance criteria.' };
}

module.exports = {
    codeTreeHash,
    acceptanceHash,
    dirtyPaths,
    parseReport,
    renderSection,
    markerBody,
    readMarker,
    checkFresh,
};
