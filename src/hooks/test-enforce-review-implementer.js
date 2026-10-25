// Tests for enforce-review-implementer.js: the UserPromptSubmit hook that points
// Claude at the code-review-implementer skill when the owner asks to apply review
// findings. Spawns the hook with stdin JSON and a scratch user config, and checks
// the default message and the steps block (orchestration area, non-guard).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const HOOK = path.join(__dirname, 'enforce-review-implementer.js');
const MATCHING_PROMPT = 'please apply the review findings';
const ORDINARY_PROMPT = 'carry on with the build';

let passed = 0;
let failed = 0;

/**
 * Records one check.
 * @param {string} name - what is checked.
 * @param {*} actual - the observed value.
 * @param {*} expected - the wanted value.
 * @returns {void}
 */
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

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'enforce-review-implementer-'));
const userCfg = path.join(sb, 'user-sdlc-review.json');
const ENV = {
    ...process.env,
    SDLC_REVIEW_CONFIG_USER: userCfg,
    CLAUDE_CONFIG_DIR: path.join(sb, 'claude-config'),
    TDD_MANDATE_CONFIG: path.join(sb, 'no-such-mandate.json'),
    SDLC_ORCHESTRATOR_STATE_DIR: path.join(sb, 'state'),
};
const repo = path.join(sb, 'repo');
fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: repo });
const repoCfg = path.join(repo, '.claude', 'sdlc-review.json');

/**
 * Runs the hook on a prompt.
 * @param {string} prompt - the user prompt.
 * @returns {{status: number, json: object, stderr: string}} exit status, parsed stdout, stderr.
 */
function run(prompt) {
    const r = spawnSync('node', [HOOK], {
        input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', user_prompt: prompt, cwd: repo }),
        encoding: 'utf-8',
        env: ENV,
    });
    return { status: r.status, json: JSON.parse((r.stdout || '').trim() || 'null'), stderr: r.stderr || '' };
}

const APPROVE = { decision: 'approve' };
const STEP_CASES = [
    { name: 'default: the message', user: null, repo: null, off: false },
    { name: 'area off in the user file: plain approve', user: { steps: { orchestration: false } }, repo: null, off: true },
    { name: 'step off inside an on area: plain approve', user: { steps: { orchestration: { 'enforce-review-implementer': false } } }, repo: null, off: true },
    { name: 'repo file off beats user on: plain approve', user: { steps: { orchestration: true } }, repo: { steps: { orchestration: { 'enforce-review-implementer': false } } }, off: true },
];

try {
    console.log('steps block: enforce-review-implementer honours its step');
    for (const c of STEP_CASES) {
        fs.rmSync(userCfg, { force: true });
        fs.rmSync(repoCfg, { force: true });
        if (c.user) fs.writeFileSync(userCfg, JSON.stringify(c.user));
        if (c.repo) fs.writeFileSync(repoCfg, JSON.stringify(c.repo));
        const r = run(MATCHING_PROMPT);
        assert(c.name, c.off ? [r.status, r.json] : [r.status, r.json.decision, /ENFORCE_REVIEW_IMPLEMENTER/.test(r.json.systemMessage)],
            c.off ? [0, APPROVE] : [0, 'approve', true]);
    }
    fs.rmSync(userCfg, { force: true });
    fs.rmSync(repoCfg, { force: true });
    assert('a non-matching prompt approves with no message', run(ORDINARY_PROMPT).json, APPROVE);
    fs.writeFileSync(userCfg, '{ not json');
    const bad = run(MATCHING_PROMPT);
    assert('a broken user file warns on stderr, one prefixed line each', bad.stderr.split('\n').filter(Boolean).every((l) => l.startsWith('enforce-review-implementer: ')), true);
} finally {
    fs.rmSync(sb, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
