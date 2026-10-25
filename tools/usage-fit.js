#!/usr/bin/env node
// Usage indicator report, read from local Claude Code transcripts
// (~/.claude/projects/**/*.jsonl). Per 7-day week it reports where main-session
// cost sits: context size, /clear resets, Opus work turns, long sub-agent runs and
// prompt-cache rebuilds. Step 2 of the usage-fit feature turns these into levers.
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
            if (all.length > SUB_LONG_RUN_CALLS) w.subRunsOver100 += 1;
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
                if (family(e.model) === FAMILY_OPUS) {
                    w.opusCost += c;
                    if (classifyTurn(e.tools).group === GROUP_WORK) w.opusWorkCost += c;
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
                        w.rebuildCost += cost(e.model, { cache_creation_input_tokens: Math.min(cc, prev.ctx) });
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
    }
    return { weeks, unknown };
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
    ['sdlc commands', (w) => num(w.sdlcCommands)],
    ['sdlc agent runs', (w) => num(w.sdlcAgentRuns)],
];

// Renders the weeks as a text table, one column per week, oldest first.
//
// Args:
//   weeks: rows from buildWeeks.
// Returns:
//   the table as a string.
function render(weeks) {
    const label = Math.max(...ROWS.map((r) => r[0].length));
    const head = ['week starting'.padEnd(label)].concat(weeks.map((w) => w.weekStart.padStart(10)));
    const lines = [head.join('  ')];
    for (const [name, fmt] of ROWS) {
        lines.push([name.padEnd(label)].concat(weeks.map((w) => fmt(w).padStart(10))).join('  '));
    }
    return lines.join('\n');
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
    const { weeks, unknown } = await buildWeeks(opts.dir, { days: opts.days, now: Date.now() });
    if (unknown.size) {
        const kinds = [...unknown].map(([k, n]) => k + '=' + n).join(', ');
        process.stderr.write('Unrecognised transcript shapes: ' + kinds + '\n');
        process.exit(EXIT_UNRECOGNISED);
    }
    process.stdout.write((opts.json ? JSON.stringify({ weeks }, null, 2) : render(weeks)) + '\n');
}

if (require.main === module) {
    main().catch((e) => { process.stderr.write(readErrorText(e)); process.exit(EXIT_READ); });
}

module.exports = { buildWeeks };
