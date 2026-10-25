// Tests for read-trim.js and lib/read-trim.js: the PostToolUse hook on Read that trims
// oversized whole-file reads inside sub-agents. Spawns the hook with stdin JSON.
// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

// Scratch config so no case reads the owner's real files.
const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'read-trim-'));
const userCfg = path.join(sb, 'user-sdlc-review.json');
process.env.SDLC_REVIEW_CONFIG_USER = userCfg;
process.env.CLAUDE_CONFIG_DIR = path.join(sb, 'claude');
process.env.TDD_MANDATE_CONFIG = path.join(sb, 'tdd.json');

const HOOK = path.join(__dirname, 'read-trim.js');
const HOOKS_JSON = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
const { MAX_CHARS, trimRead } = require('./lib/read-trim.js');

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

function run(stdin) {
    const r = spawnSync('node', [HOOK], { input: stdin, encoding: 'utf-8' });
    const text = (r.stdout || '').trim();
    return { status: r.status, out: text ? JSON.parse(text) : '' };
}

function event(over, content, extra) {
    return Object.assign({
        session_id: 's', hook_event_name: 'PostToolUse', tool_name: 'Read',
        agent_id: 'a1', agent_type: 'general-purpose',
        tool_input: { file_path: '/x/plan.md' },
        tool_response: {
            type: 'text',
            file: Object.assign({ filePath: '/x/plan.md', content, numLines: content.split('\n').length, startLine: 1, totalLines: content.split('\n').length }, extra),
        },
    }, over);
}

// 100-char lines ("L<n>" padded, newline-terminated) so the cut point is predictable.
const line = (i) => `L${i}`.padEnd(99, '.');
const bigText = Array.from({ length: 300 }, (_, i) => line(i)).join('\n');
const updated = (r) => r.out && r.out.hookSpecificOutput && r.out.hookSpecificOutput.updatedToolOutput;

console.log('read-trim hook');

assert('threshold is 12000', MAX_CHARS, 12000);

{
    const r = run(JSON.stringify(event({ agent_id: undefined, agent_type: undefined }, bigText)));
    assert('main session untouched', [r.status, r.out], [0, '']);
}
{
    const r = run(JSON.stringify(event({ agent_id: '' }, bigText)));
    assert('empty agent_id untouched', [r.status, r.out], [0, '']);
}
{
    const r = run(JSON.stringify(event({}, 'a\nb\nc')));
    assert('under threshold untouched', [r.status, r.out], [0, '']);
}
{
    const ev = event({}, bigText, { extraField: 'keep' });
    ev.tool_response.extra = { n: 1 };
    const r = run(JSON.stringify(ev));
    const u = updated(r);
    assert('status 0', r.status, 0);
    assert('hookEventName', r.out.hookSpecificOutput.hookEventName, 'PostToolUse');
    const keptLines = u.file.content.split('\n');
    const note = keptLines[keptLines.length - 1];
    const keptContent = keptLines.slice(0, -1).join('\n');
    assert('cut at a line boundary', keptContent, Array.from({ length: 120 }, (_, i) => line(i)).join('\n'));
    assert('note exact', note, `[sdlc read-trim: showing lines 1-120 of 300 (${keptContent.length} of ${bigText.length} chars). Grep for what you need, or Read again with offset/limit — ranged reads are not trimmed.]`);
    assert('numLines updated', u.file.numLines, 121);
    const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.file.content; delete c.file.numLines; return c; };
    assert('other fields deep-equal', strip(u), strip(ev.tool_response));
}
{
    const r = run(JSON.stringify(event({ tool_input: { file_path: '/x', offset: 5 } }, bigText)));
    assert('offset untouched', [r.status, r.out], [0, '']);
}
{
    const r = run(JSON.stringify(event({ tool_input: { file_path: '/x', limit: 50 } }, bigText)));
    assert('limit untouched', [r.status, r.out], [0, '']);
}
{
    const ev = event({}, bigText);
    ev.tool_response.type = 'image';
    assert('non-text type untouched', run(JSON.stringify(ev)).out, '');
}
{
    assert('non-Read tool untouched', run(JSON.stringify(event({ tool_name: 'Grep' }, bigText))).out, '');
}
{
    const flat = 'x'.repeat(30000);
    const u = updated(run(JSON.stringify(event({}, flat))));
    const lines = u.file.content.split('\n');
    assert('no newline: cut at threshold', lines[0].length, 12000);
    assert('no newline: note says lines 1-1', lines[1].startsWith('[sdlc read-trim: showing lines 1-1 of 1 (12000 of 30000 chars).'), true);
    assert('no newline: numLines 2', u.file.numLines, 2);
}
{
    const r = run('{not json');
    assert('malformed JSON', [r.status, r.out], [0, '']);
    const e = run('');
    assert('empty stdin', [e.status, e.out], [0, '']);
    assert('missing file field', run(JSON.stringify({ tool_name: 'Read', agent_id: 'a', tool_input: {}, tool_response: { type: 'text' } })).out, '');
}

console.log('trimRead pure function');
{
    assert('null for non-object', trimRead(null), null);
    assert('does not mutate input', (() => {
        const resp = event({}, bigText).tool_response;
        const before = JSON.stringify(resp);
        trimRead(resp);
        return JSON.stringify(resp) === before;
    })(), true);
    assert('exactly at threshold untouched', trimRead(event({}, 'y'.repeat(MAX_CHARS)).tool_response), null);
}

console.log('steps: read-trim switch');
{
    const repo = path.join(sb, 'repo');
    fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo });
    const repoCfg = path.join(repo, '.claude', 'sdlc-review.json');
    const STEP_CASES = [
        { name: 'default: trimmed', user: null, repo: null, trimmed: true },
        { name: 'area off in the user file: untouched', user: { steps: { orchestration: false } }, repo: null, trimmed: false },
        { name: 'step off inside an on area: untouched', user: { steps: { orchestration: { 'read-trim': false } } }, repo: null, trimmed: false },
        { name: 'repo file off beats user on: untouched', user: { steps: { orchestration: true } }, repo: { steps: { orchestration: { 'read-trim': false } } }, trimmed: false },
        { name: 'another step off: still trimmed', user: { steps: { orchestration: { 'context-budget': false } } }, repo: null, trimmed: true },
    ];
    for (const c of STEP_CASES) {
        fs.rmSync(userCfg, { force: true });
        fs.rmSync(repoCfg, { force: true });
        if (c.user) fs.writeFileSync(userCfg, JSON.stringify(c.user));
        if (c.repo) fs.writeFileSync(repoCfg, JSON.stringify(c.repo));
        const r = run(JSON.stringify(event({ cwd: repo }, bigText)));
        assert(c.name, [r.status, !!updated(r)], [0, c.trimmed]);
    }
    fs.rmSync(userCfg, { force: true });
    fs.rmSync(repoCfg, { force: true });
}
fs.rmSync(sb, { recursive: true, force: true });

console.log('hooks.json wiring');
{
    const cfg = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf-8'));
    const entry = cfg.hooks.PostToolUse.find((e) => e.matcher === 'Read');
    const cmds = entry ? entry.hooks.map((h) => h.command) : [];
    assert('PostToolUse Read wired', cmds, ['node "${CLAUDE_PLUGIN_ROOT}/src/hooks/read-trim.js"']);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
