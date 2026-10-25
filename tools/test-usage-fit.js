// Tests for tools/usage-fit.js: the usage indicator report read from local
// Claude Code transcripts.
// Run: node tools/test-usage-fit.js
//
// Builds one fake projects tree with hand-computed numbers and pins: the weekly
// indicators, a message split over two lines counted once at its final usage, a
// line with no requestId counted once, the privacy of the output (no prompt text,
// path, project name or session id), exit 3 on an unrecognised shape, and that a
// run writes nothing (fixture tree byte-identical, HOME untouched).
'use strict';

// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('../src/hooks/lib/isolate-git-env.js').isolateGitEnv();

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'usage-fit.js');
const { buildWeeks } = require('./usage-fit.js');
let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS: ' + name); }
    else { failed += 1; console.log('  FAIL: ' + name + (detail !== undefined ? ' -- ' + JSON.stringify(detail) : '')); }
}

function near(a, b) {
    return typeof a === 'number' && Math.abs(a - b) < 1e-9;
}

const MIN = 60 * 1000;
const NOW = Date.now();
const T0 = NOW - 10 * 60 * MIN; // first call of the main session, 10 hours ago
const iso = (offsetMin) => new Date(T0 + offsetMin * MIN).toISOString();

const OPUS = 'claude-opus-4-8';
const SONNET = 'claude-sonnet-5-5';

// One assistant transcript line.
function aline(o) {
    return JSON.stringify({
        type: 'assistant',
        timestamp: iso(o.at),
        requestId: o.req,
        message: {
            id: o.id,
            model: o.model || OPUS,
            usage: o.usage,
            content: o.content || [{ type: 'text', text: 'x' }],
        },
    });
}

function uline(at, content) {
    return JSON.stringify({ type: 'user', timestamp: iso(at), message: { role: 'user', content } });
}

const tool = (name, input) => ({ type: 'tool_use', id: 'tu-' + name, name, input });

const FABLE = 'claude-fable-1';
const MYSTERY = 'claude-mystery-1'; // a model family with no price
const SECRETS = ['SECRETPROMPT', 'secretuser', 'secretproj', 'SECRETSESSION', 'SECRETBAD', OPUS, SONNET, FABLE, MYSTERY, 'mystery'];

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-fit-'));
const home = path.join(sb, 'home');
fs.mkdirSync(home);
const projects = path.join(sb, 'projects');
const proj = path.join(projects, '-home-secretuser-secretproj');
const sessDir = path.join(proj, 'SECRETSESSION');
fs.mkdirSync(path.join(sessDir, 'subagents'), { recursive: true });

// Opus price per M tokens: input 4, output 20, cache read 0.20, 5m write 5, 1h write 8.
// Sonnet: input 2, 5m write 2.5.
const main = [
    uline(-1, '<command-name>/sdlc:orchestrate</command-name>'),
    uline(0, 'SECRETPROMPT please start in /home/secretuser/x'),
    // c1: split over two lines (first line has partial usage). ctx 50000, gateway.
    // 4000 + 40000*5 + 9000*8 + 2000 = 278000 -> 0.278
    aline({ at: 0, req: 'r1', id: 'm1', usage: { input_tokens: 1000, output_tokens: 1 }, content: [{ type: 'text', text: 'x' }] }),
    aline({
        at: 0, req: 'r1', id: 'm1', content: [tool('Read', { file_path: '/home/secretuser/a.js' })],
        usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 49000, cache_creation: { ephemeral_1h_input_tokens: 9000 } },
    }),
    // c2: ctx 150100, claude.ai, text-only. 400 + 30000 + 1000 -> 0.0314
    aline({ at: 2, req: 'r2', id: 'm2', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 150000, inference_geo: 'global' } }),
    // c3: no requestId, 8 min after c2 (rebuild). ctx 250000, claude.ai. 250000*5 -> 1.25
    aline({
        at: 10, id: 'm3', content: [tool('Edit', { file_path: '/home/secretuser/a.js' })],
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 250000, inference_geo: 'global' },
    }),
    // c4: ctx 350000, gateway. 70000 + 20000 -> 0.09
    aline({ at: 11, req: 'r4', id: 'm4', usage: { input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 350000 } }),
    uline(20, '<command-name>/clear</command-name>'),
    uline(21, 'resume SECRETPROMPT2 from the notes'),
    // c5: Sonnet 19 min after c4, but after a /clear: a fresh start, not a rebuild.
    // ctx 20000. 20000*2.5 -> 0.05
    aline({
        at: 30, req: 'r5', id: 'm5', model: SONNET, content: [tool('Bash', { command: 'ls' })],
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 20000 },
    }),
];
fs.writeFileSync(path.join(proj, 'SECRETSESSION.jsonl'), main.join('\n') + '\n');

// Sub-agent run 1: 101 calls, meta says an sdlc agent. Run 2: 2 calls, no meta file.
const subCalls = (n, tag) => Array.from({ length: n }, (_, i) =>
    aline({ at: i, req: tag + 'r' + i, id: tag + 'm' + i, model: SONNET, usage: { input_tokens: 100, output_tokens: 0 } })).join('\n') + '\n';
fs.writeFileSync(path.join(sessDir, 'subagents', 'agent-a1.jsonl'), subCalls(101, 'a'));
fs.writeFileSync(path.join(sessDir, 'subagents', 'agent-a1.meta.json'), JSON.stringify({ agentType: 'sdlc:implementer' }));
fs.writeFileSync(path.join(sessDir, 'subagents', 'agent-a2.jsonl'), subCalls(2, 'b'));

// Lever tree: gateway backend (no inference_geo), one main session, three sub-agent runs.
// Opus per M: input 4, output 20, cache read 0.20, 5m write 5. Fable: input 10.
// All calls 1 minute apart except a3, 10 minutes after a2 (a cache rebuild).
const leverProjects = path.join(sb, 'levers');
const leverSess = path.join(leverProjects, '-secretproj', 'SECRETSESSION');
fs.mkdirSync(path.join(leverSess, 'subagents'), { recursive: true });
fs.writeFileSync(path.join(leverProjects, '-secretproj', 'SECRETSESSION.jsonl'), [
    // a1: ctx 50000, Read. 50000*0.2 = 0.01
    aline({ at: 0, req: 'r1', id: 'a1', content: [tool('Read', {})], usage: { input_tokens: 0, cache_read_input_tokens: 50000 } }),
    // a2: ctx 90000, Bash. 90000*0.2 = 0.018
    aline({ at: 1, req: 'r2', id: 'a2', content: [tool('Bash', {})], usage: { input_tokens: 0, cache_read_input_tokens: 90000 } }),
    // a3: ctx 400000, Edit, 10 min after a2. 300000*0.2 + 100000*5 = 0.06 + 0.5 = 0.56
    // rebuild = min(cache write 100000, previous ctx 90000) * 5 = 0.45
    aline({ at: 11, req: 'r3', id: 'a3', content: [tool('Edit', {})], usage: { input_tokens: 0, cache_read_input_tokens: 300000, cache_creation_input_tokens: 100000 } }),
    // a4: ctx 500000, Edit. 500000*0.2 + 1000*20 = 0.1 + 0.02 = 0.12
    aline({ at: 12, req: 'r4', id: 'a4', content: [tool('Edit', {})], usage: { input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 500000 } }),
    // a5: Fable, ctx 150000, Read. 150000*10 = 1.5
    aline({ at: 13, req: 'r5', id: 'a5', model: FABLE, content: [tool('Read', {})], usage: { input_tokens: 150000 } }),
    // a6: no price, text only. costs 0 and is counted as unpriced.
    aline({ at: 14, req: 'r6', id: 'a6', model: MYSTERY, usage: { input_tokens: 0, cache_read_input_tokens: 150000 } }),
].join('\n') + '\n');
// 120 calls at 100000 input on Sonnet (2/M) = 0.2 each; calls 41..120 cost 80*0.2 = 16.0.
const subCallsIn = (n, tag, tokens, model) => Array.from({ length: n }, (_, i) =>
    aline({ at: i, req: tag + i, id: tag + i, model, usage: { input_tokens: tokens } })).join('\n') + '\n';
fs.writeFileSync(path.join(leverSess, 'subagents', 'agent-x.jsonl'), subCallsIn(120, 'x', 100000, SONNET));
// Exactly 100 calls is not a long run: nothing counts past call 40.
fs.writeFileSync(path.join(leverSess, 'subagents', 'agent-y.jsonl'), subCallsIn(100, 'y', 1000, SONNET));
fs.writeFileSync(path.join(leverSess, 'subagents', 'agent-z.jsonl'), subCallsIn(1, 'z', 1, MYSTERY));

// claude.ai-only tree: one Opus call on the global backend.
const aiProjects = path.join(sb, 'ai');
fs.mkdirSync(path.join(aiProjects, '-p'), { recursive: true });
fs.writeFileSync(path.join(aiProjects, '-p', 's.jsonl'),
    aline({ at: 0, req: 'r1', id: 'm1', usage: { input_tokens: 1000, inference_geo: 'global' } }) + '\n');

// Tree with three unrecognised shapes.
const badProjects = path.join(sb, 'bad');
fs.mkdirSync(path.join(badProjects, '-p'), { recursive: true });
fs.writeFileSync(path.join(badProjects, '-p', 's.jsonl'), [
    '{"type":"assistant", SECRETBAD broken',
    JSON.stringify({ type: 'user', timestamp: iso(0), message: { content: 42, note: 'SECRETBAD' } }),
    JSON.stringify({ type: 'assistant', message: { id: 'x', model: OPUS, usage: { input_tokens: 1 }, note: 'SECRETBAD' } }),
].join('\n') + '\n');

// In-flight last line: a valid line, then a half-written final line (no newline).
const liveProjects = path.join(sb, 'live');
fs.mkdirSync(path.join(liveProjects, '-p'), { recursive: true });
fs.writeFileSync(path.join(liveProjects, '-p', 's.jsonl'),
    aline({ at: 0, req: 'r1', id: 'm1', usage: { input_tokens: 1 } }) + '\n{"type":"assistant","message":{"id":"SECRETBAD');

// A file given where a directory is expected: the read fails with the path in the message.
const secretFile = path.join(sb, 'SECRETREADFAIL.jsonl');
fs.writeFileSync(secretFile, '');

// Hash of every file under a tree, for the read-only check.
function snapshot(dir) {
    const out = {};
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else out[path.relative(dir, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
        }
    };
    walk(dir);
    return out;
}

function run(args) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home } });
    return { code: r.status, out: r.stdout, err: r.stderr };
}

async function main_() {
    const before = snapshot(sb);
    const { weeks } = await buildWeeks(projects, { days: 56, now: NOW });
    const w = weeks[weeks.length - 1];

    console.log('Hand-computed week');
    const expect = {
        mainCalls: 5, mainCost: 1.6994, over200: 2, over300: 1, costOver300: 0.09,
        shareOver200: 0.4, shareOver300: 0.2,
        segments: 2, clearStarts: 1, resetsPer100Calls: 20, handoffStyleShare: 0.5,
        opusCost: 1.6494, opusWorkCost: 1.528,
        subRuns: 2, subRunsOver100: 1, subCalls: 103,
        gatewayCost: 0.418, claudeaiCost: 1.2814, write5mCost: 1.5, write1hCost: 0.072,
        rebuildGaps: 1, rebuildCost: 0.7505, sdlcCommands: 1, sdlcAgentRuns: 1,
    };
    for (const k of Object.keys(expect)) ok(k + ' = ' + expect[k], near(w[k], expect[k]), w[k]);
    const bandCalls = [2, 1, 1, 1];
    const bandCost = [0.328, 0.0314, 1.25, 0.09];
    w.bands.forEach((b, i) => ok('band ' + i + ' calls ' + bandCalls[i] + ' cost ' + bandCost[i],
        b.calls === bandCalls[i] && near(b.cost, bandCost[i]), b));

    console.log('Dedupe');
    // c1 is two lines (final usage 0.278, not the partial) and c3 has no requestId:
    // five calls, and the total above already needs both. Pin the two directly.
    ok('split message costed at its final usage (band 0 holds 0.278 + 0.05)', near(w.bands[0].cost, 0.328));
    ok('no-requestId message counted once', w.bands[2].calls === 1 && near(w.bands[2].cost, 1.25));

    console.log('Privacy');
    for (const args of [[projects], [projects, '--json']]) {
        const r = run(args);
        ok('exit 0 ' + args.slice(1).join(' '), r.code === 0, r.err);
        ok('no secret in output ' + args.slice(1).join(' '), SECRETS.every((s) => !r.out.includes(s)),
            SECRETS.filter((s) => r.out.includes(s)));
    }
    const js = JSON.parse(run([projects, '--json']).out);
    ok('json carries the weeks', Array.isArray(js.weeks) && js.weeks.length === weeks.length);

    console.log('Levers');
    const lv = (await buildWeeks(leverProjects, { days: 56, now: NOW })).window;
    const byName = Object.fromEntries(lv.levers.levers.map((l) => [l.name, l]));
    // main = 0.01 + 0.018 + 0.56 + 0.12 + 1.5 + 0 = 2.208; Opus and Fable work = 2.208.
    ok('main cost 2.208', near(lv.mainCost, 2.208), lv.mainCost);
    // calls over 300K: 0.56 + 0.12 = 0.68; under 100K: (0.01 + 0.018) / 2 = 0.014 a call.
    // context-reset = 0.68 - 2 * 0.014 = 0.652
    ok('context-reset 0.652, arithmetic', near(byName['context-reset'].low, 0.652) && near(byName['context-reset'].high, 0.652)
        && byName['context-reset'].confidence === 'arithmetic', byName['context-reset']);
    // sub-agent cost: x 120 * 0.2 = 24.0; y 100 * 0.002 = 0.2; z unpriced = 0. So 24.2.
    // total = 2.208 + 24.2 = 26.408; every percentage is of this total.
    ok('sub-agent cost 24.2 and total cost 26.408', near(lv.subCost, 24.2) && near(lv.totalCost, 26.408), [lv.subCost, lv.totalCost]);
    ok('context-reset share of total cost', near(byName['context-reset'].pctOfTotal, 0.652 / 26.408));
    // sonnet-main: 30% and 45% of 2.208
    ok('sonnet-main 0.6624 to 0.9936, estimate', near(byName['sonnet-main'].low, 0.6624) && near(byName['sonnet-main'].high, 0.9936)
        && byName['sonnet-main'].confidence === 'estimate', byName['sonnet-main']);
    // cache-1h-main: 70% of the 0.45 gateway rebuild
    ok('cache-1h-main 0.315', near(byName['cache-1h-main'].low, 0.315) && byName['cache-1h-main'].applies);
    // cap: calls 41..120 of the 120-call run, 80 * 0.2 = 16.0; the 100-call run adds nothing
    // it is an upper bound: a fresh agent redoes some of the work past call 40; share is 16 / 26.408
    ok('cap-runaway-subagents 16.0, upper-bound, share of total', near(byName['cap-runaway-subagents'].high, 16) && near(lv.subCostPast40, 16)
        && byName['cap-runaway-subagents'].confidence === 'upper-bound'
        && near(byName['cap-runaway-subagents'].pctOfTotal, 16 / 26.408), byName['cap-runaway-subagents']);
    // combined: sequence, scaling sonnet-main and cache-1h-main by 1 - 0.652 / 2.208
    const keep = 1 - 0.652 / 2.208;
    const cLow = 0.652 + (0.6624 + 0.315) * keep + 16;
    const cHigh = 0.652 + (0.9936 + 0.315) * keep + 16;
    const comb = lv.levers.combined;
    // combined share = cHigh / 26.408, with cHigh = 0.652 + (0.9936 + 0.315) * keep + 16
    ok('combined low and high match the sequence rule', near(comb.low, cLow) && near(comb.high, cHigh)
        && near(comb.pctOfTotal, cHigh / 26.408), comb);
    const sumLow = lv.levers.levers.reduce((a, l) => a + l.low, 0);
    const sumHigh = lv.levers.levers.reduce((a, l) => a + l.high, 0);
    const maxLow = Math.max(...lv.levers.levers.map((l) => l.low));
    ok('combined <= sum of levers and >= largest single low',
        comb.low <= sumLow && comb.high <= sumHigh && comb.low >= maxLow, [comb, sumLow, sumHigh, maxLow]);
    ok('model mix by family: opus 0.708, fable 1.5, other 0',
        near(lv.modelMix.opus.cost, 0.708) && near(lv.modelMix.fable.cost, 1.5) && near(lv.modelMix.fable.workCost, 1.5)
        && near(lv.modelMix.other.cost, 0) && near(lv.modelMix.sonnet.cost, 0), lv.modelMix);
    ok('unpriced calls: one main and one sub-agent = 2', lv.unpricedModelCalls === 2, lv.unpricedModelCalls);
    const ai = (await buildWeeks(aiProjects, { days: 56, now: NOW })).window;
    const aiLev = Object.fromEntries(ai.levers.levers.map((l) => [l.name, l]));
    ok('claude.ai-only window: cache-1h-main not applicable with a reason',
        ai.claudeAiOnly && !aiLev['cache-1h-main'].applies && aiLev['cache-1h-main'].reason.length > 0, aiLev['cache-1h-main']);
    ok('context-reset not applicable without under-100K comparison calls, with a reason',
        !aiLev['context-reset'].applies && aiLev['context-reset'].reason.length > 0);

    console.log('Wording and recommendations');
    const NOTE = 'Counterfactuals on your own history at list prices, not forecasts.';
    const AI_NOTE = 'claude.ai sessions are subscription: dollars are list-price estimates; read the shares.';
    for (const [dir, label] of [[leverProjects, 'gateway'], [aiProjects, 'claude.ai']]) {
        const t = run([dir]);
        const j = run([dir, '--json']);
        ok('table has Levers section and counterfactual line (' + label + ')', t.code === 0 && t.out.includes('Levers') && t.out.includes(NOTE), t.err);
        ok('json has the counterfactual line (' + label + ')', JSON.parse(j.out).counterfactualNote === NOTE);
        ok('claude.ai line only for a claude.ai-only window (' + label + ')',
            t.out.includes(AI_NOTE) === (label === 'claude.ai') && (JSON.parse(j.out).claudeAiNote === AI_NOTE) === (label === 'claude.ai'));
        ok('no secret or model id on any path (' + label + ')', SECRETS.every((x) => !t.out.includes(x) && !j.out.includes(x)));
        // Never recommend a 1h cache for sub-agents: no output line joins the two, and no lever is about it.
        const lines = (t.out + '\n' + j.out).split('\n');
        ok('no line joins sub-agent and 1h (' + label + ')', !lines.some((x) => /subagent|sub-agent/i.test(x) && /1h/i.test(x)));
        const names = JSON.parse(j.out).window.levers.levers.map((l) => l.name);
        ok('no lever about a sub-agent cache (' + label + ')', !names.some((n) => /sub/i.test(n) && /cache|1h/i.test(n)), names);
    }
    const tl = run([leverProjects]).out;
    ok('Levers heading and rows say total cost', tl.includes('total cost $26.41 (main $2.21, sub-agents $24.20)')
        && tl.includes('of total cost') && !tl.includes('of main cost'), tl);
    ok('table line: unpriced-model calls: 2 (cost not included)', tl.includes('unpriced-model calls: 2 (cost not included)'));
    ok('json carries unpriced count', JSON.parse(run([leverProjects, '--json']).out).window.unpricedModelCalls === 2);

    console.log('Unrecognised shape');
    const bad = run([badProjects]);
    ok('exit 3', bad.code === 3, bad.code);
    ok('stderr names each kind and count',
        /unparsable-line=1\b/.test(bad.err) && /user-content-shape.*1/.test(bad.err) && /no-timestamp.*1/.test(bad.err), bad.err);
    ok('no line content on stdout or stderr', !bad.out.includes('SECRETBAD') && !bad.err.includes('SECRETBAD'));

    // Only the final line of a file may be half written; a bad line elsewhere still counts (above).
    const live = run([liveProjects]);
    ok('unparsable final line is in-flight: exit 0', live.code === 0 && live.err === '', [live.code, live.err]);

    const rf = run([secretFile]);
    ok('read failure exits 2', rf.code === 2, [rf.code, rf.err]);
    ok('read failure prints a fixed label and the code only',
        /^usage-fit: read error \([A-Z0-9]+\)\n$/.test(rf.err) && rf.out === '', rf.err);
    ok('read failure leaks no name or temp path',
        ![rf.out, rf.err].some((x) => x.includes('SECRETREADFAIL') || x.includes(sb)), rf.err);

    console.log('Read-only');
    ok('post-/clear call after a 19 min gap adds no rebuild', w.rebuildGaps === 1);
    ok('fixture tree byte-identical after the runs', JSON.stringify(snapshot(sb)) === JSON.stringify(before));
    ok('HOME left empty', fs.readdirSync(home).length === 0);

    console.log('Usage');
    ok('missing directory exits 1', run([path.join(sb, 'nope')]).code === 1);

    fs.rmSync(sb, { recursive: true, force: true });
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}

main_().catch((e) => { console.log('FATAL: ' + e.message); process.exit(1); });
