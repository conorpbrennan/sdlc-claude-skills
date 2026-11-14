// Tests for lib/branch-report.js: the parser that settles a branch-review
// report's verdict. One table of reports against the expected verdict.
require('./lib/isolate-git-env.js').isolateGitEnv();

const { parseReport } = require('./lib/branch-report.js');

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
    if (ok) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        console.log(`    ${detail}`);
        failed++;
    }
}

const EVIDENCE = 'Checked it at src/a.js:12 and found the issue.';
const NONE_OK = 'None found, checked: lib/a.js, lib/b.js, test-a.js';

// Args:
//   bodies: object, question number to body text; defaults to evidence.
//   omit: number[], question numbers left out.
//   repeat: number[], question numbers written twice.
//   extra: string, text placed after the sections and before the trailer.
//   trailer: string, the trailer line, or null for none.
//   head: string, text placed above the first heading.
// Returns:
//   string: a report.
function build({ bodies = {}, omit = [], repeat = [], extra = '', trailer = 'BRANCH_GATE: PASS', head = '' } = {}) {
    const out = [head];
    for (let n = 1; n <= 7; n++) {
        if (omit.includes(n)) continue;
        const times = repeat.includes(n) ? 2 : 1;
        for (let i = 0; i < times; i++) out.push('## Q' + n + ' question', bodies[n] === undefined ? EVIDENCE : bodies[n], '');
    }
    out.push(extra);
    if (trailer !== null) out.push(trailer);
    return out.join('\n');
}

const BARE = ['None', 'none.', 'N/A', '- none', 'None found.', ''];
const bareRows = BARE.map(b => ['bare "' + b + '"', build({ bodies: { 3: b } }), { verdict: 'FAIL', problemMatch: /Q3/ }]);

const rows = [
    ['all seven with evidence, PASS', build(), { verdict: 'PASS', problemMatch: null }],
    ...bareRows,
    ['None found with one item', build({ bodies: { 4: 'None found, checked: a.js' } }), { verdict: 'FAIL', problemMatch: /Q4/ }],
    ['None found with three items', build({ bodies: { 4: NONE_OK } }), { verdict: 'PASS', problemMatch: null }],
    ['None found, bulleted, semicolons', build({ bodies: { 4: '- none found, checked: lib/a.js; lib/b.js' } }), { verdict: 'PASS', problemMatch: null }],
    ['None found with two short items', build({ bodies: { 4: 'None found, checked: ab, cd' } }), { verdict: 'FAIL', problemMatch: /Q4/ }],
    ['missing Q5', build({ omit: [5] }), { verdict: 'FAIL', problemMatch: /Q5/ }],
    ['repeated Q2', build({ repeat: [2] }), { verdict: 'FAIL', problemMatch: /Q2/ }],
    ['file:line above the first Q only', build({ bodies: { 1: 'nothing' }, head: 'See src/a.js:9' }), { verdict: 'FAIL', problemMatch: /Q1/ }],
    ['URL with a port is not file:line', build({ bodies: { 1: 'see http://example.com:8080/x' } }), { verdict: 'FAIL', problemMatch: /Q1/ }],
    ['path with line after a URL still counts', build({ bodies: { 1: 'http://example.com:8080/x and lib/a.js:12' } }), { verdict: 'PASS', problemMatch: null }],
    ['PASS trailer with CONFIRMED CRITICAL', build({ extra: '### F1 CONFIRMED CRITICAL\nbad' }), { verdict: 'FAIL', problemMatch: /CRITICAL|blocking/i }],
    ['PASS trailer with CONFIRMED ADVISORY', build({ extra: '### F1 CONFIRMED ADVISORY\nminor' }), { verdict: 'PASS', problemMatch: null }],
    ['FAIL trailer', build({ trailer: 'BRANCH_GATE: FAIL' }), { verdict: 'FAIL', problemMatch: /FAIL/ }],
    ['trailer not last', build({ trailer: 'BRANCH_GATE: PASS\nthanks' }), { verdict: 'FAIL', problemMatch: /trailer/ }],
    ['no trailer', build({ trailer: null }), { verdict: 'FAIL', problemMatch: /trailer/ }],
    ['empty string', '', { verdict: 'FAIL', problemMatch: /trailer/ }],
    ['non-string input', 42, { verdict: 'FAIL', problemMatch: /trailer/ }],
    ['finding heading with colon', build({ extra: '### F1 CONFIRMED: CRITICAL\nx' }), { verdict: 'FAIL', problemMatch: /F1/ }],
    ['finding heading without severity', build({ extra: '### F1 CONFIRMED\nx' }), { verdict: 'FAIL', problemMatch: /F1/ }],
];

console.log('parseReport verdicts:');
for (const [name, report, want] of rows) {
    let got;
    try {
        got = parseReport(report);
    } catch (e) {
        check(name, false, 'threw: ' + e.message);
        continue;
    }
    const matched = want.problemMatch === null
        ? got.problems.length === 0
        : got.problems.some(p => want.problemMatch.test(p));
    check(name, got.verdict === want.verdict && matched && got.sections.length === 7,
        'verdict ' + got.verdict + ' (want ' + want.verdict + '), problems ' + JSON.stringify(got.problems));
}

// The evidence token in another section must not rescue a section.
console.log('section isolation and counts:');
const crossed = parseReport(build({ bodies: { 1: 'nothing', 2: 'see src/b.js:3' } }));
check('Q1 not ok when only Q2 has evidence', crossed.sections[0].ok === false && crossed.sections[0].kind === 'bad' && crossed.sections[1].kind === 'evidence',
    JSON.stringify(crossed.sections.slice(0, 2)));
const counts = parseReport(build({ extra: '### F1 CONFIRMED CRITICAL\na\n### F2 PLAUSIBLE CRITICAL\nb\n### F3 CONFIRMED ADVISORY\nc' }));
check('counts', counts.confirmed === 2 && counts.plausible === 1 && counts.blocking === 1,
    JSON.stringify([counts.confirmed, counts.plausible, counts.blocking]));
check('none-found kind', parseReport(build({ bodies: { 4: NONE_OK } })).sections[3].kind === 'none-found', 'kind not none-found');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
