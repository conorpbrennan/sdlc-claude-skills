// Tests for rule-stop-hook.js: the Stop hook that blocks a turn ending in an
// option question to the owner outside the gates.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'rule-stop-hook.js');
const LOG_NAME = 'sdlc-rule-stop.log';

let passed = 0;
let failed = 0;

// Args:
//   name: the test name.
//   actual: the value under test.
//   expected: the value it must equal.
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

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-stop-test-'));
const CONFIG = path.join(sb, 'config');
fs.mkdirSync(CONFIG);
const LOG = path.join(CONFIG, LOG_NAME);
let seq = 0;

// Args:
//   rows: transcript rows (objects), or a raw string.
// Returns: the path of a transcript file holding them as JSONL.
function transcript(rows) {
    const p = path.join(sb, `t${seq++}.jsonl`);
    fs.writeFileSync(p, typeof rows === 'string' ? rows : rows.map(r => JSON.stringify(r)).join('\n'));
    return p;
}

// Args:
//   text: the assistant's reply text.
// Returns: transcript rows with one user row and one assistant row.
function reply(text) {
    return [
        { type: 'user', message: { role: 'user', content: 'go' } },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } },
    ];
}

// Args:
//   input: the stdin object for the hook.
//   configDir: the CLAUDE_CONFIG_DIR to run under.
// Returns: { out: stdout, status }.
function run(input, configDir) {
    const r = spawnSync('node', [HOOK], {
        input: JSON.stringify(input),
        cwd: sb,
        encoding: 'utf-8',
        env: { ...process.env, CLAUDE_CONFIG_DIR: configDir || CONFIG, SDLC_REVIEW_CONFIG_USER: path.join(configDir || CONFIG, 'sdlc-review.json') },
    });
    return { out: r.stdout, status: r.status };
}

// Args:
//   out: the hook's stdout.
// Returns: true when it is a block decision.
function isBlock(out) {
    try { return JSON.parse(out).decision === 'block'; } catch (e) { return false; }
}

function readLog() {
    try { return fs.readFileSync(LOG, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; }
}

// Seven sample messages: [name, text, blocks].
const SAMPLES = [
    ['do you want me to', 'Tests pass.\nDo you want me to refactor the parser or add more tests?', true],
    ['should I', 'Done with the loader.\nShould I start on the writer?', true],
    ['which option', 'Two paths.\nWhich option do you prefer?', true],
    ['would you like me to', 'All green.\nWould you like me to fix the lint warnings?', true],
    ['gate: commit', 'Work is ready.\nShould I commit this now?', false],
    ['gate: push', 'Branch is clean.\nDo you want me to push it?', false],
    ['plain statement', 'I fixed the bug and ran the suite. All 40 tests pass.', false],
];

for (const [name, text, blocks] of SAMPLES) {
    const r = run({ transcript_path: transcript(reply(text)), session_id: 's1' });
    assert(`sample ${name}: exit 0`, r.status, 0);
    assert(`sample ${name}: ${blocks ? 'blocks' : 'passes'}`, isBlock(r.out), blocks);
}

const QUESTION = reply('Done.\nShould I start on the writer?');

// The block reason tells the model what to do.
const blocked = JSON.parse(run({ transcript_path: transcript(QUESTION), session_id: 's2' }).out);
assert('reason: says pick the next step and start it', /next step/.test(blocked.reason) && /start it/.test(blocked.reason), true);

// Loop guard.
assert('loop guard: stop_hook_active prints nothing', run({ transcript_path: transcript(QUESTION), stop_hook_active: true }).out, '');

// Step off: the conduct area switched off in the user file.
const offDir = path.join(sb, 'off');
fs.mkdirSync(offDir);
const offFile = path.join(offDir, 'sdlc-review.json');
fs.writeFileSync(offFile, JSON.stringify({ steps: { conduct: false } }));
const off = run({ transcript_path: transcript(QUESTION) }, offDir);
assert('step off: prints nothing, exit 0', [off.out, off.status], ['', 0]);
assert('step off: no log written', fs.existsSync(path.join(offDir, LOG_NAME)), false);

// Errors print nothing.
assert('error: missing transcript prints nothing', run({ transcript_path: path.join(sb, 'nope.jsonl') }).out, '');
assert('error: no transcript_path prints nothing', run({}).out, '');
assert('error: garbage transcript prints nothing', run({ transcript_path: transcript('not json\n{{') }).out, '');
assert('error: invalid stdin prints nothing', (() => {
    const r = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf-8', env: { ...process.env, CLAUDE_CONFIG_DIR: CONFIG } });
    return [r.stdout, r.status];
})(), ['', 0]);

// Log line: one JSON line per block, tail cut to 200 chars; passes log nothing.
fs.rmSync(LOG, { force: true });
run({ transcript_path: transcript(reply('Fine, done.')), session_id: 's3' });
assert('log: a pass writes nothing', readLog().length, 0);
const longText = 'x'.repeat(500) + '\nShould I start on the writer?';
run({ transcript_path: transcript(reply(longText)), session_id: 's3' });
const lines = readLog();
assert('log: one line per block', lines.length, 1);
assert('log: fields', [typeof lines[0].ts, lines[0].session_id, lines[0].tail.length <= 200], ['string', 's3', true]);
assert('log: tail keeps the question end', lines[0].tail.endsWith('Should I start on the writer?'), true);

// A log write failure never changes the decision: the log path is a directory.
const badDir = path.join(sb, 'bad');
fs.mkdirSync(path.join(badDir, LOG_NAME), { recursive: true });
assert('log failure: still blocks', isBlock(run({ transcript_path: transcript(QUESTION) }, badDir).out), true);

fs.rmSync(sb, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
