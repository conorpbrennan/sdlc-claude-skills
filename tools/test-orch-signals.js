// Tests for tools/lib/orch-signals.js: readSessions turns the transcript tree into
// one in-memory record per main session.
// Run: node tools/test-orch-signals.js
//
// Each test builds a small synthetic tree in os.tmpdir() and asserts the record.
'use strict';

// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('../src/hooks/lib/isolate-git-env.js').isolateGitEnv();

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readSessions } = require('./lib/orch-signals.js');

const OPUS = 'claude-opus-4-8';
const DAY = 24 * 3600 * 1000;
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const COMMIT_TEXT = '[main abc1234] msg';
const GATE_TEXT = 'PRE_COMMIT_GATE: blocked';

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS: ' + name); }
    else { failed += 1; console.log('  FAIL: ' + name + (detail !== undefined ? ' -- ' + JSON.stringify(detail) : '')); }
}

const text = (t) => ({ type: 'text', text: t });
const tool = (name, input, id) => ({ type: 'tool_use', id: id || 'tu-' + name, name, input });

// One assistant line. `o.main` adds the parentUuid key main lines carry.
function asst(o) {
    return JSON.stringify({
        parentUuid: null, type: 'assistant', timestamp: o.ts, requestId: o.req,
        message: { id: o.id, model: OPUS, usage: o.usage || { input_tokens: 1000, output_tokens: 100 }, content: o.content || [text('x')] },
    });
}

// One user line: `content` is a string or an array of blocks.
function user(ts, content) {
    return JSON.stringify({ parentUuid: null, type: 'user', timestamp: ts, message: { role: 'user', content } });
}

const result = (id, t, isError) => ({ type: 'tool_result', tool_use_id: id, content: t, is_error: isError });

// Writes <root>/<proj>/<sid>.jsonl with the given mtime (ms since epoch).
function mainFile(root, sid, linesIn, mtimeMs) {
    const dir = path.join(root, 'proj');
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, sid + '.jsonl');
    fs.writeFileSync(fp, linesIn.join('\n') + '\n');
    fs.utimesSync(fp, new Date(mtimeMs), new Date(mtimeMs));
}

// Writes a sub-agent transcript and its meta beside main session `sid`.
function subFile(root, sid, name, meta, linesIn) {
    const dir = path.join(root, 'proj', sid, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.jsonl'), linesIn.join('\n') + '\n');
    fs.writeFileSync(path.join(dir, name + '.meta.json'), JSON.stringify(meta));
}

async function withTree(fn) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-signals-'));
    try { await fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function testSubsAttach() {
    await withTree(async (root) => {
        mainFile(root, 's1', [asst({ ts: iso(3000), req: 'r1', id: 'm1', content: [tool('Agent', { prompt: 'p' }, 'tuA')] })], NOW);
        subFile(root, 's1', 'agent-1', { toolUseId: 'tuA', agentType: 'implementer' }, [
            asst({ ts: iso(2000), req: 'q1', id: 'n1', content: [tool('Edit', { file_path: '/a.js' }, 'e1'), tool('Write', { file_path: '/a.js' }, 'e2')] }),
            asst({ ts: iso(1000), req: 'q2', id: 'n2', content: [tool('SubagentHandback', { message: 'done' }, 'e3'), text('later text')] }),
            'not json {{{',
        ]);
        const [r] = await readSessions(root, { since: 0 });
        const s = r.subs[0];
        ok('sub attaches by toolUseId', r.subs.length === 1 && s.toolUseId === 'tuA' && r.agents[0].id === 'tuA' && s.agentType === 'implementer', r.subs);
        ok('sub files distinct, turns, toolCalls, handback final', s.files.length === 1 && s.files[0] === '/a.js' && s.turns === 2 && s.toolCalls === 3 && s.final === 'done' && s.cost > 0, s);
    });
}

async function testResumeDedupe() {
    await withTree(async (root) => {
        const m1 = asst({ ts: iso(3000), req: 'r1', id: 'm1', content: [tool('Agent', { prompt: 'p' }, 'tuA')] });
        mainFile(root, 'early', [m1], NOW - 2 * 3600 * 1000);
        mainFile(root, 'late', [m1, asst({ ts: iso(2000), req: 'r2', id: 'm2' })], NOW - 1 * 3600 * 1000);
        subFile(root, 'late', 'agent-1', {}, [asst({ ts: iso(1500), req: 'r1', id: 'm1' })]);
        const [a, b] = await readSessions(root, { since: 0 });
        ok('resumed message counted once, in the earlier file', a.sid === 'early' && a.turns === 1 && b.turns === 1 && b.subs[0].turns === 0, [a.turns, b.turns, b.subs[0].turns]);
        ok('repeated Agent tool_use gives one dispatch', a.agents.length === 1 && b.agents.length === 0, [a.agents.length, b.agents.length]);
    });
}

async function testWindows() {
    await withTree(async (root) => {
        mainFile(root, 'old', [asst({ ts: iso(20 * DAY), req: 'r0', id: 'm0' })], NOW - 20 * DAY);
        mainFile(root, 'new', [
            asst({ ts: iso(20 * DAY), req: 'r1', id: 'm1' }),
            asst({ ts: iso(1 * DAY), req: 'r2', id: 'm2' }),
            asst({ ts: iso(1000), req: 'r3', id: 'm3' }),
        ], NOW);
        subFile(root, 'new', 'agent-1', {}, [asst({ ts: iso(1000), req: 'q1', id: 'n1' }), asst({ ts: iso(2 * DAY), req: 'q2', id: 'n2' })]);
        const all = await readSessions(root, { since: NOW - 10 * DAY, until: NOW - 12 * 3600 * 1000 });
        ok('since drops an old file, not old messages in a new file', all.length === 1 && all[0].sid === 'new' && all[0].turns === 2, all.map((r) => [r.sid, r.turns]));
        ok('until drops a later main and sub message', all[0].last === iso(1 * DAY) && all[0].subs[0].turns === 1, [all[0].last, all[0].subs[0].turns]);
    });
}

async function testEvents() {
    await withTree(async (root) => {
        const bash = (id, cmd) => asst({ ts: iso(1000), req: 'r' + id, id: 'm' + id, content: [tool('Bash', { command: cmd }, id)] });
        mainFile(root, 's1', [
            bash('c1', 'git commit -m x'),
            user(iso(900), [result('c1', GATE_TEXT, true)]),
            bash('c2', 'git commit -m y'),
            user(iso(800), [result('c2', COMMIT_TEXT, false)]),
            bash('c3', 'ls'),
            user(iso(700), [result('c3', COMMIT_TEXT, false)]),
            bash('c4', 'git commit -m z'),
            user(iso(600), [result('c4', 'Hook foo denied', true)]),
            bash('c5', 'git commit -m w'),
            user(iso(500), [result('c5', COMMIT_TEXT, true)]),
            user(iso(400), [result('zz', 'Orchestrator mode on', true)]),
        ], NOW);
        const [r] = await readSessions(root, { since: 0 });
        const kinds = r.events.map((e) => e.k);
        ok('events in file order with denial kinds and COMMIT_OK', JSON.stringify(kinds) === JSON.stringify(['PRE_COMMIT_GATE', 'COMMIT_OK', 'other-hook', 'orchestrator-mode']) && r.commits === 1, kinds);
    });
}

async function testFinalTruncation() {
    await withTree(async (root) => {
        const long = 'a'.repeat(1400) + 'M'.repeat(1) + 'z'.repeat(800);
        const edge = 'b'.repeat(2200);
        mainFile(root, 's1', [asst({ ts: iso(1000), req: 'r1', id: 'm1' })], NOW);
        subFile(root, 's1', 'agent-1', {}, [asst({ ts: iso(900), req: 'q1', id: 'n1', content: [text(long)] })]);
        subFile(root, 's1', 'agent-2', {}, [asst({ ts: iso(900), req: 'q2', id: 'n2', content: [text(edge)] })]);
        const [r] = await readSessions(root, { since: 0 });
        const cut = r.subs[0].final;
        ok('final of 2201 chars keeps first 1400 and last 800', long.length === 2201 && cut === 'a'.repeat(1400) + ' ... ' + 'z'.repeat(800), cut.length);
        ok('final of 2200 chars is kept whole', r.subs[1].final === edge);
    });
}

async function testAgentFields() {
    await withTree(async (root) => {
        const prompt = 'TIER: opus: ' + 'r'.repeat(100) + '\nEdit test_a.py and Test_A.py and b-test.js, not x.txt. café';
        mainFile(root, 's1', [
            asst({ ts: iso(3000), req: 'r1', id: 'm1', content: [
                tool('Agent', { description: 'build S3', prompt }, 'a1'),
                tool('Agent', { prompt: 'plain' }, 'a2'),
                tool('Agent', { prompt: 'no result' }, 'a3'),
                tool('Write', { notebook_path: '/n.ipynb' }, 'w1'),
                tool('Edit', {}, 'w2'),
            ] }),
            user(iso(2000), [result('a1', 'ok', false), result('a2', 'boom', true)]),
        ], NOW);
        const [r] = await readSessions(root, { since: 0 });
        const [a1, a2, a3] = r.agents;
        ok('tier cut to 80, step from desc, type default', a1.tier.length === 80 && a1.step === 'S3' && a2.type === 'general-purpose' && a2.tier === null, [a1.tier, a1.step]);
        ok('promptBytes counts UTF-8, hash is sha1, promptLen is chars', a1.promptBytes === a1.promptLen + 1 && a1.promptHash === crypto.createHash('sha1').update(prompt).digest('hex'), [a1.promptBytes, a1.promptLen]);
        ok('testFilesNamed counts distinct lowercased names', a1.testFilesNamed === 2 && a2.testFilesNamed === 0, a1.testFilesNamed);
        ok('isError from the result, false when none', a1.isError === false && a2.isError === true && a3.isError === false);
        ok('record keeps no prompt text', !JSON.stringify(r).includes('no result'));
        ok('mainEdits take notebook_path, a missing path is empty', JSON.stringify(r.mainEdits) === JSON.stringify(['/n.ipynb', '']), r.mainEdits);
    });
}

async function testInterruptsAndPeak() {
    await withTree(async (root) => {
        const INT = '[Request interrupted by user]';
        mainFile(root, 's1', [
            user(iso(5000), INT),
            asst({ ts: iso(4000), req: 'r1', id: 'm1', usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30 } }),
            user(iso(3000), INT),
            asst({ ts: iso(2000), req: 'r2', id: 'm2', usage: { input_tokens: 5, cache_read_input_tokens: 5 } }),
            user(iso(1000), 'carry on'),
            user(iso(900), '[Request interrupted by user for tool use]'),
        ], NOW);
        mainFile(root, 's2', [], NOW + 1000);
        const [r, empty] = await readSessions(root, { since: 0 });
        ok('interrupts skip the first user entry', r.interrupts === 2 && r.firstUserText === INT, r.interrupts);
        ok('peakCtx is the maximum', r.peakCtx === 60, r.peakCtx);
        ok('empty session has empty firstUserText', empty.firstUserText === '' && empty.first === null);
    });
}

(async () => {
    await testSubsAttach();
    await testResumeDedupe();
    await testWindows();
    await testEvents();
    await testFinalTruncation();
    await testAgentFields();
    await testInterruptsAndPeak();
    console.log('\n====================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();
