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

const SECRETS = ['SECRETPROMPT', 'secretuser', 'secretproj', 'SECRETSESSION', 'SECRETBAD', OPUS, SONNET];

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
