// Tests for timing-log.js shared helper.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = path.join(os.tmpdir(), 'timing-log-test-' + process.pid);
fs.mkdirSync(TMP, { recursive: true });
const TEST_LOG = path.join(TMP, 'timing.jsonl');

// Point the module at a scratch file BEFORE requiring it — module caches logPath()
// indirectly via env each call, so setting here is enough.
process.env.TIMING_LOG_PATH = TEST_LOG;
const { logEvent, timer, rotate, logPath } = require('./timing-log');

let passed = 0, failed = 0;
function assert(name, actual, expected) {
    if (actual === expected) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); failed++; }
}
function assertTrue(name, cond) { assert(name, !!cond, true); }

function resetLog() { try { fs.unlinkSync(TEST_LOG); } catch (e) {} }

console.log('timing-log tests');
console.log('================');

console.log('\n[CLI] node timing-log.js <event> key=value');
{
    const { spawnSync } = require('child_process');
    resetLog();
    const res = spawnSync('node', [path.join(__dirname, 'timing-log.js'), 'review.completed',
        'agent=code-reviewer', 'round=1', 'verdict=PASS', 'critical=0', 'important=2'],
        { encoding: 'utf-8', env: { ...process.env, TIMING_LOG_PATH: TEST_LOG } });
    assert('cli exits 0', res.status, 0);
    const rec = JSON.parse(fs.readFileSync(TEST_LOG, 'utf-8').trim().split('\n').pop());
    assert('cli records the event', rec.event, 'review.completed');
    assert('cli keeps strings', rec.agent, 'code-reviewer');
    assert('cli parses numbers', rec.important, 2);
    const usage = spawnSync('node', [path.join(__dirname, 'timing-log.js')], { encoding: 'utf-8' });
    assert('cli without an event exits 2', usage.status, 2);
    resetLog();
}

// logPath honours env override
assert('logPath uses TIMING_LOG_PATH env', logPath(), TEST_LOG);

// Single event writes exactly one JSON line.
resetLog();
logEvent('test.event', { foo: 'bar', n: 1 });
let content = fs.readFileSync(TEST_LOG, 'utf-8');
let lines = content.split('\n').filter(Boolean);
assert('one event -> one line', lines.length, 1);
const parsed = JSON.parse(lines[0]);
assert('event name recorded', parsed.event, 'test.event');
assert('custom field recorded', parsed.foo, 'bar');
assert('numeric field recorded', parsed.n, 1);
assertTrue('ts is ISO8601', /^\d{4}-\d{2}-\d{2}T/.test(parsed.ts));

// Multiple events append.
resetLog();
logEvent('a', { i: 1 });
logEvent('b', { i: 2 });
logEvent('c', { i: 3 });
content = fs.readFileSync(TEST_LOG, 'utf-8');
lines = content.split('\n').filter(Boolean);
assert('three events -> three lines', lines.length, 3);
assert('events ordered', JSON.parse(lines[0]).event + JSON.parse(lines[1]).event + JSON.parse(lines[2]).event, 'abc');

// Missing fields object is safe.
resetLog();
logEvent('noargs');
content = fs.readFileSync(TEST_LOG, 'utf-8');
const noArgs = JSON.parse(content.trim());
assert('event-only write works', noArgs.event, 'noargs');

// CLAUDE_REVIEW_VARIANT env var is merged into every record when set.
resetLog();
const savedVariant = process.env.CLAUDE_REVIEW_VARIANT;
process.env.CLAUDE_REVIEW_VARIANT = 'v0';
logEvent('with_variant', { foo: 1 });
let variantLine = JSON.parse(fs.readFileSync(TEST_LOG, 'utf-8').trim());
assert('variant recorded from env', variantLine.variant, 'v0');
assert('variant does not clobber other fields', variantLine.foo, 1);

// Explicit variant in fields wins over env.
resetLog();
logEvent('with_variant', { variant: 'explicit' });
variantLine = JSON.parse(fs.readFileSync(TEST_LOG, 'utf-8').trim());
assert('explicit variant in fields wins', variantLine.variant, 'explicit');

// No variant when env is unset.
resetLog();
delete process.env.CLAUDE_REVIEW_VARIANT;
logEvent('no_variant', {});
variantLine = JSON.parse(fs.readFileSync(TEST_LOG, 'utf-8').trim());
assert('no variant field when env unset', 'variant' in variantLine, false);

// Restore env.
if (savedVariant === undefined) delete process.env.CLAUDE_REVIEW_VARIANT;
else process.env.CLAUDE_REVIEW_VARIANT = savedVariant;

// Write failures are swallowed: point at a path that can't exist (NUL char in name).
const save = process.env.TIMING_LOG_PATH;
process.env.TIMING_LOG_PATH = path.join(TMP, 'nested', '\0bad', 'x.jsonl');
let threw = false;
try { logEvent('swallowed'); } catch (e) { threw = true; }
assert('write failure does not throw', threw, false);
process.env.TIMING_LOG_PATH = save;

// Timer returns a monotonic, positive duration.
const done = timer();
// Busy wait ~5ms so we get a non-zero reading even on fast machines.
const start = Date.now();
while (Date.now() - start < 5) { /* spin */ }
const dur = done();
assertTrue('timer returns a number', typeof dur === 'number');
assertTrue('timer duration >= 5ms', dur >= 4);
assertTrue('timer duration < 1000ms', dur < 1000);

// Rotation: write 10200 lines, rotate should trim to 10000.
resetLog();
const big = Array.from({ length: 10200 }, (_, i) => JSON.stringify({ ts: '2026-01-01T00:00:00Z', event: 'x', i })).join('\n') + '\n';
fs.writeFileSync(TEST_LOG, big);
rotate(TEST_LOG, 10000);
content = fs.readFileSync(TEST_LOG, 'utf-8');
lines = content.split('\n').filter(Boolean);
assert('rotation trims to 10000', lines.length, 10000);
// Last line must be the last original line (we keep the tail).
assert('rotation keeps tail (last event)', JSON.parse(lines[lines.length - 1]).i, 10199);

// Rotation is a no-op under the threshold.
resetLog();
for (let i = 0; i < 50; i++) logEvent('small', { i });
rotate(TEST_LOG, 10000);
content = fs.readFileSync(TEST_LOG, 'utf-8');
lines = content.split('\n').filter(Boolean);
assert('rotation no-op under threshold', lines.length, 50);

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
