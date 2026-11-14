#!/usr/bin/env node
// UserPromptSubmit hook: injects a short end-of-turn check so the owner's two rules
// (never give up; do it to the best of your ability) are in view on every prompt.
// It only reminds; it proves nothing.
//
// Input (stdin): JSON with hook_event_name and optionally session_id and cwd.
// Output (stdout): {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit",
// "additionalContext":...}} or nothing. Fails open: any error prints nothing and
// exits 0. Step id: rule-reminder (area conduct), switched through /sdlc:steps.
'use strict';

const { stepState } = require('./lib/steps');

const STEP_ID = 'rule-reminder';
const EVENT = 'UserPromptSubmit';
const REMINDER = [
    'End-of-turn check:',
    '(a) No option question to the owner outside a gate (commit, push, secrets, delete or overwrite, spend).',
    '(b) Open the code behind every claim. Read delegated diffs yourself. Say what was verified and what was not.',
    '(c) A negative result is not a stop: state the next step and start it.',
].join('\n');

// Args:
//   input: the parsed stdin value.
// Returns: the hook output object, or null when nothing is to be printed.
function decide(input) {
    if (!input || typeof input !== 'object') return null;
    if (!stepState(STEP_ID, { cwd: input.cwd || process.cwd() }).on) return null;
    return { hookSpecificOutput: { hookEventName: EVENT, additionalContext: REMINDER } };
}

function main() {
    let raw = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => {
        try {
            const out = decide(JSON.parse(raw));
            if (out) process.stdout.write(JSON.stringify(out));
        } catch (e) {
            // Fail open: this hook is advice, it must never break a prompt.
        }
    });
}

main();
