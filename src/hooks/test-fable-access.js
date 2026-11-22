// Tests for lib/fable-access.js: readAccessSignal turns a transcript tail into a
// reachable, unreachable or unknown verdict. Synthetic transcripts only.
// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { VERDICT, EVIDENCE, TAIL_BYTES, CACHE_TTL_MS, CACHE_DIR_ENV, readAccessSignal, checkAccess } = require('./lib/fable-access.js');

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'fable-access-'));
const REFUSAL = 'API Error: 403 {"error":{"message":"Your team not allowed to access model claude-fable-5-2"}}';
const REFUSAL_NO_FABLE = 'API Error: 403 {"error":{"message":"Your team not allowed to access model claude-other"}}';

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

// Record builders. `geo` undefined omits the field.
const asst = (model, geo, content) => {
    const usage = geo === undefined ? {} : { inference_geo: geo };
    return { type: 'assistant', message: { role: 'assistant', model, usage, content: content || [{ type: 'text', text: 'ok' }] } };
};
const userStr = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const toolUse = (id, name) => asst('claude-sonnet-5-5', undefined, [{ type: 'tool_use', id, name, input: {} }]);
const toolResult = (id, text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] } });
const notification = (status, summaryPrefix, text) =>
    userStr(`<task-notification>\n<status>${status}</status>\n<summary>${summaryPrefix}${text}</summary>\n</task-notification>`);

const GLOBAL = asst('claude-sonnet-5-5', 'global');

function writeTranscript(name, records) {
    const p = path.join(sb, `${name.replace(/\W+/g, '_')}.jsonl`);
    fs.writeFileSync(p, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    return p;
}

// name, records (oldest first), expected verdict, expected evidence
const ROWS = [
    ['Fable reply', [asst('claude-fable-5-2', 'global')], VERDICT.REACHABLE, EVIDENCE.FABLE_REPLY],
    ['failed task-notification quoting the 403 and Fable, newer than global',
        [GLOBAL, notification('failed', 'Agent "x" failed: ', REFUSAL)], VERDICT.UNREACHABLE, EVIDENCE.REFUSED_403],
    ['Agent tool_result 403 newer than global',
        [GLOBAL, toolUse('t1', 'Agent'), toolResult('t1', REFUSAL)], VERDICT.UNREACHABLE, EVIDENCE.REFUSED_403],
    ['global newer than a 403 (backend switch)',
        [notification('failed', 'Agent "x" failed: ', REFUSAL), GLOBAL], VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
    ['empty geo only', [asst('claude-sonnet-5-5', '')], VERDICT.UNREACHABLE, EVIDENCE.GEO_EMPTY],
    ['global older, empty newer (switch to gateway)',
        [asst('claude-opus-5-5', 'global'), asst('claude-sonnet-5-5', '')], VERDICT.UNREACHABLE, EVIDENCE.GEO_EMPTY],
    ['empty older, global newer (switch to direct)',
        [asst('claude-sonnet-5-5', ''), asst('claude-opus-5-5', 'global')], VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
    ['null geo and synthetic only',
        [asst('claude-sonnet-5-5', null), asst('<synthetic>', null)], VERDICT.UNKNOWN, EVIDENCE.NO_SIGNAL],
    ['missing geo only', [asst('claude-sonnet-5-5', undefined)], VERDICT.UNKNOWN, EVIDENCE.NO_SIGNAL],
    ['assistant text quoting the 403 above global',
        [GLOBAL, asst('claude-sonnet-5-5', undefined, [{ type: 'text', text: REFUSAL }])], VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
    ['403 that does not name Fable',
        [GLOBAL, notification('failed', 'Agent "x" failed: ', REFUSAL_NO_FABLE)], VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
    ['Read tool_result quoting the 403 and Fable',
        [GLOBAL, toolUse('r1', 'Read'), toolResult('r1', REFUSAL)], VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
    ['completed task-notification quoting the 403',
        [GLOBAL, notification('completed', 'Agent "x" completed: ', REFUSAL)], VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
    ['failed Background command notification quoting the 403 and Fable',
        [GLOBAL, notification('failed', 'Background command "x" failed: ', REFUSAL)], VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
    ['user prompt quoting a failed task-notification mid-string',
        [GLOBAL, userStr('look at this: ' + notification('failed', 'Agent "x" failed: ', REFUSAL).message.content)],
        VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
    ['non-message records skipped, older decides',
        [GLOBAL, { type: 'api-request-blob' }, { type: 'last-prompt' }, { type: 'atis-latch' }], VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL],
];

console.log('readAccessSignal decision table');
for (const [name, records, verdict, evidence] of ROWS) {
    assert(name, readAccessSignal(writeTranscript(name, records)), { verdict, evidence });
}

console.log('readAccessSignal unreadable and tail limit');
const UNREADABLE = { verdict: VERDICT.UNKNOWN, evidence: EVIDENCE.UNREADABLE };
assert('missing file', readAccessSignal(path.join(sb, 'nope.jsonl')), UNREADABLE);
assert('non-string path', readAccessSignal(undefined), UNREADABLE);
assert('empty path', readAccessSignal(''), UNREADABLE);
assert('directory as path', readAccessSignal(sb), UNREADABLE);
const zeroPath = path.join(sb, 'zero-length.jsonl');
fs.writeFileSync(zeroPath, '');
assert('zero-length file', readAccessSignal(zeroPath), { verdict: VERDICT.UNKNOWN, evidence: EVIDENCE.NO_SIGNAL });
assert('bad JSON lines skipped', readAccessSignal((() => {
    const p = path.join(sb, 'bad-json.jsonl');
    fs.writeFileSync(p, JSON.stringify(GLOBAL) + '\n{not json\n');
    return p;
})()), { verdict: VERDICT.REACHABLE, evidence: EVIDENCE.GEO_GLOBAL });
const filler = { type: 'filler', pad: 'x'.repeat(1000) };
const fillerCount = Math.ceil(TAIL_BYTES / 1000) + 5;
const beyond = writeTranscript('beyond-tail', [GLOBAL].concat(Array.from({ length: fillerCount }, () => filler)));
assert('decisive record before the tail', readAccessSignal(beyond), { verdict: VERDICT.UNKNOWN, evidence: EVIDENCE.NO_SIGNAL });

console.log('checkAccess cache and fail-closed paths');
const cacheDir = path.join(sb, 'cache');
process.env[CACHE_DIR_ENV] = cacheDir;
const NOW = 1000000000000;
const cacheFile = (id) => path.join(cacheDir, `${id}.json`);
const cacheFiles = () => (fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : []);

// AC3: a fresh entry wins over a rewritten transcript; the TTL edge is closed.
const ac3Path = writeTranscript('ac3', [GLOBAL]);
const first = checkAccess({ sessionId: 'ac3', transcriptPath: ac3Path, now: NOW });
assert('AC3 first call reads the transcript', first, { reachable: true, verdict: VERDICT.REACHABLE, evidence: EVIDENCE.GEO_GLOBAL, cached: false });
writeTranscript('ac3', [GLOBAL, notification('failed', 'Agent "x" failed: ', REFUSAL)]);
assert('AC3 inside the TTL the cache wins', checkAccess({ sessionId: 'ac3', transcriptPath: ac3Path, now: NOW + 1000 }),
    { reachable: true, verdict: VERDICT.REACHABLE, evidence: EVIDENCE.GEO_GLOBAL, cached: true });
assert('AC3 at the TTL the transcript is read again', checkAccess({ sessionId: 'ac3', transcriptPath: ac3Path, now: NOW + CACHE_TTL_MS }),
    { reachable: false, verdict: VERDICT.UNREACHABLE, evidence: EVIDENCE.REFUSED_403, cached: false });

// AC4: unknown is not cached and is not reachable.
fs.rmSync(cacheDir, { recursive: true, force: true });
const unknownPath = writeTranscript('ac4', [asst('claude-sonnet-5-5', undefined)]);
assert('AC4 unknown is not reachable', checkAccess({ sessionId: 'ac4', transcriptPath: unknownPath, now: NOW }),
    { reachable: false, verdict: VERDICT.UNKNOWN, evidence: EVIDENCE.NO_SIGNAL, cached: false });
assert('AC4 unknown writes no cache file', cacheFiles(), []);
assert('missing transcript is not reachable', checkAccess({ sessionId: 'ac4', transcriptPath: path.join(sb, 'nope.jsonl'), now: NOW }),
    { reachable: false, verdict: VERDICT.UNKNOWN, evidence: EVIDENCE.UNREADABLE, cached: false });
assert('no argument object does not throw', checkAccess().reachable, false);

// name, cache file text, expected cached. The transcript says reachable.
const stale = (extra) => JSON.stringify({ verdict: VERDICT.UNREACHABLE, evidence: EVIDENCE.GEO_EMPTY, at: NOW, ...extra });
const CACHE_ROWS = [
    ['fresh unreachable entry is used', stale({}), true],
    ['corrupt cache file is ignored', '{not json', false],
    ['future at is ignored', stale({ at: NOW + 5000 }), false],
    ['non-number at is ignored', stale({ at: String(NOW) }), false],
    ['cached unknown verdict is ignored', stale({ verdict: VERDICT.UNKNOWN }), false],
    ['cached unrecognised verdict is ignored', stale({ verdict: 'maybe' }), false],
    ['JSON null is ignored', 'null', false],
];
const rowPath = writeTranscript('rows', [GLOBAL]);
for (const [name, text, cached] of CACHE_ROWS) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile('rows'), text);
    assert(name, checkAccess({ sessionId: 'rows', transcriptPath: rowPath, now: NOW + 1 }).cached, cached);
}

// No sessionId: the verdict comes back and nothing is written.
fs.rmSync(cacheDir, { recursive: true, force: true });
for (const id of [undefined, '', 42]) {
    assert(`sessionId ${JSON.stringify(id)} returns the verdict`, checkAccess({ sessionId: id, transcriptPath: rowPath, now: NOW }).reachable, true);
}
assert('no sessionId writes no cache file', cacheFiles(), []);

// An unsafe id is sanitised into one file inside the cache directory.
checkAccess({ sessionId: '../evil/id', transcriptPath: rowPath, now: NOW });
assert('unsafe sessionId stays inside the directory', cacheFiles(), ['.._evil_id.json']);

// An unwritable cache directory (a regular file in the way) still gives the verdict.
const blocker = path.join(sb, 'blocker');
fs.writeFileSync(blocker, 'x');
process.env[CACHE_DIR_ENV] = path.join(blocker, 'sub');
assert('unwritable cache dir still returns the verdict', checkAccess({ sessionId: 'w', transcriptPath: rowPath, now: NOW }),
    { reachable: true, verdict: VERDICT.REACHABLE, evidence: EVIDENCE.GEO_GLOBAL, cached: false });

fs.rmSync(sb, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
