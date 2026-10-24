// Tests for session-start-instructions.js: the plugin SessionStart hook that
// injects the four instruction sections (instructions/*.md) as additionalContext.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

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
    // Opted out of the shipped main-model default, so tests about other things
    // see no model line. The main-model rows replace or remove this file.
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'sdlc-review.json'), JSON.stringify({ mainModel: 'off' }));
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
// Env vars the cache-TTL check reads; stripped so the machine's own do not leak in.
const INHERITED = /^(ANTHROPIC_|CLAUDE_CODE_|FORCE_|ENABLE_|SDLC_)/;

function run(script, home, extraEnv, cwd) {
    const h = home || CLEAN_HOME;
    const env = {};
    for (const [k, v] of Object.entries(process.env)) if (!INHERITED.test(k)) env[k] = v;
    Object.assign(env, { HOME: h, USERPROFILE: h }, extraEnv);
    const input = JSON.stringify(cwd ? { cwd } : {});
    const res = spawnSync('node', [script], { input, encoding: 'utf-8', env });
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
    assert('no warning for stop-review-trigger.js', ctx.includes(WARNING_HEAD), false);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nAn expanded home path is detected too:');
{
    const home = scratchHome();
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
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
    assert('no warning', ctx.includes(WARNING_HEAD), false);
    assert('begins with the first section', ctx.startsWith(SECTIONS[0][1]), true);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nA user script that only resembles a toolchain hook:');
{
    const home = scratchHome(wired('node "$HOME/.claude/hooks/my-pre-commit-review.js"'));
    const ctx = context(run(HOOK, home));
    assert('no warning for my-pre-commit-review.js', ctx.includes(WARNING_HEAD), false);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nThe plugin\'s own wiring is not a legacy install:');
{
    const home = scratchHome(wired('node "${CLAUDE_PLUGIN_ROOT}/src/hooks/pre-commit-review.js"'));
    const ctx = context(run(HOOK, home));
    assert('no warning for a CLAUDE_PLUGIN_ROOT command', ctx.includes(WARNING_HEAD), false);
    fs.rmSync(home, { recursive: true, force: true });
}

console.log('\nNo settings.json:');
{
    const ctx = context(run(HOOK, CLEAN_HOME));
    assert('no warning', ctx.includes(WARNING_HEAD), false);
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

console.log('\nThe prompt-cache TTL warning and the 1h write:');
{
    const GATEWAY = { ANTHROPIC_BASE_URL: 'https://gw.example.test' };
    const SECRET = 'sk-secret-token-value-123';
    const FIX_LINE = 'export CLAUDE_CODE_PROMPT_CACHE_TTL=1h';
    const WARN_HEAD = '> sdlc plugin WARNING: the main conversation will use the 5-minute prompt cache';
    const WROTE_HEAD = '> sdlc plugin WARNING: sdlc set `"promptCacheTtl": "1h"` in ';
    const RICH = {
        model: 'opus',
        enabledPlugins: { 'sdlc@sdlc-claude-skills': true },
        hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node x.js' }] }] },
    };
    const MALFORMED = '{ "env": ';
    // Marker: user settings.json is a symlink to a real file elsewhere in the scratch dir.
    const SYMLINKED = 'symlinked';
    // Outcomes: WROTE = settings.json now has the 1h key and the message says so;
    // WARN = no write, the manual-fix warning; SILENT = no write, no TTL line.
    const WROTE = 'wrote';
    const WARN = 'warn';
    const SILENT = 'silent';
    // [name, env, user settings, project settings, outcome]
    const rows = [
        ['gateway URL, no TTL, empty settings', GATEWAY, {}, undefined, WROTE],
        ['gateway URL, no TTL, settings missing', GATEWAY, undefined, undefined, WROTE],
        ['gateway + env 1h', { ...GATEWAY, CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' }, undefined, undefined, SILENT],
        ['gateway + user settings 1h', GATEWAY, { promptCacheTtl: '1h' }, undefined, SILENT],
        ['gateway + project settings 1h', GATEWAY, undefined, { promptCacheTtl: '1h' }, SILENT],
        ['gateway + ENABLE_PROMPT_CACHING_1H', { ...GATEWAY, ENABLE_PROMPT_CACHING_1H: '1' }, undefined, undefined, SILENT],
        ['gateway + explicit env 5m', { ...GATEWAY, CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' }, undefined, undefined, SILENT],
        ['gateway + explicit setting 5m', GATEWAY, { promptCacheTtl: '5m' }, undefined, SILENT],
        ['FORCE_PROMPT_CACHING_5M', { ...GATEWAY, FORCE_PROMPT_CACHING_5M: '1' }, undefined, undefined, SILENT],
        ['no backend vars', {}, undefined, undefined, SILENT],
        ['backend only in settings env', {}, { env: { ANTHROPIC_BASE_URL: 'https://gw.example.test' } }, undefined, WROTE],
        ['backend only in project settings env', {}, undefined, { env: { ANTHROPIC_API_KEY: SECRET } }, WROTE],
        ['Bedrock flag', { CLAUDE_CODE_USE_BEDROCK: '1' }, undefined, undefined, WROTE],
        ['malformed user settings', GATEWAY, MALFORMED, undefined, WARN],
        ['user settings is a JSON array', GATEWAY, '[1, 2]', undefined, WARN],
        ['user settings.json is a symlink', GATEWAY, SYMLINKED, undefined, WARN],
        ['malformed project settings', GATEWAY, undefined, '{ nope', WROTE],
        ['API key value never printed', { ANTHROPIC_API_KEY: SECRET }, undefined, undefined, WROTE],
    ];
    // Run one hook call over a scratch HOME (and cwd). Returns the pieces the rows check.
    const userPath = home => path.join(home, '.claude', 'settings.json');
    const backups = home => {
        const dir = path.join(home, '.claude');
        return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.includes('.backup.')) : [];
    };
    for (const [name, env, userSettings, projectSettings, outcome] of rows) {
        const home = scratchHome(userSettings === SYMLINKED ? {} : userSettings);
        let realPath = null;
        if (userSettings === SYMLINKED) {
            realPath = path.join(home, 'dotfiles-settings.json');
            fs.renameSync(userPath(home), realPath);
            fs.symlinkSync(realPath, userPath(home));
        }
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ssi-cwd-'));
        if (projectSettings !== undefined) {
            fs.mkdirSync(path.join(cwd, '.claude'));
            fs.writeFileSync(path.join(cwd, '.claude', 'settings.json'),
                typeof projectSettings === 'string' ? projectSettings : JSON.stringify(projectSettings));
        }
        const before = fs.existsSync(userPath(home)) && fs.statSync(userPath(home)).isFile()
            ? fs.readFileSync(userPath(home), 'utf-8') : null;
        const r = run(HOOK, home, env, cwd);
        const ctx = context(r);
        const after = fs.existsSync(userPath(home)) ? fs.readFileSync(userPath(home), 'utf-8') : null;
        assert(`${name}: exit 0 and one JSON object`, r.status === 0 && r.json !== null, true);
        assert(`${name}: warns to set by hand`, ctx.includes(WARN_HEAD), outcome === WARN);
        assert(`${name}: says sdlc set the key`, ctx.includes(WROTE_HEAD), outcome === WROTE);
        if (outcome === WARN) {
            assert(`${name}: names the fix`, ctx.includes(FIX_LINE) && ctx.includes('"promptCacheTtl": "1h"'), true);
        }
        if (outcome === WROTE) {
            assert(`${name}: says next session and sub-agents and the opt-out`,
                /next\s+session/.test(ctx) && ctx.includes('Sub-agents stay on 5 minutes') &&
                ctx.includes('touch ' + path.join(home, '.claude', 'sdlc-cache-ttl.disabled')), true);
            let key;
            try {
                key = JSON.parse(after).promptCacheTtl;
            } catch (e) { /* key stays undefined */ }
            assert(`${name}: settings.json holds promptCacheTtl 1h`, key, '1h');
        } else {
            assert(`${name}: settings.json not written`, after, before);
            assert(`${name}: no backup`, backups(home), []);
        }
        if (realPath) {
            assert(`${name}: still a symlink to the same target`,
                fs.lstatSync(userPath(home)).isSymbolicLink() && fs.readlinkSync(userPath(home)) === realPath, true);
            assert(`${name}: real file bytes unchanged`, fs.readFileSync(realPath, 'utf-8'), before);
        }
        assert(`${name}: no secret in output`, r.stdout.includes(SECRET) || r.stdout.includes('gw.example.test'), false);
        fs.rmSync(home, { recursive: true, force: true });
        fs.rmSync(cwd, { recursive: true, force: true });
    }

    console.log('\nThe write keeps the file and is idempotent:');
    {
        const home = scratchHome(RICH);
        const r1 = run(HOOK, home, GATEWAY);
        const written = JSON.parse(fs.readFileSync(userPath(home), 'utf-8'));
        const { promptCacheTtl, ...rest } = written;
        assert('the key is 1h', promptCacheTtl, '1h');
        assert('every other key is unchanged (deep-equal)', rest, RICH);
        assert('the file is 2-space JSON with a trailing newline',
            fs.readFileSync(userPath(home), 'utf-8'), JSON.stringify(written, null, 2) + '\n');
        const b = backups(home);
        assert('one backup, named pre-sdlc-cache-ttl', b.length === 1 &&
            /^settings\.json\.backup\.\d{4}-\d\d-\d\dT\d{6}-pre-sdlc-cache-ttl$/.test(b[0]), true);
        assert('the backup holds the old settings',
            JSON.parse(fs.readFileSync(path.join(home, '.claude', b[0]), 'utf-8')), RICH);
        assert('no temp file left', fs.readdirSync(path.join(home, '.claude')).some(f => f.includes('.tmp.')), false);
        assert('the message says next session', /next\s+session/.test(context(r1)), true);
        const bytes = fs.readFileSync(userPath(home), 'utf-8');
        const r2 = run(HOOK, home, GATEWAY);
        assert('second run: no TTL line', context(r2).includes('prompt cache'), false);
        assert('second run: file unchanged', fs.readFileSync(userPath(home), 'utf-8'), bytes);
        assert('second run: no new backup', backups(home).length, 1);
        fs.rmSync(home, { recursive: true, force: true });
    }

    console.log('\nOpt-out, malformed files, a missing file and CLAUDE_CONFIG_DIR:');
    {
        const home = scratchHome(RICH);
        fs.writeFileSync(path.join(home, '.claude', 'sdlc-cache-ttl.disabled'), '');
        const before = fs.readFileSync(userPath(home), 'utf-8');
        const ctx = context(run(HOOK, home, GATEWAY));
        assert('opt-out: warning text', ctx.includes(WARN_HEAD) && ctx.includes(FIX_LINE), true);
        assert('opt-out: not written', fs.readFileSync(userPath(home), 'utf-8'), before);
        assert('opt-out: no backup', backups(home), []);
        fs.rmSync(home, { recursive: true, force: true });
    }
    {
        const home = scratchHome(MALFORMED);
        const ctx = context(run(HOOK, home, GATEWAY));
        assert('malformed: warning text', ctx.includes(WARN_HEAD), true);
        assert('malformed: bytes unchanged', fs.readFileSync(userPath(home), 'utf-8'), MALFORMED);
        fs.rmSync(home, { recursive: true, force: true });
    }
    {
        const home = scratchHome();
        const r = run(HOOK, home, GATEWAY);
        assert('missing: created with only the key',
            JSON.parse(fs.readFileSync(userPath(home), 'utf-8')), { promptCacheTtl: '1h' });
        assert('missing: no backup', backups(home), []);
        assert('missing: says sdlc set it', context(r).includes(WROTE_HEAD), true);
        fs.rmSync(home, { recursive: true, force: true });
    }
    {
        const home = scratchHome(RICH);
        const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'ssi-cfg-'));
        fs.writeFileSync(path.join(cfg, 'settings.json'), JSON.stringify({ model: 'sonnet' }));
        const homeBefore = fs.readFileSync(userPath(home), 'utf-8');
        const ctx = context(run(HOOK, home, { ...GATEWAY, CLAUDE_CONFIG_DIR: cfg }));
        assert('CLAUDE_CONFIG_DIR: written there',
            JSON.parse(fs.readFileSync(path.join(cfg, 'settings.json'), 'utf-8')), { model: 'sonnet', promptCacheTtl: '1h' });
        assert('CLAUDE_CONFIG_DIR: HOME/.claude untouched', fs.readFileSync(userPath(home), 'utf-8'), homeBefore);
        assert('CLAUDE_CONFIG_DIR: message names that path', ctx.includes(path.join(cfg, 'settings.json')), true);
        const again = context(run(HOOK, home, { ...GATEWAY, CLAUDE_CONFIG_DIR: cfg }));
        assert('CLAUDE_CONFIG_DIR: its settings are read (second run silent)', again.includes('prompt cache'), false);
        fs.rmSync(home, { recursive: true, force: true });
        fs.rmSync(cfg, { recursive: true, force: true });
    }
}

console.log('\nThe main-session model (mainModel in the user sdlc-review.json):');
const DIRECT = '> sdlc plugin WARNING: main-session model set to';
const settingsOf = home => path.join(home, '.claude', 'settings.json');
const backupsOf = home => fs.readdirSync(path.join(home, '.claude')).filter(f => f.includes('.backup.'));
{
    // Each row: name, user sdlc-review.json (object or string, undefined = none),
    // settings.json, repo sdlc-review.json, env, expected model after the run,
    // expect a "set to" line, expect a backup, extra text the output must hold.
    const SYMLINK = 'symlink';
    const rows = [
        ['set, differs', { mainModel: 'opus' }, { model: 'sonnet', theme: 'dark' }, undefined, {}, 'opus', true, true, 'from the next session'],
        ['set, settings missing', { mainModel: 'haiku' }, undefined, undefined, {}, 'haiku', true, false, '/sdlc:main-model'],
        ['set, equal', { mainModel: 'opus' }, { model: 'opus' }, undefined, {}, 'opus', false, false, ''],
        ['absent, settings already sonnet', { round1: 'sonnet' }, { model: 'sonnet' }, undefined, {}, 'sonnet', false, false, ''],
        ['no user file, settings already sonnet', undefined, { model: 'sonnet' }, undefined, {}, 'sonnet', false, false, ''],
        ['shipped default, absent key overrides opus', { round1: 'sonnet' }, { model: 'opus', theme: 'dark' }, undefined, {}, 'sonnet', true, true, 'shipped default'],
        ['shipped default, no user file overrides opus', undefined, { model: 'opus' }, undefined, {}, 'sonnet', true, true, 'shipped default'],
        ['shipped default, settings has no model', undefined, { theme: 'dark' }, undefined, {}, 'sonnet', true, true, 'shipped default'],
        ['shipped default, settings missing', undefined, undefined, undefined, {}, 'sonnet', true, false, 'shipped default'],
        ['explicit off keeps the user model', { mainModel: 'off' }, { model: 'opus' }, undefined, {}, 'opus', false, false, ''],
        ['explicit mainModel beats the shipped default', { mainModel: 'opus' }, { model: 'sonnet' }, undefined, {}, 'opus', true, true, ''],
        ['invalid value', { mainModel: 'gpt' }, { model: 'sonnet' }, undefined, {}, 'sonnet', false, false, ''],
        ['malformed user file', '{nope', { model: 'sonnet' }, undefined, {}, 'sonnet', false, false, ''],
        ['repo layer ignored', undefined, { model: 'sonnet' }, { mainModel: 'opus' }, {}, 'sonnet', false, false, 'ignored'],
        ['repo layer ignored, user wins', { mainModel: 'haiku' }, { model: 'sonnet' }, { mainModel: 'opus' }, {}, 'haiku', true, true, 'ignored'],
        ['ANTHROPIC_MODEL set', { mainModel: 'opus' }, { model: 'sonnet' }, undefined, { ANTHROPIC_MODEL: 'claude-x-1' }, 'opus', true, true, 'ANTHROPIC_MODEL'],
        ['ANTHROPIC_MODEL set, equal', { mainModel: 'opus' }, { model: 'opus' }, undefined, { ANTHROPIC_MODEL: 'claude-x-1' }, 'opus', false, false, 'ANTHROPIC_MODEL'],
        ['ANTHROPIC_MODEL, no mainModel', undefined, { model: 'sonnet' }, undefined, { ANTHROPIC_MODEL: 'claude-x-1' }, 'sonnet', false, false, ''],
        ['settings symlinked', { mainModel: 'opus' }, SYMLINK, undefined, {}, 'sonnet', false, false, ''],
        ['settings malformed', { mainModel: 'opus' }, '{nope', undefined, {}, undefined, false, false, ''],
    ];
    for (const [name, user, settings, repo, env, model, direct, backup, extra] of rows) {
        const home = scratchHome(settings === SYMLINK ? { model: 'sonnet' } : settings);
        let real = null;
        if (settings === SYMLINK) {
            real = path.join(home, 'dotfiles.json');
            fs.renameSync(settingsOf(home), real);
            fs.symlinkSync(real, settingsOf(home));
        }
        fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
        if (user !== undefined) {
            fs.writeFileSync(path.join(home, '.claude', 'sdlc-review.json'), typeof user === 'string' ? user : JSON.stringify(user));
        } else {
            fs.rmSync(path.join(home, '.claude', 'sdlc-review.json'), { force: true });
        }
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ssi-cwd-'));
        if (repo !== undefined) {
            fs.mkdirSync(path.join(cwd, '.claude'));
            fs.writeFileSync(path.join(cwd, '.claude', 'sdlc-review.json'), JSON.stringify(repo));
        }
        const before = fs.existsSync(settingsOf(home)) ? fs.readFileSync(real || settingsOf(home), 'utf-8') : null;
        const r = run(HOOK, home, env, cwd);
        const ctx = context(r);
        assert(`${name}: exit 0 and one JSON object`, r.status === 0 && r.json !== null, true);
        assert(`${name}: "set to" line`, ctx.includes(DIRECT), direct);
        if (extra) assert(`${name}: output holds "${extra}"`, ctx.includes(extra), true);
        let after = null;
        try {
            after = JSON.parse(fs.readFileSync(settingsOf(home), 'utf-8'));
        } catch (e) { /* malformed or missing */ }
        if (model !== undefined) assert(`${name}: model in settings.json`, after && after.model, model);
        assert(`${name}: backup`, backupsOf(home).length, backup ? 1 : 0);
        if (direct && settings && typeof settings === 'object') {
            const { model: ignored, ...rest } = after;
            const { model: ignored2, ...restBefore } = settings;
            assert(`${name}: other keys kept`, rest, restBefore);
            assert(`${name}: backup holds the old file`,
                JSON.parse(fs.readFileSync(path.join(home, '.claude', backupsOf(home)[0]), 'utf-8')), settings);
            assert(`${name}: message names the file`, ctx.includes(settingsOf(home)), true);
        }
        if (!direct && settings !== undefined) {
            assert(`${name}: settings bytes unchanged`, fs.readFileSync(real || settingsOf(home), 'utf-8'), before);
        }
        if (real) assert(`${name}: still a symlink`, fs.lstatSync(settingsOf(home)).isSymbolicLink(), true);
        assert(`${name}: no env value printed`, r.stdout.includes('claude-x-1'), false);
        assert(`${name}: no temp file left`, fs.readdirSync(path.join(home, '.claude')).some(f => f.includes('.tmp.')), false);
        fs.rmSync(home, { recursive: true, force: true });
        fs.rmSync(cwd, { recursive: true, force: true });
    }
    {
        const home = scratchHome({ model: 'sonnet' });
        fs.writeFileSync(path.join(home, '.claude', 'sdlc-review.json'), JSON.stringify({ mainModel: 'opus' }));
        run(HOOK, home);
        const bytes = fs.readFileSync(settingsOf(home), 'utf-8');
        const again = context(run(HOOK, home));
        assert('second run: silent', again.includes(DIRECT), false);
        assert('second run: file unchanged, one backup', [fs.readFileSync(settingsOf(home), 'utf-8'), backupsOf(home).length], [bytes, 1]);
        const named = backupsOf(home)[0];
        assert('backup is named pre-sdlc-model', /-pre-sdlc-model$/.test(named), true);
        fs.rmSync(home, { recursive: true, force: true });
    }
}

console.log('\nAuto-update for the marketplace (extraKnownMarketplaces in the user settings):');
{
    const NAME = 'sdlc-claude-skills';
    const REPO = 'conorpbrennan/sdlc-claude-skills';
    const SRC = { source: 'github', repo: REPO };
    const OURS = { [NAME]: { source: SRC, installLocation: '/x', lastUpdated: 'now' } };
    const FORK = { [NAME]: { source: { source: 'github', repo: 'someone/fork' } } };
    const LOCAL = { [NAME]: { source: { source: 'directory', path: '/work/sdlc' } } };
    const AUTO = '> sdlc plugin WARNING: sdlc turned on auto-update';
    const OTHER = { 'other-mp': { source: { source: 'github', repo: 'a/b' } } };
    // Each row: name, known_marketplaces.json (object or string, undefined = none),
    // settings.json (undefined = none), opt-out file present, expected
    // extraKnownMarketplaces after the run (undefined = key absent), expect the
    // "turned on" line, expect a backup.
    const rows = [
        ['registered, no key', OURS, { theme: 'dark' }, false, { [NAME]: { source: SRC, autoUpdate: true } }, true, true],
        ['registered, other marketplace kept', OURS, { extraKnownMarketplaces: OTHER }, false, { ...OTHER, [NAME]: { source: SRC, autoUpdate: true } }, true, true],
        ['registered, entry without autoUpdate', OURS, { extraKnownMarketplaces: { [NAME]: { source: SRC, note: 'mine' } } }, false, { [NAME]: { source: SRC, note: 'mine', autoUpdate: true } }, true, true],
        ['explicit false is respected', OURS, { extraKnownMarketplaces: { [NAME]: { source: SRC, autoUpdate: false } } }, false, { [NAME]: { source: SRC, autoUpdate: false } }, false, false],
        ['already true, silent', OURS, { extraKnownMarketplaces: { [NAME]: { source: SRC, autoUpdate: true } } }, false, { [NAME]: { source: SRC, autoUpdate: true } }, false, false],
        ['settings missing, created', OURS, undefined, false, { [NAME]: { source: SRC, autoUpdate: true } }, true, false],
        ['opt-out file', OURS, { theme: 'dark' }, true, undefined, false, false],
        ['no known_marketplaces.json', undefined, { theme: 'dark' }, false, undefined, false, false],
        ['known_marketplaces malformed', '{nope', { theme: 'dark' }, false, undefined, false, false],
        ['fork of the same name', FORK, { theme: 'dark' }, false, undefined, false, false],
        ['local-path marketplace', LOCAL, { theme: 'dark' }, false, undefined, false, false],
        ['another marketplace only', OTHER, { theme: 'dark' }, false, undefined, false, false],
        ['settings malformed', OURS, '{nope', false, undefined, false, false],
        ['extraKnownMarketplaces not an object', OURS, { extraKnownMarketplaces: 'x' }, false, 'x', false, false],
    ];
    for (const [name, known, settings, optOut, expected, line, backup] of rows) {
        const home = scratchHome(settings);
        const dir = path.join(home, '.claude');
        if (known !== undefined) {
            fs.mkdirSync(path.join(dir, 'plugins'), { recursive: true });
            fs.writeFileSync(path.join(dir, 'plugins', 'known_marketplaces.json'), typeof known === 'string' ? known : JSON.stringify(known));
        }
        if (optOut) fs.writeFileSync(path.join(dir, 'sdlc-autoupdate.disabled'), '');
        const before = fs.existsSync(settingsOf(home)) ? fs.readFileSync(settingsOf(home), 'utf-8') : null;
        const r = run(HOOK, home);
        const ctx = context(r);
        assert(`${name}: exit 0 and one JSON object`, r.status === 0 && r.json !== null, true);
        assert(`${name}: "turned on" line`, ctx.includes(AUTO), line);
        let after = null;
        try {
            after = JSON.parse(fs.readFileSync(settingsOf(home), 'utf-8'));
        } catch (e) { /* malformed or missing */ }
        assert(`${name}: extraKnownMarketplaces`, after ? after.extraKnownMarketplaces : undefined, expected);
        assert(`${name}: backup`, backupsOf(home).filter(f => f.endsWith('-pre-sdlc-autoupdate')).length, backup ? 1 : 0);
        if (line && settings && typeof settings === 'object') {
            const { extraKnownMarketplaces: ignored, ...rest } = after;
            const { extraKnownMarketplaces: ignored2, ...restBefore } = settings;
            assert(`${name}: other keys kept`, rest, restBefore);
            assert(`${name}: message names the opt-out`, ctx.includes('sdlc-autoupdate.disabled') && ctx.includes('autoUpdate'), true);
        }
        if (!line && before !== null) {
            assert(`${name}: settings bytes unchanged`, fs.readFileSync(settingsOf(home), 'utf-8'), before);
        }
        if (line) {
            const again = context(run(HOOK, home));
            assert(`${name}: second run silent`, again.includes(AUTO), false);
        }
        assert(`${name}: no temp file left`, fs.readdirSync(dir).some(f => f.includes('.tmp.')), false);
        fs.rmSync(home, { recursive: true, force: true });
    }
    // The constants the hook writes must be the marketplace this repo publishes.
    const mp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.claude-plugin', 'marketplace.json'), 'utf-8'));
    const hookSrc = fs.readFileSync(HOOK, 'utf-8');
    assert('hook marketplace name matches marketplace.json', (/const MARKETPLACE_NAME = '([^']*)'/.exec(hookSrc) || [])[1], mp.name);
    assert('hook marketplace repo is conorpbrennan/sdlc-claude-skills', (/const MARKETPLACE_REPO = '([^']*)'/.exec(hookSrc) || [])[1], REPO);
}

fs.rmSync(CLEAN_HOME, { recursive: true, force: true });

console.log(`\n================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
