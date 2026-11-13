// Tests for branch-review-cli.js: `plan` and `check-report`. Written before the
// implementation. Each case runs the CLI as a child process in a scratch
// repository on branch feat-x (one commit ahead of origin/main) with
// BRANCH_REVIEW_REPOS_CONFIG and the user review config pointed at scratch files.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const { checkFresh, STATE } = require('./lib/branch-review.js');
const { markerPaths } = require('./lib/review-markers.js');
const { agent } = require('./lib/plugin-names.js');

const CLI = path.join(__dirname, 'branch-review-cli.js');
const BRANCH = 'feat-x';
const MAIN = 'main';
const BASE_REF = 'origin/main';
const PLAN = 'plan';
const CHECK = 'check-report';
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;
const BASH = 'bash';
const SECTION_COUNT = 7;
const EVIDENCE = 'Checked it at src/a.js:12 and found the issue.';
const DEFAULT_CAP = 25000;

let passed = 0;
let failed = 0;

// Args: name - string; actual, expected - any JSON-able values.
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

const SCRATCH = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'branch-review-cli-')));
const HOME_DIR = path.join(SCRATCH, 'home');
fs.mkdirSync(HOME_DIR);
let counter = 0;

// Args: dir - a repository; body - the repos config content (object) or null for
// no file. Returns: string, the env path of the repos config.
function reposConfig(body) {
    const file = path.join(SCRATCH, 'repos-' + (counter++) + '.json');
    if (body !== null) fs.writeFileSync(file, JSON.stringify(body));
    return file;
}

// Args: name - scratch directory name. Returns: string, a repository on branch
// feat-x one commit ahead of origin/main (origin/HEAD set). The commit changes
// a.js (2 lines) and adds pkg/b.js (3 lines): 5 changed lines in two groups.
function newRepo(name) {
    const dir = path.join(SCRATCH, name);
    const remote = path.join(SCRATCH, name + '-origin.git');
    fs.mkdirSync(dir);
    git(['init', '-q', '--bare', '-b', MAIN, remote], SCRATCH);
    git(['init', '-q', '-b', MAIN], dir);
    git(['config', 'user.email', 't@example.com'], dir);
    git(['config', 'user.name', 'T'], dir);
    fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'init'], dir);
    git(['remote', 'add', 'origin', remote], dir);
    git(['push', '-q', '-u', 'origin', MAIN], dir);
    git(['remote', 'set-head', 'origin', MAIN], dir);
    git(['checkout', '-q', '-b', BRANCH], dir);
    fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 2;\n');
    fs.mkdirSync(path.join(dir, 'pkg'));
    fs.writeFileSync(path.join(dir, 'pkg', 'b.js'), '1\n2\n3\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'change'], dir);
    return dir;
}

// Args: args - CLI argv; cwd - working directory; reposFile - repos config path.
// Returns: { status, json, stderr }; json is the parsed stdout line or null.
function run(args, cwd, reposFile) {
    const r = spawnSync('node', [CLI, ...args], {
        cwd,
        encoding: 'utf-8',
        env: {
            ...process.env,
            HOME: HOME_DIR,
            BRANCH_REVIEW_REPOS_CONFIG: reposFile || reposConfig(null),
            SDLC_REVIEW_CONFIG_USER: path.join(SCRATCH, 'no-user-config.json'),
        },
    });
    let json = null;
    try {
        json = JSON.parse(r.stdout.trim());
    } catch (e) {
        json = null;
    }
    return { status: r.status, json, stderr: r.stderr };
}

// Args: repo - a repository; cap - number. Writes the repo config with that cap.
function setCap(repo, cap) {
    fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.claude', 'sdlc-review.json'), JSON.stringify({ branchReview: { maxChangedLines: cap } }));
}

// Each setup returns { repo, repos } for one row.
const plain = n => ({ repo: newRepo(n), repos: null });
const rows = [
    ['normal branch', () => plain('normal'), EXIT_OK, {
        ok: true, branch: BRANCH, base: BASE_REF, baseSource: 'origin-head', changedLines: 5, files: ['a.js', 'pkg/b.js'],
        cap: DEFAULT_CAP, overCap: false, groups: [], agent: agent('code-reviewer-deep'), dirty: false, warnings: [],
    }],
    ['cap 5 and 5 lines is not over', () => {
        const r = newRepo('cap-equal');
        setCap(r, 5);
        return { repo: r, repos: null };
    }, EXIT_OK, { ok: true, cap: 5, overCap: false, groups: [] }],
    ['cap 4 is over, two groups cover every file', () => {
        const r = newRepo('cap-over');
        setCap(r, 4);
        return { repo: r, repos: null };
    }, EXIT_OK, {
        ok: true, cap: 4, overCap: true,
        groups: [{ dir: 'a.js', files: ['a.js'], lines: 2 }, { dir: 'pkg', files: ['pkg/b.js'], lines: 3 }],
    }],
    ['config base override without origin/HEAD', () => {
        const r = newRepo('cfg-base');
        git(['remote', 'set-head', 'origin', '-d'], r);
        return { repo: r, repos: reposConfig({ repos: { [r]: { base: BASE_REF } } }) };
    }, EXIT_OK, { ok: true, base: BASE_REF, baseSource: 'config' }],
    ['unlisted repo in a config file falls back to origin/HEAD', () => {
        const r = newRepo('unlisted');
        return { repo: r, repos: reposConfig({ repos: { '/nowhere': { base: 'x' } } }) };
    }, EXIT_OK, { ok: true, baseSource: 'origin-head', warnings: [] }],
    ['broken config file warns and falls back', () => {
        const r = newRepo('bad-cfg');
        const file = reposConfig(null);
        fs.writeFileSync(file, '{not json');
        return { repo: r, repos: file };
    }, EXIT_OK, { ok: true, baseSource: 'origin-head', warningCount: 1 }],
    ['invalid config base', () => {
        const r = newRepo('bad-base');
        return { repo: r, repos: reposConfig({ repos: { [r]: { base: '-x' } } }) };
    }, EXIT_FAIL, { ok: false }],
    ['detached HEAD', () => {
        const r = newRepo('detached');
        git(['checkout', '-q', '--detach'], r);
        return { repo: r, repos: null };
    }, EXIT_FAIL, { ok: false }],
    ['no base', () => {
        const r = newRepo('no-base');
        git(['remote', 'set-head', 'origin', '-d'], r);
        return { repo: r, repos: null };
    }, EXIT_FAIL, { ok: false }],
    ['empty range', () => {
        const r = newRepo('empty');
        git(['checkout', '-q', MAIN], r);
        return { repo: r, repos: null };
    }, EXIT_FAIL, { ok: false }],
    ['not a repository', () => ({ repo: fs.mkdtempSync(path.join(SCRATCH, 'norepo-')), repos: null }), EXIT_FAIL, { ok: false }],
    ['dirty tree', () => {
        const r = newRepo('dirty');
        fs.writeFileSync(path.join(r, 'untracked.txt'), 'x\n');
        return { repo: r, repos: null };
    }, EXIT_OK, { ok: true, dirty: true }],
];

console.log('plan:');
for (const [name, setup, wantStatus, want] of rows) {
    const { repo, repos } = setup();
    const res = run([PLAN], repo, repos);
    const j = res.json || {};
    assert(name + ' (exit)', res.status, wantStatus);
    const got = {};
    for (const k of Object.keys(want)) got[k] = k === 'warningCount' ? (j.warnings || []).length : j[k];
    assert(name + ' (facts)', got, want);
    if (wantStatus === EXIT_FAIL) assert(name + ' (error text, no plan fields)', [typeof j.error, 'head' in j, 'base' in j], ['string', false, false]);
}

console.log('plan, shape and --repo:');
{
    const repo = newRepo('shape');
    const res = run([PLAN, '--repo', repo], SCRATCH, null);
    const j = res.json;
    assert('--repo from another cwd works', [res.status, j.ok, j.toplevel], [EXIT_OK, true, repo]);
    assert('head is the full sha', j.head, git(['rev-parse', 'HEAD'], repo));
    assert('keys', Object.keys(j).sort(), ['agent', 'base', 'baseSource', 'branch', 'cap', 'changedLines', 'dirty', 'files',
        'groups', 'head', 'markerPath', 'maxRounds', 'model', 'ok', 'overCap', 'recipe', 'toplevel', 'warnings']);
    assert('markerPath is the branch marker', j.markerPath, markerPaths(repo).branch);
    assert('plan writes nothing', fs.existsSync(j.markerPath), false);
}

console.log('plan, usage:');
assert('--repo without a value exits 2', run([PLAN, '--repo'], SCRATCH, null).status, EXIT_USAGE);
assert('unknown subcommand exits 2', run(['bogus'], SCRATCH, null).status, EXIT_USAGE);
assert('check-report without a file exits 2', run([CHECK], SCRATCH, null).status, EXIT_USAGE);

console.log('recipe:');
{
    const repo = newRepo('recipe');
    const j = run([PLAN], repo, null).json;
    const markerFile = markerPaths(repo).branch;
    assert('before the recipe the marker is missing', checkFresh({ cwd: repo, base: j.base, markerFile }).state, STATE.MISSING);
    const r = spawnSync(BASH, ['-c', j.recipe], { cwd: repo, encoding: 'utf-8' });
    assert('recipe exits 0', r.status, EXIT_OK);
    assert('after the recipe the marker is fresh', checkFresh({ cwd: repo, base: j.base, markerFile }).state, STATE.FRESH);
}

// Args: trailer - the BRANCH_GATE line. Returns: string, a report with seven sections.
function report(trailer) {
    const out = [];
    for (let n = 1; n <= SECTION_COUNT; n++) out.push('## Q' + n + ' question', EVIDENCE, '');
    out.push(trailer);
    return out.join('\n');
}
const reportFile = (name, text) => {
    const f = path.join(SCRATCH, name);
    fs.writeFileSync(f, text);
    return f;
};

console.log('check-report:');
const reportRows = [
    ['passing report', reportFile('pass.md', report('BRANCH_GATE: PASS')), EXIT_OK, 'PASS'],
    ['failing report', reportFile('fail.md', report('BRANCH_GATE: FAIL')), EXIT_FAIL, 'FAIL'],
    ['missing file', path.join(SCRATCH, 'no-such.md'), EXIT_USAGE, undefined],
];
for (const [name, file, wantStatus, wantVerdict] of reportRows) {
    const res = run([CHECK, file], SCRATCH, null);
    assert(name + ' (exit, verdict)', [res.status, res.json ? res.json.verdict : undefined], [wantStatus, wantVerdict]);
}

fs.rmSync(SCRATCH, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
