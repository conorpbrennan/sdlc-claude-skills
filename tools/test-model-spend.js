// Tests for tools/model-spend.js: the weekly model spend report read from local
// Claude Code transcripts.
// Run: node tools/test-model-spend.js
//
// Builds a small fake projects tree and asserts the numbers. The fixture pins the
// behaviours that matter: one API message split over two lines is costed once (and
// at its final usage), a turn is classified from every line of its message, a
// resumed-session copy of a message is not double counted, an old message falls
// outside the window, and sub-agents are tied back to the Agent call that made them.
'use strict';

// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('../src/hooks/lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'model-spend.js');
let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS: ' + name); }
    else { failed += 1; console.log('  FAIL: ' + name + (detail !== undefined ? ' -- ' + JSON.stringify(detail) : '')); }
}

function near(a, b) {
    return typeof a === 'number' && Math.abs(a - b) < 1e-9;
}

const HOUR = 3600 * 1000;
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

const OPUS = 'claude-opus-4-8';
const SONNET = 'claude-sonnet-5-5';

// One assistant transcript line.
function line(o) {
    return JSON.stringify({
        type: 'assistant',
        timestamp: o.ts,
        requestId: o.req,
        message: {
            id: o.id,
            model: o.model,
            usage: o.usage,
            content: o.content || [{ type: 'text', text: 'x' }],
        },
    });
}

const text = (t) => ({ type: 'text', text: t });
const tool = (name, input, id) => ({ type: 'tool_use', id: id || 'tu-' + name, name, input });

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'model-spend-'));
const projects = path.join(sb, 'projects');
const proj = path.join(projects, '-home-me-repo');
fs.mkdirSync(path.join(proj, 's1', 'subagents'), { recursive: true });
fs.mkdirSync(path.join(proj, 's2', 'subagents'), { recursive: true });

// ---- main session s1 ----
const m3 = line({
    ts: iso(5 * HOUR), req: 'r3', id: 'm3', model: OPUS,
    usage: { input_tokens: 10000, output_tokens: 1000, cache_read_input_tokens: 40000 },
    content: [tool('Read', { file_path: '/x/a.js' })],
});
const s1 = [
    // m1: split over two lines. The first carries only text and a partial usage;
    // the tool calls arrive on the second. It must classify as a dispatch.
    line({
        ts: iso(10 * HOUR), req: 'r1', id: 'm1', model: OPUS,
        usage: { input_tokens: 100000, output_tokens: 5, cache_read_input_tokens: 150000, cache_creation_input_tokens: 100000, cache_creation: { ephemeral_1h_input_tokens: 40000 } },
        content: [text('dispatching')],
    }),
    line({
        ts: iso(10 * HOUR), req: 'r1', id: 'm1', model: OPUS,
        usage: { input_tokens: 100000, output_tokens: 10000, cache_read_input_tokens: 150000, cache_creation_input_tokens: 100000, cache_creation: { ephemeral_1h_input_tokens: 40000 } },
        content: [
            tool('Agent', { subagent_type: 'general-purpose', model: 'opus', prompt: 'TIER: opus: plan source review\ndo it' }, 'tu1'),
            tool('Agent', { subagent_type: 'sdlc:code-reviewer', prompt: 'review' }, 'tu2'),
            tool('Agent', { subagent_type: 'general-purpose', model: 'sonnet', prompt: 'build' }, 'tu3'),
        ],
    }),
    'this line is not json {{{',
    // m2: staging.
    line({
        ts: iso(9 * HOUR), req: 'r2', id: 'm2', model: OPUS,
        usage: { input_tokens: 10000, output_tokens: 1000, cache_read_input_tokens: 180000 },
        content: [tool('Bash', { command: 'cd /x && git add a.js' })],
    }),
    m3,
    // m4: Sonnet text-only turn in the main session.
    line({
        ts: iso(4 * HOUR), req: 'r4', id: 'm4', model: SONNET,
        usage: { input_tokens: 10000, output_tokens: 1000 },
    }),
    // m5: Opus text-only turn.
    line({
        ts: iso(3 * HOUR), req: 'r5', id: 'm5', model: OPUS,
        usage: { input_tokens: 10000, output_tokens: 500 },
    }),
    // Outside the default 7-day window: 30 days old, Opus, $4.
    line({
        ts: iso(30 * 24 * HOUR), req: 'r0', id: 'm0', model: OPUS,
        usage: { input_tokens: 1000000, output_tokens: 0 },
    }),
];
fs.writeFileSync(path.join(proj, 's1.jsonl'), s1.join('\n') + '\n');
// A resumed session repeats an earlier message. Same id and requestId: not new spend.
fs.writeFileSync(path.join(proj, 's2.jsonl'), m3 + '\n');

// ---- sub-agents ----
function agent(dir, name, meta, ts, model, usage, finalText) {
    const base = path.join(proj, dir, 'subagents', name);
    fs.writeFileSync(base + '.meta.json', JSON.stringify(meta));
    fs.writeFileSync(base + '.jsonl', line({ ts, req: 'q-' + name, id: 'id-' + name, model, usage, content: [text(finalText)] }) + '\n');
}
agent('s1', 'agent-a1', { agentType: 'sdlc:code-reviewer-deep', toolUseId: 'tu1' }, iso(8 * HOUR), OPUS, { input_tokens: 100000 }, 'Looks bad.\nTDD_GATE: FAIL');
agent('s1', 'agent-a2', { agentType: 'sdlc:code-reviewer', toolUseId: 'tu2' }, iso(7 * HOUR), SONNET, { input_tokens: 100000 }, 'Fine.\nTDD_GATE: PASS');
agent('s1', 'agent-a3', { agentType: 'general-purpose', toolUseId: 'tu3' }, iso(6 * HOUR), SONNET, { input_tokens: 50000 }, 'done');
agent('s2', 'agent-b1', { agentType: 'sdlc:code-reviewer', toolUseId: 'tuX' }, iso(2 * HOUR), SONNET, { input_tokens: 10000 }, 'Bad.\nTDD_GATE: FAIL');

function run(args) {
    return spawnSync('node', [SCRIPT, '--projects', projects, ...args], { encoding: 'utf-8' });
}

console.log('\nJSON report, default window:');
const r = run(['--json']);
ok('exits 0', r.status === 0, { status: r.status, stderr: r.stderr });
let j = {};
try { j = JSON.parse(r.stdout); } catch (e) { ok('stdout is JSON', false, r.stdout.slice(0, 200)); }

// Costs, hand-worked at list prices:
//   m1 = 100k*4 + 60k*5 + 40k*8 + 150k*.2 + 10k*20 = 0.4+0.3+0.32+0.03+0.2 = 1.25
//   m2 = 0.04 + 0.036 + 0.02 = 0.096     m3 = 0.04 + 0.008 + 0.02 = 0.068
//   m4 = 0.02 + 0.01 = 0.03              m5 = 0.04 + 0.01 = 0.05
//   a1 = 0.4  a2 = 0.2  a3 = 0.1  b1 = 0.02
ok('total calls', j.total && j.total.calls === 9, j.total);
ok('total cost', j.total && near(j.total.cost, 2.214), j.total);
ok('opus cost by model', j.byModel && near(j.byModel.opus.cost, 1.864) && j.byModel.opus.calls === 5, j.byModel);
ok('sonnet cost by model', j.byModel && near(j.byModel.sonnet.cost, 0.35) && j.byModel.sonnet.calls === 4, j.byModel);

console.log('\nMain vs sub-agent:');
ok('main opus', j.mainVsSub && near(j.mainVsSub.main.opus.cost, 1.464) && j.mainVsSub.main.opus.calls === 4, j.mainVsSub && j.mainVsSub.main);
ok('main sonnet', j.mainVsSub && near(j.mainVsSub.main.sonnet.cost, 0.03), j.mainVsSub && j.mainVsSub.main);
ok('sub opus', j.mainVsSub && near(j.mainVsSub.sub.opus.cost, 0.4) && j.mainVsSub.sub.opus.calls === 1, j.mainVsSub && j.mainVsSub.sub);
ok('sub sonnet', j.mainVsSub && near(j.mainVsSub.sub.sonnet.cost, 0.32) && j.mainVsSub.sub.sonnet.calls === 3, j.mainVsSub && j.mainVsSub.sub);

console.log('\nSub-agent cost by agent type:');
const bt = j.byAgentType || {};
ok('deep reviewer on opus', bt['sdlc:code-reviewer-deep'] && near(bt['sdlc:code-reviewer-deep'].opus.cost, 0.4), bt);
ok('reviewer on sonnet', bt['sdlc:code-reviewer'] && near(bt['sdlc:code-reviewer'].sonnet.cost, 0.22), bt);
ok('general-purpose on sonnet', bt['general-purpose'] && near(bt['general-purpose'].sonnet.cost, 0.1), bt);

console.log('\nMain-session Opus cost by turn type:');
const tt = j.mainOpusTurns || {};
ok('work', tt.work && near(tt.work.cost, 0.068) && tt.work.calls === 1, tt);
ok('orchestration (a split message classifies from its tool call)', tt.orchestration && near(tt.orchestration.cost, 1.346) && tt.orchestration.calls === 2, tt);
ok('text only', tt.text && near(tt.text.cost, 0.05) && tt.text.calls === 1, tt);
ok('detail: dispatch', tt.orchestration && tt.orchestration.detail && tt.orchestration.detail.dispatch && near(tt.orchestration.detail.dispatch.cost, 1.25), tt.orchestration);
ok('detail: stage/commit/marker', tt.orchestration && tt.orchestration.detail && tt.orchestration.detail['stage/commit/marker'] && near(tt.orchestration.detail['stage/commit/marker'].cost, 0.096), tt.orchestration);

console.log('\nMain context bands:');
const cb = j.contextBands || {};
ok('<100K', cb['<100K'] && cb['<100K'].calls === 3 && near(cb['<100K'].cost, 0.148), cb);
ok('100-200K', cb['100-200K'] && cb['100-200K'].calls === 1 && near(cb['100-200K'].cost, 0.096), cb);
ok('200-300K is empty', cb['200-300K'] && cb['200-300K'].calls === 0, cb);
ok('>300K', cb['>300K'] && cb['>300K'].calls === 1 && near(cb['>300K'].cost, 1.25), cb);
ok('cost per call', cb['>300K'] && near(cb['>300K'].costPerCall, 1.25), cb);

console.log('\nOpus sub-agent dispatches:');
const od = j.opusDispatches || {};
ok('one opus sub-agent', od.count === 1 && near(od.cost, 0.4), od);
ok('its prompt carried a TIER line', od.withTier === 1 && od.withoutTier === 0, od);

console.log('\nReview rounds:');
const rv = j.reviews || {};
ok('deep reviewer FAIL', rv.byAgent && rv.byAgent['sdlc:code-reviewer-deep'] && rv.byAgent['sdlc:code-reviewer-deep'].FAIL === 1, rv);
ok('reviewer PASS and FAIL', rv.byAgent && rv.byAgent['sdlc:code-reviewer'] && rv.byAgent['sdlc:code-reviewer'].PASS === 1 && rv.byAgent['sdlc:code-reviewer'].FAIL === 1, rv);
ok('highest round per session', rv.highestRound && rv.highestRound['1'] === 1 && rv.highestRound['2'] === 1, rv);

console.log('\nWindow:');
const wide = JSON.parse(run(['--json', '--days', '40']).stdout);
ok('--days 40 takes in the 30-day-old message', near(wide.total.cost, 2.214 + 4), wide.total);
const narrow = JSON.parse(run(['--json', '--days', '1']).stdout);
ok('--days 1 still excludes the 30-day-old message', near(narrow.total.cost, 2.214), narrow.total);

console.log('\nText report:');
const t = run([]);
ok('text exits 0', t.status === 0, t.stderr);
ok('says these are list-price estimates', /list price/i.test(t.stdout) && /estimate/i.test(t.stdout), t.stdout.slice(0, 300));
ok('has the cost by model table', /cost by model/i.test(t.stdout), t.stdout.slice(0, 300));
ok('has the review rounds section', /review rounds/i.test(t.stdout), t.stdout.slice(0, 300));

console.log('\nNo transcripts:');
const empty = spawnSync('node', [SCRIPT, '--projects', path.join(sb, 'nope')], { encoding: 'utf-8' });
ok('a missing projects dir is reported, not a crash', empty.status === 0 && /no transcripts/i.test(empty.stdout + empty.stderr), { out: empty.stdout, err: empty.stderr });

fs.rmSync(sb, { recursive: true, force: true });

console.log('\n====================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
