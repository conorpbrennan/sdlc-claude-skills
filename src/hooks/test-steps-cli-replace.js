// Tests for steps-cli.js `set` when the config holds a wrong-typed `steps` or area value:
// the value is replaced and a one-line note goes to stderr.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, 'steps-cli.js');
const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-cli-replace-'));
const userCfg = path.join(sb, 'user-sdlc-review.json');
const ENV = { ...process.env, SDLC_REVIEW_CONFIG_USER: userCfg, CLAUDE_CONFIG_DIR: path.join(sb, 'claude'),
    TDD_MANDATE_CONFIG: path.join(sb, 'tdd.json') };

let passed = 0;
let failed = 0;
function assert(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) { console.log(`  PASS: ${name}`); passed++; } else {
        console.log(`  FAIL: ${name}\n    expected: ${e}\n    actual:   ${a}`);
        failed++;
    }
}

console.log('steps-cli set: replacing a wrong-typed value');
const CASES = [
    { name: 'steps is an array', cfg: { steps: [] }, note: true },
    { name: 'area value is a string', cfg: { steps: { features: 'off' } }, note: true },
    { name: 'steps is absent: no note', cfg: {}, note: false },
    { name: 'area value is a boolean: no note', cfg: { steps: { features: true } }, note: false },
    { name: 'area value is an object: no note', cfg: { steps: { features: {} } }, note: false },
];
for (const c of CASES) {
    fs.writeFileSync(userCfg, JSON.stringify(c.cfg));
    const r = spawnSync('node', [CLI, 'set', 'features', 'off', '--file', 'user'], { encoding: 'utf-8', env: ENV, cwd: sb });
    const notes = r.stderr.split('\n').filter((l) => /replaced/.test(l));
    assert(c.name, [r.status, notes.length], [0, c.note ? 1 : 0]);
    assert(c.name + ' (written)', JSON.parse(fs.readFileSync(userCfg, 'utf-8')).steps.features.enabled, false);
}
fs.rmSync(sb, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
