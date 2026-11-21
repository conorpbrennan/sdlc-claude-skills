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

const { readSessions, classify, signals, isPartial } = require('./lib/orch-signals.js');

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

const DEV = path.join(os.homedir(), 'dev');
const IMPL_TYPE = 'sdlc:implementer';
const REV_TYPE = 'sdlc:code-reviewer';
const GP_TYPE = 'general-purpose';
const T0 = Date.parse('2026-11-01T00:00:00Z');

// Hand-built record with the fields classify and signals read.
function rec(over) {
    return Object.assign({
        famTurns: {}, agents: [], subs: [], mainEdits: [], events: [], firstUserText: '',
        peakCtx: 0, interrupts: 0, commits: 0, mainCost: 0,
    }, over);
}

// One dispatch record; `ms` is the offset from T0.
function ag(type, o) {
    const x = o || {};
    return {
        id: x.id || 'id' + Math.random(), ts: new Date(T0 + (x.ms || 0)).toISOString(), type, desc: x.desc || '',
        promptLen: x.len || 0, promptHash: x.hash || 'h' + Math.random(), isError: Boolean(x.err),
    };
}

const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));

function testClassify() {
    const impl2 = many(2, () => ag(IMPL_TYPE));
    const gp = (desc, len) => many(2, () => ag(GP_TYPE, { desc, len }));
    const files = (n) => [{ files: many(n, (i) => '/x/f' + i + '.js'), cost: 0 }];
    const rows = [
        ['implementer by type', rec({ agents: impl2 }), { nImpl: 2, orch: true }],
        ['gp by description and length', rec({ agents: gp('build S1', 1501) }), { nImpl: 2, orch: true }],
        ['gp at 1500 chars is not one', rec({ agents: gp('build S1', 1500) }), { nImpl: 0, orch: false }],
        ['gp with other description', rec({ agents: gp('research it', 3000) }), { nImpl: 0, orch: false }],
        ['reviewers by prefix', rec({ agents: [ag(REV_TYPE), ag('sdlc:code-reviewer-deep')] }), { nRev: 2, orch: true }],
        ['denied reviewer counts', rec({ agents: [ag(REV_TYPE, { err: true })] }), { nRev: 1, orch: false }],
        ['main = most turns', rec({ famTurns: { opus: 6, sonnet: 4 } }), { main: 'opus', mixed: true }],
        ['second at exactly 10% is mixed', rec({ famTurns: { opus: 9, sonnet: 1 } }), { mixed: true }],
        ['second under 10% is not', rec({ famTurns: { opus: 19, sonnet: 1 } }), { mixed: false }],
        ['haiku never makes mixed', rec({ famTurns: { opus: 8, haiku: 2 } }), { mixed: false }],
        ['no turns', rec(), { main: 'none', mixed: false }],
        ['first message and one dispatch', rec({ firstUserText: 'continue HANDOFF-x.md', agents: [ag(IMPL_TYPE)] }), { orch: true }],
        ['first message, no dispatch', rec({ firstUserText: 'continue HANDOFF-x.md' }), { orch: false }],
        ['eleven steps alone is low', rec({ agents: many(11, () => ag(IMPL_TYPE)) }), { sigN: 1, tier: 'low', orch: true }],
        ['steps and reviews is high', rec({ agents: [...many(11, () => ag(IMPL_TYPE)), ...many(6, () => ag(REV_TYPE))] }), { sigN: 2, tier: 'high' }],
        ['21 files and peak context is high', rec({ subs: files(21), peakCtx: 250000 }), { sigN: 2, tier: 'high' }],
        ['20 files and 249999 context is low', rec({ subs: files(20), peakCtx: 249999 }), { sigN: 0, tier: 'low' }],
        ['sensitive path and two repos is high', rec({ mainEdits: [path.join(DEV, 'a', 'src/hooks/x.js'), path.join(DEV, 'b', 'y.js')] }), { sigN: 2, tier: 'high' }],
        ['sensitive path in one repo is low', rec({ mainEdits: [path.join(DEV, 'a', 'auth.js')] }), { sigN: 1, tier: 'low' }],
        ['.env is not sensitive', rec({ mainEdits: [path.join(DEV, 'a', '.env')] }), { sigN: 0 }],
    ];
    for (const [name, r, want] of rows) {
        const got = classify(r);
        const bad = Object.keys(want).filter((k) => got[k] !== want[k]);
        ok('classify: ' + name, bad.length === 0, bad.map((k) => k + '=' + got[k]));
    }
}

function testIsPartial() {
    const rows = [
        ['bare', 'Status: PARTIAL', true],
        ['lowercase is not the marker', 'partial', false],
        ['inside a word', 'PARTIALLY done', false],
        ['nothing negates', 'nothing was PARTIAL', false],
        ['not negates', 'this is not PARTIAL', false],
        ['never negates', 'never PARTIAL here', false],
    ];
    for (const [name, t, want] of rows) ok('isPartial: ' + name, isPartial(t) === want, t);
}

function testBlockLoops() {
    const C = 'COMMIT_OK';
    const rows = [
        ['three of one kind', ['A', 'A', 'A'], 1],
        ['four of one kind is one loop', ['A', 'A', 'A', 'A'], 1],
        ['commit between', ['A', 'A', C, 'A', 'A'], 0],
        ['commit resets, then three', ['A', 'A', 'A', C, 'A', 'A', 'A'], 2],
        ['two kinds alternating', ['A', 'B', 'A', 'B', 'A', 'B'], 0],
    ];
    for (const [name, kinds, want] of rows) {
        const events = kinds.map((k, i) => ({ ts: new Date(T0 + i).toISOString(), k }));
        const got = signals(rec({ events })).blockLoops;
        ok('blockLoops: ' + name, got === want, got);
    }
}

function testNewSignals() {
    const ev = (ms, k) => ({ ts: new Date(T0 + ms).toISOString(), k });
    const COMMIT = 'COMMIT_OK';
    const r = rec({
        agents: [
            ag(IMPL_TYPE, { ms: 0, err: true, hash: 'a' }),
            ag(IMPL_TYPE, { ms: 119000, hash: 'b' }),
            ag(REV_TYPE, { ms: 200000, err: true, hash: 'c' }),
            ag(REV_TYPE, { ms: 321000, hash: 'd' }),
            ag(GP_TYPE, { ms: 400000, hash: 'h1' }),
            ag(GP_TYPE, { ms: 459000, hash: 'h1' }),
            ag(GP_TYPE, { ms: 470000, hash: 'h1' }),
            ag(GP_TYPE, { ms: 600000, hash: 'h2' }),
            ag(GP_TYPE, { ms: 661000, hash: 'h2' }),
            ag(REV_TYPE, { ms: 700000, hash: 'j' }),
            ag(REV_TYPE, { ms: 710000, hash: 'k' }),
            ag(REV_TYPE, { ms: 900000, hash: 'l' }),
        ],
        events: [ev(10000, COMMIT), ev(330000, COMMIT), ev(800000, COMMIT)],
    });
    const s = signals(r);
    ok('reviewCycles: denied ignored, empty commit closes none, open kept',
        JSON.stringify(s.reviewCycles) === JSON.stringify({ 1: 1, 2: 1, 3: 0, '4+': 0, open: 1 }), s.reviewCycles);
    ok('reviews counts the denied dispatch', s.reviews === 5, s.reviews);
    ok('denyRetryPairs: 119 s counts, 121 s does not', s.denyRetryPairs === 1, s.denyRetryPairs);
    ok('identicalPromptPairs: 59 s and 11 s count, 61 s does not', s.identicalPromptPairs === 2, s.identicalPromptPairs);
}

(async () => {
    testClassify();
    testIsPartial();
    testBlockLoops();
    testNewSignals();
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
