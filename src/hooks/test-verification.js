// Tests for lib/verification.js: the verification marker body, the two hashes,
// report parsing and section rendering.
//
// Written before the implementation. The module is the single owner of what
// "verified" means, so these pin the ways it must refuse: a read error never
// becomes a hash or an empty dirty list, and a PASS verdict is reachable only
// when the trailer, the row set, every row and every row's evidence all agree.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const verification = require('./lib/verification.js');
const markers = require('./lib/review-markers.js');

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        console.log(`    expected: ${e}`);
        console.log(`    actual:   ${a}`);
        failed++;
    }
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

function newRepo(dir) {
    fs.mkdirSync(dir, { recursive: true });
    git(['init', '-q', '.'], dir);
    git(['config', 'user.email', 't@t'], dir);
    git(['config', 'user.name', 't'], dir);
    return dir;
}

function commitFile(dir, rel, text) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
    git(['add', rel], dir);
    git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'c ' + rel], dir);
}

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-'));

console.log('verification tests');
console.log('==================');

// (a) codeTreeHash ignores feature records and follows code.
console.log('\ncodeTreeHash:');
const repo = newRepo(path.join(sb, 'repo'));
commitFile(repo, 'a.js', 'one\n');
commitFile(repo, 'features/x.md', 'v1\n');
const h0 = verification.codeTreeHash(repo);
assert('is a 40-char hex string', /^[0-9a-f]{40}$/.test(h0), true);
commitFile(repo, 'features/x.md', 'v2\n');
assert('unchanged by a commit touching only features/x.md', verification.codeTreeHash(repo), h0);
commitFile(repo, 'a.js', 'two\n');
const h1 = verification.codeTreeHash(repo);
assert('changes after a commit to a.js', h1 === h0, false);
commitFile(repo, 'features/sub/y.md', 'nested\n');
assert('a features/ file in a subdirectory is excluded too', verification.codeTreeHash(repo), h1);
commitFile(repo, 'docs/features/z.md', 'not a feature record\n');
assert('docs/features/z.md is code, so the hash moves', verification.codeTreeHash(repo) === h1, false);

// (b) read errors give null, never a hash of nothing.
console.log('\ncodeTreeHash fails closed:');
const empty = newRepo(path.join(sb, 'empty'));
assert('null in a repo with no commits', verification.codeTreeHash(empty), null);
const featuresOnly = newRepo(path.join(sb, 'features-only'));
commitFile(featuresOnly, 'features/x.md', 'only a record\n');
assert('null when no code path remains to hash', verification.codeTreeHash(featuresOnly), null);
assert('null outside any repository', verification.codeTreeHash(path.join(sb, 'nowhere-at-all')), null);
const savedGitDir = process.env.GIT_DIR;
process.env.GIT_DIR = path.join(sb, 'missing-git-dir');
assert('null with GIT_DIR at a missing directory', verification.codeTreeHash(repo), null);
assert('dirtyPaths is null with GIT_DIR at a missing directory', verification.dirtyPaths(repo), null);
if (savedGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = savedGitDir;

// acceptanceHash
console.log('\nacceptanceHash:');
const crypto = require('crypto');
assert('is SHA-1 of the criteria joined by newlines',
    verification.acceptanceHash(['a', 'b']),
    crypto.createHash('sha1').update('a\nb').digest('hex'));
assert('order matters', verification.acceptanceHash(['a', 'b']) === verification.acceptanceHash(['b', 'a']), false);
assert('wording matters', verification.acceptanceHash(['a']) === verification.acceptanceHash(['a ']), false);

// (c) parseReport
console.log('\nparseReport:');
function report(rows, trailer, opts) {
    const o = opts || {};
    const lines = ['Notes before the table.', '', '| # | Result | Evidence |', '| --- | --- | --- |'];
    for (const r of rows) lines.push(`| ${r[0]} | ${r[1]} | ${r[2]} |`);
    lines.push('');
    if (trailer) lines.push(trailer);
    if (o.after) lines.push(o.after);
    return lines.join('\n') + '\n';
}
const P = (n) => [n, 'PASS', 'ran the check, saw it work'];
const clean = verification.parseReport(report([P(1), P(2), P(3)], 'VERIFY_GATE: PASS'), 3);
assert('clean 3-row report is PASS', clean.verdict, 'PASS');
assert('clean report has no problems', clean.problems, []);
assert('clean report has three rows', clean.rows.map(r => [r.n, r.result]), [[1, 'PASS'], [2, 'PASS'], [3, 'PASS']]);
assert('row evidence is kept', clean.rows[0].evidence, 'ran the check, saw it work');
assert('trailing blank lines after the trailer are allowed',
    verification.parseReport(report([P(1), P(2), P(3)], 'VERIFY_GATE: PASS\n\n  \n'), 3).verdict, 'PASS');

function expectFail(name, text, count, needle) {
    const r = verification.parseReport(text, count === undefined ? 3 : count);
    assert(`${name}: verdict FAIL`, r.verdict, 'FAIL');
    assert(`${name}: exactly one problem`, r.problems.length, 1);
    if (needle) assert(`${name}: problem names it`, r.problems.join(' ').toLowerCase().includes(needle), true);
}
expectFail('PASS trailer with an UNVERIFIED row',
    report([P(1), [2, 'UNVERIFIED', 'could not run it'], P(3)], 'VERIFY_GATE: PASS'), 3, 'unverified');
expectFail('PASS trailer with a FAIL row',
    report([P(1), [2, 'FAIL', 'it broke'], P(3)], 'VERIFY_GATE: PASS'), 3, 'fail');
expectFail('missing row 2', report([P(1), P(3)], 'VERIFY_GATE: PASS'), 3, 'row');
expectFail('duplicated row 1', report([P(1), P(1), P(2), P(3)], 'VERIFY_GATE: PASS'), 3, 'row');
expectFail('extra row 4', report([P(1), P(2), P(3), P(4)], 'VERIFY_GATE: PASS'), 3, 'row');
expectFail('PASS row with empty evidence',
    report([P(1), [2, 'PASS', ''], P(3)], 'VERIFY_GATE: PASS'), 3, 'evidence');
expectFail('no trailer', report([P(1), P(2), P(3)], null), 3, 'trailer');
expectFail('text after the trailer',
    report([P(1), P(2), P(3)], 'VERIFY_GATE: PASS', { after: 'all good, ship it' }), 3, 'trailer');
expectFail('unrecognised trailer', report([P(1), P(2), P(3)], 'VERIFY_GATE: MAYBE'), 3, 'trailer');
expectFail('FAIL trailer on otherwise clean rows', report([P(1), P(2), P(3)], 'VERIFY_GATE: FAIL'), 3, 'fail');

const emptyEv = verification.parseReport(report([P(1), [2, 'PASS', '  '], P(3)], 'VERIFY_GATE: PASS'), 3);
assert('a PASS row with empty evidence is recorded as UNVERIFIED', emptyEv.rows[1].result, 'UNVERIFIED');
const noText = verification.parseReport('', 2);
assert('empty text is FAIL and does not throw', noText.verdict, 'FAIL');
assert('empty text has problems', noText.problems.length > 0, true);
assert('non-string text is FAIL and does not throw', verification.parseReport(undefined, 2).verdict, 'FAIL');
const noTable = verification.parseReport('just words\nVERIFY_GATE: PASS\n', 2);
assert('a PASS trailer with no table is FAIL', noTable.verdict, 'FAIL');
const piped = verification.parseReport(report([P(1), [2, 'PASS', 'saw a \\| b in the output'], P(3)], 'VERIFY_GATE: PASS'), 3);
assert('an escaped pipe stays inside the evidence cell', piped.rows[1].evidence, 'saw a | b in the output');
assert('an escaped pipe leaves the verdict PASS', piped.verdict, 'PASS');
const lower = verification.parseReport(report([P(1), [2, 'pass', 'ok'], P(3)], 'VERIFY_GATE: PASS'), 3);
assert('a result word in another case is not accepted as PASS', lower.verdict, 'FAIL');

// (d) renderSection
console.log('\nrenderSection:');
const criteria = ['First criterion', 'Second criterion', 'Third criterion'];
const rows = [
    { n: 1, result: 'PASS', evidence: 'Criterion 1 actually says something else entirely' },
    { n: 2, result: 'PASS', evidence: 'saw a | b' },
];
const section = verification.renderSection({
    criteria, rows, verdict: 'FAIL', date: '2026-10-14', shortSha: 'abc1234', problems: ['row 3 is missing'],
});
const sl = section.split('\n');
assert('heading', sl[0], '## Verification — 2026-10-14 @ abc1234');
assert('table header', sl[2], '| # | Criterion | Result | Evidence |');
assert('criterion 1 text comes from criteria', sl[4].includes('| First criterion |'), true);
assert('the report sentence stays in the evidence cell only',
    sl[4], '| 1 | First criterion | PASS | Criterion 1 actually says something else entirely |');
assert('a pipe in evidence is escaped', sl[5], '| 2 | Second criterion | PASS | saw a \\| b |');
assert('a criterion with no row is UNVERIFIED', sl[6], '| 3 | Third criterion | UNVERIFIED | no row in report |');
assert('verdict line', section.includes('\n**Verdict**: FAIL\n'), true);
assert('problems are bullets', section.includes('\n- row 3 is missing\n'), true);
assert('ends with a newline', section.endsWith('\n'), true);
assert('starts with the Verification heading replaceVerification expects', section.startsWith('## Verification'), true);
const smuggled = verification.renderSection({
    criteria: ['Real text'], rows: [{ n: 1, result: 'PASS', evidence: 'ok', criterion: 'Reworded', text: 'Reworded' }],
    verdict: 'PASS', date: 'd', shortSha: 's', problems: [],
});
assert('extra fields on a row never reach the criterion cell', smuggled.includes('| 1 | Real text | PASS | ok |'), true);
const pipeCrit =verification.renderSection({
    criteria: ['a | b'], rows: [{ n: 1, result: 'PASS', evidence: 'ok' }],
    verdict: 'PASS', date: 'd', shortSha: 's', problems: [],
});
assert('a pipe in a criterion is escaped', pipeCrit.includes('| 1 | a \\| b | PASS | ok |'), true);
assert('no problems means no bullets', /^- /m.test(pipeCrit), false);
const multi = verification.renderSection({
    criteria: ['c'], rows: [{ n: 1, result: 'PASS', evidence: 'line one\nline two' }],
    verdict: 'PASS', date: 'd', shortSha: 's', problems: [],
});
assert('a newline in evidence cannot break the table row', multi.includes('| 1 | c | PASS | line one line two |'), true);
const fakeRow = verification.renderSection({
    criteria: ['c'], rows: [{ n: 1, result: 'PASS', evidence: '' }],
    verdict: 'FAIL', date: 'd', shortSha: 's', problems: [],
});
assert('a PASS row with no evidence renders UNVERIFIED', fakeRow.includes('| 1 | c | UNVERIFIED |'), true);

// markerBody and readMarker
console.log('\nmarkerBody / readMarker:');
assert('markerBody layout', verification.markerBody('T', 'A'), 'PASS\nT\nA\n');
const mfile = path.join(sb, 'marker');
assert('readMarker is null for a missing file', verification.readMarker(mfile), null);
fs.writeFileSync(mfile, verification.markerBody('T', 'A'));
assert('readMarker reads tree and acceptance', verification.readMarker(mfile), { tree: 'T', acceptance: 'A' });
fs.writeFileSync(mfile, 'BLOCK\nT\nA\n');
assert('readMarker is null when the first line is not PASS', verification.readMarker(mfile), null);
fs.writeFileSync(mfile, 'PASS\nT\n');
assert('readMarker is null for a truncated body', verification.readMarker(mfile), null);
assert('readMarker is null for a directory', verification.readMarker(sb), null);

// (e) checkFresh reaches every state.
console.log('\ncheckFresh:');
const feature = '# F\n\n## Acceptance\n\n1. First\n2. Second\n';
const crit = ['First', 'Second'];
const vrepo = newRepo(path.join(sb, 'vrepo'));
commitFile(vrepo, 'a.js', 'x\n');
const vpath = markers.markerPaths(vrepo).verify;
assert('no criteria: no-acceptance', verification.checkFresh(vrepo, '# F\n\nnothing here\n').state, 'no-acceptance');
assert('no criteria wins over a broken repo',
    verification.checkFresh(path.join(sb, 'nowhere-at-all'), '# F\n').state, 'no-acceptance');
assert('not a repo: error', verification.checkFresh(path.join(sb, 'nowhere-at-all'), feature).state, 'error');
assert('no commits (tree hash null): error', verification.checkFresh(empty, feature).state, 'error');
assert('error carries a detail', typeof verification.checkFresh(empty, feature).detail, 'string');
assert('no marker: missing', verification.checkFresh(vrepo, feature).state, 'missing');
const tree = verification.codeTreeHash(vrepo);
const acc = verification.acceptanceHash(crit);
fs.writeFileSync(vpath, 'BLOCK\n' + tree + '\n' + acc + '\n');
assert('a non-PASS marker: missing', verification.checkFresh(vrepo, feature).state, 'missing');
fs.writeFileSync(vpath, verification.markerBody(tree, acc));
const ok = verification.checkFresh(vrepo, feature);
assert('matching marker: fresh', ok.state, 'fresh');
assert('fresh has a detail string', typeof ok.detail, 'string');
fs.writeFileSync(vpath, verification.markerBody('0'.repeat(40), acc));
const staleTree = verification.checkFresh(vrepo, feature);
assert('tree mismatch: stale', staleTree.state, 'stale');
assert('detail names the code tree', /code/i.test(staleTree.detail) && !/acceptance/i.test(staleTree.detail), true);
fs.writeFileSync(vpath, verification.markerBody(tree, '0'.repeat(40)));
const staleAcc = verification.checkFresh(vrepo, feature);
assert('acceptance mismatch: stale', staleAcc.state, 'stale');
assert('detail names the acceptance criteria', /acceptance/i.test(staleAcc.detail) && !/code/i.test(staleAcc.detail), true);
fs.writeFileSync(vpath, verification.markerBody('0'.repeat(40), '0'.repeat(40)));
const staleBoth = verification.checkFresh(vrepo, feature);
assert('both mismatched: stale naming both', staleBoth.state === 'stale' && /code/i.test(staleBoth.detail) && /acceptance/i.test(staleBoth.detail), true);
fs.writeFileSync(vpath, verification.markerBody(tree, acc));
commitFile(vrepo, 'a.js', 'y\n');
assert('a code commit after the marker: stale', verification.checkFresh(vrepo, feature).state, 'stale');
fs.writeFileSync(vpath, verification.markerBody(verification.codeTreeHash(vrepo), acc));
assert('re-marked: fresh again', verification.checkFresh(vrepo, feature).state, 'fresh');
assert('a reworded criterion: stale', verification.checkFresh(vrepo, '## Acceptance\n\n1. First\n2. Second, reworded\n').state, 'stale');

// (f) dirtyPaths
console.log('\ndirtyPaths:');
const drepo = newRepo(path.join(sb, 'drepo'));
commitFile(drepo, 'a.js', 'x\n');
commitFile(drepo, 'features/x.md', 'v1\n');
assert('clean tree: empty list, not null', verification.dirtyPaths(drepo), []);
fs.writeFileSync(path.join(drepo, 'features/x.md'), 'edited\n');
assert('an edited features/x.md is ignored', verification.dirtyPaths(drepo), []);
fs.mkdirSync(path.join(drepo, 'features/new'), { recursive: true });
fs.writeFileSync(path.join(drepo, 'features/new/n.md'), 'untracked record\n');
assert('an untracked record in a new features/ subdirectory is ignored', verification.dirtyPaths(drepo), []);
fs.writeFileSync(path.join(drepo, 'b.js'), 'new\n');
assert('an untracked b.js is reported', verification.dirtyPaths(drepo), ['b.js']);
fs.writeFileSync(path.join(drepo, 'a.js'), 'unstaged edit\n');
fs.writeFileSync(path.join(drepo, 'c.js'), 'staged\n');
git(['add', 'c.js'], drepo);
assert('staged, unstaged and untracked are all reported',
    verification.dirtyPaths(drepo).slice().sort(), ['a.js', 'b.js', 'c.js']);
fs.mkdirSync(path.join(drepo, 'dir'));
fs.writeFileSync(path.join(drepo, 'dir', 'd.js'), 'in a new dir\n');
assert('an untracked directory lists its files', verification.dirtyPaths(drepo).includes('dir/d.js'), true);
fs.writeFileSync(path.join(drepo, 'café x.js'), 'odd name\n');
assert('a non-ASCII name with a space comes back verbatim', verification.dirtyPaths(drepo).includes('café x.js'), true);
git(['mv', 'a.js', 'moved.js'], drepo);
const afterMove = verification.dirtyPaths(drepo);
assert('a rename reports both the new and the old path', afterMove.includes('moved.js') && afterMove.includes('a.js'), true);
assert('a rename does not leak the old path as a bogus entry', afterMove.every(p => !p.startsWith('R') || p.endsWith('.js')), true);
assert('null outside any repository', verification.dirtyPaths(path.join(sb, 'nowhere-at-all')), null);

fs.rmSync(sb, { recursive: true, force: true });

console.log('\n==================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
