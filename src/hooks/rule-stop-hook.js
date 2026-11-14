#!/usr/bin/env node
// Stop hook: block a turn that ends by asking the owner to choose between my own
// options, unless the question is about a gate (commit, push, secrets, deleting or
// overwriting, spend). It makes the owner's rule 1 (never give up) hold without the
// model remembering it.
//
// Input (stdin): JSON with transcript_path, stop_hook_active, and optionally
// session_id and cwd. Output (stdout): {"decision":"block","reason":...} or nothing.
// Every block appends one JSON line to sdlc-rule-stop.log in the config dir.
// Fails open: any error prints nothing and exits 0. Step id: rule-stop-hook
// (area conduct), switched through /sdlc:steps.
'use strict';

const fs = require('fs');
const path = require('path');
const { stepState, configDir } = require('./lib/steps');

const STEP_ID = 'rule-stop-hook';
const LOG_NAME = 'sdlc-rule-stop.log';
const TAIL_LINES = 3;
const LOG_TAIL_CHARS = 200;
const ROLE_ASSISTANT = 'assistant';
const PART_TEXT = 'text';
const DECISION_BLOCK = 'block';

// The tail ends in a question that offers the owner a choice of my own options.
const OPTION_QUESTION = /(do you want me to|should i|shall i|which (one|option|should)|would you like me to|want me to|do you prefer|let me know which)[^.?!]*\?\s*$/i;
// A gate: the owner's call to make (commit, push, secrets, delete or overwrite, spend, access).
const GATE = /(commit|push|secret|credential|password|token|delete|deleting|overwrit|force|spend|permission|approve|approval|\bsso\b|login)/i;
const REASON = 'Rule 1: your last line asks the owner to choose between your own options and names no gate ' +
    '(commit, push, secrets, delete/overwrite, spend). Pick the next step, say why in one line, and start it.';

// Args:
//   file: path to a JSONL transcript.
// Returns: the text of the last assistant message that has any, trimmed, or ''.
// Throws when the file cannot be read.
function lastAssistantText(file) {
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        let row;
        try { row = JSON.parse(lines[i]); } catch (e) { continue; }
        if (!row || typeof row !== 'object') continue;
        const msg = row.message || row;
        if ((msg.role || row.type) !== ROLE_ASSISTANT) continue;
        const content = msg.content;
        const text = typeof content === 'string' ? content
            : (Array.isArray(content) ? content : []).filter(p => p && p.type === PART_TEXT).map(p => p.text).join('\n');
        if (text.trim()) return text.trim();
    }
    return '';
}

// Args:
//   text: the assistant's last message.
// Returns: the last TAIL_LINES non-empty lines joined by a space.
function tailOf(text) {
    return text.split('\n').filter(l => l.trim()).slice(-TAIL_LINES).join(' ');
}

// The question and the gate words are tested against the same tail.
//
// Args:
//   tail: the output of tailOf.
// Returns: the block decision object, or null when the turn may end.
function decide(tail) {
    if (OPTION_QUESTION.test(tail) && !GATE.test(tail)) return { decision: DECISION_BLOCK, reason: REASON };
    return null;
}

// Appends one JSON line to the block log. A failure is swallowed: logging never
// changes the decision.
//
// Args:
//   tail: the tail text that was blocked.
//   sessionId: the session id, or undefined.
function logBlock(tail, sessionId) {
    try {
        const row = { ts: new Date().toISOString() };
        if (sessionId) row.session_id = sessionId;
        row.tail = tail.slice(-LOG_TAIL_CHARS);
        fs.appendFileSync(path.join(configDir(), LOG_NAME), JSON.stringify(row) + '\n');
    } catch (e) {
        // Fail open: the log is an aid for tuning the regex, not part of the gate.
    }
}

// Args:
//   input: the parsed stdin object.
// Returns: the decision object to print, or null for nothing.
function handle(input) {
    if (!input || typeof input !== 'object' || input.stop_hook_active) return null;
    if (typeof input.transcript_path !== 'string' || !input.transcript_path) return null;
    if (!stepState(STEP_ID, { cwd: input.cwd || process.cwd() }).on) return null;
    const tail = tailOf(lastAssistantText(input.transcript_path));
    const out = decide(tail);
    if (out) logBlock(tail, input.session_id);
    return out;
}

function main() {
    let raw = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => {
        try {
            const out = handle(JSON.parse(raw));
            if (out) process.stdout.write(JSON.stringify(out));
        } catch (e) {
            // Fail open: print nothing.
        }
    });
}

if (require.main === module) main();
module.exports = { decide, tailOf, lastAssistantText };
