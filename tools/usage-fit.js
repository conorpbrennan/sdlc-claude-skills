#!/usr/bin/env node
// Usage indicator report, read from local Claude Code transcripts
// (~/.claude/projects/**/*.jsonl). Per 7-day week it reports where main-session
// cost sits: context size, /clear resets, Opus work turns, long sub-agent runs and
// prompt-cache rebuilds. It then prices four levers as counterfactuals on that
// same history, and a combined figure that does not add overlapping levers.
//
// Usage: node tools/usage-fit.js <transcripts-dir> [--days N] [--json]
//   --days N  window in days (default 56); weeks are 7-day buckets ending now
//   --json    print the same data as JSON
//
// Exit codes: 0 ok, 1 bad usage, 2 a read error (fixed label and error code on
// stderr, never the message, which embeds paths), 3 an unrecognised transcript
// shape (kinds and counts on stderr, nothing on stdout).
//
// In-flight line: an unparsable FINAL line of a file is a line still being written
// by a live session. It is skipped, not counted. An unparsable line anywhere else
// is counted as unparsable-line and exits 3.
//
// Privacy: the output is numbers and fixed labels. Prompts are read only to match
// the handoff and command patterns. Nothing is written anywhere. Files are
// streamed line by line.
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { cost, family, classifyTurn } = require('./model-spend.js');

const DEFAULT_DAYS = 56;
const MS_PER_DAY = 86400 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MIN = 60 * 1000;
const SUBAGENT_DIR = 'subagents';
const JSONL = '.jsonl';
const META_SUFFIX = '.meta.json';

const EXIT_USAGE = 1;
const EXIT_READ = 2;
const EXIT_UNRECOGNISED = 3;
const CODE_UNKNOWN = 'UNKNOWN';

const OVER_200K = 200000;
const OVER_300K = 300000;
const BAND_NAMES = ['<100K', '100-200K', '200-300K', '>300K'];
const BAND_UPPER = [100000, 200000, 300000, Infinity];
const SUB_LONG_RUN_CALLS = 100;
const REBUILD_MIN_MIN = 5;
const REBUILD_MAX_MIN = 60;
const HANDOFF_WINDOW_CHARS = 600;
const HANDOFF_RE = /handoff|resume/i;
const GEO_CLAUDE_AI = 'global';
const SDLC_AGENT_PREFIX = 'sdlc:';

// Substrings used to pick lines cheaply before parsing.
const TYPE_ASSISTANT = 'assistant';
const TYPE_USER = 'user';
const MARK_CLEAR = 'command-name>/clear';
const MARK_SDLC = 'command-name>/sdlc:';
const PREFIX_COMMAND = '<command-';
const PREFIX_LOCAL = '<local-command';
const PREFIX_SYNTHETIC = '<';
const BLOCK_TEXT = 'text';
const BLOCK_TOOL_USE = 'tool_use';
const BLOCK_TOOL_RESULT = 'tool_result';

// Kinds of unrecognised shape, reported by name and count only.
const KIND_UNPARSABLE = 'unparsable-line';
const KIND_NO_TIMESTAMP = 'no-timestamp';
const KIND_USER_CONTENT = 'user-content-shape';

// The turn group that counts as work: the group classifyTurn gives a Read.
const GROUP_WORK = classifyTurn([{ name: 'Read', input: {} }]).group;
const FAMILY_OPUS = 'opus';
const FAMILY_FABLE = 'fable';
const FAMILY_SONNET = 'sonnet';
const FAMILY_OTHER = 'other'; // a model with no price: costs $0 today
// Fixed family labels for the model mix. Model ids are never printed.
const FAMILIES = [FAMILY_OPUS, FAMILY_FABLE, FAMILY_SONNET, 'haiku', FAMILY_OTHER];

const SUB_CAP_AFTER_CALL = 40;

// Lever names, confidence labels and fixed wording.
const LEVER_CONTEXT_RESET = 'context-reset';
const LEVER_SONNET_MAIN = 'sonnet-main';
const LEVER_CACHE_1H_MAIN = 'cache-1h-main';
const LEVER_CAP_RUNAWAY = 'cap-runaway-subagents';
const CONF_ARITHMETIC = 'arithmetic';
const CONF_UPPER_BOUND = 'upper-bound';
const CONF_ESTIMATE = 'estimate';
// Sonnet is half the Opus price on input, output and cache writes but the same on
// cache reads, and cache reads dominate at long context. So moving Opus or Fable
// work turns to Sonnet saves 30% (reads dominate) to 45% (writes and output dominate).
const SONNET_SAVE_LOW = 0.30;
const SONNET_SAVE_HIGH = 0.45;
// A 1h main-session cache avoids about this share of the gateway rebuild cost.
const CACHE_1H_AVOIDED = 0.70;
const NOTE_COUNTERFACTUAL = 'Counterfactuals on your own history at list prices, not forecasts.';
const NOTE_CLAUDE_AI = 'claude.ai sessions are subscription: dollars are list-price estimates; read the shares.';

// Counts one unrecognised-shape occurrence.
//
// Args:
//   unknown: Map kind -> count.
//   kind: one of the KIND_ constants.
// Returns:
//   nothing.
function note(unknown, kind) {
    unknown.set(kind, (unknown.get(kind) || 0) + 1);
}

// Lists every .jsonl file under a directory, depth first.
//
// Args:
//   dir: directory to walk.
// Returns:
//   array of file paths.
function listTranscripts(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listTranscripts(p));
        else if (e.isFile() && e.name.endsWith(JSONL)) out.push(p);
    }
    return out;
}

// Reads a sub-agent's agent type from its sibling .meta.json.
//
// Args:
//   file: path of the sub-agent transcript.
// Returns:
//   the agent type, or '' when the meta file is missing or has none.
function readAgentType(file) {
    try {
        const meta = JSON.parse(fs.readFileSync(file.slice(0, -JSONL.length) + META_SUFFIX, 'utf8'));
        return String(meta.agentType || '');
    } catch (e) {
        return '';
    }
}

// Streams one transcript into segments of distinct API messages.
//
// One API message spans several lines: lines are grouped by message id and request
// id (id alone when a line has no request id), and the last line's usage wins.
// A user line containing /clear starts a new segment.
//
// Args:
//   file: transcript path.
//   unknown: Map kind -> count, filled for unrecognised shapes.
// Returns:
//   {segments: [{clear, handoff, hasPrompt, msgs: [{ts, model, usage, tools}]}],
//    sdlcTimes: timestamps of /sdlc: command lines}.
async function readTranscript(file, unknown) {
    const segments = [];
    let cur = null;
    const sdlcTimes = [];
    const open = (clear) => {
        cur = { clear, handoff: false, hasPrompt: false, byKey: new Map(), msgs: [] };
        segments.push(cur);
    };
    open(false);
    let badPending = false; // an unparsable line seen; counted only if another line follows
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    for await (const raw of rl) {
        if (badPending) { note(unknown, KIND_UNPARSABLE); badPending = false; }
        const maybeAssistant = raw.includes('"' + TYPE_ASSISTANT + '"');
        const maybeUser = raw.includes('"' + TYPE_USER + '"');
        if (!maybeAssistant && !maybeUser) continue;
        if (maybeUser && raw.includes(MARK_CLEAR)) {
            if (cur.msgs.length || cur.hasPrompt) open(true); else cur.clear = true;
            continue;
        }
        let d;
        try { d = JSON.parse(raw); } catch (e) { badPending = true; continue; }
        if (!d || (d.type !== TYPE_USER && d.type !== TYPE_ASSISTANT)) continue;
        const ts = Date.parse(d.timestamp);
        if (!(ts > 0)) { note(unknown, KIND_NO_TIMESTAMP); continue; }
        const m = d.message;
        if (d.type === TYPE_USER) {
            if (!m) continue;
            const c = m.content;
            let t = null;
            if (typeof c === 'string') t = c;
            else if (Array.isArray(c)) t = c.filter((x) => x && x.type === BLOCK_TEXT).map((x) => x.text).join(' ');
            if (t === null) { note(unknown, KIND_USER_CONTENT); continue; }
            if (raw.includes(MARK_SDLC)) sdlcTimes.push(ts);
            const isToolResult = Array.isArray(c) && c.some((x) => x && x.type === BLOCK_TOOL_RESULT);
            if (!cur.hasPrompt && !d.isMeta && t && !t.startsWith(PREFIX_COMMAND)
                && !t.startsWith(PREFIX_LOCAL) && !isToolResult) {
                cur.hasPrompt = true;
                cur.handoff = HANDOFF_RE.test(t.slice(0, HANDOFF_WINDOW_CHARS));
            }
        } else {
            if (!m || !m.usage || !m.id) continue;
            if (!m.model || String(m.model).startsWith(PREFIX_SYNTHETIC)) continue;
            if (typeof m.usage.input_tokens !== 'number') continue;
            const key = m.id + '|' + (d.requestId || '');
            let e = cur.byKey.get(key);
            if (!e) { e = { ts, tools: [] }; cur.byKey.set(key, e); cur.msgs.push(e); }
            e.model = m.model;
            e.usage = m.usage;
            if (Array.isArray(m.content)) {
                for (const b of m.content) if (b && b.type === BLOCK_TOOL_USE) e.tools.push(b);
            }
        }
    }
    return { segments, sdlcTimes };
}

// Index of the band a context size falls in.
function bandOf(ctx) {
    return BAND_UPPER.findIndex((hi) => ctx < hi);
}

// Makes an empty week row.
//
// Args:
//   index: weeks ago, 0 for the latest 7 days.
//   endMs: end of the week, epoch ms.
// Returns:
//   a week object with every counter at zero.
function newWeek(index, endMs) {
    return {
        weeksAgo: index,
        weekStart: new Date(endMs - MS_PER_WEEK).toISOString().slice(0, 10),
        mainCalls: 0, mainCost: 0, over200: 0, over300: 0, costOver300: 0,
        shareOver200: 0, shareOver300: 0,
        bands: BAND_NAMES.map((name) => ({ name, calls: 0, cost: 0 })),
        segments: 0, clearStarts: 0, handoffStarts: 0, resetsPer100Calls: 0, handoffStyleShare: 0,
        opusCost: 0, opusWorkCost: 0,
        mix: Object.fromEntries(FAMILIES.map((f) => [f, { cost: 0, workCost: 0 }])),
        unpricedCalls: 0, subCost: 0, subCostPast40: 0, gatewayRebuildCost: 0,
        subRuns: 0, subRunsOver100: 0, subCalls: 0,
        gatewayCalls: 0, gatewayCost: 0, claudeaiCalls: 0, claudeaiCost: 0,
        write5mCost: 0, write1hCost: 0, rebuildGaps: 0, rebuildCost: 0,
        sdlcCommands: 0, sdlcAgentRuns: 0,
    };
}

// Builds the weekly indicator rows from a transcripts tree.
//
// Args:
//   dir: transcripts root (the projects directory).
//   opts: {days, now}. days is the window; now is epoch ms.
// Returns:
//   Promise of {weeks, unknown}. weeks is oldest first, one row per 7-day bucket
//   ending at now, zero-filled; unknown is a Map of unrecognised-shape kind -> count.
async function buildWeeks(dir, opts) {
    const days = opts && opts.days !== undefined ? opts.days : DEFAULT_DAYS;
    const now = opts && opts.now !== undefined ? opts.now : Date.now();
    const since = now - days * MS_PER_DAY;
    const count = Math.max(1, Math.ceil(days / 7));
    const weeks = [];
    for (let i = count - 1; i >= 0; i--) weeks.push(newWeek(i, now - i * MS_PER_WEEK));
    const unknown = new Map();
    const at = (ts) => {
        if (ts < since || ts > now) return null;
        const i = Math.floor((now - ts) / MS_PER_WEEK);
        return i < count ? weeks[count - 1 - i] : null;
    };

    for (const file of listTranscripts(dir)) {
        const isSub = path.relative(dir, file).split(path.sep).includes(SUBAGENT_DIR);
        const { segments, sdlcTimes } = await readTranscript(file, unknown);
        for (const ts of sdlcTimes) {
            const w = at(ts);
            if (w) w.sdlcCommands += 1;
        }
        segments.forEach((s) => s.msgs.forEach((m) => { m.seg = s; }));
        const all = segments.flatMap((s) => s.msgs).sort((a, b) => a.ts - b.ts);

        if (isSub) {
            if (!all.length) continue;
            const w = at(all[0].ts);
            if (!w) continue;
            w.subRuns += 1;
            w.subCalls += all.length;
            for (const e of all) w.subCost += cost(e.model, e.usage);
            if (all.length > SUB_LONG_RUN_CALLS) {
                w.subRunsOver100 += 1;
                for (const e of all.slice(SUB_CAP_AFTER_CALL)) w.subCostPast40 += cost(e.model, e.usage);
            }
            for (const e of all) if (family(e.model) === FAMILY_OTHER) w.unpricedCalls += 1;
            if (readAgentType(file).startsWith(SDLC_AGENT_PREFIX)) w.sdlcAgentRuns += 1;
            continue;
        }

        for (const s of segments) {
            if (!s.msgs.length) continue;
            const w = at(s.msgs[0].ts);
            if (!w) continue;
            w.segments += 1;
            if (s.clear) w.clearStarts += 1;
            if (s.handoff) w.handoffStarts += 1;
        }

        // Previous main call, to price a cache rebuild. Reset at each segment
        // boundary: a fresh start after /clear is not an expired cache.
        let prev = null;
        let prevSeg = null;
        for (const e of all) {
            if (e.seg !== prevSeg) { prev = null; prevSeg = e.seg; }
            const u = e.usage;
            const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
            const w = at(e.ts);
            if (w) {
                const c = cost(e.model, u);
                const claudeai = u.inference_geo === GEO_CLAUDE_AI;
                w.mainCalls += 1;
                w.mainCost += c;
                if (ctx > OVER_200K) w.over200 += 1;
                if (ctx > OVER_300K) { w.over300 += 1; w.costOver300 += c; }
                const b = w.bands[bandOf(ctx)];
                b.calls += 1;
                b.cost += c;
                const fam = family(e.model);
                const isWork = classifyTurn(e.tools).group === GROUP_WORK;
                w.mix[fam].cost += c;
                if (isWork) w.mix[fam].workCost += c;
                if (fam === FAMILY_OTHER) w.unpricedCalls += 1;
                if (fam === FAMILY_OPUS) {
                    w.opusCost += c;
                    if (isWork) w.opusWorkCost += c;
                }
                if (claudeai) { w.claudeaiCalls += 1; w.claudeaiCost += c; } else { w.gatewayCalls += 1; w.gatewayCost += c; }
                const cc = u.cache_creation_input_tokens || 0;
                const t1h = ((u.cache_creation || {}).ephemeral_1h_input_tokens) || 0;
                w.write1hCost += cost(e.model, { cache_creation_input_tokens: t1h, cache_creation: { ephemeral_1h_input_tokens: t1h } });
                w.write5mCost += cost(e.model, { cache_creation_input_tokens: cc - t1h });
                // A gap of 5-60 minutes between consecutive main calls means the 5m
                // cache expired and this call rebuilt it. Estimate the rebuild as the
                // smaller of this call's cache-write tokens and the previous call's
                // context, priced as a 5m write.
                if (prev) {
                    const gap = (e.ts - prev.ts) / MS_PER_MIN;
                    if (gap > REBUILD_MIN_MIN && gap <= REBUILD_MAX_MIN) {
                        w.rebuildGaps += 1;
                        const rc = cost(e.model, { cache_creation_input_tokens: Math.min(cc, prev.ctx) });
                        w.rebuildCost += rc;
                        if (!claudeai) w.gatewayRebuildCost += rc;
                    }
                }
            }
            prev = { ts: e.ts, ctx };
        }
    }

    for (const w of weeks) {
        w.shareOver200 = w.mainCalls ? w.over200 / w.mainCalls : 0;
        w.shareOver300 = w.mainCalls ? w.over300 / w.mainCalls : 0;
        w.resetsPer100Calls = w.mainCalls ? 100 * w.clearStarts / w.mainCalls : 0;
        w.handoffStyleShare = w.segments ? w.handoffStarts / w.segments : 0;
        w.levers = computeLevers(w);
    }
    const total = sumWeeks(weeks);
    const window = {
        mainCost: total.mainCost,
        unpricedModelCalls: total.unpricedCalls,
        subCost: total.subCost,
        totalCost: total.mainCost + total.subCost,
        subCostPast40: total.subCostPast40,
        modelMix: total.mix,
        levers: computeLevers(total),
        claudeAiOnly: total.mainCost > 0 && total.gatewayCost === 0,
    };
    return { weeks, unknown, window };
}

// Sums the additive counters of the week rows into one window row.
//
// Args:
//   weeks: rows from buildWeeks, before or after their derived shares are set.
// Returns:
//   a week-shaped object holding the window totals (shares are not recomputed).
function sumWeeks(weeks) {
    const t = newWeek(0, 0);
    for (const w of weeks) {
        for (const k of Object.keys(t)) if (typeof t[k] === 'number' && k !== 'weeksAgo') t[k] += w[k];
        w.bands.forEach((b, i) => { t.bands[i].calls += b.calls; t.bands[i].cost += b.cost; });
        for (const f of FAMILIES) { t.mix[f].cost += w.mix[f].cost; t.mix[f].workCost += w.mix[f].workCost; }
    }
    return t;
}

// Prices the levers as counterfactuals on one row of history.
//
// Args:
//   t: a week row or the window total from sumWeeks.
// Returns:
//   {levers, combined}. Each lever is {name, confidence, applies, reason, low, high,
//   pctOfTotal}; reason is '' when it applies and low and high are 0 when it does not.
//   combined is {low, high, pctOfTotal}. Percentages are of total cost (main plus sub-agents).
//
// The levers overlap, so the combined figure applies them in sequence: context-reset
// first; then sonnet-main on the work-turn cost that remains, and cache-1h-main on the
// rebuild cost that remains (both scaled by 1 minus context-reset's share of main
// cost, since resetting removes that share of every long-context call); then
// cap-runaway-subagents, which is sub-agent cost and independent. So combined is
// at most the sum of the levers.
function computeLevers(t) {
    const main = t.mainCost;
    const total = t.mainCost + t.subCost; // denominator of every percentage
    const mk = (name, confidence, applies, reason, low, high) => ({
        name, confidence, applies, reason: applies ? '' : reason,
        low: applies ? low : 0, high: applies ? high : 0,
        pctOfTotal: applies && total > 0 ? high / total : 0,
    });

    // context-reset: calls over 300K, minus the same number of calls at this
    // history's under-100K cost per call.
    const under = t.bands[0];
    let crDollars = 0;
    let crReason = '';
    if (!under.calls) crReason = 'no calls under 100K context to compare against';
    else if (!t.over300) crReason = 'no calls over 300K context';
    else {
        crDollars = t.costOver300 - t.over300 * (under.cost / under.calls);
        if (crDollars <= 0) crReason = 'calls over 300K cost no more than calls under 100K';
    }
    const cr = mk(LEVER_CONTEXT_RESET, CONF_ARITHMETIC, crDollars > 0, crReason, crDollars, crDollars);
    const keep = main > 0 ? 1 - cr.high / main : 1; // share of main cost left after a reset

    const work = t.mix[FAMILY_OPUS].workCost + t.mix[FAMILY_FABLE].workCost;
    const sm = mk(LEVER_SONNET_MAIN, CONF_ESTIMATE, work > 0,
        'no Opus or Fable work-turn cost (already on Sonnet or no work turns)',
        SONNET_SAVE_LOW * work, SONNET_SAVE_HIGH * work);

    const c1h = mk(LEVER_CACHE_1H_MAIN, CONF_ESTIMATE, t.gatewayRebuildCost > 0,
        'no gateway cache rebuild cost (claude.ai already gets the 1h cache)',
        CACHE_1H_AVOIDED * t.gatewayRebuildCost, CACHE_1H_AVOIDED * t.gatewayRebuildCost);

    // Upper bound: a fresh agent redoes some of the work past call 40, so not all of it is saved.
    const cap = mk(LEVER_CAP_RUNAWAY, CONF_UPPER_BOUND, t.subCostPast40 > 0,
        'no sub-agent run over 100 calls', t.subCostPast40, t.subCostPast40);

    const levers = [cr, sm, c1h, cap];
    const low = cr.low + sm.low * keep + c1h.low * keep + cap.low;
    const high = cr.high + sm.high * keep + c1h.high * keep + cap.high;
    return { levers, combined: { low, high, pctOfTotal: total > 0 ? high / total : 0 } };
}

// Rows for the human table: label and a formatter over a week.
const usd = (x) => '$' + x.toFixed(2);
const pct = (x) => (100 * x).toFixed(0) + '%';
const num = (x) => String(x);
const ROWS = [
    ['main calls', (w) => num(w.mainCalls)],
    ['main cost', (w) => usd(w.mainCost)],
    ['calls > 200K ctx', (w) => pct(w.shareOver200)],
    ['calls > 300K ctx', (w) => pct(w.shareOver300)],
    ['cost of calls > 300K', (w) => usd(w.costOver300)],
    ['resets per 100 calls', (w) => w.resetsPer100Calls.toFixed(1)],
    ['handoff-style starts', (w) => pct(w.handoffStyleShare)],
    ['main Opus cost', (w) => usd(w.opusCost)],
    ['  of it work turns', (w) => usd(w.opusWorkCost)],
    ['sub-agent runs', (w) => num(w.subRuns)],
    ['  over 100 calls', (w) => num(w.subRunsOver100)],
    ['cache: claude.ai cost', (w) => usd(w.claudeaiCost)],
    ['cache: gateway cost', (w) => usd(w.gatewayCost)],
    ['cache: 5m write cost', (w) => usd(w.write5mCost)],
    ['cache: 1h write cost', (w) => usd(w.write1hCost)],
    ['cache: rebuild cost', (w) => usd(w.rebuildCost)],
    ...FAMILIES.map((f) => ['mix ' + f + ' cost / work', (w) => usd(w.mix[f].cost) + ' / ' + usd(w.mix[f].workCost)]),
    ['sub-agent cost past call ' + SUB_CAP_AFTER_CALL, (w) => usd(w.subCostPast40)],
    ['sdlc commands', (w) => num(w.sdlcCommands)],
    ['sdlc agent runs', (w) => num(w.sdlcAgentRuns)],
];

// Formats the lever section.
//
// Args:
//   window: the window object from buildWeeks.
// Returns:
//   array of text lines.
function renderLevers(window) {
    const out = ['', 'Levers (whole window; total cost ' + usd(window.totalCost) + ' (main ' + usd(window.mainCost)
        + ', sub-agents ' + usd(window.subCost) + '))'];
    const range = (l) => (l.low === l.high ? usd(l.high) : usd(l.low) + '-' + usd(l.high));
    for (const l of window.levers.levers) {
        out.push(l.applies
            ? '  ' + l.name + ': ' + range(l) + ' (' + pct(l.pctOfTotal) + ' of total cost), ' + l.confidence
            : '  ' + l.name + ': not applicable, ' + l.reason);
    }
    const c = window.levers.combined;
    out.push('  combined (levers applied in sequence, overlaps removed): ' + usd(c.low) + '-' + usd(c.high)
        + ' (' + pct(c.pctOfTotal) + ' of total cost at the high end)');
    out.push('');
    out.push('unpriced-model calls: ' + window.unpricedModelCalls + ' (cost not included)');
    out.push(NOTE_COUNTERFACTUAL);
    if (window.claudeAiOnly) out.push(NOTE_CLAUDE_AI);
    return out;
}

// Renders the weeks as a text table, one column per week, oldest first.
//
// Args:
//   weeks: rows from buildWeeks.
//   window: the window object from buildWeeks.
// Returns:
//   the table and lever section as a string.
function render(weeks, window) {
    const label = Math.max(...ROWS.map((r) => r[0].length));
    const head = ['week starting'.padEnd(label)].concat(weeks.map((w) => w.weekStart.padStart(10)));
    const lines = [head.join('  ')];
    for (const [name, fmt] of ROWS) {
        lines.push([name.padEnd(label)].concat(weeks.map((w) => fmt(w).padStart(10))).join('  '));
    }
    return lines.concat(renderLevers(window)).join('\n');
}

// Parses the command line.
//
// Args:
//   argv: arguments after the script name.
// Returns:
//   {dir, days, json} or {error}.
function parseArgs(argv) {
    const o = { dir: null, days: DEFAULT_DAYS, json: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--json') o.json = true;
        else if (a === '--days') {
            const n = Number(argv[++i]);
            if (!Number.isFinite(n) || n <= 0) return { error: '--days needs a number above 0' };
            o.days = n;
        } else if (a.startsWith('--') || o.dir) return { error: 'unknown argument' };
        else o.dir = a;
    }
    if (!o.dir) return { error: 'a transcripts directory is required' };
    return o;
}

// Fixed-label text for a failed run. Node fs messages embed full paths, so only a
// short error code is kept.
//
// Args:
//   e: the caught error.
// Returns:
//   'usage-fit: read error (CODE)\n', CODE being e.code when it is capital letters
//   and digits, else UNKNOWN.
function readErrorText(e) {
    const code = e && typeof e.code === 'string' && /^[A-Z0-9]{1,24}$/.test(e.code) ? e.code : CODE_UNKNOWN;
    return 'usage-fit: read error (' + code + ')\n';
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.error || !fs.existsSync(opts.dir)) {
        process.stderr.write((opts.error || 'transcripts directory not found') + '\nUsage: usage-fit.js <transcripts-dir> [--days N] [--json]\n');
        process.exit(EXIT_USAGE);
    }
    const { weeks, unknown, window } = await buildWeeks(opts.dir, { days: opts.days, now: Date.now() });
    if (unknown.size) {
        const kinds = [...unknown].map(([k, n]) => k + '=' + n).join(', ');
        process.stderr.write('Unrecognised transcript shapes: ' + kinds + '\n');
        process.exit(EXIT_UNRECOGNISED);
    }
    process.stdout.write((opts.json ? JSON.stringify({
        weeks,
        window,
        counterfactualNote: NOTE_COUNTERFACTUAL,
        claudeAiNote: window.claudeAiOnly ? NOTE_CLAUDE_AI : null,
    }, null, 2) : render(weeks, window)) + '\n');
}

if (require.main === module) {
    main().catch((e) => { process.stderr.write(readErrorText(e)); process.exit(EXIT_READ); });
}

module.exports = { buildWeeks };
