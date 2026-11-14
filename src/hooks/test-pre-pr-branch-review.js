// Tests for pre-pr-branch-review.js: the PreToolUse hook that checks the
// branch-review marker before a PR is opened. Advisory by default, a block in
// enforce mode. Written before the implementation.
//
// Each case runs the hook as a child process with stdin JSON, in a scratch
// repository on branch feat-x with an `origin` remote, with
// BRANCH_REVIEW_REPOS_CONFIG pointed at a scratch file and HOME at a scratch
// directory so nothing touches the real config. A PATH shim records any git spawn.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const markers = require('./lib/review-markers.js');
const branchReview = require('./lib/branch-review.js');
const { cmd } = require('./lib/plugin-names.js');

const HOOK = path.join(__dirname, 'pre-pr-branch-review.js');
const LIB_DIR = path.join(__dirname, 'lib');
const BRANCH = 'feat-x';
const MAIN = 'main';
const BASE_REF = 'origin/main';
const PR_COMMAND = 'gh pr create --fill';
const REVIEW_NAME = cmd('branch-review');
const CRASH_TAG = 'PRE_PR_BRANCH_REVIEW:';
const APPROVE = { decision: 'approve' };
const KIND_APPROVE = 'approve';
const KIND_NOTICE = 'notice';
const KIND_DENY = 'deny';
const ADVISORY = 'advisory';
const ENFORCE = 'enforce';
const STEP_ID = 'pre-pr-branch-review';
const STEP_AREA = 'branch-review';

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

const SCRATCH = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pre-pr-branch-review-')));
const HOME_DIR = path.join(SCRATCH, 'home');
fs.mkdirSync(HOME_DIR);
const SENTINEL = path.join(SCRATCH, 'git-was-spawned');
const SHIM_DIR = path.join(SCRATCH, 'shim');
fs.mkdirSync(SHIM_DIR);
fs.writeFileSync(path.join(SHIM_DIR, 'git'), '#!/bin/sh\necho spawned > "' + SENTINEL + '"\nexit 1\n', { mode: 0o755 });
const NO_USER_CONFIG = path.join(SCRATCH, 'no-such-user-config.json');
const ENV_BASE = {
    SDLC_REVIEW_CONFIG_USER: NO_USER_CONFIG,
    CLAUDE_CONFIG_DIR: path.join(SCRATCH, 'claude-config'),
    TDD_MANDATE_CONFIG: path.join(SCRATCH, 'no-such-mandate.json'),
};

// Args: name - scratch directory name; extraRemoteBranch - a branch name to
// publish at the feature tip, or null.
// Returns: string, a repository on branch feat-x, one commit ahead of origin/main,
// with origin/HEAD set.
function newRepo(name, extraRemoteBranch) {
    const dir = path.join(SCRATCH, name);
    const remote = path.join(SCRATCH, name + '-origin.git');
    fs.mkdirSync(dir);
    git(['init', '-q', '--bare', '-b', MAIN, remote], SCRATCH);
    git(['init', '-q', '-b', MAIN], dir);
    git(['config', 'user.email', 't@example.com'], dir);
    git(['config', 'user.name', 'T'], dir);
    fs.mkdirSync(path.join(dir, 'pkg'));
    fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'init'], dir);
    git(['remote', 'add', 'origin', remote], dir);
    git(['push', '-q', '-u', 'origin', MAIN], dir);
    git(['remote', 'set-head', 'origin', MAIN], dir);
    git(['checkout', '-q', '-b', BRANCH], dir);
    fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 2;\n');
    git(['commit', '-q', '-am', 'change'], dir);
    if (extraRemoteBranch) git(['push', '-q', 'origin', BRANCH + ':' + extraRemoteBranch], dir);
    git(['fetch', '-q', 'origin'], dir);
    return dir;
}

let configCount = 0;
// Args: body - string | object, the config file's content.
// Returns: string, path of a new scratch config file.
function writeConfig(body) {
    const file = path.join(SCRATCH, 'branch-review-repos-' + (configCount++) + '.json');
    fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
    return file;
}

// Args: dir - a repository path to list; entry - the entry object.
// Returns: string, path of a scratch config listing dir.
function listed(dir, entry) {
    return writeConfig({ version: 1, repos: { [dir]: entry } });
}

// Args: dir - a repository path; mode - the entry's mode, or undefined.
// Returns: string, path of a scratch config listing dir.
function listedMode(dir, mode) {
    return listed(dir, mode === undefined ? {} : { mode });
}

// Args: cwd - where the hook runs; command - the Bash command; config - the
// BRANCH_REVIEW_REPOS_CONFIG path (null leaves it unset); opts - { env, shim, hook }.
// Returns: { status, stdout, json }.
function run(cwd, command, config, opts) {
    const o = opts || {};
    const env = { ...process.env, HOME: HOME_DIR, ...ENV_BASE, ...(o.env || {}) };
    delete env.TIMING_LOG_PATH;
    delete env.BRANCH_REVIEW_REPOS_CONFIG;
    if (config !== null) env.BRANCH_REVIEW_REPOS_CONFIG = config;
    if (o.shim) env.PATH = SHIM_DIR + path.delimiter + env.PATH;
    const r = spawnSync(process.execPath, [o.hook || HOOK], {
        cwd, env, encoding: 'utf-8', input: JSON.stringify({ tool_input: { command } }),
    });
    let json = null;
    try { json = JSON.parse(r.stdout); } catch (e) { /* json stays null */ }
    return { status: r.status, stdout: r.stdout, json };
}

const denied = r => !!r.json && !!r.json.hookSpecificOutput &&
    r.json.hookSpecificOutput.permissionDecision === 'deny';
const reasonOf = r => (r.json && r.json.hookSpecificOutput && r.json.hookSpecificOutput.permissionDecisionReason) || '';
const noteOf = r => (r.json && r.json.systemMessage) || '';
const isNotice = r => !!r.json && typeof r.json.systemMessage === 'string' &&
    !('decision' in r.json) && !('hookSpecificOutput' in r.json);

// Args: r - a run result. Returns: string, which output kind it is.
function kindOf(r) {
    if (denied(r)) return KIND_DENY;
    if (isNotice(r)) return KIND_NOTICE;
    if (r.json && r.json.decision === 'approve' && Object.keys(r.json).length === 1) return KIND_APPROVE;
    return 'other:' + r.stdout;
}

// Args: r - a run result. Returns: string, all the text the output carries.
function textOf(r) {
    return reasonOf(r) + '\n' + noteOf(r);
}

// Args: dir - a repository. Writes a marker for the current branch diff.
function writeFreshMarker(dir) {
    const recipe = branchReview.markerRecipe({
        toplevel: dir, markerPath: markers.markerPaths(dir).branch, base: BASE_REF, tag: 'test:round1',
    });
    execFileSync('sh', ['-c', recipe], { cwd: dir });
}

function sentinelGone() {
    const there = fs.existsSync(SENTINEL);
    fs.rmSync(SENTINEL, { force: true });
    return !there;
}

// Each row: setup(dir) returns { config, command?, cwd?, env?, shim? } for the
// hook run; kind is the expected output kind; match is a regex on all the text.
const ROWS = [
    { name: 'not a PR command', mode: ENFORCE, kind: KIND_APPROVE, command: 'ls -la', setup: () => ({}) },
    { name: 'no config file', mode: ENFORCE, kind: KIND_APPROVE,
        setup: () => ({ config: path.join(SCRATCH, 'no-such-repos.json') }) },
    { name: 'step off', mode: ENFORCE, kind: KIND_APPROVE, setup: (dir) => {
        const user = path.join(SCRATCH, 'user-step-off.json');
        fs.writeFileSync(user, JSON.stringify({ steps: { [STEP_AREA]: { [STEP_ID]: false } } }));
        return { env: { SDLC_REVIEW_CONFIG_USER: user } };
    } },
    { name: 'repo not listed', mode: ENFORCE, kind: KIND_APPROVE,
        setup: () => ({ config: listedMode(path.join(SCRATCH, 'elsewhere'), ENFORCE) }) },
    { name: 'ancestor listed, nested unlisted repo', mode: ENFORCE, kind: KIND_APPROVE, setup: (dir) => {
        const nested = path.join(dir, 'pkg', 'inner');
        fs.mkdirSync(nested);
        git(['init', '-q', '-b', MAIN], nested);
        return { cwd: nested };
    } },
    { name: 'no marker, advisory', mode: ADVISORY, kind: KIND_NOTICE, match: /missing[\s\S]*allowed anyway \(advisory mode\)/, setup: () => ({}) },
    { name: 'no marker, enforce', mode: ENFORCE, kind: KIND_DENY, match: /missing/, setup: () => ({}) },
    { name: 'stale marker, advisory', mode: ADVISORY, kind: KIND_NOTICE, match: /stale/, setup: (dir) => {
        writeFreshMarker(dir);
        fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 3;\n');
        git(['commit', '-q', '-am', 'later'], dir);
        return {};
    } },
    { name: 'stale marker, enforce', mode: ENFORCE, kind: KIND_DENY, match: /stale/, setup: (dir) => {
        writeFreshMarker(dir);
        fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 3;\n');
        git(['commit', '-q', '-am', 'later'], dir);
        return {};
    } },
    { name: 'fresh marker', mode: ENFORCE, kind: KIND_APPROVE, setup: (dir) => { writeFreshMarker(dir); return {}; } },
    { name: 'no base, enforce', mode: ENFORCE, kind: KIND_DENY, match: /no-base[\s\S]*base/, setup: (dir) => {
        git(['remote', 'set-head', 'origin', '-d'], dir);
        return {};
    } },
    { name: 'no base, advisory', mode: ADVISORY, kind: KIND_NOTICE, match: /no-base/, setup: (dir) => {
        git(['remote', 'set-head', 'origin', '-d'], dir);
        return {};
    } },
    { name: 'detached HEAD, enforce', mode: ENFORCE, kind: KIND_DENY, match: /detached/, setup: (dir) => {
        git(['checkout', '-q', '--detach'], dir);
        return {};
    } },
    { name: 'empty range, enforce', mode: ENFORCE, kind: KIND_DENY, match: /empty/, setup: (dir) => {
        git(['reset', '-q', '--hard', BASE_REF], dir);
        return {};
    } },
    { name: 'git unreadable, advisory', mode: ADVISORY, kind: KIND_NOTICE, match: /error/, setup: () => ({ shim: true }) },
    { name: 'git unreadable, enforce', mode: ENFORCE, kind: KIND_DENY, match: /error/, setup: () => ({ shim: true }) },
    { name: 'invalid mode', mode: 'strict', kind: KIND_DENY, match: /mode/, setup: () => ({}) },
    { name: 'unparsable config', mode: ADVISORY, kind: KIND_DENY, match: /parse/, setup: () => ({ config: writeConfig('{not json') }) },
    { name: 'unparsable config, fix text names the config file', mode: ADVISORY, kind: KIND_DENY, match: /Fix the config file [^\s]*\.json[\s\S]*retry/, nomatch: /git problem/, setup: () => ({ config: writeConfig('{not json') }) },
    { name: 'git unreadable, fix text keeps the git advice', mode: ENFORCE, kind: KIND_DENY, match: /Fix the git problem/, setup: () => ({ shim: true }) },
    { name: 'invalid base', mode: ADVISORY, kind: KIND_DENY, match: /base/, entry: { mode: ADVISORY, base: '--evil' }, setup: () => ({}) },
];

try {
    console.log('(a) table of states');
    let n = 0;
    for (const row of ROWS) {
        const dir = newRepo('row' + (n++), null);
        const s = row.setup(dir);
        const config = s.config || (row.entry ? listed(dir, row.entry) : listedMode(dir, row.mode));
        const r = run(s.cwd || dir, row.command || PR_COMMAND, config, { env: s.env, shim: s.shim });
        assert(row.name + ': kind', kindOf(r), row.kind);
        if (row.match) assert(row.name + ': text', row.match.test(textOf(r)), true);
        if (row.nomatch) assert(row.name + ': text lacks', row.nomatch.test(textOf(r)), false);
        if (row.kind === KIND_NOTICE) assert(row.name + ': notice never blocks', r.status, 0);
    }

    console.log('(b) D9: cwd outside every listed key, no git spawned');
    {
        const dir = newRepo('d9', null);
        const other = path.join(SCRATCH, 'd9-other');
        fs.mkdirSync(other);
        fs.rmSync(SENTINEL, { force: true });
        const r = run(dir, PR_COMMAND, listedMode(other, ENFORCE), { shim: true });
        assert('approve', r.json, APPROVE);
        assert('shim saw no git', sentinelGone(), true);
        const q = run(dir, 'ls', listedMode(dir, ENFORCE), { shim: true });
        assert('non-PR command: approve, no git', q.json && sentinelGone(), true);
    }

    console.log('(c) the recipe in the deny text, run verbatim from a subdirectory, makes the next call approve');
    {
        const dir = newRepo('recipe', null);
        const config = listedMode(dir, ENFORCE);
        const first = run(dir, PR_COMMAND, config);
        assert('first call denies', kindOf(first), KIND_DENY);
        assert('names the command', reasonOf(first).includes(REVIEW_NAME), true);
        assert('says to replace the round', reasonOf(first).includes('replace round<n> with the round used'), true);
        const line = reasonOf(first).split('\n').find(l => l.startsWith('printf '));
        assert('the text carries a recipe line', typeof line, 'string');
        const sub = path.join(dir, 'pkg');
        const ran = spawnSync('sh', ['-c', line], { cwd: sub, encoding: 'utf-8' });
        assert('recipe exits 0', ran.status, 0);
        assert('next call approves', run(sub, PR_COMMAND, config).json, APPROVE);
    }

    console.log('(d) crash: a truncated lib file denies in both modes');
    {
        const tree = path.join(SCRATCH, 'crash-tree');
        fs.mkdirSync(tree);
        fs.cpSync(LIB_DIR, path.join(tree, 'lib'), { recursive: true });
        fs.copyFileSync(HOOK, path.join(tree, 'pre-pr-branch-review.js'));
        fs.writeFileSync(path.join(tree, 'lib', 'branch-review.js'), 'const x = {\n');
        const dir = newRepo('crash', null);
        for (const mode of [ADVISORY, ENFORCE]) {
            const r = run(dir, PR_COMMAND, listedMode(dir, mode), { hook: path.join(tree, 'pre-pr-branch-review.js') });
            assert('crash denies, ' + mode, denied(r), true);
            assert('crash reason is tagged, ' + mode, reasonOf(r).startsWith(CRASH_TAG), true);
        }
    }

    console.log('(e) the base override: origin/dev judges origin/dev...HEAD');
    {
        const dir = newRepo('base', 'dev');
        const plain = run(dir, PR_COMMAND, listedMode(dir, ENFORCE));
        assert('default base: missing', denied(plain) && /missing/.test(reasonOf(plain)), true);
        const over = run(dir, PR_COMMAND, listed(dir, { mode: ENFORCE, base: 'origin/dev' }));
        assert('override: empty range against origin/dev', denied(over) && /empty/.test(reasonOf(over)) && reasonOf(over).includes('origin/dev'), true);
    }
} finally {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
}

console.log('\n=================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
