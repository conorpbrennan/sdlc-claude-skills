#!/usr/bin/env node
// PostToolUse hook on Read: inside a sub-agent, a whole-file text read over
// lib/read-trim.js MAX_CHARS is cut to whole lines plus a note. Every Read result
// stays in context and is re-read each turn, so oversized ones are costly.
// Ranged reads (offset or limit) are never trimmed. Fail open: any parse error or
// odd input prints nothing and exits 0.
'use strict';

const { trimRead } = require('./lib/read-trim');
const { stepState } = require('./lib/steps');

const TOOL_READ = 'Read';
const STEP_ID = 'read-trim';

// Asks the steps resolver whether this hook's step is off. Warnings go to stderr.
//
// Args:
//   cwd: the session's working directory, or undefined.
// Returns:
//   true when the step is off. A resolver failure counts as on (unchanged behaviour).
function stepIsOff(cwd) {
    try {
        const step = stepState(STEP_ID, { cwd: cwd || process.cwd() });
        for (const w of step.warnings) process.stderr.write(`read-trim: ${w}\n`);
        return !step.on;
    } catch (e) {
        return false;
    }
}

// Decides what to print for one Read result.
//
// Args:
//   input: the parsed hook stdin object.
// Returns:
//   the object to print, or null to leave the result untouched.
function decide(input) {
    if (!input || input.tool_name !== TOOL_READ) return null;
    if (typeof input.agent_id !== 'string' || !input.agent_id) return null;
    const toolInput = input.tool_input;
    if (!toolInput || typeof toolInput !== 'object') return null;
    if (toolInput.offset != null || toolInput.limit != null) return null;
    if (stepIsOff(input.cwd)) return null;
    const trimmed = trimRead(input.tool_response);
    if (!trimmed) return null;
    return { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: trimmed } };
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
    try {
        const out = decide(JSON.parse(raw));
        if (out) process.stdout.write(JSON.stringify(out));
    } catch (e) {
        // Fail open: trimming is an optimisation and must never break a Read.
    }
});
