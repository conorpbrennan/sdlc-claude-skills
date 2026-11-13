// Tests for the branch-review skill, its reviewer prompt and its command.
// They read the three files and assert the properties the gate relies on.
// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('./hooks/lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const path = require('path');
const { parseReport } = require('./hooks/lib/branch-report.js');

const ROOT = path.join(__dirname, '..');
const PROMPT_PATH = path.join(ROOT, 'skills', 'branch-review', 'reviewer-prompt.md');
const SKILL_PATH = path.join(ROOT, 'skills', 'branch-review', 'SKILL.md');
const COMMAND_PATH = path.join(ROOT, 'commands', 'branch-review.md');
const QUESTION_COUNT = 7;
const PASS_TRAILER = 'BRANCH_GATE: PASS';
const FAIL_TRAILER = 'BRANCH_GATE: FAIL';
const TDD_TRAILER_LINE = /^\s*TDD_GATE:\s*(PASS|FAIL)/m;

let passed = 0;
let failed = 0;

// Args: name - the case name; cond - truthy when it holds; detail - shown on failure.
// Returns: nothing; counts the result.
function ok(name, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS: ' + name); }
    else { failed += 1; console.log('  FAIL: ' + name + (detail !== undefined ? ' -- ' + detail : '')); }
}

// Args: file - an absolute path. Returns: string, the file text, or '' when absent.
function read(file) {
    try { return fs.readFileSync(file, 'utf-8'); } catch (e) { return ''; }
}

const prompt = read(PROMPT_PATH);
const skill = read(SKILL_PATH);
const command = read(COMMAND_PATH);

console.log('reviewer-prompt.md: headings and trailer:');
{
    const headings = prompt.split('\n').filter(l => /^## Q\d/.test(l));
    const want = [1, 2, 3, 4, 5, 6, 7].map(n => '## Q' + n);
    const got = headings.map(h => h.split(' ').slice(0, 2).join(' '));
    ok('headings Q1 to Q7 in order', JSON.stringify(got) === JSON.stringify(want), got.join(','));
    ok('exactly seven question headings', headings.length === QUESTION_COUNT, headings.length);
    ok('names both trailers', prompt.includes(PASS_TRAILER) && prompt.includes(FAIL_TRAILER));
    ok('holds the threat-model words', ['ADVISORY', 'honest mistakes', 'not adversarial'].every(p => prompt.includes(p)));
    ok('has no TDD_GATE trailer line', !TDD_TRAILER_LINE.test(prompt));
    ok('overrides the containing-function rule', prompt.includes('containing function only') && prompt.includes('git show HEAD:'));
    const TITLES = ['Handoffs between files', 'Where two writers meet', 'Timing', 'Repeated requests in flight', 'Flags and modes', 'Tests', 'Anything else spanning files'];
    ok('exact Q titles', JSON.stringify(headings.map(h => h.replace(/^## Q\d /, ''))) === JSON.stringify(TITLES), headings.join('|'));
    ok('never mentions a round number', !/round\s*\d/i.test(prompt));
}

console.log('\nreviewer-prompt.md: a report built from its headings parses:');
{
    const titles = prompt.split('\n').filter(l => /^## Q\d/.test(l));
    const body = titles.map(t => t + '\nsrc/a.js:10 reads the field src/b.js:22 writes.\n').join('\n');
    const report = body + '\n### F1 CONFIRMED ADVISORY Help text drifts\nsrc/a.js:3 and src/b.js:9.\n\n' + PASS_TRAILER + '\n';
    const res = parseReport(report);
    ok('sample report passes parseReport', res.verdict === 'PASS', JSON.stringify(res.problems));
    ok('the same report without a trailer fails', parseReport(report.replace(PASS_TRAILER, '')).verdict !== 'PASS');
}

console.log('\nSKILL.md:');
{
    const needles = ['branch-review-cli.js', 'check-report', 'maxRounds', 'two-round', 'sdlc:code-reviewer-deep', 'reviewer-prompt.md', 'timing-log.js'];
    for (const n of needles) ok('names ' + n, skill.includes(n));
    ok('has no git hash-object', !skill.includes('git hash-object'));
    ok('has no printf', !skill.includes('printf'));
    ok('has name and argument-hint frontmatter', /^name: branch-review$/m.test(skill) && /^argument-hint:/m.test(skill));
}

console.log('\ncommands/branch-review.md:');
{
    const needles = ['sdlc:branch-review', '`on`', '`off`', '`status`', 'branch-review-cli.js', 'enable', 'disable'];
    for (const n of needles) ok('names ' + n, command.includes(n));
    ok('has no writeFileSync or renameSync', !/writeFileSync|renameSync/.test(command));
    ok('has description and Arguments line', /^description:/m.test(command) && /^## Arguments:/m.test(command));
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
