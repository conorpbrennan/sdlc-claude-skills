// Reads the Claude Code transcript tree into one in-memory record per main session.
// Port of tmp/sdlc-phase0/reference/extract.js. Read-only on the tree. Records hold
// paths and prompt hashes; prompt and user text is never kept beyond `firstUserText`.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { family, cost } = require('./prices.js');

const JSONL_SUFFIX = '.jsonl';
const META_SUFFIX = '.meta.json';
const SUBAGENTS_DIR = 'subagents';

const TYPE_ASSISTANT = 'assistant';
const TYPE_USER = 'user';
const BLOCK_TOOL_USE = 'tool_use';
const BLOCK_TOOL_RESULT = 'tool_result';
const BLOCK_TEXT = 'text';
const ATTACHMENT_QUEUED = 'queued_command';
const TOOL_AGENT = 'Agent';
const TOOL_BASH = 'Bash';
const TOOL_HANDBACK = 'SubagentHandback';
const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

const DEFAULT_AGENT_TYPE = 'general-purpose';
const EVENT_COMMIT_OK = 'COMMIT_OK';
const DENIAL_AGENT_TIER = 'agent-tier-gate';
const DENIAL_ORCHESTRATOR = 'orchestrator-mode';
const DENIAL_COMMIT_GATE = 'PRE_COMMIT_GATE';
const DENIAL_COMMIT_REVIEW = 'PRE_COMMIT_REVIEW';
const DENIAL_OTHER_HOOK = 'other-hook';

const STEP_RE = /\b(S\d+[a-z]?(?:\.\d+)?|[Ss]tep \d+[a-z]?)\b/;
const TIER_RE = /^\s*tier:\s*(?:opus|fable)\s*[:\-–—]\s*(\S.*)$/im;
const TEST_FILE_RE = /\b(?:test[_-][\w.-]*|[\w.-]+[._-]test)\.(?:py|js|ts|sh|cs)\b/gi;
const GIT_COMMIT_RE = /\bgit\s+commit\b/;
const COMMIT_RESULT_RE = /\[[^\]\s]+ [0-9a-f]{7,}\]/;
const INTERRUPT_RE = /\[Request interrupted by user/;
const TAG_START_RE = /^\s*</;
const CAVEAT_RE = /^Caveat:/;
const DENIAL_AGENT_TIER_RE = /Opus and Fable dispatches|Plan writing is for new plans/;
const DENIAL_ORCHESTRATOR_RE = /Orchestrator mode/;
const DENIAL_COMMIT_GATE_RE = /PRE_COMMIT_GATE/;
const DENIAL_COMMIT_REVIEW_RE = /PRE_COMMIT_REVIEW/;
const DENIAL_OTHER_HOOK_RE = /hook error|blocked by hook|Hook .*denied/i;

const USER_TEXT_MAX = 400;
const DESC_MAX = 120;
const TIER_MAX = 80;
const STEP_PROMPT_HEAD = 400;
const FINAL_MAX = 2200;
const FINAL_HEAD = 1400;
const FINAL_TAIL = 800;
const FINAL_JOIN = ' ... ';
const NO_UNTIL = '9999-01-01';

/**
 * Streams the lines of a file.
 *
 * Args:
 *   file: absolute path of a text file.
 * Returns:
 *   An async iterable of lines.
 */
function lines(file) {
    return readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
}

/**
 * Parses one JSONL line; a malformed line gives null.
 *
 * Args:
 *   line: one line of text.
 * Returns:
 *   The parsed object, or null when it is not a JSON object.
 */
function parseLine(line) {
    if (!line) return null;
    try {
        const d = JSON.parse(line);
        return d && typeof d === 'object' ? d : null;
    } catch (e) {
        return null;
    }
}

/**
 * Flattens message content (string, or blocks) to text.
 *
 * Args:
 *   c: a string, an array of blocks or strings, or anything else.
 * Returns:
 *   The text, blocks joined by newline; '' for anything else.
 */
function txt(c) {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
        return c.map((b) => {
            if (typeof b === 'string') return b;
            if (!b) return '';
            return b.text || (b.content ? txt(b.content) : '');
        }).join('\n');
    }
    return '';
}

/**
 * Classifies a hook denial from a tool_result text.
 *
 * Args:
 *   t: the text of an is_error tool_result.
 * Returns:
 *   The denial kind, or null when it is not a known denial.
 */
function denialKind(t) {
    if (DENIAL_AGENT_TIER_RE.test(t)) return DENIAL_AGENT_TIER;
    if (DENIAL_ORCHESTRATOR_RE.test(t)) return DENIAL_ORCHESTRATOR;
    if (DENIAL_COMMIT_GATE_RE.test(t)) return DENIAL_COMMIT_GATE;
    if (DENIAL_COMMIT_REVIEW_RE.test(t)) return DENIAL_COMMIT_REVIEW;
    if (DENIAL_OTHER_HOOK_RE.test(t)) return DENIAL_OTHER_HOOK;
    return null;
}

/**
 * Whether a timestamp is later than the `until` bound.
 *
 * Args:
 *   d: a parsed transcript line.
 *   untilMs: the bound, epoch ms.
 * Returns:
 *   True when the line has a timestamp after the bound.
 */
function afterUntil(d, untilMs) {
    return Boolean(d.timestamp) && Date.parse(d.timestamp) > untilMs;
}

/**
 * Counts an API message once per call.
 *
 * Args:
 *   m: the message object (has `id`).
 *   requestId: the line's requestId.
 *   seen: the per-call dedupe set, shared by main and sub files.
 * Returns:
 *   True the first time the message is seen, false for a repeat.
 */
function firstSight(m, requestId, seen) {
    const k = m.id + '|' + requestId;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
}

/**
 * The file path an edit tool call names.
 *
 * Args:
 *   input: the tool_use input object.
 * Returns:
 *   file_path, else notebook_path, else ''.
 */
function editPath(input) {
    return (input && (input.file_path || input.notebook_path)) || '';
}

/**
 * Caps a sub-agent's final message: first 1,400 and last 800 chars when over 2,200.
 *
 * Args:
 *   s: the final message text.
 * Returns:
 *   The text, cut when long.
 */
function capFinal(s) {
    const f = String(s);
    return f.length > FINAL_MAX ? f.slice(0, FINAL_HEAD) + FINAL_JOIN + f.slice(-FINAL_TAIL) : f;
}

/**
 * Builds the agent record for an Agent tool_use. Keeps only derived values.
 *
 * Args:
 *   b: the tool_use block.
 *   ts: the line timestamp.
 * Returns:
 *   The agent record.
 */
function buildAgent(b, ts) {
    const inp = b.input || {};
    const prompt = String(inp.prompt || '');
    const desc = String(inp.description || '');
    const tier = TIER_RE.exec(prompt);
    const step = STEP_RE.exec(desc) || STEP_RE.exec(prompt.slice(0, STEP_PROMPT_HEAD)) || [];
    const named = new Set((prompt.match(TEST_FILE_RE) || []).map((x) => x.toLowerCase()));
    return {
        id: b.id,
        ts,
        type: inp.subagent_type || DEFAULT_AGENT_TYPE,
        model: inp.model || null,
        desc: desc.slice(0, DESC_MAX),
        step: step[1] || null,
        tier: tier ? tier[1].slice(0, TIER_MAX) : null,
        promptLen: prompt.length,
        promptBytes: Buffer.byteLength(prompt, 'utf8'),
        promptHash: crypto.createHash('sha1').update(prompt).digest('hex'),
        testFilesNamed: named.size,
        isError: false,
    };
}

/**
 * Reads one sub-agent transcript.
 *
 * Args:
 *   file: absolute path of the sub-agent .jsonl.
 *   untilMs: lines after this are skipped.
 *   seen: the per-call dedupe set.
 * Returns:
 *   Promise of {cost, files, final, turns, toolCalls}.
 */
async function readSub(file, untilMs, seen) {
    const r = { cost: 0, files: new Set(), final: '', turns: 0, toolCalls: new Set() };
    let handback = '';
    let lastText = '';
    for await (const l of lines(file)) {
        const d = parseLine(l);
        if (!d || !d.message || afterUntil(d, untilMs)) continue;
        if (d.type !== TYPE_ASSISTANT) continue;
        const m = d.message;
        if (m.usage && firstSight(m, d.requestId, seen)) {
            r.cost += cost(m.model, m.usage);
            r.turns += 1;
        }
        const content = Array.isArray(m.content) ? m.content : [];
        for (const b of content) {
            if (!b || b.type !== BLOCK_TOOL_USE) continue;
            if (b.id) r.toolCalls.add(b.id);
            const fp = editPath(b.input);
            if (EDIT_TOOLS.includes(b.name) && fp) r.files.add(fp);
            if (b.name === TOOL_HANDBACK) handback = (b.input && b.input.message) || handback;
        }
        const t = content.filter((b) => b && b.type === BLOCK_TEXT).map((b) => b.text).join('\n');
        if (t) lastText = t;
    }
    return {
        cost: r.cost,
        files: [...r.files],
        final: capFinal(handback || lastText),
        turns: r.turns,
        toolCalls: r.toolCalls.size,
    };
}

/**
 * Reads the sub-agents of one main session.
 *
 * Args:
 *   mainFile: absolute path of the main .jsonl.
 *   untilMs: lines after this are skipped.
 *   seen: the per-call dedupe set.
 * Returns:
 *   Promise of [{toolUseId, agentType, cost, files, final, turns, toolCalls}].
 */
async function readSubs(mainFile, untilMs, seen) {
    const sdir = path.join(path.dirname(mainFile), path.basename(mainFile, JSONL_SUFFIX), SUBAGENTS_DIR);
    if (!fs.existsSync(sdir)) return [];
    const out = [];
    const names = fs.readdirSync(sdir).filter((x) => x.endsWith(JSONL_SUFFIX)).sort();
    for (const f of names) {
        let meta = {};
        try {
            meta = JSON.parse(fs.readFileSync(path.join(sdir, f.slice(0, -JSONL_SUFFIX.length) + META_SUFFIX), 'utf8'));
        } catch (e) { /* no meta: the sub stays unattached */ }
        const s = await readSub(path.join(sdir, f), untilMs, seen);
        out.push({ toolUseId: meta.toolUseId, agentType: meta.agentType, ...s });
    }
    return out;
}

/**
 * Applies a user entry's text to the session's user list.
 *
 * Args:
 *   c: the message content.
 *   d: the parsed line.
 *   ts: the line timestamp.
 *   users: array of {ts, t}, appended to.
 * Returns:
 *   Nothing.
 */
function collectUser(c, d, ts, users) {
    if (!(typeof c === 'string' || (Array.isArray(c) && c.some((b) => b && b.type === BLOCK_TEXT)))) return;
    const t = txt(c);
    if (!d.isMeta && t && !TAG_START_RE.test(t) && !CAVEAT_RE.test(t) && !d.toolUseResult) {
        users.push({ ts, t: t.slice(0, USER_TEXT_MAX) });
    }
}

/**
 * Reads one main session file and its sub-agents.
 *
 * Args:
 *   file: absolute path of the main .jsonl.
 *   untilMs: lines after this are skipped.
 *   seen: the per-call dedupe set.
 *   seenAgents: the per-call set of Agent tool_use ids.
 * Returns:
 *   Promise of a SessionRecord.
 */
async function readMain(file, untilMs, seen, seenAgents) {
    const R = {
        proj: path.basename(path.dirname(file)), sid: path.basename(file, JSONL_SUFFIX),
        first: null, last: null, famTurns: {}, famCost: {}, mainCost: 0, turns: 0, peakCtx: 0,
        firstUserText: '', interrupts: 0, agents: [], events: [], commits: 0, mainEdits: [], subs: [],
    };
    const users = [];
    const pending = {};
    for await (const l of lines(file)) {
        const d = parseLine(l);
        if (!d || !Object.prototype.hasOwnProperty.call(d, 'parentUuid')) continue;
        if (d.isSidechain || afterUntil(d, untilMs)) continue;
        const ts = d.timestamp;
        if (ts) { R.first = R.first || ts; R.last = ts; }
        if (d.attachment && d.attachment.type === ATTACHMENT_QUEUED) {
            const t = txt(d.attachment.prompt || d.attachment.content);
            if (t && !TAG_START_RE.test(t)) users.push({ ts, t: t.slice(0, USER_TEXT_MAX) });
            continue;
        }
        const m = d.message;
        if (!m) continue;
        const c = m.content;
        if (d.type === TYPE_ASSISTANT) {
            if (m.usage && firstSight(m, d.requestId, seen)) {
                const cst = cost(m.model, m.usage);
                const f = family(m.model);
                R.mainCost += cst;
                R.famCost[f] = (R.famCost[f] || 0) + cst;
                R.famTurns[f] = (R.famTurns[f] || 0) + 1;
                R.turns += 1;
                const ctx = (m.usage.input_tokens || 0) + (m.usage.cache_read_input_tokens || 0)
                    + (m.usage.cache_creation_input_tokens || 0);
                if (ctx > R.peakCtx) R.peakCtx = ctx;
            }
            for (const b of (Array.isArray(c) ? c : [])) {
                if (!b || b.type !== BLOCK_TOOL_USE) continue;
                const inp = b.input || {};
                if (b.name === TOOL_AGENT) {
                    if (seenAgents.has(b.id)) continue;
                    seenAgents.add(b.id);
                    const a = buildAgent(b, ts);
                    R.agents.push(a);
                    pending[b.id] = { agent: a };
                } else if (EDIT_TOOLS.includes(b.name)) {
                    R.mainEdits.push(editPath(inp));
                } else if (b.name === TOOL_BASH && GIT_COMMIT_RE.test(inp.command || '')) {
                    pending[b.id] = { commit: true };
                }
            }
        } else if (d.type === TYPE_USER) {
            collectUser(c, d, ts, users);
            for (const b of (Array.isArray(c) ? c : [])) {
                if (!b || b.type !== BLOCK_TOOL_RESULT) continue;
                const t = txt(b.content);
                const p = pending[b.tool_use_id];
                if (b.is_error) {
                    const k = denialKind(t);
                    if (k) R.events.push({ ts, k });
                }
                if (p && p.commit && !b.is_error && COMMIT_RESULT_RE.test(t)) {
                    R.commits += 1;
                    R.events.push({ ts, k: EVENT_COMMIT_OK });
                }
                if (p && p.agent) p.agent.isError = Boolean(b.is_error);
            }
        }
    }
    R.firstUserText = users.length ? users[0].t : '';
    R.interrupts = users.slice(1).filter((u) => INTERRUPT_RE.test(u.t)).length;
    R.subs = await readSubs(file, untilMs, seen);
    return R;
}

/**
 * Lists main session files with mtime >= since, oldest first.
 *
 * Args:
 *   root: the projects directory.
 *   sinceMs: lower bound on file mtime, epoch ms.
 * Returns:
 *   Absolute paths in ascending mtime order.
 */
function mainFiles(root, sinceMs) {
    const found = [];
    for (const p of fs.readdirSync(root)) {
        const dir = path.join(root, p);
        let names;
        try {
            if (!fs.statSync(dir).isDirectory()) continue;
            names = fs.readdirSync(dir);
        } catch (e) { continue; }
        for (const f of names) {
            if (!f.endsWith(JSONL_SUFFIX)) continue;
            const fp = path.join(dir, f);
            let st;
            try { st = fs.statSync(fp); } catch (e) { continue; }
            if (st.isFile() && st.mtimeMs >= sinceMs) found.push([st.mtimeMs, fp]);
        }
    }
    found.sort((a, b) => a[0] - b[0]);
    return found.map((x) => x[1]);
}

/**
 * Reads the transcript tree into one record per main session.
 *
 * Args:
 *   root: the projects directory (root/<dir>/*.jsonl).
 *   opts: {since, until}, each a Date, epoch ms or ISO string. `since` filters main
 *     file mtimes only; `until` drops any line stamped after it.
 * Returns:
 *   Promise of SessionRecord[], in ascending file mtime order.
 */
async function readSessions(root, opts) {
    const o = opts || {};
    const sinceMs = o.since === undefined ? 0 : new Date(o.since).getTime();
    const untilMs = new Date(o.until === undefined ? NO_UNTIL : o.until).getTime();
    const seen = new Set();
    const seenAgents = new Set();
    const out = [];
    for (const f of mainFiles(root, sinceMs)) out.push(await readMain(f, untilMs, seen, seenAgents));
    return out;
}

module.exports = { readSessions, denialKind };
