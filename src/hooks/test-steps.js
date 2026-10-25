// Tests for lib/steps.js: is step X on, and why, from the `steps` block of the
// user and repo sdlc-review.json files plus the legacy opt-out aliases.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');

const steps = require('./lib/steps.js');

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

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-test-'));
let seq = 0;

// Args: user: object (written as JSON) or string (written raw) or null;
//   repo: same for the repo file; files: paths to touch, relative to the repo
//   ('cfg:' prefix = relative to the config dir).
// Returns: { repoRoot, cfgDir } for a fresh scratch repo; env points at it.
function scratch(user, repo, files) {
    const dir = path.join(sb, `case${seq++}`);
    const repoRoot = path.join(dir, 'acme-repo');
    const cfgDir = path.join(dir, 'cfg');
    fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.claude'), { recursive: true });
    fs.mkdirSync(cfgDir, { recursive: true });
    const put = (file, v) => {
        if (v === null || v === undefined) return;
        fs.writeFileSync(file, typeof v === 'string' ? v : JSON.stringify(v));
    };
    put(path.join(dir, 'user.json'), user);
    put(path.join(repoRoot, '.claude', 'sdlc-review.json'), repo);
    for (const f of files || []) {
        const p = f.startsWith('cfg:') ? path.join(cfgDir, f.slice(4)) : path.join(repoRoot, f);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, '');
    }
    process.env.SDLC_REVIEW_CONFIG_USER = path.join(dir, 'user.json');
    process.env.CLAUDE_CONFIG_DIR = cfgDir;
    process.env.TDD_MANDATE_CONFIG = path.join(dir, 'no-tdd-mandate.json');
    return { repoRoot, cfgDir, dir };
}

// warn: substring that some warning must contain; '' means no warnings at all.
const CASES = [
    { name: 'default on', user: null, repo: null, files: [], step: 'read-trim', on: true, source: 'default', warn: '' },
    { name: 'user area off', user: { steps: { orchestration: false } }, repo: null, files: [], step: 'read-trim', on: false, source: 'user', warn: '' },
    { name: 'user step off inside an on area', user: { steps: { orchestration: { 'read-trim': false } } }, repo: null, files: [], step: 'read-trim', on: false, source: 'user', warn: '' },
    { name: 'user area off, step true: step wins', user: { steps: { orchestration: { enabled: false, 'read-trim': true } } }, repo: null, files: [], step: 'read-trim', on: true, source: 'user', warn: '' },
    { name: 'repo off non-guard beats user on', user: { steps: { hygiene: true } }, repo: { steps: { hygiene: false } }, files: [], step: 'pre-commit-hygiene', on: false, source: 'repo', warn: '' },
    { name: 'repo on beats user off', user: { steps: { hygiene: false } }, repo: { steps: { hygiene: true } }, files: [], step: 'pre-commit-hygiene', on: true, source: 'repo', warn: '' },
    { name: 'repo off on guard is ignored with warning', user: null, repo: { steps: { review: { 'review-gate': false } } }, files: [], step: 'review-gate', on: true, source: 'default', warn: 'steps.review.review-gate is read from the user file only; ignored' },
    { name: 'repo off on guard area (boolean) is ignored with warning', user: null, repo: { steps: { tdd: false } }, files: [], step: 'tdd-mandate', on: true, source: 'default', warn: 'is read from the user file only; ignored' },
    { name: 'repo off on guard area (enabled) is ignored with warning', user: null, repo: { steps: { 'commit-conventions': { enabled: false } } }, files: [], step: 'enforce-co-author', on: true, source: 'default', warn: 'is read from the user file only; ignored' },
    { name: 'invalid JSON in user file', user: '{ nope', repo: null, files: [], step: 'read-trim', on: true, source: 'default', warn: 'invalid JSON' },
    { name: 'value "off" is not boolean', user: { steps: { orchestration: 'off' } }, repo: null, files: [], step: 'read-trim', on: true, source: 'default', warn: 'steps.orchestration' },
    { name: 'unknown step key warns', user: { steps: { orchestration: { 'no-such-step': false } } }, repo: null, files: [], step: 'read-trim', on: true, source: 'default', warn: 'steps.orchestration.no-such-step' },
    { name: 'alias alone', user: null, repo: null, files: ['.claude/feature-tracking.disabled'], step: 'pre-commit-feature', on: false, source: 'alias', warn: '' },
    { name: 'alias off beats block true', user: null, repo: { steps: { features: true } }, files: ['.claude/feature-tracking.disabled'], step: 'pre-commit-feature', on: false, source: 'alias', warn: '', detail: 'block says on; the alias wins' },
    { name: 'tdd-mandate.disabled', user: null, repo: null, files: ['.claude/tdd-mandate.disabled'], step: 'tdd-mandate', on: false, source: 'alias', warn: '' },
];

for (const c of CASES) {
    const { repoRoot } = scratch(c.user, c.repo, c.files);
    const r = steps.stepState(c.step, { repoRoot });
    assert(`${c.name}: on`, r.on, c.on);
    assert(`${c.name}: source`, r.source, c.source);
    const w = c.warn === '' ? r.warnings.length === 0 : r.warnings.some(x => x.includes(c.warn));
    assert(`${c.name}: warnings`, w, true);
    if (c.detail) assert(`${c.name}: detail`, r.detail.includes(c.detail), true);
}

// Aliases outside the repo: config-dir files and mainModel.
{
    const { repoRoot } = scratch({ mainModel: 'off' }, null, ['cfg:sdlc-cache-ttl.disabled', 'cfg:sdlc-autoupdate.disabled']);
    const r = steps.stepStates(['main-model', 'cache-ttl', 'marketplace-autoupdate', 'pre-pr-verify'], { repoRoot });
    assert('config-dir aliases', ['main-model', 'cache-ttl', 'marketplace-autoupdate'].map(i => [r.states[i].on, r.states[i].source]),
        [[false, 'alias'], [false, 'alias'], [false, 'alias']]);
    assert('cache-ttl detail', r.states['cache-ttl'].detail, 'writes nothing; still warns');
    assert('opt-in step detail', r.states['pre-pr-verify'].detail.startsWith('runs only in repos listed in'), true);
}

// areasShape
{
    const all = [].concat(...Object.values(steps.AREAS).map(a => a.steps));
    assert('areasShape: each id in exactly one area', new Set(all).size, all.length);
    assert('areasShape: 22 steps', all.length, 22);
    assert('areasShape: guards', Object.keys(steps.AREAS).filter(k => steps.AREAS[k].guard).sort(), ['commit-conventions', 'review', 'tdd']);
    assert('areasShape: frozen', Object.isFrozen(steps.AREAS), true);
    scratch(null, null, []);
    assert('listSteps covers every id', steps.listSteps({}).states.map(s => s.id), all);
}

// neverThrows
{
    const { repoRoot, dir } = scratch(null, null, []);
    let r = steps.stepState('no-such-step', { repoRoot });
    assert('neverThrows: unknown id', [r.on, r.source, r.warnings.some(w => w.endsWith('; treated as on'))], [true, 'default', true]);
    scratch({ steps: [] }, null, []);
    r = steps.stepState('read-trim', { repoRoot });
    assert('neverThrows: steps array', [r.on, r.warnings.some(w => w.includes('steps'))], [true, true]);
    const s = scratch(null, null, []);
    fs.mkdirSync(path.join(s.dir, 'user.json'));
    r = steps.stepState('read-trim', { repoRoot: s.repoRoot });
    assert('neverThrows: directory as user file', [r.on, r.warnings.length > 0], [true, true]);
    const g = scratch(null, null, []);
    fs.mkdirSync(path.join(g.repoRoot, '.claude', 'sdlc-review.json'));
    r = steps.stepState('review-gate', { repoRoot: g.repoRoot });
    assert('neverThrows: directory as repo file', r.on, true);
    assert('neverThrows: bad opts', steps.isStepOn('read-trim', null), true);
    void dir;
}

// rootWalk
{
    const a = scratch(null, { steps: { hygiene: false } }, []);
    const sub = path.join(a.repoRoot, 'src', 'deep');
    fs.mkdirSync(sub, { recursive: true });
    assert('rootWalk: subdirectory finds repo file', steps.isStepOn('pre-commit-hygiene', { cwd: sub }), false);
    const b = scratch(null, { steps: { hygiene: false } }, []);
    fs.rmSync(path.join(b.repoRoot, '.git'), { recursive: true });
    fs.writeFileSync(path.join(b.repoRoot, '.git'), 'gitdir: ../elsewhere\n');
    assert('rootWalk: .git file counts', steps.isStepOn('pre-commit-hygiene', { cwd: path.join(b.repoRoot, '.claude') }), false);
    const c = scratch(null, null, []);
    const bare = path.join(c.dir, 'norepo');
    fs.mkdirSync(bare);
    assert('rootWalk: no repo, no repo layer', steps.stepState('pre-commit-hygiene', { cwd: bare }).on, true);
}

fs.rmSync(sb, { recursive: true, force: true });

console.log('\n====================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
