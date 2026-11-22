// Fable access signal: reads the tail of a session transcript and decides
// whether the Fable model is reachable from this session's backend.
// Decision table: docs/plans/fable-access-check/probe-findings.md.
// The newest decisive record wins, because a session can change backend part
// way. Never throws.
const fs = require('fs');

const VERDICT = Object.freeze({REACHABLE: 'reachable', UNREACHABLE: 'unreachable', UNKNOWN: 'unknown'});
const EVIDENCE = Object.freeze({
    FABLE_REPLY: 'fable-reply',
    REFUSED_403: 'refused-403',
    GEO_GLOBAL: 'geo-global',
    GEO_EMPTY: 'geo-empty',
    NO_SIGNAL: 'no-signal',
    UNREADABLE: 'unreadable',
    CHECK_ERROR: 'check-error',
});

// Bytes read from the end of the transcript; the head is never read.
const TAIL_BYTES = 1024 * 1024;

const FABLE_REPLY_MODEL = /^claude-fable/i;
const REFUSED_403 = /team not allowed to access model/i;
const FABLE_NAME = /fable/i;
// inference_geo: "global" is the direct backend, "" is the gateway (INFERRED).
const GEO_REACHABLE = 'global';
const GEO_UNREACHABLE = '';
// A failed Agent task-notification carries all three markers.
const TASK_NOTIFICATION_MARKER = '<task-notification>';
const STATUS_FAILED_MARKER = '<status>failed</status>';
const AGENT_SUMMARY_MARKER = '<summary>Agent "';
const AGENT_TOOL_NAME = 'Agent';

const FILE_READ_FLAG = 'r';
const TEXT_ENCODING = 'utf8';
const LINE_BREAK = '\n';
const TYPE_ASSISTANT = 'assistant';
const TYPE_USER = 'user';
const BLOCK_TOOL_USE = 'tool_use';
const BLOCK_TOOL_RESULT = 'tool_result';
const BLOCK_TEXT = 'text';

const UNREADABLE_SIGNAL = Object.freeze({verdict: VERDICT.UNKNOWN, evidence: EVIDENCE.UNREADABLE});
const NO_SIGNAL = Object.freeze({verdict: VERDICT.UNKNOWN, evidence: EVIDENCE.NO_SIGNAL});

/**
 * Builds a signal object.
 * Args:
 *   verdict: one of VERDICT.
 *   evidence: one of EVIDENCE.
 * Returns: {verdict, evidence}.
 */
function signal(verdict, evidence) {
    return {verdict, evidence};
}

/**
 * Reads at most the last TAIL_BYTES of a file, dropping a partial first line.
 * Args:
 *   filePath: absolute transcript path.
 * Returns: the tail text. Throws on any read error (the caller catches).
 */
function readTail(filePath) {
    const fd = fs.openSync(filePath, FILE_READ_FLAG);
    try {
        const size = fs.fstatSync(fd).size;
        const start = Math.max(0, size - TAIL_BYTES);
        const length = size - start;
        const buf = Buffer.alloc(length);
        let got = 0;
        while (got < length) {
            const n = fs.readSync(fd, buf, got, length - got, start + got);
            if (n <= 0) break;
            got += n;
        }
        let text = buf.toString(TEXT_ENCODING, 0, got);
        if (start > 0) {
            // The read began mid-file: the first line is probably cut.
            const nl = text.indexOf(LINE_BREAK);
            text = nl === -1 ? '' : text.slice(nl + 1);
        }
        return text;
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Parses transcript text into records, oldest first, skipping bad lines.
 * Args:
 *   text: JSONL text.
 * Returns: array of parsed objects.
 */
function parseRecords(text) {
    const records = [];
    for (const line of text.split(LINE_BREAK)) {
        if (!line) continue;
        try {
            const rec = JSON.parse(line);
            if (rec && typeof rec === 'object') records.push(rec);
        } catch (e) {
            // A malformed line carries no signal; skip it.
        }
    }
    return records;
}

/**
 * Returns the content blocks of a record's message, or [] when not an array.
 * Args:
 *   rec: a transcript record.
 * Returns: array of content blocks.
 */
function blocksOf(rec) {
    const content = rec.message && rec.message.content;
    return Array.isArray(content) ? content : [];
}

/**
 * Collects the ids of tool_use blocks named AGENT_TOOL_NAME in the tail.
 * Args:
 *   records: parsed records.
 * Returns: Set of tool_use ids.
 */
function agentToolUseIds(records) {
    const ids = new Set();
    for (const rec of records) {
        if (rec.type !== TYPE_ASSISTANT) continue;
        for (const b of blocksOf(rec)) {
            if (b && b.type === BLOCK_TOOL_USE && b.name === AGENT_TOOL_NAME && typeof b.id === 'string') ids.add(b.id);
        }
    }
    return ids;
}

/**
 * Flattens a tool_result's content (string or text blocks) to one string.
 * Args:
 *   content: the block's content field.
 * Returns: the text, '' when none.
 */
function resultText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.filter((c) => c && c.type === BLOCK_TEXT && typeof c.text === 'string').map((c) => c.text).join(LINE_BREAK);
}

/**
 * Tells whether text is a refusal: the 403 phrase and the Fable name together.
 * Args:
 *   text: text to test.
 * Returns: boolean.
 */
function isRefusalText(text) {
    return REFUSED_403.test(text) && FABLE_NAME.test(text);
}

/**
 * Classifies a user record: a failed Agent task-notification or an Agent
 * tool_result that holds a refusal. Bash, Read and Grep results never count.
 * Args:
 *   rec: a user record.
 *   agentIds: Set of Agent tool_use ids in the tail.
 * Returns: boolean, true when the record is a Fable refusal.
 */
function isUserRefusal(rec, agentIds) {
    const content = rec.message && rec.message.content;
    if (typeof content === 'string') {
        return content.startsWith(TASK_NOTIFICATION_MARKER) && content.includes(STATUS_FAILED_MARKER) &&
            content.includes(AGENT_SUMMARY_MARKER) && isRefusalText(content);
    }
    return blocksOf(rec).some((b) => b && b.type === BLOCK_TOOL_RESULT && agentIds.has(b.tool_use_id) &&
        isRefusalText(resultText(b.content)));
}

/**
 * Classifies an assistant record: Fable reply, geo, or not decisive.
 * Args:
 *   rec: an assistant record.
 * Returns: a signal, or null to skip and read older.
 */
function assistantSignal(rec) {
    const message = rec.message || {};
    if (typeof message.model === 'string' && FABLE_REPLY_MODEL.test(message.model)) {
        return signal(VERDICT.REACHABLE, EVIDENCE.FABLE_REPLY);
    }
    const geo = message.usage && message.usage.inference_geo;
    if (geo === GEO_REACHABLE) return signal(VERDICT.REACHABLE, EVIDENCE.GEO_GLOBAL);
    if (geo === GEO_UNREACHABLE) return signal(VERDICT.UNREACHABLE, EVIDENCE.GEO_EMPTY);
    return null;
}

/**
 * Reads the transcript tail and returns the newest decisive signal.
 * Args:
 *   transcriptPath: path of the session transcript (JSONL).
 * Returns: {verdict, evidence}. Unreadable path or read error gives
 *   unknown/unreadable; no decisive record gives unknown/no-signal. Never throws.
 */
function readAccessSignal(transcriptPath) {
    if (typeof transcriptPath !== 'string' || !transcriptPath) return {...UNREADABLE_SIGNAL};
    let text;
    try {
        text = readTail(transcriptPath);
    } catch (e) {
        return {...UNREADABLE_SIGNAL};
    }
    try {
        const records = parseRecords(text);
        const agentIds = agentToolUseIds(records);
        for (let i = records.length - 1; i >= 0; i--) {
            const rec = records[i];
            let found = null;
            if (rec.type === TYPE_ASSISTANT) found = assistantSignal(rec);
            else if (rec.type === TYPE_USER && isUserRefusal(rec, agentIds)) found = signal(VERDICT.UNREACHABLE, EVIDENCE.REFUSED_403);
            if (found) return found;
        }
        return {...NO_SIGNAL};
    } catch (e) {
        return signal(VERDICT.UNKNOWN, EVIDENCE.CHECK_ERROR);
    }
}

module.exports = {VERDICT, EVIDENCE, TAIL_BYTES, readAccessSignal};
