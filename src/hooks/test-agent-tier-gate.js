// Tests for agent-tier-gate.js: the PreToolUse gate on the Agent tool that keeps
// volume work on Sonnet. Spawns the hook with stdin JSON and checks stdout.
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'agent-tier-gate.js');
const DENY_REASON = 'Opus dispatch without a stated reason. Opus is for plans, plan source review and judgement calls. Add a line "TIER: opus: <why>" to the prompt, or dispatch with model: "sonnet".';

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

// Runs the hook on a raw stdin string. Returns { status, out } with out parsed
// JSON, or '' when the hook printed nothing.
function run(stdin) {
    const r = spawnSync('node', [HOOK], { input: stdin, encoding: 'utf-8' });
    const text = (r.stdout || '').trim();
    return { status: r.status, out: text ? JSON.parse(text) : '' };
}

const call = (toolInput) => run(JSON.stringify({ tool_name: 'Agent', tool_input: toolInput }));
const decision = (r) => r.out && r.out.hookSpecificOutput && r.out.hookSpecificOutput.permissionDecision;

console.log('gated types, opus without a reason');
for (const type of [undefined, '', 'general-purpose', 'Explore', 'Plan']) {
    const r = call({ subagent_type: type, model: 'opus', prompt: 'do the thing' });
    assert(`deny opus, type=${JSON.stringify(type)}`, decision(r), 'deny');
    assert(`deny reason, type=${JSON.stringify(type)}`,
        r.out.hookSpecificOutput.permissionDecisionReason, DENY_REASON);
}
assert('deny fable', decision(call({ subagent_type: 'Plan', model: 'fable', prompt: 'x' })), 'deny');
assert('deny full opus id', decision(call({ subagent_type: 'Plan', model: 'claude-opus-4-1', prompt: 'x' })), 'deny');
assert('deny uppercase OPUS', decision(call({ subagent_type: 'Plan', model: 'OPUS', prompt: 'x' })), 'deny');
assert('deny empty reason text',
    decision(call({ subagent_type: 'Plan', model: 'opus', prompt: 'TIER: opus:   ' })), 'deny');

console.log('gated types, opus with a reason');
const withReason = (line, model) =>
    call({ subagent_type: 'general-purpose', model: model || 'opus', prompt: `intro\n${line}\nmore` });
assert('allow colon form', withReason('TIER: opus: plan source review').out, '');
assert('allow dash form', withReason('TIER: opus - judgement call').out, '');
assert('allow lowercase tier', withReason('tier: Opus: why').out, '');
assert('allow fable reason', withReason('TIER: fable: why', 'fable').out, '');

console.log('gated types, model missing or cheap');
const rewritten = call({ subagent_type: 'Explore', prompt: 'look', description: 'd' });
assert('missing model rewritten to sonnet', rewritten.out, {
    hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { subagent_type: 'Explore', prompt: 'look', description: 'd', model: 'sonnet' },
    },
});
for (const m of ['inherit', 'INHERIT', ' inherit ']) {
    const r = call({ subagent_type: 'Plan', model: m, prompt: 'x' });
    assert(`inherit rewritten to sonnet: ${JSON.stringify(m)}`, r.out.hookSpecificOutput.updatedInput.model, 'sonnet');
}
for (const m of [42, true, ['opus'], {}]) {
    assert(`non-string model passes through: ${JSON.stringify(m)}`, call({ subagent_type: 'Plan', model: m, prompt: 'x' }).out, '');
}
assert('missing type rewritten', decision(call({ prompt: 'x' })), 'allow');
assert('sonnet passes', call({ subagent_type: 'Plan', model: 'sonnet', prompt: 'x' }).out, '');
assert('haiku passes', call({ subagent_type: 'Plan', model: 'haiku', prompt: 'x' }).out, '');

console.log('ungated types');
for (const type of ['sdlc:code-reviewer-deep', 'sdlc:code-reviewer', 'fork', 'claude-code-guide',
    'statusline-setup', 'my-own-agent']) {
    assert(`opus passes untouched, ${type}`, call({ subagent_type: type, model: 'opus', prompt: 'x' }).out, '');
    assert(`no model untouched, ${type}`, call({ subagent_type: type, prompt: 'x' }).out, '');
}

console.log('fail open');
assert('bad JSON', run('not json'), { status: 0, out: '' });
assert('empty stdin', run(''), { status: 0, out: '' });
assert('no tool_input', run(JSON.stringify({ tool_name: 'Agent' })), { status: 0, out: '' });
assert('exit code on deny', call({ subagent_type: 'Plan', model: 'opus', prompt: 'x' }).status, 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
