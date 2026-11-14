// Tests for rule-reminder.js: the UserPromptSubmit hook that injects the
// end-of-turn check.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'rule-reminder.js');
const EVENT = 'UserPromptSubmit';
const MAX_LINES = 8;

let passed = 0;
let failed = 0;

// Args:
//   name: the test name.
//   actual: the value under test.
//   expected: the value it must equal.
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

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-reminder-test-'));

// Args:
//   stdin: the raw stdin text for the hook.
//   userConfig: contents for the user sdlc-review.json, or undefined for none.
// Returns: { out: stdout, status }.
function run(stdin, userConfig) {
    const dir = fs.mkdtempSync(path.join(sb, 'cfg-'));
    const file = path.join(dir, 'sdlc-review.json');
    if (userConfig !== undefined) fs.writeFileSync(file, JSON.stringify(userConfig));
    const r = spawnSync('node', [HOOK], {
        input: stdin,
        cwd: sb,
        encoding: 'utf-8',
        env: { ...process.env, CLAUDE_CONFIG_DIR: dir, SDLC_REVIEW_CONFIG_USER: file },
    });
    return { out: r.stdout, status: r.status };
}

const PROMPT = JSON.stringify({ hook_event_name: EVENT, session_id: 's1', prompt: 'go' });

// On: the three points are present, as UserPromptSubmit additional context.
const on = run(PROMPT);
const parsed = (() => { try { return JSON.parse(on.out); } catch (e) { return null; } })();
const ctx = parsed && parsed.hookSpecificOutput ? parsed.hookSpecificOutput.additionalContext : '';
assert('on: exit 0', on.status, 0);
assert('on: event name', parsed && parsed.hookSpecificOutput.hookEventName, EVENT);
assert('on: (a) no option question outside a gate', /option question/i.test(ctx) && /gate/i.test(ctx), true);
assert('on: (b) open the code, read delegated diffs, say what was verified', [/open the code/i, /delegated diff/i, /verified/i].every(re => re.test(ctx)), true);
assert('on: (c) negative result is not a stop', /negative result/i.test(ctx) && /next step/i.test(ctx), true);
assert('on: short', ctx.split('\n').length <= MAX_LINES, true);

// Off: the conduct area, or the step alone, prints nothing.
for (const [name, cfg] of [['area off', { steps: { conduct: false } }], ['step off', { steps: { conduct: { 'rule-reminder': false } } }]]) {
    const r = run(PROMPT, cfg);
    assert(`${name}: prints nothing, exit 0`, [r.out, r.status], ['', 0]);
}

// Errors print nothing.
for (const [name, stdin] of [['invalid stdin', 'not json'], ['empty stdin', ''], ['non-object stdin', '42']]) {
    const r = run(stdin);
    assert(`error: ${name} prints nothing, exit 0`, [r.out, r.status], ['', 0]);
}

fs.rmSync(sb, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
