// Tests for pre-pr-verify.js: the PreToolUse hook that checks verification
// before a PR is opened. Advisory by default, a block in enforce mode.
//
// Written before the implementation. Each case runs the hook as a child
// process with stdin JSON, in a scratch repository on branch feat-x, with
// VERIFY_REPOS_CONFIG pointed at a scratch file and HOME at a scratch
// directory so nothing touches the real config or the real timing log.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const markers = require('./lib/review-markers.js');
const { cmd } = require('./lib/plugin-names.js');

const HOOK = path.join(__dirname, 'pre-pr-verify.js');
const RECORDER = path.join(__dirname, 'record-verification.js');
const BRANCH = 'feat-x';
const RECORD_REL = 'features/feat-x.md';
const PR_COMMAND = 'gh pr create --fill';
const VERIFY_NAME = cmd('verify');
const APPROVE = { decision: 'approve' };

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

const SCRATCH = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pre-pr-verify-')));
const HOME_DIR = path.join(SCRATCH, 'home');
fs.mkdirSync(HOME_DIR);
const SENTINEL = path.join(SCRATCH, 'git-was-spawned');
const SHIM_DIR = path.join(SCRATCH, 'shim');
fs.mkdirSync(SHIM_DIR);
fs.writeFileSync(path.join(SHIM_DIR, 'git'), '#!/bin/sh\necho spawned > "' + SENTINEL + '"\nexit 1\n', { mode: 0o755 });

const RECORD_WITH_ACCEPTANCE =
    '# Feature: X\n\n## Acceptance\n\n1. First thing works.\n2. Second thing works.\n';
const RECORD_NO_ACCEPTANCE = '# Feature: X\n\nNothing here.\n';
const PASS_REPORT =
    '| # | Result | Evidence |\n| --- | --- | --- |\n' +
    '| 1 | PASS | ran the first check |\n| 2 | PASS | ran the second check |\n\nVERIFY_GATE: PASS\n';

// Args:
//   name: string, scratch directory name.
//   record: string | null, the feature record's text, or null for no record.
// Returns:
//   string: path of a repository on branch feat-x with one commit holding a.js
//   and, when given, the record.
function newRepo(name, record) {
    const dir = path.join(SCRATCH, name);
    fs.mkdirSync(path.join(dir, 'features'), { recursive: true });
    git(['init', '-q', '-b', BRANCH], dir);
    git(['config', 'user.email', 't@example.com'], dir);
    git(['config', 'user.name', 'T'], dir);
    fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 1;\n');
    if (record !== null) fs.writeFileSync(path.join(dir, RECORD_REL), record);
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'init'], dir);
    return dir;
}

let configCount = 0;
// Args:
//   body: string | object, the config file's content (an object is JSON-encoded).
// Returns:
//   string: path of a new scratch config file.
function writeConfig(body) {
    const file = path.join(SCRATCH, 'verify-repos-' + (configCount++) + '.json');
    fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
    return file;
}

// Args:
//   dir: string, a repository path to list.
//   mode: string | undefined, the entry's mode; omitted when undefined.
// Returns:
//   string: path of a scratch config listing dir.
function listed(dir, mode) {
    const entry = mode === undefined ? {} : { mode };
    return writeConfig({ version: 1, repos: { [dir]: entry } });
}

// Args:
//   cwd: string, where the hook runs.
//   command: string, the Bash command in the stdin JSON.
//   config: string | null, VERIFY_REPOS_CONFIG; null leaves it unset.
//   opts: { env?: object, shim?: boolean }, extra environment; shim puts a
//     failing git first on PATH.
// Returns:
//   { status: number, stdout: string, json: object | null }
function run(cwd, command, config, opts) {
    const o = opts || {};
    const env = { ...process.env, HOME: HOME_DIR, ...(o.env || {}) };
    delete env.TIMING_LOG_PATH;
    delete env.VERIFY_REPOS_CONFIG;
    if (config !== null) env.VERIFY_REPOS_CONFIG = config;
    if (o.shim) env.PATH = SHIM_DIR + path.delimiter + env.PATH;
    const r = spawnSync(process.execPath, [HOOK], {
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
// An advisory notice: a systemMessage and neither decision key.
const isNotice = r => !!r.json && typeof r.json.systemMessage === 'string' &&
    !('decision' in r.json) && !('hookSpecificOutput' in r.json);

function sentinelGone() {
    const there = fs.existsSync(SENTINEL);
    fs.rmSync(SENTINEL, { force: true });
    return !there;
}

try {
    console.log('(a) repo not listed: the whole output is approve, no git spawned');
    {
        const dir = newRepo('a', RECORD_WITH_ACCEPTANCE);
        const other = path.join(SCRATCH, 'some-other-repo');
        const r = run(dir, PR_COMMAND, listed(other, 'enforce'), { shim: true });
        assert('stdout parses to approve and nothing else', r.json, APPROVE);
        assert('exit 0', r.status, 0);
        assert('no git process started', sentinelGone(), true);
        const sibling = run(dir, PR_COMMAND, listed(dir + '-x', 'enforce'), { shim: true });
        assert('a listed path that only shares a prefix is not an ancestor', sibling.json, APPROVE);
        assert('still no git process', sentinelGone(), true);
    }

    console.log('(b) a non-PR command in a listed repo approves silently, no git spawned');
    {
        const dir = newRepo('b', RECORD_WITH_ACCEPTANCE);
        const r = run(dir, 'ls -la && echo "gh pr create"', listed(dir, 'enforce'), { shim: true });
        assert('stdout is approve', r.json, APPROVE);
        assert('no git process started', sentinelGone(), true);
        const none = run(dir, '', listed(dir, 'enforce'), { shim: true });
        assert('an empty command is approve', none.json, APPROVE);
        assert('config missing: approve', run(dir, PR_COMMAND, path.join(SCRATCH, 'nope.json'), { shim: true }).json, APPROVE);
        assert('config missing: no git process', sentinelGone(), true);
    }

    console.log('(c) enforce, no marker: deny naming the verify command');
    {
        const dir = newRepo('c', RECORD_WITH_ACCEPTANCE);
        const r = run(dir, PR_COMMAND, listed(dir, 'enforce'));
        assert('denied', denied(r), true);
        assert('reason names the verify command', reasonOf(r).includes(VERIFY_NAME), true);
        assert('reason names the state', reasonOf(r).includes('missing'), true);
        assert('reason names the record path', reasonOf(r).includes(RECORD_REL), true);
        const sub = path.join(dir, 'features');
        assert('from a subdirectory of the listed repo too', denied(run(sub, PR_COMMAND, listed(dir, 'enforce'))), true);
        assert('inside a compound command', denied(run(dir, 'cd . && ' + PR_COMMAND, listed(dir, 'enforce'))), true);
    }

    console.log('(d) advisory, the same state: a notice, never a decision');
    {
        const dir = newRepo('d', RECORD_WITH_ACCEPTANCE);
        const r = run(dir, PR_COMMAND, listed(dir, 'advisory'));
        assert('is a notice', isNotice(r), true);
        assert('no permissionDecision', !!r.json && !('hookSpecificOutput' in r.json), true);
        assert('systemMessage names the verify command', noteOf(r).includes(VERIFY_NAME), true);
        assert('says the PR is allowed anyway', /allowed anyway/.test(noteOf(r)), true);
        assert('names the state', noteOf(r).includes('missing'), true);
        assert('names the record path', noteOf(r).includes(RECORD_REL), true);
        assert('a missing mode is advisory', isNotice(run(dir, PR_COMMAND, listed(dir))), true);
    }

    console.log('(e) a recorded PASS, then record-only commit, then a code commit');
    {
        const dir = newRepo('e', RECORD_WITH_ACCEPTANCE);
        const report = path.join(SCRATCH, 'e-report.md');
        fs.writeFileSync(report, PASS_REPORT);
        const rec = spawnSync(process.execPath, [RECORDER, '--report', report], {
            cwd: dir, encoding: 'utf-8', env: { ...process.env, HOME: HOME_DIR },
        });
        assert('recorder exits 0', rec.status, 0);
        git(['add', RECORD_REL], dir);
        git(['commit', '-q', '-m', 'record the verification'], dir);
        const config = listed(dir, 'enforce');
        assert('record-only change: hook silent', run(dir, PR_COMMAND, config).json, APPROVE);
        fs.writeFileSync(path.join(dir, 'a.js'), 'module.exports = 2;\n');
        git(['add', 'a.js'], dir);
        git(['commit', '-q', '-m', 'change code'], dir);
        const r = run(dir, PR_COMMAND, config);
        assert('code change: denied', denied(r), true);
        assert('reports stale', reasonOf(r).includes('stale'), true);
        assert('names the moved code tree', reasonOf(r).includes('the code tree'), true);
    }

    console.log('(f) no ## Acceptance section');
    {
        const dir = newRepo('f', RECORD_NO_ACCEPTANCE);
        const enforce = run(dir, PR_COMMAND, listed(dir, 'enforce'));
        assert('enforce: denied', denied(enforce), true);
        assert('enforce: states no-acceptance', reasonOf(enforce).includes('no-acceptance'), true);
        const advisory = run(dir, PR_COMMAND, listed(dir, 'advisory'));
        assert('advisory: a notice', isNotice(advisory), true);
        assert('advisory: states no-acceptance', noteOf(advisory).includes('no-acceptance'), true);
    }

    console.log('(g) enforce, broken GIT_DIR');
    {
        const dir = newRepo('g', RECORD_WITH_ACCEPTANCE);
        const r = run(dir, PR_COMMAND, listed(dir, 'enforce'), { env: { GIT_DIR: path.join(SCRATCH, 'no-such-git-dir') } });
        assert('denied', denied(r), true);
        const adv = run(dir, PR_COMMAND, listed(dir, 'advisory'), { env: { GIT_DIR: path.join(SCRATCH, 'no-such-git-dir') } });
        assert('advisory: a notice, not a deny', isNotice(adv), true);
    }

    console.log('(h) no feature record, and a detached HEAD');
    {
        const dir = newRepo('h-missing', null);
        const enforce = run(dir, PR_COMMAND, listed(dir, 'enforce'));
        assert('missing record, enforce: denied', denied(enforce), true);
        assert('missing record, enforce: names no-record', reasonOf(enforce).includes('no-record'), true);
        const advisory = run(dir, PR_COMMAND, listed(dir, 'advisory'));
        assert('missing record, advisory: a notice', isNotice(advisory), true);
        assert('missing record, advisory: names no-record', noteOf(advisory).includes('no-record'), true);

        const det = newRepo('h-detached', RECORD_WITH_ACCEPTANCE);
        git(['checkout', '-q', '--detach'], det);
        const dEnforce = run(det, PR_COMMAND, listed(det, 'enforce'));
        assert('detached, enforce: denied', denied(dEnforce), true);
        assert('detached, enforce: names no-record', reasonOf(dEnforce).includes('no-record'), true);
        const dAdvisory = run(det, PR_COMMAND, listed(det, 'advisory'));
        assert('detached, advisory: a notice', isNotice(dAdvisory), true);
        assert('detached, advisory: names no-record', noteOf(dAdvisory).includes('no-record'), true);

        const main = newRepo('h-main', RECORD_WITH_ACCEPTANCE);
        git(['checkout', '-q', '-b', 'main'], main);
        const mEnforce = run(main, PR_COMMAND, listed(main, 'enforce'));
        assert('a non-feature branch, enforce: denied as no-record', denied(mEnforce) && reasonOf(mEnforce).includes('no-record'), true);
    }

    console.log('(i) enforce: every other error path denies');
    {
        const dir = newRepo('i', RECORD_WITH_ACCEPTANCE);
        const marker = markers.markerPaths(dir).verify;
        fs.mkdirSync(marker);
        const dirMarker = run(dir, PR_COMMAND, listed(dir, 'enforce'));
        assert('a marker that is a directory: denied', denied(dirMarker), true);
        assert('a marker that is a directory, advisory: a notice', isNotice(run(dir, PR_COMMAND, listed(dir, 'advisory'))), true);

        const unreadable = path.join(SCRATCH, 'config-is-a-directory');
        fs.mkdirSync(unreadable);
        const ur = run(dir, PR_COMMAND, unreadable);
        assert('an unreadable config: denied', denied(ur), true);
        assert('an unreadable config names the verify command', reasonOf(ur).includes(VERIFY_NAME) || reasonOf(ur).includes('verify-repos'), true);

        assert('an unparsable config: denied', denied(run(dir, PR_COMMAND, writeConfig('{not json'))), true);
        assert('an empty config file: denied', denied(run(dir, PR_COMMAND, writeConfig(''))), true);
        assert('a config with no repos object: denied', denied(run(dir, PR_COMMAND, writeConfig({ version: 1 }))), true);
        assert('an invalid mode: denied', denied(run(dir, PR_COMMAND, listed(dir, 'strict'))), true);
        assert('a non-string mode: denied', denied(run(dir, PR_COMMAND, writeConfig({ version: 1, repos: { [dir]: { mode: 7 } } }))), true);
        assert('a null entry: denied', denied(run(dir, PR_COMMAND, writeConfig({ version: 1, repos: { [dir]: null } }))), true);
    }

    console.log('(j) listing and locating');
    {
        const outer = newRepo('j-outer', RECORD_WITH_ACCEPTANCE);
        const sub = path.join(outer, 'pkg');
        fs.mkdirSync(sub);
        const nested = path.join(sub, 'inner');
        fs.mkdirSync(nested);
        git(['init', '-q', '-b', BRANCH], nested);
        const config = listed(outer, 'enforce');
        const r = run(nested, PR_COMMAND, config);
        assert('cwd in a nested repo that is not itself listed: approve', r.json, APPROVE);
        const plain = path.join(SCRATCH, 'plain-dir');
        fs.mkdirSync(plain);
        assert('cwd under a listed path but not in a repo: approve', run(plain, PR_COMMAND, listed(SCRATCH, 'enforce')).json, APPROVE);
        const ancestor = newRepo('j-anc', RECORD_WITH_ACCEPTANCE);
        const viaAncestor = run(ancestor, PR_COMMAND, listed(SCRATCH, 'enforce'));
        assert('a listed ancestor that is not the toplevel: approve (entry must equal toplevel)', viaAncestor.json, APPROVE);
        assert('trailing slash on a key still matches', denied(run(ancestor, PR_COMMAND, listed(ancestor + '/', 'enforce'))), true);
        const link = path.join(SCRATCH, 'j-link');
        fs.symlinkSync(ancestor, link);
        assert('a symlinked key matches through its real path', denied(run(ancestor, PR_COMMAND, listed(link, 'enforce'))), true);
    }
    console.log('(k) steps block: pre-pr-verify honours its step, enforce mode included');
    {
        const STEP_CASES = [
            { name: 'default: denies', user: null, repo: null, deny: true },
            { name: 'verification area off in the user file: approves', user: { steps: { verification: false } }, repo: null, deny: false },
            { name: 'step off inside an on area: approves', user: { steps: { verification: { 'pre-pr-verify': false } } }, repo: null, deny: false },
            { name: 'repo file off beats user on: approves', user: { steps: { verification: true } }, repo: { steps: { verification: { 'pre-pr-verify': false } } }, deny: false },
        ];
        let n = 0;
        for (const c of STEP_CASES) {
            const dir = newRepo('k' + (n++), RECORD_WITH_ACCEPTANCE);
            const userCfg = path.join(SCRATCH, 'k-user-' + n + '.json');
            if (c.user) fs.writeFileSync(userCfg, JSON.stringify(c.user));
            if (c.repo) {
                fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
                fs.writeFileSync(path.join(dir, '.claude', 'sdlc-review.json'), JSON.stringify(c.repo));
            }
            const r = run(dir, PR_COMMAND, listed(dir, 'enforce'), { env: {
                SDLC_REVIEW_CONFIG_USER: userCfg,
                CLAUDE_CONFIG_DIR: path.join(SCRATCH, 'k-claude-config'),
                TDD_MANDATE_CONFIG: path.join(SCRATCH, 'no-such-mandate.json'),
            } });
            assert(c.name, c.deny ? denied(r) : r.json, c.deny ? true : APPROVE);
        }
        const other = run(newRepo('k-unlisted', RECORD_WITH_ACCEPTANCE), PR_COMMAND,
            listed(path.join(SCRATCH, 'elsewhere'), 'enforce'),
            { env: { SDLC_REVIEW_CONFIG_USER: path.join(SCRATCH, 'none.json') } });
        assert('an unlisted repo still approves', other.json, APPROVE);
    }
} finally {
    fs.rmSync(SCRATCH, { recursive: true, force: true });
}

console.log('\n=================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
