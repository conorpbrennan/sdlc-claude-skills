// Reads the Claude Code transcript tree into one in-memory record per main session.
// Port of tmp/sdlc-phase0/reference/extract.js. Read-only on the tree. Records hold
// paths and prompt hashes; prompt and user text is never kept beyond `firstUserText`.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
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

// Classification and signal rules (port of tmp/sdlc-phase0/reference/classify.js and analyze.js).
const IMPL_TYPE = 'sdlc:implementer';
const GENERAL_TYPE = DEFAULT_AGENT_TYPE;
const IMPL_LIKE_RE = /build|implement|\bS\d+|step|fix|add |wire|refactor|port|write/i;
const REVIEWER_RE = /^sdlc:code-reviewer/;
const ORCH_FIRST_RE = /HANDOFF-|\/sdlc:orchestrate|plan-spec|tracker\.md|\bRESUME\b|implementation-plan/i;
const SENSITIVE_RE = /src\/hooks\/|\/hooks\/|gate|auth|secret|security|credential|permission/i;
const PARTIAL_RE = /\bPARTIAL\b/;
const PARTIAL_NEG_RE = /(nothing|not|no|never|none|without|neither)\b[^.\n]{0,30}PARTIAL/i;
const TDD_FAIL_RE = /TDD_GATE:\s*FAIL/;
const TDD_PASS_RE = /TDD_GATE:\s*PASS/;
const SRC_RE = /\.(py|js|ts|tsx|jsx|cs|sql|sh|java|go|rs|html|css)$/i;
const NOT_SRC_RE = /scratchpad|^\/tmp\/|\.claude\//;
const DEV_DIR = path.join(os.homedir(), 'dev');

const IMPL_PROMPT_MIN = 1500;
const MIXED_SHARE = 0.1;
const MIXED_EXCLUDED_FAMILY = 'haiku';
const FAMILY_NONE = 'none';
const ORCH_MIN_DISPATCHES = 2;
const TIER_HIGH = 'high';
const TIER_LOW = 'low';
const TIER_MIN_SIGNALS = 2;
const TIER_STEPS = 11;
const TIER_FILES = 21;
const TIER_REVIEWS = 6;
const TIER_REPOS = 2;
const TIER_PEAK_CTX = 250000;
const BLOCK_LOOP_RUN = 3;
const CYCLE_OPEN = 'open';
const CYCLE_MAX_KEY = '4+';
const CYCLE_MAX = 4;
const DENY_RETRY_MS = 120000;
const IDENTICAL_PROMPT_MS = 60000;

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

/**
 * True when the dispatch is an implementer: the plugin agent, or a long general-purpose
 * prompt whose description reads like a build step.
 *
 * Args:
 *   agent: an agent record ({type, desc, promptLen}).
 * Returns:
 *   boolean.
 */
function isImplementer(agent) {
    return agent.type === IMPL_TYPE
        || (agent.type === GENERAL_TYPE && IMPL_LIKE_RE.test(agent.desc) && agent.promptLen > IMPL_PROMPT_MIN);
}

/**
 * True when the dispatch is a code reviewer (any `sdlc:code-reviewer*` type).
 *
 * Args:
 *   agent: an agent record.
 * Returns:
 *   boolean.
 */
function isReviewer(agent) {
    return REVIEWER_RE.test(agent.type);
}

/**
 * True when the text reports PARTIAL and does not negate it ("nothing PARTIAL").
 *
 * Args:
 *   text: a sub-agent final report.
 * Returns:
 *   boolean.
 */
function isPartial(text) {
    const t = String(text || '');
    return PARTIAL_RE.test(t) && !PARTIAL_NEG_RE.test(t);
}

/**
 * The first directory under ~/dev of a path, or null.
 *
 * Args:
 *   file: an absolute path.
 * Returns:
 *   The repo directory name or null.
 */
function repoOf(file) {
    const rel = path.relative(DEV_DIR, file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep)[0] || null;
}

/**
 * Scores one session record: dominant model family, orchestration flag and complexity tier.
 *
 * Args:
 *   rec: a session record from readSessions.
 * Returns:
 *   {main, mixed, orch, tier, sigN, nImpl, nRev}.
 */
function classify(rec) {
    const fam = rec.famTurns || {};
    const total = Object.values(fam).reduce((a, b) => a + b, 0) || 1;
    const sorted = Object.entries(fam).sort((a, b) => b[1] - a[1]);
    const main = sorted.length ? sorted[0][0] : FAMILY_NONE;
    const mixed = sorted.length > 1 && sorted[1][1] / total >= MIXED_SHARE && sorted[1][0] !== MIXED_EXCLUDED_FAMILY;
    const nImpl = rec.agents.filter(isImplementer).length;
    const nRev = rec.agents.filter(isReviewer).length;
    const orch = nImpl + nRev >= ORCH_MIN_DISPATCHES || (ORCH_FIRST_RE.test(rec.firstUserText || '') && nImpl + nRev >= 1);
    const subFiles = new Set();
    for (const s of rec.subs) for (const f of s.files) subFiles.add(f);
    const all = [...subFiles, ...rec.mainEdits];
    const repos = new Set(all.map(repoOf).filter(Boolean));
    const fired = [
        nImpl >= TIER_STEPS, subFiles.size >= TIER_FILES, nRev >= TIER_REVIEWS,
        all.some((f) => SENSITIVE_RE.test(f)), repos.size >= TIER_REPOS, rec.peakCtx >= TIER_PEAK_CTX,
    ];
    const sigN = fired.filter(Boolean).length;
    return { main, mixed, orch, tier: sigN >= TIER_MIN_SIGNALS ? TIER_HIGH : TIER_LOW, sigN, nImpl, nRev };
}

/**
 * Counts block loops: a run of one non-COMMIT_OK denial kind reaching exactly 3,
 * reset by COMMIT_OK.
 *
 * Args:
 *   events: [{k}] in file order.
 * Returns:
 *   The loop count.
 */
function countBlockLoops(events) {
    let loops = 0;
    let run = 0;
    let last = null;
    for (const e of events) {
        if (e.k === EVENT_COMMIT_OK) { run = 0; last = null; continue; }
        if (e.k === last) run += 1; else { run = 1; last = e.k; }
        if (run === BLOCK_LOOP_RUN) loops += 1;
    }
    return loops;
}

/**
 * Walks non-denied reviewer dispatches and COMMIT_OK events in time order. A commit
 * with reviews pending closes a cycle into its bucket; a commit with none closes none;
 * pending reviews at the end are one open cycle. At equal time, dispatches come first.
 *
 * Args:
 *   rec: a session record.
 * Returns:
 *   {'1', '2', '3', '4+', open} counts.
 */
function reviewCycles(rec) {
    const out = { 1: 0, 2: 0, 3: 0, [CYCLE_MAX_KEY]: 0, [CYCLE_OPEN]: 0 };
    const items = [
        ...rec.agents.filter((a) => isReviewer(a) && !a.isError).map((a) => ({ t: Date.parse(a.ts), rev: true })),
        ...rec.events.filter((e) => e.k === EVENT_COMMIT_OK).map((e) => ({ t: Date.parse(e.ts), rev: false })),
    ].sort((a, b) => a.t - b.t);
    let pending = 0;
    for (const it of items) {
        if (it.rev) { pending += 1; continue; }
        if (pending > 0) out[pending >= CYCLE_MAX ? CYCLE_MAX_KEY : pending] += 1;
        pending = 0;
    }
    if (pending > 0) out[CYCLE_OPEN] += 1;
    return out;
}

/**
 * Counts errored Agent calls whose next Agent call (file order, any outcome) has the
 * same type and starts no more than 120 s later.
 *
 * Args:
 *   agents: agent records in file order.
 * Returns:
 *   The pair count.
 */
function countDenyRetryPairs(agents) {
    let n = 0;
    for (let i = 0; i + 1 < agents.length; i += 1) {
        const a = agents[i];
        const b = agents[i + 1];
        if (a.isError && a.type === b.type && Date.parse(b.ts) - Date.parse(a.ts) <= DENY_RETRY_MS) n += 1;
    }
    return n;
}

/**
 * Counts non-error calls whose prompt hash equals an earlier non-error call's, at most
 * 60 s before. Each later call counts once.
 *
 * Args:
 *   agents: agent records in file order.
 * Returns:
 *   The pair count.
 */
function countIdenticalPromptPairs(agents) {
    const live = agents.filter((a) => !a.isError);
    let n = 0;
    for (let i = 1; i < live.length; i += 1) {
        const t = Date.parse(live[i].ts);
        const hit = live.slice(0, i).some((e) => e.promptHash === live[i].promptHash && t - Date.parse(e.ts) <= IDENTICAL_PROMPT_MS);
        if (hit) n += 1;
    }
    return n;
}

/**
 * Failure and process signals for one session record.
 *
 * Args:
 *   rec: a session record from readSessions.
 * Returns:
 *   {steps, partial, tddFail, tddPass, interrupts, mainSrcEdits, blockLoops, commits,
 *    reviews, peakCtx, mainCost, subCost, reviewCycles, denyRetryPairs, identicalPromptPairs}.
 */
function signals(rec) {
    const byId = {};
    for (const s of rec.subs) byId[s.toolUseId] = s;
    const impl = rec.agents.filter(isImplementer);
    const rev = rec.agents.filter(isReviewer);
    let partial = 0;
    for (const a of impl) if (byId[a.id] && isPartial(byId[a.id].final)) partial += 1;
    let tddFail = 0;
    let tddPass = 0;
    for (const a of rev) {
        const s = byId[a.id];
        if (!s) continue;
        if (TDD_FAIL_RE.test(s.final)) tddFail += 1;
        else if (TDD_PASS_RE.test(s.final)) tddPass += 1;
    }
    return {
        steps: impl.length,
        partial,
        tddFail,
        tddPass,
        interrupts: rec.interrupts,
        mainSrcEdits: rec.mainEdits.filter((f) => SRC_RE.test(f) && !NOT_SRC_RE.test(f)).length,
        blockLoops: countBlockLoops(rec.events),
        commits: rec.commits,
        reviews: rev.length,
        peakCtx: rec.peakCtx,
        mainCost: rec.mainCost,
        subCost: rec.subs.reduce((a, s) => a + s.cost, 0),
        reviewCycles: reviewCycles(rec),
        denyRetryPairs: countDenyRetryPairs(rec.agents),
        identicalPromptPairs: countIdenticalPromptPairs(rec.agents),
    };
}

const COUNT_KEYS = ['partial', 'tddFail', 'interrupts', 'mainSrcEdits', 'blockLoops', 'denyRetryPairs', 'identicalPromptPairs'];
const SESSION_KEYS = ['partial', 'tddFail', 'interrupts', 'mainSrcEdits', 'blockLoops'];
const CYCLE_KEYS = ['1', '2', '3', CYCLE_MAX_KEY, CYCLE_OPEN];
const GROUP_MIXED = 'mixed';
const GROUP_BEFORE = 'before ';
const GROUP_AFTER = 'after ';
const PER10_SCALE = 10;
const P50_FRACTION = 0.5;

/**
 * Divides, giving null on a zero denominator.
 *
 * Args:
 *   num: the numerator.
 *   den: the denominator.
 * Returns:
 *   num / den, or null when den is 0.
 */
function ratio(num, den) {
    return den === 0 ? null : num / den;
}

/**
 * Builds one report row from the scored sessions of one group.
 *
 * Args:
 *   group: the group name.
 *   scored: [signals()] of the group's sessions.
 * Returns:
 *   A Row (see summarise).
 */
function buildRow(group, scored) {
    const sum = (f) => scored.reduce((a, s) => a + f(s), 0);
    const sessions = scored.length;
    const steps = sum((s) => s.steps);
    const commits = sum((s) => s.commits);
    const reviews = sum((s) => s.reviews);
    const counts = {};
    for (const k of COUNT_KEYS) counts[k] = sum((s) => s[k]);
    const sessionsWith = {};
    for (const k of SESSION_KEYS) sessionsWith[k] = scored.filter((s) => s[k] > 0).length;
    const per10 = {};
    for (const k of COUNT_KEYS) {
        const r = ratio(counts[k], steps);
        per10[k] = r === null ? null : PER10_SCALE * counts[k] / steps;
    }
    const share = {};
    for (const k of SESSION_KEYS) share[k] = ratio(sessionsWith[k], sessions);
    const main = sum((s) => s.mainCost);
    const sub = sum((s) => s.subCost);
    const reviewCycles = {};
    for (const k of CYCLE_KEYS) reviewCycles[k] = sum((s) => s.reviewCycles[k]);
    const ctx = scored.map((s) => s.peakCtx).sort((a, b) => a - b);
    return {
        group, sessions, steps, commits, reviews, counts, sessionsWith, per10, share,
        cost: { main, sub, perCommit: ratio(main + sub, commits), mainPerCommit: ratio(main, commits) },
        reviewsPerCommit: ratio(reviews, commits),
        reviewCycles,
        peakCtx: { p50: ctx[Math.floor(P50_FRACTION * (ctx.length - 1))], max: ctx[ctx.length - 1] },
    };
}

/**
 * Groups the orchestrated sessions into report rows. Values are unrounded.
 *
 * Args:
 *   records: session records from readSessions.
 *   opts: {splitAt}, epoch ms; when set, each group name is prefixed 'before ' (session
 *     ended before splitAt) or 'after '.
 * Returns:
 *   {groups: Row[]} sorted by group. Row = {group, sessions, steps, commits, reviews,
 *   counts, sessionsWith, per10, share, cost{main, sub, perCommit, mainPerCommit},
 *   reviewsPerCommit, reviewCycles, peakCtx{p50, max}}.
 */
function summarise(records, opts) {
    const splitAt = (opts || {}).splitAt;
    const by = new Map();
    for (const rec of records) {
        const c = classify(rec);
        if (!c.orch) continue;
        let name = c.mixed ? GROUP_MIXED : c.main + ' ' + c.tier;
        if (splitAt !== undefined && splitAt !== null) name = (Date.parse(rec.last) < splitAt ? GROUP_BEFORE : GROUP_AFTER) + name;
        if (!by.has(name)) by.set(name, []);
        by.get(name).push(signals(rec));
    }
    const groups = [...by.keys()].sort().map((name) => buildRow(name, by.get(name)));
    return { groups };
}

module.exports = { readSessions, denialKind, classify, signals, isImplementer, isPartial, summarise };
