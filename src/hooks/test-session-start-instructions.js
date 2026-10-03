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

// A scratch HOME. With `settings`, its .claude/settings.json holds that text
// (a string) or that object as JSON; `dir: true` makes settings.json a
// directory, which no read can open.
function scratchHome(settings, opts) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ssi-home-'));
    const target = path.join(home, '.claude', 'settings.json');
    if (opts && opts.dir) {
        fs.mkdirSync(target, { recursive: true });
    } else if (settings !== undefined) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, typeof settings === 'string' ? settings : JSON.stringify(settings, null, 2));
    }
    return home;
}

// A clean HOME (no settings.json), so a legacy install on the machine running
// the tests cannot change what the shipped-instructions checks see.
const CLEAN_HOME = scratchHome();

// Run a hook script with stdin `{}`; parse stdout as exactly one JSON object.
function run(script, home) {
    const h = home || CLEAN_HOME;
    const env = { ...process.env, HOME: h, USERPROFILE: h };
    const res = spawnSync('node', [script], { input: '{}', encoding: 'utf-8', env });
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

console.log('\nCRLF-encoded instructions give the same output as LF:');
{
    // Git for Windows (core.autocrlf=true) and a marketplace clone on Windows
    // can check the files out with CRLF; the context must not carry the \r.
    const lf = {};
    for (const [name, text] of Object.entries(realFiles())) lf[name] = text.replace(/\r\n/g, '\n');
    const crlf = {};
    for (const [name, text] of Object.entries(lf)) crlf[name] = text.replace(/\n/g, '\r\n');
    assert('the fixture is CRLF-encoded', Object.values(crlf).every(t => t.includes('\r\n')), true);
    const sLf = scratch(lf);
    const sCrlf = scratch(crlf);
    const rLf = run(sLf.hook);
    const rCrlf = run(sCrlf.hook);
    assert('exits 0', rCrlf.status, 0);
    const ctx = context(rCrlf);
    assert('additionalContext contains no \\r', ctx.includes('\r'), false);
    for (const [name, heading] of SECTIONS) {
        assert(`contains ${heading} (${name})`, ctx.includes(heading + '\n'), true);
    }
    assert('output is byte-identical to the LF tree\'s', rCrlf.stdout, rLf.stdout);
    fs.rmSync(sLf.root, { recursive: true, force: true });
    fs.rmSync(sCrlf.root, { recursive: true, force: true });
}

// A settings.json hook block wiring one command, the shape a legacy install
// merged in.
function wired(command) {
    return {
        model: 'opus',
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command, timeout: 2000 }] }] },
    };
}

const LEGACY_COMMAND = 'node "$HOME/.claude/hooks/pre-commit-review.js"';
const WARNING_HEAD = '> sdlc plugin WARNING:';

// The fix the warning must give: uninstall.sh run from a checkout.
function namesFix(text) {
    return text.includes('./uninstall.sh') && /checkout/.test(text);
}

console.log('\nA legacy install still wired in settings.json:');
{
    const home = scratchHome(wired(LEGACY_COMMAND));
    const r = run(HOOK, home);
    assert('exits 0', r.status, 0);
    assert('stdout is one JSON object', r.json !== null && typeof r.json === 'object', true);
    const ctx = context(r);
    assert('additionalContext begins with the warning', ctx.startsWith(WARNING_HEAD), true);
    const warning = ctx.split('\n\n---\n\n')[0];
    assert('the warning names the double-run', /twice/.test(warning), true);
    assert('the warning names the script it found', warning.includes('pre-commit-review.js'), true);
    assert('the warning gives the fix (./uninstall.sh from a checkout)', namesFix(warning), true);
    for (const [name, heading] of SECTIONS) {
        assert(`still carries ${heading} (${name})`, ctx.includes(heading + '\n'), true);
    }
    console.log(`  additionalContext length with the warning: ${ctx.length} (cap ${CAP})`);
    assert(`length with the warning under the ${CAP}-character cap`, ctx.length < CAP, true);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nLEGACY_SCRIPTS is exactly the scripts the legacy wiring names:');
{
    let legacy = {};
    try {
        legacy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'legacy', 'hooks-config.json'), 'utf-8'));
    } catch (e) { /* legacy stays empty; the next assertion reports it */ }
    const commands = Object.values(legacy).flatMap(blocks => blocks.flatMap(b => b.hooks.map(h => h.command)));
    assert('the legacy wiring names commands', commands.length > 0, true);
    const wiredScripts = [...new Set(commands
        .map(c => (/[\\/]\.claude[\\/]hooks[\\/]([\w.-]+\.js)/.exec(c) || [])[1])
        .filter(Boolean))].sort();
    assert('every legacy command names a ~/.claude/hooks script', wiredScripts.length, commands.length);
    // The list is inline in the hook, which runs on load rather than export it,
    // so it is read from the source text.
    const source = fs.readFileSync(HOOK, 'utf-8');
    const literal = (/const LEGACY_SCRIPTS = \[([^\]]*)\]/.exec(source) || [])[1] || '';
    const listed = [...literal.matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
    assert('LEGACY_SCRIPTS equals the scripts in legacy/hooks-config.json', listed, wiredScripts);
    for (const command of commands) {
        const home = scratchHome(wired(command));
        const ctx = context(run(HOOK, home));
        assert(`warns on ${command}`, ctx.startsWith(WARNING_HEAD), true);
        fs.rmSync(home, { recursive: true, force: true });
    }
}

console.log('\nA hook the legacy wiring never had is not a legacy install:');
{
    // uninstall.sh strips only what legacy/hooks-config.json names, so a warning
    // here would be one its own fix cannot clear.
    const home = scratchHome(wired('node "$HOME/.claude/hooks/stop-review-trigger.js"'));
    const ctx = context(run(HOOK, home));
    assert('no warning for stop-review-trigger.js', ctx.includes('WARNING'), false);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nAn expanded home path is detected too:');
{
    const home = scratchHome();
    fs.mkdirSync(path.join(home, '.claude'));
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'),
        JSON.stringify(wired(`node "${home}/.claude/hooks/enforce-co-author.js"`)));
    const ctx = context(run(HOOK, home));
    assert('warns on an absolute home path', ctx.startsWith(WARNING_HEAD), true);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nA clean settings.json:');
{
    const home = scratchHome(wired('node "/opt/tools/someone-elses-hook.js"'));
    const ctx = context(run(HOOK, home));
    assert('no warning', ctx.includes('WARNING'), false);
    assert('begins with the first section', ctx.startsWith(SECTIONS[0][1]), true);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nA user script that only resembles a toolchain hook:');
{
    const home = scratchHome(wired('node "$HOME/.claude/hooks/my-pre-commit-review.js"'));
    const ctx = context(run(HOOK, home));
    assert('no warning for my-pre-commit-review.js', ctx.includes('WARNING'), false);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nThe plugin\'s own wiring is not a legacy install:');
{
    const home = scratchHome(wired('node "${CLAUDE_PLUGIN_ROOT}/src/hooks/pre-commit-review.js"'));
    const ctx = context(run(HOOK, home));
    assert('no warning for a CLAUDE_PLUGIN_ROOT command', ctx.includes('WARNING'), false);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nNo settings.json:');
{
    const ctx = context(run(HOOK, CLEAN_HOME));
    assert('no warning', ctx.includes('WARNING'), false);
}

console.log('\nAn unreadable settings.json:');
{
    const home = scratchHome(undefined, { dir: true });
    const r = run(HOOK, home);
    assert('exits 0', r.status, 0);
    assert('stdout is one JSON object', r.json !== null && typeof r.json === 'object', true);
    const ctx = context(r);
    assert('additionalContext begins with a warning', ctx.startsWith(WARNING_HEAD), true);
    assert('the warning gives the fix', namesFix(ctx.split('\n\n---\n\n')[0]), true);
    assert('the sections still follow', ctx.includes(SECTIONS[3][1] + '\n'), true);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nAn unparseable settings.json:');
{
    const home = scratchHome('{ "hooks": ');
    const r = run(HOOK, home);
    assert('exits 0', r.status, 0);
    assert('stdout is one JSON object', r.json !== null && typeof r.json === 'object', true);
    const ctx = context(r);
    assert('additionalContext begins with a warning', ctx.startsWith(WARNING_HEAD), true);
    assert('the sections still follow', ctx.includes(SECTIONS[0][1] + '\n'), true);
    fs.rmSync(home, { recursive: true, force: true });
}

fs.rmSync(CLEAN_HOME, { recursive: true, force: true });

console.log(`\n================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
