// Tests for post-commit-notify.js: the PostToolUse hook that runs a
// site-specific notifier after a commit. CLAUDE_COMMIT_NOTIFY points at a
// script that writes a file, so a run is seen by that file existing.
//
// The hook reads CLAUDE_TOOL_INPUT from the environment, not stdin. Each case
// sets SDLC_REVIEW_CONFIG_USER, CLAUDE_CONFIG_DIR and TDD_MANDATE_CONFIG to
// scratch paths so nothing reads the owner's real files. Area
// commit-conventions is a guard: a repo file cannot switch the step off.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const HOOK = path.join(__dirname, 'post-commit-notify.js');
const STEP = 'post-commit-notify';
const AREA = 'commit-conventions';
const COMMIT_INPUT = ['git', 'commit', '-m', 'x'].join(' ');
const WARNING_KEY = `steps.${AREA}.${STEP}`;

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'pcn-'));
process.on('exit', () => fs.rmSync(ROOT, { recursive: true, force: true }));

let passed = 0;
let failed = 0;

/**
 * Records one check.
 * @param {string} name - what is checked.
 * @param {boolean} ok - whether it held.
 * @param {string} detail - printed on failure.
 * @returns {void}
 */
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name}\n    ${detail}`); failed++; }
}

/**
 * Runs the hook once in a scratch repo.
 * @param {number} n - case number, names the scratch directory.
 * @param {{input: string, user: ?object, repo: ?object}} c - the case.
 * @returns {{ran: boolean, stderr: string, repoFile: string}} whether the
 *   notifier wrote its file, the hook's stderr, and the repo config path.
 */
function runCase(n, c) {
    const dir = path.join(ROOT, `case-${n}`);
    const repo = path.join(dir, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q', repo]);
    const marker = path.join(dir, 'notified');
    const script = path.join(dir, 'notify.sh');
    fs.writeFileSync(script, `#!/bin/sh\necho ran > "${marker}"\n`, { mode: 0o755 });
    const userFile = path.join(dir, 'user.json');
    if (c.user) fs.writeFileSync(userFile, JSON.stringify(c.user));
    const repoFile = path.join(repo, '.claude', 'sdlc-review.json');
    if (c.repo) {
        fs.mkdirSync(path.dirname(repoFile), { recursive: true });
        fs.writeFileSync(repoFile, JSON.stringify(c.repo));
    }
    const r = spawnSync('node', [HOOK], {
        cwd: repo,
        encoding: 'utf-8',
        env: Object.assign({}, process.env, {
            CLAUDE_TOOL_INPUT: c.input,
            CLAUDE_COMMIT_NOTIFY: script,
            SDLC_REVIEW_CONFIG_USER: userFile,
            CLAUDE_CONFIG_DIR: path.join(dir, 'claude-config'),
            TDD_MANDATE_CONFIG: path.join(dir, 'no-mandate.json'),
        }),
    });
    return { ran: fs.existsSync(marker), stderr: r.stderr, repoFile };
}

const OFF_STEP = { steps: { [AREA]: { [STEP]: false } } };
const CASES = [
    { name: 'default: the notifier runs', input: COMMIT_INPUT, ran: true },
    { name: 'area off in the user file: no notifier', input: COMMIT_INPUT, user: { steps: { [AREA]: false } }, ran: false },
    { name: 'step off inside an on area: no notifier', input: COMMIT_INPUT, user: OFF_STEP, ran: false },
    { name: 'repo file off is ignored: notifier runs and stderr warns', input: COMMIT_INPUT, repo: OFF_STEP, ran: true, warns: true },
    { name: 'a non-commit runs no notifier and reads no config', input: 'git status', repo: OFF_STEP, ran: false },
];

console.log('=== post-commit-notify.js tests ===');
CASES.forEach((c, i) => {
    const r = runCase(i, c);
    check(`${c.name}: notifier ran=${c.ran}`, r.ran === c.ran, `ran=${r.ran} stderr=${r.stderr}`);
    const lines = r.stderr.split('\n').filter((l) => l.includes('read from the user file only'));
    if (c.warns) {
        check(`${c.name}: stderr names repo file and key`,
            lines.length === 1 && lines[0].startsWith('post-commit-notify: ') &&
            lines[0].includes(r.repoFile) && lines[0].includes(WARNING_KEY),
            `stderr=${r.stderr}`);
    } else {
        check(`${c.name}: no warning`, lines.length === 0, `stderr=${r.stderr}`);
    }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
