// Tests for lib/hook-output.js: the one shape a PreToolUse hook prints to block.
//
// Written before the implementation. Every PreToolUse hook blocked with the
// legacy `{decision: 'block', reason, systemMessage}`. Claude sees only the
// reason; systemMessage is shown to the user. So the marker recipe, the rounds
// policy, the timing command and the gap-patch thresholds -- all carried in
// systemMessage -- never reached the model the review gate was talking to.
// Checked against the harness on 2026-10-12: given both shapes, Claude saw
// `permissionDecisionReason` and neither the legacy reason nor systemMessage.
// So the deny reason carries the short reason AND the full instructions.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const path = require('path');

const hookOutput = require('./lib/hook-output.js');

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        console.log(`    expected: ${e}`);
        console.log(`    actual:   ${a}`);
        failed++;
    }
}

console.log('hook-output tests');
console.log('=================');

console.log('\n[UNIT] deny() speaks the current PreToolUse schema:');
{
    const out = hookOutput.deny('Code review required before commit', 'PRE_COMMIT_REVIEW: run the review, then printf ...');
    assert('hookEventName is PreToolUse', out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert('permissionDecision is deny', out.hookSpecificOutput.permissionDecision, 'deny');
    assert('the reason Claude sees carries the short reason and the instructions',
        out.hookSpecificOutput.permissionDecisionReason,
        'Code review required before commit\nPRE_COMMIT_REVIEW: run the review, then printf ...');
    // Kept for the transition (docs/plans/sdlc-hardening.md step 4a).
    assert('legacy decision kept', out.decision, 'block');
    assert('legacy reason kept short', out.reason, 'Code review required before commit');
    assert('legacy systemMessage kept', out.systemMessage, 'PRE_COMMIT_REVIEW: run the review, then printf ...');
}

console.log('\n[UNIT] deny() does not repeat a reason the message already states:');
{
    const out = hookOutput.deny('Same diff', 'PRE_COMMIT_REVIEW: Same diff. Retry.');
    assert('message alone when it contains the reason',
        out.hookSpecificOutput.permissionDecisionReason, 'PRE_COMMIT_REVIEW: Same diff. Retry.');
}

console.log('\n[UNIT] deny() with no message:');
{
    const out = hookOutput.deny('Git commits must include a Co-Authored-By trailer');
    assert('reason alone', out.hookSpecificOutput.permissionDecisionReason,
        'Git commits must include a Co-Authored-By trailer');
    assert('no systemMessage key', Object.prototype.hasOwnProperty.call(out, 'systemMessage'), false);
}

// Guard: a wired PreToolUse hook that builds the legacy block object by hand
// sends Claude the short reason only, which is the bug this file exists for.
// The crash handlers are registered before any require, so they cannot use the
// lib; they must still carry permissionDecisionReason.
console.log('\n[GUARD] Every wired PreToolUse hook blocks through the deny shape:');
{
    const wiring = require('../../hooks/hooks.json').hooks.PreToolUse || [];
    const files = [];
    for (const m of wiring) {
        for (const h of m.hooks) {
            const hit = /src\/hooks\/([\w-]+\.js)/.exec(h.command);
            if (hit) files.push(hit[1]);
        }
    }
    assert('PreToolUse hooks found in hooks.json', files.length > 0, true);
    for (const f of files) {
        const text = fs.readFileSync(path.join(__dirname, f), 'utf-8');
        assert(f + ': no hand-built legacy block object',
            /JSON\.stringify\(\{\s*decision:\s*'block'/.test(text), false);
        const handler = /process\.on\('uncaughtException'[\s\S]*?\n\}\);/.exec(text);
        if (handler) {
            assert(f + ': crash handler denies with permissionDecisionReason',
                /permissionDecision:\s*'deny'/.test(handler[0]) && /permissionDecisionReason/.test(handler[0]), true);
        }
    }
}

console.log('\n=================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
