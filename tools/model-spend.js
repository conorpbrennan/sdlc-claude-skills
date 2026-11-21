#!/usr/bin/env node
// Weekly model spend report, read from local Claude Code transcripts
// (~/.claude/projects/**/*.jsonl). It answers one question: did steering work
// toward Sonnet actually move the spend?
//
// Usage: node tools/model-spend.js [--days N | --since ISO] [--until ISO] [--split ISO] [--json] [--projects DIR]
//   --days N       window by message timestamp (default 7; 0 means all time)
//   --since ISO    window start; replaces --days (giving both is an error)
//   --until ISO    drop every message after this time, in every section (default now)
//   --split ISO    section 9 groups sessions that ended before / after this time
//   --json         print the same data as JSON
//   --projects DIR transcripts root (default ~/.claude/projects)
//
// Section 8 shows the main-session prompt cache by backend (claude.ai login vs
// gateway/API key), split by cache-write TTL, with the cost of rebuilds after idle gaps.
// Section 9 shows orchestration signals per 10 implementer dispatches, by session group
// (tools/lib/orch-signals.js).
// Section 10 shows the PARTIAL rate by dispatch size (prompt bytes, tool calls, files edited,
// test files named).
//
// Files are streamed line by line: the real tree is about 2 GB.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const { PRICES, MODEL_PRICES, PRICING_DATE, PRICING_SOURCE, family, cost, cacheWriteCost } = require('./lib/prices.js');
const { readSessions, summarise, partialAnatomy } = require('./lib/orch-signals.js');

// Section 9 labels. Keys are the Row keys of summarise().
const ORCH_HEADING = '9. Orchestration signals per 10 implementer dispatches';
const ORCH_WINDOW_LINE = 'Sessions are those active since the window start';
const ORCH_NONE = 'none';
const ORCH_DASH = '-';
const ORCH_COUNT_LABELS = [
    ['partial', 'partial'], ['tddFail', 'tdd-fail'], ['interrupts', 'interrupts'], ['mainSrcEdits', 'main-src-edits'],
    ['blockLoops', 'block-loops'], ['denyRetryPairs', 'deny-retry'], ['identicalPromptPairs', 'same-prompt'],
];
const ORCH_SHARE_LABELS = [
    ['partial', 'partial'], ['tddFail', 'tdd-fail'], ['interrupts', 'interrupts'], ['mainSrcEdits', 'main-src-edits'],
    ['blockLoops', 'block-loops'],
];
const ORCH_CYCLE_KEYS = ['1', '2', '3', '4+', 'open'];
const ANATOMY_HEADING = '10. PARTIAL anatomy';
const ANATOMY_DIM_LABELS = [
    ['promptBytes', 'prompt bytes'], ['toolCalls', 'tool calls'], ['filesEdited', 'files edited'], ['testFilesNamed', 'test files named'],
];
const TOKENS_PER_K = 1000;
const PERCENT = 100;
const TIME_FLAGS = { '--since': 'since', '--until': 'until', '--split': 'splitAt' };
const USAGE_LINE = 'Usage: model-spend.js [--days N | --since ISO] [--until ISO] [--split ISO] [--json] [--projects DIR]';

// Main-session prompt cache. Claude Code picks the TTL by auth route: 1h on a
// claude.ai login (inference_geo "global"), 5m through an API key or gateway.
const BACKEND_CLAUDE_AI = 'claude.ai';
const BACKEND_GATEWAY = 'gateway/API';
const GEO_CLAUDE_AI = 'global';
const REBUILD_MIN_MS = 5 * 60 * 1000;
const REBUILD_MAX_MS = 60 * 60 * 1000;
const FIX_LINE = 'export CLAUDE_CODE_PROMPT_CACHE_TTL=1h';

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
//   until: epoch ms; messages newer than this are dropped (default: none dropped).
// Returns:
//   {messages: Map key -> {model, usage, ts, tools}, lastText}.
async function readTranscript(file, since, dispatches, until) {
    const untilMs = until === undefined ? Infinity : until;
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
        if (!m.usage || !m.model || m.model.startsWith('<') || !(ts >= since) || ts > untilMs) continue;
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
//   opts: optional {since, until, splitAt}, epoch ms, each optional. since replaces the
//     days window start; until drops every later message in every section; splitAt
//     splits the section 9 groups.
// Returns:
//   the report object, or null when no transcript file exists.
async function buildReport(root, days, now, opts) {
    const o = opts || {};
    const since = o.since !== undefined ? o.since : (days > 0 ? now - days * MS_PER_DAY : 0);
    const files = listTranscripts(root);
    if (!files.length) return null;

    const rep = {
        window: { days, since: since ? new Date(since).toISOString() : null },
        pricing: { date: PRICING_DATE, source: PRICING_SOURCE, perMTok: PRICES, perModel: MODEL_PRICES },
        total: { calls: 0, cost: 0 },
        byModel: {},
        mainVsSub: { main: {}, sub: {} },
        byAgentType: {},
        mainOpusTurns: {},
        contextBands: {},
        opusDispatches: { count: 0, cost: 0, withTier: 0, withoutTier: 0, unmatched: 0 },
        reviews: { byAgent: {}, highestRound: {} },
        promptCache: {},
    };
    for (const name of [BACKEND_CLAUDE_AI, BACKEND_GATEWAY]) {
        rep.promptCache[name] = {
            sessions: 0, write5m: 0, write1h: 0,
            rebuild5to60m: { calls: 0, cost: 0 }, rebuildOver60m: { calls: 0, cost: 0 },
        };
    }
    for (const b of BANDS) rep.contextBands[b.name] = { calls: 0, cost: 0, costPerCall: 0 };

    const seen = new Set();
    const dispatches = new Map();
    const subs = [];

    for (const file of files) {
        if (since) {
            try { if (fs.statSync(file).mtimeMs < since) continue; } catch (e) { continue; }
        }
        const isSub = file.includes(SUBAGENT_DIR);
        const { messages, lastText } = await readTranscript(file, since, dispatches, o.until);
        const meta = isSub ? readMeta(file) : {};
        const agentType = meta.agentType || UNKNOWN;
        const backendsSeen = new Set();
        let prevTs = null;
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
            // Prompt cache: one backend per call; a rebuild is a cache write after an idle gap.
            const backend = u.inference_geo === GEO_CLAUDE_AI ? BACKEND_CLAUDE_AI : BACKEND_GATEWAY;
            const pc = rep.promptCache[backend];
            if (!backendsSeen.has(backend)) { backendsSeen.add(backend); pc.sessions += 1; }
            const w = cacheWriteCost(msg.model, u);
            pc.write5m += w.w5m;
            pc.write1h += w.w1h;
            if (prevTs !== null && msg.ts - prevTs > REBUILD_MIN_MS) {
                const rb = msg.ts - prevTs <= REBUILD_MAX_MS ? pc.rebuild5to60m : pc.rebuildOver60m;
                rb.calls += 1;
                rb.cost += w.w5m + w.w1h;
            }
            prevTs = msg.ts;
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

    const sessions = await readSessions(root, { since, until: o.until });
    const isoOrNull = (ms) => (ms === undefined ? null : new Date(ms).toISOString());
    rep.orchestration = {
        window: { since: isoOrNull(o.since), until: isoOrNull(o.until), split: isoOrNull(o.splitAt) },
        groups: summarise(sessions, { splitAt: o.splitAt }).groups,
        anatomy: partialAnatomy(sessions),
    };
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
    let win = 'all time';
    if (rep.window.days > 0) win = `last ${rep.window.days} day(s), since ${rep.window.since}`;
    else if (rep.window.since) win = `since ${rep.window.since}`;
    out.push(`Model spend, ${win}`);
    out.push(`Estimate at list prices (page of ${rep.pricing.date}); real bills differ.`);
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
    out.push('');
    out.push('8. Main-session prompt cache, by backend (cache writes only)');
    for (const name of Object.keys(rep.promptCache)) {
        const x = rep.promptCache[name];
        out.push(`  ${name.padEnd(12)} sessions ${String(x.sessions).padStart(4)}  5m writes ${usd(x.write5m).padStart(9)}  1h writes ${usd(x.write1h).padStart(9)}`
            + `  rebuild 5-60m ${usd(x.rebuild5to60m.cost).padStart(8)} (${x.rebuild5to60m.calls})  rebuild >60m ${usd(x.rebuildOver60m.cost).padStart(8)} (${x.rebuildOver60m.calls})`);
    }
    const gw = rep.promptCache[BACKEND_GATEWAY];
    if (gw.write5m > gw.write1h) out.push(`  Gateway/API sessions wrote mostly 5m cache. Fix: ${FIX_LINE}`);
    out.push('');
    out.push(...renderOrchestration(rep));
    out.push('', ...renderAnatomy(rep));
    return out.join('\n');
}

// Formats a rate or cost with 2 decimals; a null (zero denominator) prints a dash.
//
// Args:
//   n: a number or null.
//   prefix: text put before a number (for example '$').
// Returns:
//   the formatted string.
function fixed2(n, prefix) {
    return n === null || n === undefined ? ORCH_DASH : (prefix || '') + n.toFixed(2);
}

// Formats a share as a whole percent; a null prints a dash.
//
// Args:
//   n: a fraction or null.
// Returns:
//   the formatted string.
function pct(n) {
    return n === null || n === undefined ? ORCH_DASH : Math.round(PERCENT * n) + '%';
}

// Renders one section 9 row as a single line.
//
// Args:
//   r: a Row from summarise().
// Returns:
//   the line.
function orchRow(r) {
    const parts = [`${r.group}: sessions ${r.sessions}  steps ${r.steps}  commits ${r.commits}`];
    parts.push('per10 ' + ORCH_COUNT_LABELS.map(([k, label]) => `${label} ${fixed2(r.per10[k])}`).join(' '));
    parts.push('share ' + ORCH_SHARE_LABELS.map(([k, label]) => `${label} ${pct(r.share[k])}`).join(' '));
    parts.push(`cost/commit ${fixed2(r.cost.perCommit, '$')}  main/commit ${fixed2(r.cost.mainPerCommit, '$')}`);
    parts.push(`reviews/commit ${fixed2(r.reviewsPerCommit)}`);
    parts.push('review-cycles ' + ORCH_CYCLE_KEYS.map((k) => `${k}:${r.reviewCycles[k]}`).join(' '));
    parts.push(`peak-ctx p50 ${Math.round(r.peakCtx.p50 / TOKENS_PER_K)}K max ${Math.round(r.peakCtx.max / TOKENS_PER_K)}K`);
    return '  ' + parts.join('  ');
}

// Renders section 9: orchestration signals per group.
//
// Args:
//   rep: the report from buildReport().
// Returns:
//   an array of lines.
function renderOrchestration(rep) {
    const groups = rep.orchestration.groups;
    const since = rep.window.since ? ` (${rep.window.since})` : '';
    const out = [ORCH_HEADING, `  ${ORCH_WINDOW_LINE}${since}.`];
    if (!groups.length) out.push('  ' + ORCH_NONE);
    for (const r of groups) out.push(orchRow(r));
    return out;
}

// Renders section 10: PARTIAL rate by dispatch size, one block per dimension.
//
// Args:
//   rep: the report from buildReport().
// Returns:
//   an array of lines.
function renderAnatomy(rep) {
    const a = rep.orchestration.anatomy;
    const out = [ANATOMY_HEADING, `  Implementer dispatches with a sub-agent record: ${a.dispatches}, PARTIAL: ${a.partial}.`];
    for (const [dim, label] of ANATOMY_DIM_LABELS) {
        out.push(`  ${label}`);
        for (const b of a.bands[dim]) out.push(`    ${b.band.padEnd(6)} dispatches ${String(b.dispatches).padStart(4)}  partial ${String(b.partial).padStart(4)}  rate ${pct(b.rate)}`);
    }
    return out;
}

// Parses argv.
//
// Returns:
//   {days, json, projects, since, until, splitAt} or {error}. since, until and splitAt are
//   epoch ms or undefined.
function parseArgs(argv) {
    const o = { days: DEFAULT_DAYS, json: false, projects: path.join(os.homedir(), '.claude', 'projects') };
    let daysGiven = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--json') o.json = true;
        else if (a === '--days') {
            const n = Number(argv[++i]);
            if (!Number.isFinite(n) || n < 0) return { error: '--days needs a number of 0 or more' };
            o.days = n;
            daysGiven = true;
        } else if (TIME_FLAGS[a]) {
            const ms = Date.parse(argv[++i]);
            if (!Number.isFinite(ms)) return { error: a + ' needs an ISO date-time' };
            o[TIME_FLAGS[a]] = ms;
        } else if (a === '--projects') {
            if (!argv[i + 1]) return { error: '--projects needs a directory' };
            o.projects = argv[++i];
        } else return { error: 'unknown argument: ' + a };
    }
    if (o.since !== undefined && daysGiven) return { error: '--since and --days cannot be used together' };
    return o;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.error) {
        process.stderr.write(opts.error + '\n' + USAGE_LINE + '\n');
        process.exit(2);
    }
    // --since replaces the days window, so the report must not claim a days window too.
    const days = opts.since !== undefined ? 0 : opts.days;
    const rep = await buildReport(opts.projects, days, Date.now(), { since: opts.since, until: opts.until, splitAt: opts.splitAt });
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
