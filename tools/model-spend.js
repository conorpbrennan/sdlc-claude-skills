#!/usr/bin/env node
// Weekly model spend report, read from local Claude Code transcripts
// (~/.claude/projects/**/*.jsonl). It answers one question: did steering work
// toward Sonnet actually move the spend?
//
// Usage: node tools/model-spend.js [--days N] [--json] [--projects DIR]
//   --days N       window by message timestamp (default 7; 0 means all time)
//   --json         print the same data as JSON
//   --projects DIR transcripts root (default ~/.claude/projects)
//
// Files are streamed line by line: the real tree is about 2 GB.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

// List prices in USD per million tokens, as cached on 6 Oct 2026. An estimate: it
// ignores discounts and anything the transcript does not record.
// Cache writes: 5-minute = 1.25x input, 1-hour = 2x input.
const PRICING_DATE = '6 Oct 2026';
const PRICES = {
    opus: { input: 4, output: 20, cacheRead: 0.20 },
    sonnet: { input: 2, output: 10, cacheRead: 0.20 },
    haiku: { input: 0.10, output: 0.50, cacheRead: 0.01 },
    fable: { input: 10, output: 50, cacheRead: 0.25 },
};
const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const OTHER = 'other';

const MS_PER_DAY = 86400 * 1000;
const DEFAULT_DAYS = 7;
const SUBAGENT_DIR = path.sep + 'subagents' + path.sep;

// Context-size bands for main-session calls: [lower, upper), in tokens.
const BANDS = [
    { name: '<100K', lo: 0, hi: 100000 },
    { name: '100-200K', lo: 100000, hi: 200000 },
    { name: '200-300K', lo: 200000, hi: 300000 },
    { name: '>300K', lo: 300000, hi: Infinity },
];

const AGENT_TOOLS = new Set(['Agent', 'Task']);
const EXPENSIVE_MODEL = /opus|fable/i;
// Same shape as the tier gate's line in src/hooks/agent-tier-gate.js.
const TIER_LINE = /^\s*tier:\s*(?:opus|fable)\s*[:\-–—]\s*\S/im;
const VERDICT = /TDD_GATE:\s*(PASS|FAIL)/g;
const REVIEWER_TYPE = 'code-reviewer';
const UNKNOWN = 'unknown';

// Main-session turn groups and the labels inside them.
const GROUP_WORK = 'work';
const GROUP_ORCH = 'orchestration';
const GROUP_TEXT = 'text';
const LABEL_TEXT = 'text-only turn';

const ORCH_FILE = /HANDOFF|handoff|tracker|TRACKER|\/reports\/|features\/|memory\//;
const GIT_STAGE = /^(?:git (?:add|commit|worktree|apply)|printf)\b/;
const RUN_TESTS = /pytest|make test|npm test|node .*test/;
const READ_ONLY_CMD = /^(?:(?:cat|head|tail|sed -n|grep|rg|find|ls|wc|awk)\b|git (?:diff|show|log|status)\b)/;

// Family of a model id, by substring.
//
// Args:
//   model: model id string, possibly missing.
// Returns:
//   a key of PRICES, or OTHER.
function family(model) {
    const m = String(model || '');
    for (const k of Object.keys(PRICES)) if (m.includes(k)) return k;
    return OTHER;
}

// Estimated cost of one API message.
//
// Args:
//   model: model id string.
//   u: the message's usage object.
// Returns:
//   USD, 0 for a model with no price.
function cost(model, u) {
    const p = PRICES[family(model)];
    if (!p) return 0;
    const w1h = ((u.cache_creation || {}).ephemeral_1h_input_tokens) || 0;
    const w5m = (u.cache_creation_input_tokens || 0) - w1h;
    return ((u.input_tokens || 0) * p.input
        + w5m * p.input * CACHE_WRITE_5M
        + w1h * p.input * CACHE_WRITE_1H
        + (u.cache_read_input_tokens || 0) * p.cacheRead
        + (u.output_tokens || 0) * p.output) / 1e6;
}

// Sorts one tool call into a turn group and label.
//
// Args:
//   b: a tool_use content block.
// Returns:
//   {group, label}.
function classifyTool(b) {
    const name = b.name;
    const input = b.input || {};
    if (AGENT_TOOLS.has(name) || name === 'SendMessage') return { group: GROUP_ORCH, label: 'dispatch' };
    if (name === 'Edit' || name === 'Write' || name === 'MultiEdit') {
        const fp = input.file_path || '';
        if (ORCH_FILE.test(fp)) return { group: GROUP_ORCH, label: 'handoff/tracker/report write' };
        if (fp.endsWith('.md')) return { group: GROUP_WORK, label: 'edit docs/plan .md' };
        return { group: GROUP_WORK, label: 'edit source' };
    }
    if (name === 'Bash') {
        const cmd = String(input.command || '').replace(/^\s*(?:cd [^;&]+(?:&&|;)\s*)+/, '').trim();
        if (GIT_STAGE.test(cmd)) return { group: GROUP_ORCH, label: 'stage/commit/marker' };
        if (RUN_TESTS.test(cmd)) return { group: GROUP_WORK, label: 'run tests' };
        if (READ_ONLY_CMD.test(cmd)) return { group: GROUP_WORK, label: 'read/search' };
        return { group: GROUP_WORK, label: 'run/other bash' };
    }
    if (name === 'Read') return { group: GROUP_WORK, label: 'read/search' };
    return { group: GROUP_WORK, label: 'other tool' };
}

// Classifies a whole API message by its first tool call across all of its lines.
//
// Args:
//   tools: tool_use blocks gathered over every line of the message.
// Returns:
//   {group, label}.
function classifyTurn(tools) {
    if (!tools.length) return { group: GROUP_TEXT, label: LABEL_TEXT };
    return classifyTool(tools[0]);
}

// Adds one call's cost to a {calls, cost} bucket.
function bump(bucket, c) {
    bucket.calls = (bucket.calls || 0) + 1;
    bucket.cost = (bucket.cost || 0) + c;
}

// Gets or creates a child object.
function child(obj, key, make) {
    if (!obj[key]) obj[key] = make ? make() : {};
    return obj[key];
}

// Lists every .jsonl file under a directory, depth first.
//
// Args:
//   dir: directory to walk.
// Returns:
//   array of absolute file paths; empty when dir is missing.
function listTranscripts(dir) {
    const out = [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listTranscripts(p));
        else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
    return out;
}

// Reads a sub-agent's sibling .meta.json.
function readMeta(file) {
    try { return JSON.parse(fs.readFileSync(file.slice(0, -'.jsonl'.length) + '.meta.json', 'utf-8')); } catch (e) { return {}; }
}

// Streams one transcript and returns its distinct API messages.
//
// One API message is split over several lines with the same message id, so lines
// are grouped by (message id, request id) first; the last line's usage is the
// final one and tool calls are gathered across all of its lines.
//
// Args:
//   file: transcript path.
//   since: epoch ms; messages older than this are dropped.
//   dispatches: Map filled with Agent tool_use id -> {tier}, from every line.
// Returns:
//   {messages: Map key -> {model, usage, ts, tools}, lastText}.
async function readTranscript(file, since, dispatches) {
    const messages = new Map();
    let lastText = '';
    const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf-8' }), crlfDelay: Infinity });
    for await (const raw of rl) {
        if (!raw.includes('"assistant"')) continue;
        let d;
        try { d = JSON.parse(raw); } catch (e) { continue; }
        if (!d || d.type !== 'assistant' || !d.message) continue;
        const m = d.message;
        const content = Array.isArray(m.content) ? m.content : [];
        for (const b of content) {
            if (!b || typeof b !== 'object') continue;
            if (b.type === 'tool_use' && AGENT_TOOLS.has(b.name)) {
                const prompt = (b.input && typeof b.input.prompt === 'string') ? b.input.prompt : '';
                dispatches.set(b.id, { tier: TIER_LINE.test(prompt) });
            }
        }
        const ts = Date.parse(d.timestamp);
        if (!m.usage || !m.model || m.model.startsWith('<') || !(ts >= since)) continue;
        const key = m.id + '|' + d.requestId;
        let msg = messages.get(key);
        if (!msg) { msg = { model: m.model, usage: m.usage, ts, tools: [] }; messages.set(key, msg); }
        msg.usage = m.usage;
        for (const b of content) {
            if (b && b.type === 'tool_use') msg.tools.push(b);
            else if (b && b.type === 'text' && b.text) lastText = b.text;
        }
    }
    return { messages, lastText };
}

// Builds the report.
//
// Args:
//   root: transcripts root directory.
//   days: window in days; 0 means all time.
//   now: epoch ms.
// Returns:
//   the report object, or null when no transcript file exists.
async function buildReport(root, days, now) {
    const since = days > 0 ? now - days * MS_PER_DAY : 0;
    const files = listTranscripts(root);
    if (!files.length) return null;

    const rep = {
        window: { days, since: since ? new Date(since).toISOString() : null },
        pricing: { date: PRICING_DATE, perMTok: PRICES },
        total: { calls: 0, cost: 0 },
        byModel: {},
        mainVsSub: { main: {}, sub: {} },
        byAgentType: {},
        mainOpusTurns: {},
        contextBands: {},
        opusDispatches: { count: 0, cost: 0, withTier: 0, withoutTier: 0, unmatched: 0 },
        reviews: { byAgent: {}, highestRound: {} },
    };
    for (const b of BANDS) rep.contextBands[b.name] = { calls: 0, cost: 0, costPerCall: 0 };

    const seen = new Set();
    const dispatches = new Map();
    const subs = [];

    for (const file of files) {
        if (since) {
            try { if (fs.statSync(file).mtimeMs < since) continue; } catch (e) { continue; }
        }
        const isSub = file.includes(SUBAGENT_DIR);
        const { messages, lastText } = await readTranscript(file, since, dispatches);
        const meta = isSub ? readMeta(file) : {};
        const agentType = meta.agentType || UNKNOWN;
        const sub = { file, agentType, toolUseId: meta.toolUseId, cost: 0, firstTs: Infinity, expensive: false, lastText, calls: 0 };

        for (const [key, msg] of messages) {
            if (seen.has(key)) continue;
            seen.add(key);
            const fam = family(msg.model);
            const c = cost(msg.model, msg.usage);
            bump(rep.total, c);
            bump(child(rep.byModel, fam), c);
            bump(child(child(rep.mainVsSub, isSub ? 'sub' : 'main'), fam), c);
            if (isSub) {
                bump(child(child(rep.byAgentType, agentType), fam), c);
                sub.cost += c;
                sub.calls += 1;
                sub.firstTs = Math.min(sub.firstTs, msg.ts);
                if (EXPENSIVE_MODEL.test(msg.model)) sub.expensive = true;
                continue;
            }
            const u = msg.usage;
            const size = (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0);
            const band = BANDS.find((b) => size >= b.lo && size < b.hi);
            bump(rep.contextBands[band.name], c);
            if (fam === 'opus') {
                const k = classifyTurn(msg.tools);
                const g = child(rep.mainOpusTurns, k.group);
                bump(g, c);
                bump(child(child(g, 'detail'), k.label), c);
            }
        }
        if (isSub && sub.calls) subs.push(sub);
    }

    for (const b of BANDS) {
        const x = rep.contextBands[b.name];
        x.costPerCall = x.calls ? x.cost / x.calls : 0;
    }

    // Opus sub-agent dispatches: tie each expensive sub-agent back to its Agent call.
    for (const s of subs) {
        if (!s.expensive) continue;
        const od = rep.opusDispatches;
        od.count += 1;
        od.cost += s.cost;
        const req = dispatches.get(s.toolUseId);
        if (!req) od.unmatched += 1;
        else if (req.tier) od.withTier += 1;
        else od.withoutTier += 1;
    }

    // Review rounds: a review's round is 1 plus the FAILs since the last PASS in
    // the same session. Report the highest round each session reached.
    const bySession = new Map();
    for (const s of subs) {
        if (!s.agentType.includes(REVIEWER_TYPE)) continue;
        const verdicts = [...s.lastText.matchAll(VERDICT)];
        s.verdict = verdicts.length ? verdicts[verdicts.length - 1][1] : UNKNOWN;
        const counts = child(rep.reviews.byAgent, s.agentType, () => ({ PASS: 0, FAIL: 0, unknown: 0 }));
        counts[s.verdict] += 1;
        const session = s.file.split(SUBAGENT_DIR)[0];
        if (!bySession.has(session)) bySession.set(session, []);
        bySession.get(session).push(s);
    }
    for (const list of bySession.values()) {
        list.sort((a, b) => a.firstTs - b.firstTs);
        let round = 0;
        let highest = 0;
        for (const s of list) {
            round += 1;
            highest = Math.max(highest, round);
            if (s.verdict === 'PASS') round = 0;
        }
        rep.reviews.highestRound[highest] = (rep.reviews.highestRound[highest] || 0) + 1;
    }
    return rep;
}

const usd = (n) => '$' + n.toFixed(2);

// Renders a cost table. Percentages use totalCost when given (for rows that nest),
// else the sum of the rows.
function table(title, rows, totalCost) {
    const total = totalCost !== undefined ? totalCost : rows.reduce((a, r) => a + r.cost, 0);
    const lines = [title];
    for (const r of rows) {
        const pct = total ? Math.round(100 * r.cost / total) : 0;
        lines.push(`  ${r.name.padEnd(42)} ${usd(r.cost).padStart(10)} ${String(pct).padStart(4)}%  calls ${r.calls}`);
    }
    return lines.join('\n');
}

// Flattens {family: {calls, cost}} into table rows with a prefix.
function famRows(prefix, byFam) {
    return Object.keys(byFam).map((f) => ({ name: prefix + f, calls: byFam[f].calls, cost: byFam[f].cost }));
}

// Renders the report as plain text.
function render(rep) {
    const out = [];
    const win = rep.window.days > 0 ? `last ${rep.window.days} day(s), since ${rep.window.since}` : 'all time';
    out.push(`Model spend, ${win}`);
    out.push(`Estimate at list prices (cached ${rep.pricing.date}); real bills differ.`);
    out.push('');
    out.push(`Total: ${usd(rep.total.cost)} over ${rep.total.calls} API calls`);
    out.push('');
    out.push(table('1. Cost by model', famRows('', rep.byModel).sort((a, b) => b.cost - a.cost)));
    out.push('');
    const mv = [];
    for (const side of ['main', 'sub']) mv.push(...famRows(side === 'main' ? 'main / ' : 'sub-agent / ', rep.mainVsSub[side]));
    out.push(table('2. Main session vs sub-agents, by model', mv.sort((a, b) => b.cost - a.cost)));
    out.push('');
    const at = [];
    for (const t of Object.keys(rep.byAgentType)) at.push(...famRows(t + ' / ', rep.byAgentType[t]));
    out.push(table('3. Sub-agent cost by agent type and model', at.sort((a, b) => b.cost - a.cost)));
    out.push('');
    const tt = [];
    for (const g of Object.keys(rep.mainOpusTurns)) {
        const x = rep.mainOpusTurns[g];
        tt.push({ name: g, calls: x.calls, cost: x.cost });
        for (const l of Object.keys(x.detail)) tt.push({ name: '    ' + l, calls: x.detail[l].calls, cost: x.detail[l].cost });
    }
    out.push(table('4. Main-session Opus cost by turn type', tt, Object.values(rep.mainOpusTurns).reduce((a, x) => a + x.cost, 0)));
    out.push('');
    out.push('5. Main context size per call');
    for (const b of BANDS) {
        const x = rep.contextBands[b.name];
        out.push(`  ${b.name.padEnd(10)} calls ${String(x.calls).padStart(6)}  cost ${usd(x.cost).padStart(10)}  per call ${('$' + x.costPerCall.toFixed(3)).padStart(8)}`);
    }
    out.push('');
    const od = rep.opusDispatches;
    out.push('6. Opus sub-agent dispatches');
    out.push(`  ${od.count} sub-agents on Opus/Fable, cost ${usd(od.cost)}`);
    out.push(`  prompt carried a TIER: opus: line: ${od.withTier}; no TIER line: ${od.withoutTier}; dispatch not found: ${od.unmatched}`);
    out.push('');
    out.push('7. Review rounds');
    for (const a of Object.keys(rep.reviews.byAgent)) {
        const c = rep.reviews.byAgent[a];
        out.push(`  ${a.padEnd(34)} PASS ${c.PASS}  FAIL ${c.FAIL}  no verdict ${c.unknown}`);
    }
    const hr = rep.reviews.highestRound;
    const rounds = Object.keys(hr).sort((a, b) => a - b);
    out.push('  highest round reached per session: ' + (rounds.length ? rounds.map((r) => `round ${r}: ${hr[r]} session(s)`).join(', ') : 'none'));
    return out.join('\n');
}

// Parses argv.
//
// Returns:
//   {days, json, projects} or {error}.
function parseArgs(argv) {
    const o = { days: DEFAULT_DAYS, json: false, projects: path.join(os.homedir(), '.claude', 'projects') };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--json') o.json = true;
        else if (a === '--days') {
            const n = Number(argv[++i]);
            if (!Number.isFinite(n) || n < 0) return { error: '--days needs a number of 0 or more' };
            o.days = n;
        } else if (a === '--projects') {
            if (!argv[i + 1]) return { error: '--projects needs a directory' };
            o.projects = argv[++i];
        } else return { error: 'unknown argument: ' + a };
    }
    return o;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.error) {
        process.stderr.write(opts.error + '\nUsage: model-spend.js [--days N] [--json] [--projects DIR]\n');
        process.exit(2);
    }
    const rep = await buildReport(opts.projects, opts.days, Date.now());
    if (!rep) {
        process.stdout.write(`No transcripts found under ${opts.projects}\n`);
        return;
    }
    process.stdout.write((opts.json ? JSON.stringify(rep, null, 2) : render(rep)) + '\n');
}

if (require.main === module) {
    main().catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
}

module.exports = { family, cost, classifyTurn, buildReport };
