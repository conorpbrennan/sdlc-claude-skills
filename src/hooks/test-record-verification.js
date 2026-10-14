// Tests for record-verification.js: the CLI that turns a verifier report into
// the feature record's "## Verification" section and the verification marker.
//
// Written before the implementation. Each case runs the script as a child
// process in a scratch repository on branch feat-x, with HOME and the timing
// log pointed at a scratch directory so nothing touches the real ones.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const verification = require('./lib/verification.js');
const markers = require('./lib/review-markers.js');
const { parseAcceptance } = require(path.join(__dirname, 'lib', 'feature-file'));

const SCRIPT = path.join(__dirname, 'record-verification.js');
const BRANCH = 'feat-x';
const RECORD_REL = 'features/feat-x.md';

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

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'record-verification-'));
const HOME_DIR = path.join(SCRATCH, 'home');
fs.mkdirSync(HOME_DIR);
const LOG = path.join(HOME_DIR, '.claude', 'code-review-timing.jsonl');

const RECORD_WITH_ACCEPTANCE =
    '# Feature: X\n\n## Acceptance\n\n1. First thing works.\n2. Second thing works.\n';
const RECORD_NO_ACCEPTANCE = '# Feature: X\n\nNothing here.\n';

// Args:
//   name: string, scratch directory name.
//   record: string, the feature record's text.
// Returns:
//   string: path of a repository on branch feat-x with one commit holding a.js
//   and the record.
function newRepo(name, record) {
    const dir = path.join(SCRATCH, name);
    fs.mkdirSync(path.join(dir, 'features'), { recursive: true });
    git(['init', '-q', '-b', BRANCH], dir);
    git(['config', 'user.email', 't@example.com'], dir);
    git(['config', 'user.name', 'T'], dir);
    fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(dir, RECORD_REL), record);
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'init'], dir);
    return dir;
}

const PASS_REPORT =
    '| # | Result | Evidence |\n| --- | --- | --- |\n' +
    '| 1 | PASS | ran the first check |\n| 2 | PASS | ran the second check |\n\nVERIFY_GATE: PASS\n';
const UNVERIFIED_REPORT =
    '| # | Result | Evidence |\n| --- | --- | --- |\n' +
    '| 1 | PASS | ran the first check |\n| 2 | UNVERIFIED | could not run it |\n\nVERIFY_GATE: PASS\n';

// Args:
//   dir: string, the repository to run in.
//   report: string, the report text.
//   extraEnv: object, environment overrides.
// Returns:
//   { status: number, stdout: string, stderr: string }
function run(dir, report, extraEnv) {
    const reportPath = path.join(SCRATCH, 'report-' + path.basename(dir) + '.md');
    fs.writeFileSync(reportPath, report);
    const env = { ...process.env, HOME: HOME_DIR, ...(extraEnv || {}) };
    delete env.TIMING_LOG_PATH;
    const r = spawnSync('node', [SCRIPT, '--report', reportPath], { cwd: dir, env, encoding: 'utf-8' });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf-8');
const markerFile = dir => markers.markerPaths(dir).verify;
const exists = f => fs.existsSync(f);

try {
    console.log('(a) clean PASS report');
    {
        const dir = newRepo('a', RECORD_WITH_ACCEPTANCE);
        const r = run(dir, PASS_REPORT);
        assert('exit 0', r.status, 0);
        assert('stdout ends with the trailer', r.stdout.trim().split('\n').pop(), 'VERIFY_GATE: PASS');
        const record = read(dir, RECORD_REL);
        assert('record has the section', record.includes('## Verification'), true);
        assert('record says PASS', record.includes('**Verdict**: PASS'), true);
        const expected = verification.markerBody(
            verification.codeTreeHash(dir),
            verification.acceptanceHash(parseAcceptance(RECORD_WITH_ACCEPTANCE)));
        assert('marker body has the hashes', exists(markerFile(dir)) ? fs.readFileSync(markerFile(dir), 'utf-8') : null, expected);
        assert('timing log has verify.completed', exists(LOG) && read(HOME_DIR, '.claude/code-review-timing.jsonl').includes('verify.completed'), true);
        assert('nothing staged', git(['diff', '--cached', '--name-only'], dir), '');
        assert('no new commit', git(['rev-list', '--count', 'HEAD'], dir), '1');
    }

    console.log('(b) PASS trailer with an UNVERIFIED row');
    {
        const dir = newRepo('b', RECORD_WITH_ACCEPTANCE);
        assert('first run passes', run(dir, PASS_REPORT).status, 0);
        assert('marker from the first run exists', exists(markerFile(dir)), true);
        git(['checkout', '-q', '--', RECORD_REL], dir);
        const r = run(dir, UNVERIFIED_REPORT);
        assert('exit 1', r.status, 1);
        assert('record says FAIL', read(dir, RECORD_REL).includes('**Verdict**: FAIL'), true);
        assert('stdout ends with the FAIL trailer', r.stdout.trim().split('\n').pop(), 'VERIFY_GATE: FAIL');
        assert('stale marker deleted', exists(markerFile(dir)), false);
    }

    console.log('(c) untracked b.js');
    {
        const dir = newRepo('c', RECORD_WITH_ACCEPTANCE);
        fs.writeFileSync(path.join(dir, 'b.js'), 'x\n');
        const r = run(dir, PASS_REPORT);
        assert('exit 2', r.status, 2);
        assert('names the dirty path', r.stderr.includes('b.js'), true);
        assert('record unchanged', read(dir, RECORD_REL), RECORD_WITH_ACCEPTANCE);
        assert('no marker', exists(markerFile(dir)), false);
    }

    console.log('(d) no Acceptance section');
    {
        const dir = newRepo('d', RECORD_NO_ACCEPTANCE);
        const r = run(dir, PASS_REPORT);
        assert('exit 2', r.status, 2);
        assert('names the command', r.stderr.includes('/sdlc:feature-new'), true);
        assert('names the record', r.stderr.includes('features/feat-x.md'), true);
        assert('record unchanged', read(dir, RECORD_REL), RECORD_NO_ACCEPTANCE);
        assert('no marker', exists(markerFile(dir)), false);
    }

    console.log('(e) running twice');
    {
        const dir = newRepo('e', RECORD_WITH_ACCEPTANCE);
        run(dir, PASS_REPORT);
        run(dir, PASS_REPORT);
        const count = (read(dir, RECORD_REL).match(/^## Verification/gm) || []).length;
        assert('one section', count, 1);
    }

    console.log('(f) GIT_DIR broken');
    {
        const dir = newRepo('f', RECORD_WITH_ACCEPTANCE);
        const r = run(dir, PASS_REPORT, { GIT_DIR: path.join(SCRATCH, 'no-such-git-dir') });
        assert('exit 2', r.status, 2);
        assert('no marker', exists(markerFile(dir)), false);
        assert('record unchanged', read(dir, RECORD_REL), RECORD_WITH_ACCEPTANCE);
    }

    console.log('(g) outside a repository');
    {
        const dir = path.join(SCRATCH, 'plain');
        fs.mkdirSync(dir);
        const r = run(dir, PASS_REPORT);
        assert('exit 2', r.status, 2);
    }

    console.log('(h) a non-feature branch');
    {
        const dir = newRepo('h', RECORD_WITH_ACCEPTANCE);
        git(['checkout', '-q', '-b', 'main'], dir);
        const r = run(dir, PASS_REPORT);
        assert('exit 2', r.status, 2);
        assert('no marker', exists(markerFile(dir)), false);
    }

    console.log('(i) a report with no trailer is a FAIL, never a PASS');
    {
        const dir = newRepo('i', RECORD_WITH_ACCEPTANCE);
        const r = run(dir, PASS_REPORT.replace('VERIFY_GATE: PASS\n', ''));
        assert('exit 1', r.status, 1);
        assert('no marker', exists(markerFile(dir)), false);
    }

    console.log('(j) a missing report file');
    {
        const dir = newRepo('j', RECORD_WITH_ACCEPTANCE);
        const r = spawnSync('node', [SCRIPT, '--report', path.join(SCRATCH, 'nope.md')], {
            cwd: dir, env: { ...process.env, HOME: HOME_DIR }, encoding: 'utf-8',
        });
        assert('exit 2', r.status, 2);
        assert('no marker', exists(markerFile(dir)), false);
        assert('record unchanged', read(dir, RECORD_REL), RECORD_WITH_ACCEPTANCE);
    }
} finally {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
