#!/usr/bin/env node
// PostToolUse hook on Read: inside a sub-agent, a whole-file text read over
// lib/read-trim.js MAX_CHARS is cut to whole lines plus a note. Every Read result
// stays in context and is re-read each turn, so oversized ones are costly.
// Ranged reads (offset or limit) are never trimmed. Fail open: any parse error or
// odd input prints nothing and exits 0.
'use strict';

const { trimRead } = require('./lib/read-trim');

const TOOL_READ = 'Read';

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
