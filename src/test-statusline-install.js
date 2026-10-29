// Tests for statusline-install.js: the opt-in installer that merges only the
// `statusLine` key into settings.json and copies the status line scripts.
// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('./hooks/lib/isolate-git-env.js').isolateGitEnv();

let failed = 0;

// Runs one case, printing PASS/FAIL; any failure makes the script exit non-zero.
function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (e) {
        console.log(`  FAIL: ${name}\n    ${e.message}`);
        failed++;
    }
}

const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolvePaths, Refusal } = require('./statusline-install.js');

const INSTALLER = path.join(__dirname, 'statusline-install.js');
const BACKUP_INFIX = '.backup.';
const BACKUP_SUFFIX = '-pre-sdlc-statusline';
const ANSI = /\x1b\[[0-9;]*m/g;

// Makes a scratch sandbox: a settings path, a data dir and a scratch home for children.
function sandbox() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-inst-'));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    const s = {
        root,
        home,
        settings: path.join(root, 'cfg', 'settings.json'),
        data: path.join(root, 'data'),
        script: path.join(root, 'data', 'statusline', 'statusline.js'),
        cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
    fs.mkdirSync(path.dirname(s.settings));
    return s;
}

// Runs the installer against a sandbox with every config location pointed at scratch paths.
function install(s, args = [], extra = {}) {
    const argv = [INSTALLER, '--settings', s.settings, '--data-dir', s.data, ...args];
    const r = spawnSync('node', argv, {
        encoding: 'utf8',
        env: {
            PATH: process.env.PATH,
            HOME: s.home,
            CLAUDE_CONFIG_DIR: path.join(s.root, 'cfg'),
            CLAUDE_PLUGIN_DATA: s.data,
            XDG_CACHE_HOME: path.join(s.root, 'cache'),
            ...extra,
        },
    });
    return { status: r.status, out: r.stdout + r.stderr };
}

// Lists every path under a directory, relative, sorted.
function listing(dir) {
    const out = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            out.push(path.relative(dir, p));
            if (e.isDirectory()) walk(p);
        }
    };
    walk(dir);
    return out.sort();
}

const backupsOf = (s) => fs.readdirSync(path.dirname(s.settings))
    .filter((n) => n.includes(BACKUP_INFIX) && n.endsWith(BACKUP_SUFFIX));

const OTHER = {
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] },
    env: { A: '1' },
    permissions: { allow: ['Bash(ls)'], deny: [] },
    model: 'opus',
    enabledPlugins: { 'sdlc@sdlc-claude-skills': true },
    futureUnknownKey: { nested: [1, 2, { z: null }] },
};
const OWN_COMMAND = (s) => `node "${s.script}"`;

test('no settings file: created with only statusLine, scripts copied', () => {
    const s = sandbox();
    try {
        const r = install(s);
        assert.strictEqual(r.status, 0, r.out);
        const doc = JSON.parse(fs.readFileSync(s.settings, 'utf8'));
        assert.deepStrictEqual(doc, { statusLine: { type: 'command', command: OWN_COMMAND(s), padding: 0 } });
        assert.ok(fs.existsSync(s.script));
        assert.ok(fs.existsSync(path.join(s.data, 'statusline', 'lib', 'day-cost.js')));
        assert.deepStrictEqual(backupsOf(s), []);
        assert.ok(/next session|refresh/.test(r.out), r.out);
    } finally { s.cleanup(); }
});

test('other keys survive an install and the old file is backed up byte for byte', () => {
    const s = sandbox();
    try {
        const before = JSON.stringify(OTHER, null, 2) + '\n';
        fs.writeFileSync(s.settings, before);
        fs.chmodSync(s.settings, 0o640);
        const r = install(s);
        assert.strictEqual(r.status, 0, r.out);
        assert.strictEqual(fs.statSync(s.settings).mode & 0o777, 0o640, 'file mode kept');
        const { statusLine, ...rest } = JSON.parse(fs.readFileSync(s.settings, 'utf8'));
        assert.deepStrictEqual(rest, OTHER);
        assert.strictEqual(statusLine.command, OWN_COMMAND(s));
        const backups = backupsOf(s);
        assert.strictEqual(backups.length, 1);
        assert.strictEqual(fs.readFileSync(path.join(path.dirname(s.settings), backups[0]), 'utf8'), before);
    } finally { s.cleanup(); }
});

test('a different statusLine is refused, and --force replaces it after a backup', () => {
    const s = sandbox();
    try {
        const mine = { ...OTHER, statusLine: { type: 'command', command: 'echo mine' } };
        const before = JSON.stringify(mine, null, 2) + '\n';
        fs.writeFileSync(s.settings, before);
        const refused = install(s);
        assert.strictEqual(refused.status, 2);
        assert.ok(refused.out.includes('echo mine') && refused.out.includes('--force'), refused.out);
        assert.strictEqual(fs.readFileSync(s.settings, 'utf8'), before);
        assert.deepStrictEqual(backupsOf(s), []);
        assert.ok(!fs.existsSync(s.data), 'a refusal must not create the data dir');

        const forced = install(s, ['--force']);
        assert.strictEqual(forced.status, 0, forced.out);
        const after = JSON.parse(fs.readFileSync(s.settings, 'utf8'));
        assert.strictEqual(after.statusLine.command, OWN_COMMAND(s));
        const { statusLine, ...rest } = after;
        const { statusLine: old, ...oldRest } = mine;
        assert.deepStrictEqual(rest, oldRest);
        const backups = backupsOf(s);
        assert.strictEqual(backups.length, 1);
        assert.strictEqual(fs.readFileSync(path.join(path.dirname(s.settings), backups[0]), 'utf8'), before);
    } finally { s.cleanup(); }
});

test('an identical statusLine is already installed: no write, files refreshed', () => {
    const s = sandbox();
    try {
        fs.writeFileSync(s.settings, JSON.stringify(OTHER) + '\n');
        assert.strictEqual(install(s).status, 0);
        const bytes = fs.readFileSync(s.settings);
        const backupsBefore = backupsOf(s);
        const lib = path.join(s.data, 'statusline', 'lib', 'day-cost.js');
        fs.rmSync(lib);
        const r = install(s);
        assert.strictEqual(r.status, 0, r.out);
        assert.ok(r.out.includes('already installed'), r.out);
        assert.ok(fs.readFileSync(s.settings).equals(bytes));
        assert.deepStrictEqual(backupsOf(s), backupsBefore);
        assert.ok(fs.existsSync(lib), 'the deleted copy returns');
    } finally { s.cleanup(); }
});

test('--dry-run lists the actions and writes nothing anywhere', () => {
    const s = sandbox();
    try {
        fs.writeFileSync(s.settings, JSON.stringify(OTHER) + '\n');
        const before = listing(s.root);
        const bytes = fs.readFileSync(s.settings);
        for (const args of [['--dry-run'], ['--dry-run', '--force'], ['--dry-run', '--remove']]) {
            const r = install(s, args);
            assert.ok(r.status === 0 || r.status === 2, r.out);
            assert.deepStrictEqual(listing(s.root), before, args.join(' '));
            assert.ok(fs.readFileSync(s.settings).equals(bytes));
        }
        const r = install(s, ['--dry-run']);
        assert.strictEqual(r.status, 0, r.out);
        for (const word of ['copy', 'backup', 'merge']) assert.ok(r.out.toLowerCase().includes(word), `${word}: ${r.out}`);
    } finally { s.cleanup(); }
});

test('--remove drops our key and data dir, leaves a foreign key, copes with none', () => {
    const s = sandbox();
    try {
        fs.writeFileSync(s.settings, JSON.stringify(OTHER) + '\n');
        assert.strictEqual(install(s).status, 0);
        const r = install(s, ['--remove']);
        assert.strictEqual(r.status, 0, r.out);
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(s.settings, 'utf8')), OTHER);
        assert.ok(!fs.existsSync(path.join(s.data, 'statusline')));
        assert.ok(r.out.split('\n').includes(`removed ${path.join(s.data, 'statusline')}`), r.out);
        assert.strictEqual(backupsOf(s).length, 2, 'install and remove each back up');

        const none = install(s, ['--remove']);
        assert.strictEqual(none.status, 0, none.out);
        assert.ok(/nothing to remove/i.test(none.out), none.out);

        const foreign = JSON.stringify({ ...OTHER, statusLine: { type: 'command', command: 'echo mine' } });
        fs.writeFileSync(s.settings, foreign);
        const kept = install(s, ['--remove']);
        assert.strictEqual(kept.status, 2, kept.out);
        assert.strictEqual(fs.readFileSync(s.settings, 'utf8'), foreign);
    } finally { s.cleanup(); }
});

test('refusals exit 2 and write nothing: symlink, invalid JSON, JSON array', () => {
    const s = sandbox();
    try {
        const target = path.join(s.root, 'real.json');
        fs.writeFileSync(target, '{}\n');
        const cases = {
            symlink: () => fs.symlinkSync(target, s.settings),
            'invalid JSON': () => fs.writeFileSync(s.settings, '{"a": '),
            array: () => fs.writeFileSync(s.settings, '[1, 2]\n'),
        };
        for (const [name, setup] of Object.entries(cases)) {
            fs.rmSync(s.settings, { force: true });
            setup();
            const before = listing(s.root);
            const r = install(s, name === 'array' ? ['--force'] : []);
            assert.strictEqual(r.status, 2, `${name}: ${r.out}`);
            assert.deepStrictEqual(listing(s.root), before, name);
            assert.strictEqual(fs.readFileSync(target, 'utf8'), '{}\n', 'the link target is untouched');
        }
    } finally { s.cleanup(); }
});

test('the written command is exactly node "<data dir>/statusline/statusline.js" and the copy runs', () => {
    const s = sandbox();
    try {
        assert.strictEqual(install(s).status, 0);
        const command = JSON.parse(fs.readFileSync(s.settings, 'utf8')).statusLine.command;
        assert.strictEqual(command, `node "${path.join(s.data, 'statusline', 'statusline.js')}"`);
        const input = {
            model: { display_name: 'Sonnet' },
            cost: { total_cost_usd: 1.2 },
            workspace: { current_dir: os.tmpdir() },
            context_window: { context_window_size: 200000, remaining_percentage: 73, current_usage: { input_tokens: 54000 } },
        };
        const r = spawnSync('node', [s.script], {
            input: JSON.stringify(input),
            encoding: 'utf8',
            env: { PATH: process.env.PATH, HOME: s.home, XDG_CACHE_HOME: path.join(s.root, 'cache') },
        });
        assert.strictEqual(r.status, 0, r.stderr);
        assert.ok(r.stdout.replace(ANSI, '').startsWith('ctx 27% used (54k/200k)'), r.stdout);
    } finally { s.cleanup(); }
});

test('refusals name the cause and write nothing: shell-unsafe data dir, empty file, BOM', () => {
    const s = sandbox();
    try {
        const cases = [];
        for (const ch of ['"', '$', '`', '\\']) {
            cases.push({
                name: `data dir with ${ch}`,
                setup: () => fs.writeFileSync(s.settings, '{}\n'),
                args: ['--data-dir', path.join(s.root, `d${ch}x`)],
                expect: [ch, '--data-dir'],
            });
        }
        cases.push({
            name: 'empty file',
            setup: () => fs.writeFileSync(s.settings, ''),
            args: [],
            expect: ['settings.json is empty. Put {} in it, or delete it, then re-run.'],
        });
        cases.push({
            name: 'BOM',
            setup: () => fs.writeFileSync(s.settings, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}\n')])),
            args: [],
            expect: ['settings.json starts with a byte order mark (BOM). Save it as UTF-8 without BOM, then re-run.'],
        });
        for (const c of cases) {
            fs.rmSync(s.settings, { force: true });
            c.setup();
            const before = listing(s.root);
            const r = install(s, c.args);
            assert.strictEqual(r.status, 2, `${c.name}: ${r.out}`);
            for (const frag of c.expect) assert.ok(r.out.includes(frag), `${c.name}: ${r.out}`);
            assert.deepStrictEqual(listing(s.root), before, c.name);
        }
    } finally { s.cleanup(); }
});

test('a null statusLine counts as absent; any other value still needs --force', () => {
    const s = sandbox();
    try {
        fs.writeFileSync(s.settings, JSON.stringify({ model: 'm', statusLine: null }));
        const r = install(s);
        assert.strictEqual(r.status, 0, r.out);
        assert.strictEqual(JSON.parse(fs.readFileSync(s.settings, 'utf8')).statusLine.command, OWN_COMMAND(s));
        for (const other of [0, '', false, 'x', []]) {
            fs.writeFileSync(s.settings, JSON.stringify({ statusLine: other }));
            const kept = install(s);
            assert.strictEqual(kept.status, 2, `${JSON.stringify(other)}: ${kept.out}`);
        }
    } finally { s.cleanup(); }
});

test('resolvePaths: win32 treats backslash as a separator; other unsafe chars and POSIX backslashes still refuse', () => {
    const WIN_DATA = 'C:\\Users\\x\\.claude\\plugins\\data\\sdlc-sdlc-claude-skills';
    const WIN_COMMAND = 'node "C:/Users/x/.claude/plugins/data/sdlc-sdlc-claude-skills/statusline/statusline.js"';
    const ok = [
        { name: 'win32 CLAUDE_PLUGIN_DATA', platform: 'win32', env: { CLAUDE_PLUGIN_DATA: WIN_DATA }, command: WIN_COMMAND },
        {
            name: 'win32 CLAUDE_CONFIG_DIR fallback',
            platform: 'win32',
            env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\x\\.claude' },
            command: 'node "C:/Users/x/.claude/plugins/data/sdlc-sdlc-claude-skills/statusline/statusline.js"',
        },
        { name: 'win32 UNC share keeps the leading //', platform: 'win32', env: { CLAUDE_PLUGIN_DATA: '\\\\server\\share\\d' }, command: 'node "//server/share/d/statusline/statusline.js"' },
        { name: 'win32 space in path', platform: 'win32', env: { CLAUDE_PLUGIN_DATA: 'C:\\Users\\John Smith\\.claude\\plugins\\data\\x' }, command: 'node "C:/Users/John Smith/.claude/plugins/data/x/statusline/statusline.js"' },
        { name: 'win32 trailing backslash', platform: 'win32', env: { CLAUDE_PLUGIN_DATA: 'C:\\d\\' }, command: 'node "C:/d/statusline/statusline.js"' },
        { name: 'win32 mixed separators', platform: 'win32', env: { CLAUDE_PLUGIN_DATA: 'C:\\d/e\\f' }, command: 'node "C:/d/e/f/statusline/statusline.js"' },
    ];
    for (const c of ok) {
        const p = resolvePaths({}, c.env, c.platform);
        assert.strictEqual(p.command, c.command, c.name);
        assert.strictEqual(p.dataDir.includes('\\'), true, `${c.name}: dataDir is not rewritten to forward slashes`);
    }
    const refused = [
        { name: 'win32 with $', platform: 'win32', data: 'C:\\Users\\a$b' },
        { name: 'win32 with double quote', platform: 'win32', data: 'C:\\Users\\a"b' },
        { name: 'win32 with backtick', platform: 'win32', data: 'C:\\Users\\a`b' },
        { name: 'linux with backslash', platform: 'linux', data: '/home/a\\b' },
    ];
    for (const c of refused) {
        assert.throws(() => resolvePaths({}, { CLAUDE_PLUGIN_DATA: c.data }, c.platform), Refusal, c.name);
    }
});

if (failed) process.exit(1);
