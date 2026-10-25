// Tests for pending-review-gate.js: a fresh pending-review marker denies Bash,
// unless the pending-review-gate step is switched off (steps block).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'pending-review-gate.js');
const PENDING_NAME = require('./lib/review-markers.js').PENDING_NAME;

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

// repo: the file is the guard-area repo file, whose `false` must be ignored.
const CASES = [
    { name: 'default: denies', user: null, repo: null, expect: 'deny', lock: true, stderr: null },
    { name: 'review area off in the user file: approves', user: { steps: { review: false } }, repo: null, expect: 'approve', lock: false, stderr: null },
    { name: 'step off inside an on area: approves', user: { steps: { review: { 'pending-review-gate': false } } }, repo: null, expect: 'approve', lock: false, stderr: null },
    { name: 'other review step off: still denies', user: { steps: { review: { 'plan-review': false } } }, repo: null, expect: 'deny', lock: true, stderr: null },
    { name: 'repo file off (guard): ignored, stderr names file and key', user: null, repo: { steps: { review: { 'pending-review-gate': false } } }, expect: 'deny', lock: true, stderr: 'pending-review-gate: ' },
];

for (const c of CASES) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prg-')));
    try {
        execFileSync('git', ['init', '-q'], { cwd: dir });
        const pending = path.join(dir, '.git', PENDING_NAME);
        fs.writeFileSync(pending, JSON.stringify({ files: ['a.js'] }));
        const lock = path.join(dir, '.git', 'lock-probe');
        const userCfg = path.join(dir, 'user-sdlc-review.json');
        if (c.user) fs.writeFileSync(userCfg, JSON.stringify(c.user));
        if (c.repo) {
            fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
            fs.writeFileSync(path.join(dir, '.claude', 'sdlc-review.json'), JSON.stringify(c.repo));
        }
        const before = new Set(fs.readdirSync(path.join(dir, '.git')));
        const res = spawnSync('node', [HOOK], {
            input: JSON.stringify({ tool_input: { command: 'ls' } }),
            encoding: 'utf-8',
            cwd: dir,
            env: {
                ...process.env,
                SDLC_REVIEW_CONFIG_USER: userCfg,
                CLAUDE_CONFIG_DIR: path.join(dir, 'claude-config'),
                TDD_MANDATE_CONFIG: path.join(dir, 'no-such-mandate.json'),
            },
        });
        let out = {};
        try { out = JSON.parse(res.stdout.trim()); } catch (e) { out = { decision: 'unparseable' }; }
        const got = out.decision === 'approve' ? 'approve' : (JSON.stringify(out).includes('POST_COMMIT_REVIEW') ? 'deny' : 'other');
        assert(c.name + ' (decision)', got, c.expect);
        const created = fs.readdirSync(path.join(dir, '.git')).filter(f => !before.has(f));
        assert(c.name + ' (lock written)', created.length > 0, c.lock);
        if (c.stderr) {
            assert(c.name + ' (stderr prefix)', res.stderr.startsWith(c.stderr), true);
            assert(c.name + ' (stderr names file and key)',
                res.stderr.includes('sdlc-review.json') && res.stderr.includes('pending-review-gate'), true);
        } else {
            assert(c.name + ' (stderr empty)', res.stderr, '');
        }
        assert(c.name + ' (stdout is JSON only)', res.stdout.trim().split('\n').length, 1);
        void lock;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
