// Tests for agent-tier-gate.js: the PreToolUse gate on the Agent tool that keeps
// volume work on Sonnet. Spawns the hook with stdin JSON and checks stdout.
// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'agent-tier-gate.js');
const { BUDGET_BLOCK, BUDGET_MARKER } = require('./lib/context-budget.js');
const { agent } = require('./lib/plugin-names.js');
const CATEGORIES = ['plan writing', 'plan source review', 'fail triage', 'user asked'];
const namesCategories = (r) => CATEGORIES.every((c) => r.out.hookSpecificOutput.permissionDecisionReason.includes(c));

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
for (const type of [undefined, '', 'general-purpose', 'Explore', 'Plan', 'implementer', agent('implementer')]) {
    const r = call({ subagent_type: type, model: 'opus', prompt: 'do the thing' });
    assert(`deny opus, type=${JSON.stringify(type)}`, decision(r), 'deny');
    assert(`deny reason names the categories, type=${JSON.stringify(type)}`, namesCategories(r), true);
}
assert('deny fable', decision(call({ subagent_type: 'Plan', model: 'fable', prompt: 'x' })), 'deny');
assert('deny full opus id', decision(call({ subagent_type: 'Plan', model: 'claude-opus-4-1', prompt: 'x' })), 'deny');
assert('deny uppercase OPUS', decision(call({ subagent_type: 'Plan', model: 'OPUS', prompt: 'x' })), 'deny');
assert('deny empty reason text',
    decision(call({ subagent_type: 'Plan', model: 'opus', prompt: 'TIER: opus:   ' })), 'deny');

console.log('gated types, opus with a reason');
const withReason = (line, model) =>
    call({ subagent_type: 'general-purpose', model: model || 'opus', description: 'Map workbook', prompt: `intro\n${line}\nmore\n${BUDGET_MARKER}` });
// line, model, expected decision (undefined = allowed with no decision).
for (const [line, model, want] of [
    ['TIER: opus: plan writing', 'opus', undefined],
    ['TIER: opus: plan source review', 'opus', undefined],
    ['TIER: opus: fail triage', 'opus', undefined],
    ['TIER: opus: plan source review: round 1 of rev 3', 'opus', undefined],
    ['TIER: opus: plan-source-review', 'opus', undefined],
    ['TIER: opus: plan_writing', 'opus', undefined],
    ['TIER: OPUS: PLAN  WRITING', 'opus', undefined],
    ['tier: Opus - fail triage', 'opus', undefined],
    ['TIER: fable: plan writing', 'fable', undefined],
    ['TIER: opus: user asked', 'opus', 'ask'],
    ['TIER: fable: user asked: owner wants fable', 'fable', 'ask'],
    ['TIER: opus: design judgement', 'opus', 'deny'],
    ['TIER: opus - judgement call', 'opus', 'deny'],
    ['TIER: opus: why', 'opus', 'deny'],
    ['TIER: fable: why', 'fable', 'deny'],
    ['TIER: opus: needs plan writing', 'opus', 'deny'],
    ['TIER: opus: plan writer', 'opus', 'deny'],
    ['TIER: opus: plan writingfoo', 'opus', 'deny'],
    ['TIER: opus: plan writing2', 'opus', 'deny'],
    ['TIER: opus:  ', 'opus', 'deny'],
    ['TIER: opus: plan writing.', 'opus', undefined],
    ['TIER: opus: plan source review, round 2', 'opus', undefined],
    ['TIER: opus: fail triage; two unexplained results', 'opus', undefined],
]) {
    const r = withReason(line, model);
    assert(`${want || 'allow'}: ${line}`, decision(r) || undefined, want);
    if (want === 'deny') assert(`deny names the categories: ${line}`, namesCategories(r), true);
    if (want === 'ask') {
        const reason = r.out.hookSpecificOutput.permissionDecisionReason;
        assert(`ask reason names model and description: ${line}`,
            [reason.includes(model), reason.includes('"Map workbook"')], [true, true]);
    }
}

console.log('plan writing is for new plans only');
// description (undefined = field absent), prompt, expected decision (undefined = allowed with no decision).
for (const [description, prompt, want] of [
    ['Add cache sizing experiment to phase 2 plan', 'TIER: opus: plan writing. You are editing the phase 2 plan...', 'deny'],
    ['Revise 7l plan after review', 'TIER: opus: plan writing. Revise the plan... to answer the round 1 source review', 'deny'],
    ['Fold C3a plan review findings', 'TIER: opus: plan writing. Fold the findings... You edit the plan only.', 'deny'],
    ['Fold C3a round 2 findings', 'TIER: opus: plan writing. Fold the findings of the second C3a plan review...', 'deny'],
    ['Write cube optimise plan', 'TIER: opus: plan writing. Write an implementation plan to agg_poc/tmp/PLAN_cube_optimise.md...', undefined],
    ['Plan Step 7l empty-book skip', 'TIER: opus: plan writing. Write the plan for RD1 Step 7l...', undefined],
    [undefined, 'TIER: opus: plan writing. Write the plan for RD1 Step 7l.', undefined],
    ['Write the plan', 'TIER: opus: plan writing\nAmend the existing plan with the findings.', 'deny'],
    ['Write the plan', 'TIER: opus: plan writing. Write the plan. You edit nothing else.', undefined],
    ['Review folded C3a plan text', 'TIER: opus: plan source review. Review the folded C3a plan text...', undefined],
    ['Triage failure', 'TIER: opus: fail triage. Revise your view of the failing test.', undefined],
    ['Revise plan', 'TIER: opus: user asked. Revise the plan.', 'ask'],
]) {
    const r = call({ subagent_type: 'general-purpose', model: 'opus', description, prompt: prompt + '\n' + BUDGET_MARKER });
    assert(`${want || 'allow'}: ${description} | ${prompt.slice(0, 50)}`, decision(r) || undefined, want);
    if (want === 'deny') {
        const reason = r.out.hookSpecificOutput.permissionDecisionReason;
        assert(`deny says new plans only: ${description}`, [reason.includes('new plans'), reason.includes('sonnet')], [true, true]);
    }
}

console.log('implementer, opus with a reason');
assert('allow opus with reason, sdlc:implementer',
    call({ subagent_type: agent('implementer'), model: 'opus', prompt: 'TIER: opus: plan writing\n' + BUDGET_MARKER }).out, '');
assert('missing model rewritten to sonnet, sdlc:implementer',
    call({ subagent_type: agent('implementer'), prompt: 'x' }).out.hookSpecificOutput.updatedInput.model, 'sonnet');
assert('allow opus with reason, bare implementer',
    call({ subagent_type: 'implementer', model: 'opus', prompt: 'TIER: opus: plan writing\n' + BUDGET_MARKER }).out, '');
assert('missing model rewritten to sonnet, bare implementer',
    call({ subagent_type: 'implementer', prompt: 'x' }).out.hookSpecificOutput.updatedInput.model, 'sonnet');

console.log('gated types, model missing or cheap');
const rewritten = call({ subagent_type: 'Explore', prompt: 'look', description: 'd' });
assert('missing model rewritten to sonnet', rewritten.out, {
    hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { subagent_type: 'Explore', prompt: 'look\n\n' + BUDGET_BLOCK, description: 'd', model: 'sonnet' },
    },
});
for (const m of ['inherit', 'INHERIT', ' inherit ']) {
    const r = call({ subagent_type: 'Plan', model: m, prompt: 'x' });
    assert(`inherit rewritten to sonnet: ${JSON.stringify(m)}`, r.out.hookSpecificOutput.updatedInput.model, 'sonnet');
}
for (const m of [42, true, ['opus'], {}]) {
    assert(`non-string model passes through: ${JSON.stringify(m)}`, call({ subagent_type: 'Plan', model: m, prompt: BUDGET_MARKER }).out, '');
}
assert('missing type rewritten', decision(call({ prompt: 'x' })), 'allow');
assert('sonnet passes', call({ subagent_type: 'Plan', model: 'sonnet', prompt: BUDGET_MARKER }).out, '');
assert('haiku passes', call({ subagent_type: 'Plan', model: 'haiku', prompt: BUDGET_MARKER }).out, '');

console.log('ungated types');
for (const type of ['sdlc:code-reviewer-deep', 'sdlc:code-reviewer', 'fork', 'claude-code-guide',
    'statusline-setup', 'my-own-agent']) {
    assert(`opus passes untouched, ${type}`, call({ subagent_type: type, model: 'opus', prompt: 'x' }).out, '');
    assert(`no model untouched, ${type}`, call({ subagent_type: type, prompt: 'x' }).out, '');
}

console.log('context budget');
const updated = (r) => r.out && r.out.hookSpecificOutput && r.out.hookSpecificOutput.updatedInput;
for (const type of [undefined, '', 'general-purpose', 'Explore', 'Plan', 'implementer', agent('implementer')]) {
    const u = updated(call({ subagent_type: type, model: 'sonnet', prompt: 'do it' }));
    assert(`budget appended once, type=${JSON.stringify(type)}`, u && u.prompt, 'do it\n\n' + BUDGET_BLOCK);
}
const both = call({ subagent_type: 'Plan', prompt: 'look', description: 'd', run_in_background: true });
assert('tier rewrite and budget in one updatedInput', updated(both),
    { subagent_type: 'Plan', prompt: 'look\n\n' + BUDGET_BLOCK, description: 'd', run_in_background: true, model: 'sonnet' });
assert('budget alone emits updatedInput and no permissionDecision',
    [updated(call({ subagent_type: 'Plan', model: 'haiku', prompt: 'x' })) !== undefined,
        decision(call({ subagent_type: 'Plan', model: 'haiku', prompt: 'x' }))], [true, undefined]);
assert('opus with reason: budget alone, no permissionDecision',
    decision(call({ subagent_type: 'Plan', model: 'opus', prompt: 'TIER: opus: plan writing' })), undefined);
const asked = updated(call({ subagent_type: 'Plan', model: 'opus', prompt: 'TIER: opus: user asked' }));
assert('ask dispatch still carries the budget block', asked && asked.prompt, 'TIER: opus: user asked\n\n' + BUDGET_BLOCK);
assert('ask dispatch keeps permissionDecision ask',
    decision(call({ subagent_type: 'Plan', model: 'opus', prompt: 'TIER: opus: user asked' })), 'ask');
assert('tier rewrite plus budget still allows', decision(both), 'allow');
assert('deny is unchanged', decision(call({ subagent_type: 'Plan', model: 'opus', prompt: 'x' })), 'deny');
assert('model untouched when only budget', updated(call({ subagent_type: 'Plan', model: 'haiku', prompt: 'x' })).model, 'haiku');
assert('opus with reason gets budget, model kept',
    updated(call({ subagent_type: 'Plan', model: 'opus', prompt: 'TIER: opus: plan writing' })).model, 'opus');
assert('idempotent when marker present',
    call({ subagent_type: 'Plan', model: 'sonnet', prompt: 'x\n' + BUDGET_MARKER + '\nmore' }).out, '');
assert('marker present still rewrites model',
    updated(call({ subagent_type: 'Plan', prompt: 'x ' + BUDGET_MARKER })).prompt, 'x ' + BUDGET_MARKER);
for (const type of ['sdlc:code-reviewer', 'fork', 'my-own-agent']) {
    assert(`budget skipped, ${type}`, call({ subagent_type: type, model: 'sonnet', prompt: 'x' }).out, '');
}
for (const p of [undefined, '', '   ', 42, ['x'], null]) {
    assert(`bad prompt untouched: ${JSON.stringify(p)}`, call({ subagent_type: 'Plan', model: 'sonnet', prompt: p }).out, '');
}
assert('deny carries no updatedInput', updated(call({ subagent_type: 'Plan', model: 'opus', prompt: 'x' })), undefined);

console.log('fail open');
assert('bad JSON', run('not json'), { status: 0, out: '' });
assert('empty stdin', run(''), { status: 0, out: '' });
assert('no tool_input', run(JSON.stringify({ tool_name: 'Agent' })), { status: 0, out: '' });
assert('exit code on deny', call({ subagent_type: 'Plan', model: 'opus', prompt: 'x' }).status, 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
