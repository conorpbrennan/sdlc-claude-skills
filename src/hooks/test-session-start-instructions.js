// Tests for session-start-instructions.js: the plugin SessionStart hook that
// injects the four instruction sections (instructions/*.md) as additionalContext.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.join(__dirname, 'session-start-instructions.js');
const INSTRUCTIONS = path.join(__dirname, '..', '..', 'instructions');
const CAP = 10000;  // Claude Code's limit on a hook's additionalContext
const HEADROOM = 1500;

// The fixed order the hook must emit, with each file's `## ` heading.
const SECTIONS = [
    ['claude-md-snippet.md', '## Auto Code Review Triggers'],
    ['feature-workflow-snippet.md', '## Feature Tracking'],
    ['hygiene-snippet.md', '## Pre-Commit Hygiene Gate'],
    ['tdd-mandate-snippet.md', '## TDD Mandate'],
];

let passed = 0;
let failed = 0;
function assert(name, actual, expected) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name} -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        failed++;
    }
}

// Run a hook script with stdin `{}`; parse stdout as exactly one JSON object.
function run(script) {
    const res = spawnSync('node', [script], { input: '{}', encoding: 'utf-8' });
    let json = null;
    try {
        json = JSON.parse(res.stdout);
    } catch (e) { /* json stays null; the assertions below report it */ }
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

function context(r) {
    const hso = r.json && r.json.hookSpecificOutput;
    return hso && typeof hso.additionalContext === 'string' ? hso.additionalContext : '';
}

// A scratch copy of the plugin layout (src/hooks/<hook> + instructions/),
// so files can be removed or altered without touching the real tree.
function scratch(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssi-test-'));
    fs.mkdirSync(path.join(root, 'src', 'hooks'), { recursive: true });
    fs.copyFileSync(HOOK, path.join(root, 'src', 'hooks', 'session-start-instructions.js'));
    if (files) {
        fs.mkdirSync(path.join(root, 'instructions'));
        for (const [name, text] of Object.entries(files)) {
            fs.writeFileSync(path.join(root, 'instructions', name), text);
        }
    }
    return { root, hook: path.join(root, 'src', 'hooks', 'session-start-instructions.js') };
}

function realFiles() {
    const out = {};
    for (const [name] of SECTIONS) out[name] = fs.readFileSync(path.join(INSTRUCTIONS, name), 'utf-8');
    return out;
}

console.log('session-start-instructions tests');
console.log('================================');

console.log('\nThe shipped instructions:');
{
    const r = run(HOOK);
    assert('exits 0', r.status, 0);
    assert('stdout is one JSON object', r.json !== null && typeof r.json === 'object', true);
    assert('hookEventName is SessionStart', r.json && r.json.hookSpecificOutput &&
        r.json.hookSpecificOutput.hookEventName, 'SessionStart');
    const ctx = context(r);
    for (const [name, heading] of SECTIONS) {
        assert(`contains ${heading} (${name})`, ctx.includes(heading + '\n'), true);
    }
    const positions = SECTIONS.map(([, heading]) => ctx.indexOf(heading));
    assert('sections in the fixed order', positions.every((p, k) => p >= 0 && (k === 0 || p > positions[k - 1])), true);
    assert('no sentinel comments', /<!--\s*sdlc-claude-skills:/.test(ctx), false);
    console.log(`  additionalContext length: ${ctx.length} (cap ${CAP})`);
    assert(`length under the ${CAP}-character cap`, ctx.length < CAP, true);
    assert(`at least ${HEADROOM} characters of headroom`, ctx.length <= CAP - HEADROOM, true);
    const second = run(HOOK);
    assert('output is deterministic', second.stdout, r.stdout);
}

console.log('\nA missing instructions file:');
{
    const files = realFiles();
    delete files['hygiene-snippet.md'];
    const s = scratch(files);
    const r = run(s.hook);
    assert('exits 0', r.status, 0);
    assert('stdout is one JSON object', r.json !== null && typeof r.json === 'object', true);
    const ctx = context(r);
    for (const [name, heading] of SECTIONS.filter(([n]) => n !== 'hygiene-snippet.md')) {
        assert(`keeps ${heading}`, ctx.includes(heading + '\n'), true);
    }
    assert('drops the missing section', ctx.includes('## Pre-Commit Hygiene Gate'), false);
    const notices = ctx.split('\n').filter(l => l.includes('hygiene-snippet.md'));
    assert('one one-line notice names the missing file', notices.length, 1);
    fs.rmSync(s.root, { recursive: true, force: true });
}

console.log('\nNo instructions directory at all:');
{
    const s = scratch(null);
    const r = run(s.hook);
    assert('exits 0', r.status, 0);
    assert('stdout is one JSON object', r.json !== null && typeof r.json === 'object', true);
    assert('hookEventName is SessionStart', r.json && r.json.hookSpecificOutput &&
        r.json.hookSpecificOutput.hookEventName, 'SessionStart');
    assert('a notice is still emitted', context(r).length > 0, true);
    fs.rmSync(s.root, { recursive: true, force: true });
}

console.log('\nSentinels are stripped:');
{
    const files = realFiles();
    files['hygiene-snippet.md'] = '<!-- sdlc-claude-skills:hygiene:start -->\n' +
        files['hygiene-snippet.md'] + '<!-- sdlc-claude-skills:hygiene:end -->\n';
    const s = scratch(files);
    const ctx = context(run(s.hook));
    assert('section kept', ctx.includes('## Pre-Commit Hygiene Gate\n'), true);
    assert('sentinels removed', ctx.includes('sdlc-claude-skills:'), false);
    fs.rmSync(s.root, { recursive: true, force: true });
}

console.log(`\n================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
