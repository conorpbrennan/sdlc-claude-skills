// Shared timing log for code review / TDD hooks.
// Appends JSON lines to ~/.claude/code-review-timing.jsonl (override with
// TIMING_LOG_PATH for tests). All writes are best-effort — any failure here
// is swallowed so a logging bug never blocks a commit.
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_MAX_LINES = 10000;
const ROTATE_HYSTERESIS = 100;

function logPath() {
    return process.env.TIMING_LOG_PATH ||
        path.join(os.homedir(), '.claude', 'code-review-timing.jsonl');
}

function logEvent(event, fields) {
    const record = { ts: new Date().toISOString(), event, ...(fields || {}) };
    const variant = process.env.CLAUDE_REVIEW_VARIANT;
    if (variant && !record.variant) record.variant = variant;
    const line = JSON.stringify(record) + '\n';
    const p = logPath();
    try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.appendFileSync(p, line);
        rotate(p, DEFAULT_MAX_LINES);
    } catch (e) { /* never fail a commit on logging */ }
}

function rotate(filePath, maxLines) {
    try {
        const stat = fs.statSync(filePath);
        // Cheap sniff: skip the re-read only when the file is obviously small.
        // A valid JSONL event is at least ~30 bytes, so anything under 100 KB
        // can't hold 10k real events.
        if (stat.size < 100 * 1024) return;
        const content = fs.readFileSync(filePath, 'utf-8');
        // Drop trailing empty line from split so we count real events only,
        // and write back with a proper trailing newline.
        const lines = content.split('\n');
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        if (lines.length > maxLines + ROTATE_HYSTERESIS) {
            fs.writeFileSync(filePath, lines.slice(-maxLines).join('\n') + '\n');
        }
    } catch (e) { /* non-fatal */ }
}

function timer() {
    const start = process.hrtime.bigint();
    return () => Number((process.hrtime.bigint() - start) / 1000000n);
}

module.exports = { logEvent, timer, rotate, logPath };

// CLI: `node timing-log.js <event> key=value ...` appends one event. Used by
// the review skill to record what the hooks cannot see: which agent ran,
// which round, the verdict, and the findings count.
if (require.main === module) {
    const [event, ...pairs] = process.argv.slice(2);
    if (!event) {
        console.error('usage: node timing-log.js <event> key=value ...');
        process.exit(2);
    }
    const fields = {};
    for (const pair of pairs) {
        const i = pair.indexOf('=');
        if (i <= 0) continue;
        const v = pair.slice(i + 1);
        fields[pair.slice(0, i)] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    }
    logEvent(event, fields);
}
