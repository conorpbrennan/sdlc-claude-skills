// Tests for orchestrator-mode.js: the hook that keeps the main session a thin
// orchestrator once it picks up a handoff or runs a plan. Spawns the hook with
// stdin JSON, a temp state dir and a temp user config, and checks stdout and state.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const HOOK = path.join(__dirname, 'orchestrator-mode.js');

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

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-mode-'));
const stateDir = path.join(sb, 'state');
const userCfg = path.join(sb, 'user-sdlc-review.json');
const ENV = { ...process.env, SDLC_ORCHESTRATOR_STATE_DIR: stateDir, SDLC_REVIEW_CONFIG_USER: userCfg };

let n = 0;
const newSession = () => `sess-${++n}`;

// A plain directory that is not a git repo, and a repo with a repo-level config.
const plain = path.join(sb, 'plain');
fs.mkdirSync(plain);
const repo = path.join(sb, 'repo');
fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: repo });

// Runs the hook. Returns { status, out } with out parsed JSON or '' for no output.
function run(input, args) {
    const r = spawnSync('node', [HOOK, ...(args || [])], {
        input: typeof input === 'string' ? input : JSON.stringify(input),
        encoding: 'utf-8',
        env: ENV,
    });
    const text = (r.stdout || '').trim();
    return { status: r.status, out: text ? JSON.parse(text) : '', raw: text };
}

const stateFile = (sid) => path.join(stateDir, `${sid}.json`);
const readState = (sid) => {
    try { return JSON.parse(fs.readFileSync(stateFile(sid), 'utf-8')); } catch (e) { return null; }
};
const writeState = (sid, s) => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile(sid), JSON.stringify(s));
};
const isOn = (sid) => !!(readState(sid) && readState(sid).on);

const post = (sid, tool, toolInput, extra) => run({
    session_id: sid, hook_event_name: 'PostToolUse', cwd: plain,
    tool_name: tool, tool_input: toolInput, ...extra,
});
const pre = (sid, tool, toolInput, extra) => run({
    session_id: sid, hook_event_name: 'PreToolUse', cwd: plain,
    tool_name: tool, tool_input: toolInput, ...extra,
});
const prompt = (sid, text) => run({ session_id: sid, hook_event_name: 'UserPromptSubmit', cwd: plain, prompt: text });
const decision = (r) => r.out && r.out.hookSpecificOutput && r.out.hookSpecificOutput.permissionDecision;
const turnOn = (sid, extra) => writeState(sid, { on: true, since: '2026-01-01T00:00:00.000Z', trigger: 'test', inlineSinceDispatch: 0, off: false, ...extra });

const COMMIT = 'com' + 'mit';
const MODEL_LINE = 'Run this session on Sonnet (/model sonnet). Opus is for plan writing, plan source review and FAIL triage.';
const DENY_REASON = 'Orchestrator mode: the main session does not edit source. Write a brief and dispatch a Sonnet sub-agent (Agent tool, model: "sonnet"). If the owner wants this edit made inline, ask them to run /sdlc:orchestrate off.';

console.log('sub-agent input prints nothing and changes nothing');
{
    const sid = newSession();
    turnOn(sid);
    const sub = { agent_id: 'a1', agent_type: 'general-purpose' };
    assert('pre edit', pre(sid, 'Edit', { file_path: '/repo/src/x.js' }, sub), { status: 0, out: '', raw: '' });
    assert('post bash', post(sid, 'Bash', { command: 'ls' }, sub).out, '');
    assert('post agent', post(sid, 'Agent', {}, sub).out, '');
    assert('prompt off', run({ session_id: sid, hook_event_name: 'UserPromptSubmit', prompt: '/orchestrate off', ...sub }).out, '');
    assert('state untouched by sub-agent', [readState(sid).on, readState(sid).off, readState(sid).inlineSinceDispatch], [true, false, 0]);
    const sid2 = newSession();
    post(sid2, 'Read', { file_path: '/x/HANDOFF-1.md' }, sub);
    assert('sub-agent reading a handoff does not turn on', readState(sid2), null);
}

console.log('triggers turn the mode on');
{
    const cases = [
        ['Read HANDOFF file', 'Read', { file_path: '/p/HANDOFF-sonnet.md' }],
        ['Read handoff lowercase', 'Read', { file_path: '/p/notes/my-handoff.md' }],
        ['Read tracker path', 'Read', { file_path: '/p/run/tracker/state.md' }],
        ['Bash cat handoff', 'Bash', { command: 'cat /p/HANDOFF-1.md' }],
        ['Bash cd then head', 'Bash', { command: 'cd /p && head -50 HANDOFF-1.md' }],
        ['Bash tail', 'Bash', { command: 'tail -n 20 /p/HANDOFF-1.md' }],
        ['Bash less', 'Bash', { command: 'less /p/HANDOFF-1.md' }],
        ['Bash sed -n', 'Bash', { command: "sed -n '1,40p' /p/HANDOFF-1.md" }],
        ['Bash cat tracker', 'Bash', { command: 'cat /p/tracker-1.md' }],
        ['Skill plan-spec run', 'Skill', { skill: 'sdlc:plan-spec', args: 'run plans/x.md' }],
        ['Skill bare plan-spec run', 'Skill', { skill: 'plan-spec', args: 'run' }],
    ];
    for (const [name, tool, input] of cases) {
        const sid = newSession();
        post(sid, tool, input);
        const s = readState(sid);
        assert(`on: ${name}`, !!(s && s.on), true);
        assert(`trigger recorded: ${name}`, !!(s && typeof s.trigger === 'string' && s.trigger), true);
    }
    const sid = newSession();
    post(sid, 'Read', { file_path: '/p/HANDOFF-1.md' });
    const s = readState(sid);
    assert('state fields', [s.on, s.off, s.inlineSinceDispatch, typeof s.since], [true, false, 0, 'string']);
    assert('since is ISO', new Date(s.since).toISOString(), s.since);
}

console.log('non-triggers leave the mode off');
{
    const cases = [
        ['Read ordinary md', 'Read', { file_path: '/p/README.md' }],
        ['Read handoff but not md', 'Read', { file_path: '/p/handoff.txt' }],
        ['Bash cat ordinary', 'Bash', { command: 'cat /p/README.md' }],
        ['Bash grep handoff', 'Bash', { command: 'grep -n x /p/HANDOFF-1.md' }],
        ['Skill plan-spec without run', 'Skill', { skill: 'sdlc:plan-spec', args: 'write a plan' }],
        ['Skill other', 'Skill', { skill: 'sdlc:commit-prep', args: 'run' }],
    ];
    for (const [name, tool, input] of cases) {
        const sid = newSession();
        post(sid, tool, input);
        assert(`off: ${name}`, isOn(sid), false);
    }
}

console.log('off blocks re-triggering; the owner can switch on again');
{
    const sid = newSession();
    prompt(sid, '/sdlc:orchestrate off');
    assert('off recorded', [readState(sid).on, readState(sid).off], [false, true]);
    post(sid, 'Read', { file_path: '/p/HANDOFF-1.md' });
    assert('trigger ignored while off', [readState(sid).on, readState(sid).off], [false, true]);
    post(sid, 'Skill', { skill: 'sdlc:plan-spec', args: 'run' });
    assert('plan-spec run ignored while off', isOn(sid), false);
    prompt(sid, '/sdlc:orchestrate on');
    assert('on recorded', [readState(sid).on, readState(sid).off], [true, false]);
}

console.log('UserPromptSubmit');
{
    const sid = newSession();
    const ctx = (r) => r.out && r.out.hookSpecificOutput;
    const on1 = ctx(prompt(sid, '/orchestrate on'));
    assert('on reports state', [on1.hookEventName, /^Orchestrator mode: on \(trigger: owner: \/sdlc:orchestrate on, since \S+, 0 inline commands since the last dispatch\)\.\n/.test(on1.additionalContext)], ['UserPromptSubmit', true]);
    assert('short form on', isOn(sid), true);
    prompt(sid, '/orchestrate off');
    assert('short form off', [readState(sid).on, readState(sid).off], [false, true]);
    prompt(sid, '/sdlc:orchestrate on');
    assert('long form on', isOn(sid), true);
    turnOn(sid, { trigger: 'Read HANDOFF-9.md', inlineSinceDispatch: 4, since: '2026-02-02T00:00:00.000Z' });
    const st = prompt(sid, '/sdlc:orchestrate status');
    assert('status changes nothing', [isOn(sid), readState(sid).inlineSinceDispatch], [true, 4]);
    assert('status line', st.out.hookSpecificOutput.additionalContext, 'Orchestrator mode: on (trigger: Read HANDOFF-9.md, since 2026-02-02T00:00:00.000Z, 4 inline commands since the last dispatch).');
    assert('off reports off', /^Orchestrator mode: off \(trigger: owner: \/sdlc:orchestrate off,/.test(prompt(sid, '/orchestrate off').out.hookSpecificOutput.additionalContext), true);
    const nostate = newSession();
    assert('status with no state', prompt(nostate, '/orchestrate status').out.hookSpecificOutput.additionalContext, 'Orchestrator mode: off (no state for this session).');
    prompt(sid, '/sdlc:orchestrate on');
    prompt(sid, '/sdlc:orchestrate off extra words');
    assert('trailing words allowed', readState(sid).off, true);
    const s2 = newSession();
    prompt(s2, 'please run /orchestrate on');
    assert('mid-sentence ignored', readState(s2), null);
    prompt(s2, '/orchestrate maybe');
    assert('unknown word ignored', readState(s2), null);
    prompt(s2, '/orchestrates on');
    assert('longer command name ignored', readState(s2), null);
    prompt(s2, '/sdlc:orchestrate off');
    assert('off from nothing creates state', [readState(s2).on, readState(s2).off], [false, true]);
}

console.log('deny inline source edits');
{
    const sid = newSession();
    turnOn(sid);
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
        const r = pre(sid, tool, { file_path: '/home/u/dev/proj/src/app.js' });
        assert(`deny ${tool}`, decision(r), 'deny');
        assert(`reason ${tool}`, r.out.hookSpecificOutput.permissionDecisionReason, DENY_REASON);
    }
    assert('notebook_path is read too', decision(pre(sid, 'NotebookEdit', { notebook_path: '/home/u/dev/proj/a.ipynb' })), 'deny');
    assert('plain .md outside special dirs denied', decision(pre(sid, 'Write', { file_path: '/home/u/dev/proj/README.md' })), 'deny');
    assert('exit code on deny', pre(sid, 'Edit', { file_path: '/home/u/x.js' }).status, 0);
}

console.log('allowed paths while on');
{
    const sid = newSession();
    turnOn(sid);
    const home = os.homedir();
    const allowed = [
        '/home/u/dev/proj/HANDOFF-1.md',
        '/home/u/dev/proj/docs/handoff-notes.md',
        '/home/u/dev/proj/run/tracker/state.md',
        '/home/u/dev/proj/tracker.md',
        '/home/u/dev/proj/run/reports/s1.md',
        '/home/u/dev/proj/reports/s1.md',
        '/home/u/dev/proj/briefs/S1.md',
        '/home/u/dev/proj/brief-1.md',
        '/home/u/dev/proj/features/sonnet-steering.md',
        '/home/u/dev/proj/plans/steps.md',
        '/home/u/dev/proj/docs/plans/sonnet.md',
        '/home/u/dev/proj/my-plan.md',
        `${home}/.claude/projects/-home-u-proj/memory/note.md`,
        path.join(os.tmpdir(), 'scratch', 'brief.txt'),
        '/tmp/anything/x.js',
    ];
    for (const p of allowed) {
        assert(`allow ${p}`, pre(sid, 'Write', { file_path: p }).out, '');
    }
    // Windows-style separators resolve the same way as POSIX ones.
    const winAllowed = [
        'proj\\features\\sonnet-steering.md',
        'proj\\run\\reports\\s1.md',
        'proj\\plans\\steps.md',
        'proj\\docs\\plans\\sonnet.md',
        `${home}\\.claude\\projects\\-home-u-proj\\memory\\note.md`,
    ];
    for (const p of winAllowed) {
        assert(`allow backslash ${p}`, pre(sid, 'Write', { file_path: p }, { cwd: '/home/u' }).out, '');
    }
    assert('backslash source path denied', decision(pre(sid, 'Write', { file_path: 'proj\\src\\app.js' }, { cwd: '/home/u' })), 'deny');
    assert('backslash features non-md denied', decision(pre(sid, 'Write', { file_path: 'proj\\features\\x.js' }, { cwd: '/home/u' })), 'deny');
    // A .md is a plan only under plans/ or by a basename that names a plan.
    for (const p of ['/home/u/dev/proj/PLAN.md', '/home/u/dev/proj/PLAN-sonnet.md', '/home/u/dev/proj/plan.md',
        '/home/u/dev/proj/notes/my_plan.md', '/home/u/dev/proj/commands/plan-x.md', '/home/u/dev/proj/v2.plan.md']) {
        assert(`plan basename allowed ${p}`, pre(sid, 'Write', { file_path: p }).out, '');
    }
    for (const p of ['/home/u/dev/proj/skills/plan-spec/SKILL.md', '/home/u/dev/proj/commands/planner.md',
        '/home/u/dev/proj/docs/explanation.md', '/home/u/dev/proj/skills/plan-spec/README.md']) {
        assert(`plan-ish source doc denied ${p}`, decision(pre(sid, 'Write', { file_path: p })), 'deny');
    }
    assert('features non-md denied', decision(pre(sid, 'Write', { file_path: '/home/u/dev/proj/features/x.js' })), 'deny');
    assert('plans non-md denied', decision(pre(sid, 'Write', { file_path: '/home/u/dev/proj/plans/x.js' })), 'deny');
}

console.log('deny only applies when on, and never for a missing path');
{
    const sid = newSession();
    assert('mode never on: allow', pre(sid, 'Edit', { file_path: '/home/u/src/a.js' }).out, '');
    turnOn(sid, { on: false, off: true });
    assert('mode off: allow', pre(sid, 'Edit', { file_path: '/home/u/src/a.js' }).out, '');
    turnOn(sid);
    assert('no path: fail open', pre(sid, 'Edit', {}).out, '');
    assert('other tool: untouched', pre(sid, 'Bash', { command: 'ls' }).out, '');
}

console.log('Bash counting and the nudge');
{
    const sid = newSession();
    turnOn(sid);
    for (let i = 1; i <= 7; i++) assert(`inline ${i} silent`, post(sid, 'Bash', { command: `ls ${i}` }).out, '');
    assert('count 7', readState(sid).inlineSinceDispatch, 7);
    const r8 = post(sid, 'Bash', { command: 'pytest -q' });
    assert('nudge at 8', r8.out, { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'Orchestrator mode: 8 inline commands since the last dispatch. Hand investigation and runs to a Sonnet sub-agent and read its report.' } });
    assert('silent at 9', post(sid, 'Bash', { command: 'ls 9' }).out, '');
    for (let i = 10; i <= 15; i++) post(sid, 'Bash', { command: `ls ${i}` });
    const r16 = post(sid, 'Bash', { command: 'ls 16' });
    assert('nudge at 16', r16.out.hookSpecificOutput.additionalContext.startsWith('Orchestrator mode: 16 inline commands'), true);
    assert('count 16', readState(sid).inlineSinceDispatch, 16);
}

console.log('orchestration commands are not counted');
{
    const sid = newSession();
    turnOn(sid);
    const free = [
        'git add -A', `git ${COMMIT} -m "x"`, 'git status', 'git status --short', 'git log --oneline -3',
        'git diff --cached --stat', 'git worktree list', 'git apply p.diff', 'git rev-parse HEAD',
        'git branch -a', 'git checkout -b feature/x', 'printf "%s" x > f',
        'gh pr view 3', 'node /h/src/hooks/test-x.js', 'node tools/plugin-version.js bump',
        'cd /home/u/proj && git status', 'cd /home/u/proj && gh pr list',
    ];
    for (const command of free) post(sid, 'Bash', { command });
    assert('none counted', readState(sid).inlineSinceDispatch, 0);
    const counted = ['git diff HEAD', 'git checkout main', 'node build.js', 'npm test', 'grep -rn x .', 'cd /p && pytest'];
    for (const command of counted) post(sid, 'Bash', { command });
    assert('each counted', readState(sid).inlineSinceDispatch, counted.length);
}

console.log('Bash does not count when the mode is off');
{
    const sid = newSession();
    post(sid, 'Bash', { command: 'ls' });
    assert('no state created', readState(sid), null);
    turnOn(sid, { on: false, off: true });
    post(sid, 'Bash', { command: 'ls' });
    assert('off: not counted', readState(sid).inlineSinceDispatch, 0);
}

console.log('Agent resets the count');
{
    const sid = newSession();
    turnOn(sid, { inlineSinceDispatch: 5 });
    assert('agent prints nothing', post(sid, 'Agent', { prompt: 'x' }).out, '');
    assert('reset to 0', readState(sid).inlineSinceDispatch, 0);
    for (let i = 0; i < 7; i++) post(sid, 'Bash', { command: 'ls' });
    post(sid, 'Agent', {});
    assert('no nudge after a reset at 8th command', post(sid, 'Bash', { command: 'ls' }).out, '');
}

console.log('threshold comes from config');
{
    const sid = newSession();
    turnOn(sid);
    fs.writeFileSync(path.join(repo, '.claude', 'sdlc-review.json'), JSON.stringify({ orchestrator: { bashNudge: 2 } }));
    const inRepo = { cwd: repo };
    assert('1st silent', post(sid, 'Bash', { command: 'ls' }, inRepo).out, '');
    const r2 = post(sid, 'Bash', { command: 'ls' }, inRepo);
    assert('nudge at 2', r2.out.hookSpecificOutput.additionalContext.startsWith('Orchestrator mode: 2 inline commands'), true);
    assert('silent at 3', post(sid, 'Bash', { command: 'ls' }, inRepo).out, '');
    assert('nudge at 4', post(sid, 'Bash', { command: 'ls' }, inRepo).out !== '', true);
    fs.rmSync(path.join(repo, '.claude', 'sdlc-review.json'));

    const sid2 = newSession();
    turnOn(sid2);
    fs.writeFileSync(userCfg, JSON.stringify({ orchestrator: { bashNudge: 3 } }));
    post(sid2, 'Bash', { command: 'ls' }, inRepo);
    post(sid2, 'Bash', { command: 'ls' }, inRepo);
    assert('user config threshold', post(sid2, 'Bash', { command: 'ls' }, inRepo).out !== '', true);
    fs.rmSync(userCfg);

    const sid3 = newSession();
    turnOn(sid3, { inlineSinceDispatch: 7 });
    assert('non-repo cwd defaults to 8', post(sid3, 'Bash', { command: 'ls' }).out !== '', true);
}

console.log('corrupt or missing state is treated as off');
{
    const sid = newSession();
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile(sid), '{not json');
    assert('edit allowed', pre(sid, 'Edit', { file_path: '/home/u/src/a.js' }), { status: 0, out: '', raw: '' });
    assert('bash silent', post(sid, 'Bash', { command: 'ls' }).status, 0);
    const sid2 = newSession();
    fs.writeFileSync(stateFile(sid2), '{not json');
    const r = post(sid2, 'Read', { file_path: '/p/HANDOFF-1.md' });
    assert('corrupt state does not crash on trigger', r.status, 0);
    assert('corrupt state is replaced by a trigger', isOn(sid2), true);
    const sid3 = newSession();
    fs.writeFileSync(stateFile(sid3), '[1,2]');
    assert('wrong shape: allowed', pre(sid3, 'Edit', { file_path: '/home/u/src/a.js' }).out, '');
}

console.log('fail open on bad input');
assert('bad JSON', run('not json'), { status: 0, out: '', raw: '' });
assert('empty stdin', run(''), { status: 0, out: '', raw: '' });
assert('no session id', run({ hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: '/p/HANDOFF-1.md' } }).status, 0);
assert('unknown event', run({ session_id: 'x', hook_event_name: 'Stop' }), { status: 0, out: '', raw: '' });
assert('no stray temp files', fs.readdirSync(stateDir).filter((f) => !f.endsWith('.json')), []);

console.log('--status');
{
    const sid = newSession();
    const none = spawnSync('node', [HOOK, '--status', sid], { encoding: 'utf-8', env: ENV });
    assert('status with no state', [none.status, none.stdout.trim()], [0, 'Orchestrator mode: off (no state for this session).']);
    turnOn(sid, { trigger: 'Read HANDOFF-1.md', inlineSinceDispatch: 3 });
    const on = spawnSync('node', [HOOK, '--status', sid], { encoding: 'utf-8', env: ENV });
    assert('status on mentions on, trigger, count',
        [/on/.test(on.stdout), /Read HANDOFF-1\.md/.test(on.stdout), /3/.test(on.stdout)], [true, true, true]);
    turnOn(sid, { on: false, off: true });
    const off = spawnSync('node', [HOOK, '--status', sid], { encoding: 'utf-8', env: ENV });
    assert('status off by owner', /switched off/.test(off.stdout), true);
}

console.log('the Sonnet line prints once per switch-on');
{
    const count = (text) => String(text || '').split(MODEL_LINE).length - 1;
    const ctxOf = (r) => r.out && r.out.hookSpecificOutput && r.out.hookSpecificOutput.additionalContext;

    // Explicit on path (UserPromptSubmit).
    const sid = newSession();
    assert('explicit on prints the line once', count(ctxOf(prompt(sid, '/orchestrate on'))), 1);
    assert('status does not repeat it', count(ctxOf(prompt(sid, '/orchestrate status'))), 0);
    assert('off does not print it', count(ctxOf(prompt(sid, '/orchestrate off'))), 0);
    assert('switching on again prints it again', count(ctxOf(prompt(sid, '/sdlc:orchestrate on'))), 1);

    // Trigger path (PostToolUse on a handoff read).
    const t = newSession();
    assert('handoff read prints the line once', count(ctxOf(post(t, 'Read', { file_path: '/p/HANDOFF-1.md' }))), 1);
    assert('second handoff read prints nothing', post(t, 'Read', { file_path: '/p/HANDOFF-1.md' }).out, '');
    assert('Bash handoff read after on prints nothing', post(t, 'Bash', { command: 'cat /p/HANDOFF-1.md' }).out, '');
    assert('ordinary prompt prints nothing', run({ session_id: t, hook_event_name: 'UserPromptSubmit', cwd: plain, prompt: 'carry on' }).out, '');
    const nudged = [];
    for (let i = 0; i < 8; i++) nudged.push(ctxOf(post(t, 'Bash', { command: 'ls /p' })));
    assert('inline-command nudge does not carry the line', nudged.some((x) => count(x) > 0), false);
    assert('plan-spec run prints the line', count(ctxOf(post(newSession(), 'Skill', { skill: 'sdlc:plan-spec', args: 'run plans/x.md' }))), 1);

    // No line while the owner has switched the mode off.
    const o = newSession();
    prompt(o, '/orchestrate off');
    assert('trigger while off prints nothing', post(o, 'Read', { file_path: '/p/HANDOFF-1.md' }).out, '');
}

fs.rmSync(sb, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
