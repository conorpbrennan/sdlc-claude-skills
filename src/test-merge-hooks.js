// Tests for merge-hooks.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MERGE_SCRIPT = path.join(__dirname, 'merge-hooks.js');
const TMP_DIR = path.join(__dirname, '..', 'tmp');
const TMP_SETTINGS = path.join(TMP_DIR, 'test-settings.json');
const HOOKS_CONFIG = path.join(__dirname, '..', '.claude', 'hooks-config.json');

if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr === expectedStr) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        console.log(`    expected: ${expectedStr}`);
        console.log(`    actual:   ${actualStr}`);
        failed++;
    }
}

function runMerge(settingsContent) {
    fs.writeFileSync(TMP_SETTINGS, JSON.stringify(settingsContent, null, 2));
    execSync(`node "${MERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8' });
    return JSON.parse(fs.readFileSync(TMP_SETTINGS, 'utf-8'));
}

const hooksConfig = JSON.parse(fs.readFileSync(HOOKS_CONFIG, 'utf-8'));

console.log('merge-hooks tests');
console.log('=================');

// Test 1: Merges hooks into settings with no existing hooks
console.log('\nSettings with no hooks section:');
let result = runMerge({
    apiKeyHelper: 'some-helper',
    model: 'opus'
});
assert('adds hooks section', result.hooks !== undefined, true);
assert('preserves apiKeyHelper', result.apiKeyHelper, 'some-helper');
assert('preserves model', result.model, 'opus');
// Derived from the config, not hardcoded: which events are wired is a
// deployment decision that changes over time (Stop was dropped when the
// stop hook was disabled), and the merge's job is to carry across whatever
// the config declares.
for (const event of Object.keys(hooksConfig)) {
    assert(`has ${event}`, Array.isArray(result.hooks[event]), true);
}

// Test 2: the user's own hooks survive. The merge used to assign
// `settings.hooks = config`, which dropped every hook the user had added
// themselves or taken from another project -- and uninstall could not bring
// them back, since it only strips this project's entries.
console.log('\nSettings with existing foreign hooks:');
result = runMerge({
    model: 'opus',
    hooks: {
        PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo old', timeout: 1000 }] }
        ],
        Notification: [
            { matcher: '', hooks: [{ type: 'command', command: 'node other.js' }] }
        ]
    }
});
const commandsOf = (groups) => (groups || []).flatMap(g => (g.hooks || []).map(h => h.command));
assert('foreign PreToolUse hook kept', commandsOf(result.hooks.PreToolUse).includes('echo old'), true);
assert('foreign event kept', commandsOf(result.hooks.Notification), ['node other.js']);
for (const [event, groups] of Object.entries(hooksConfig)) {
    for (const cmd of commandsOf(groups)) {
        assert(`${event} has ${cmd.match(/[\w.-]+\.js/)[0]}`, commandsOf(result.hooks[event]).includes(cmd), true);
    }
}

// Test 2b: re-running is idempotent -- this project's entries are replaced,
// never duplicated, and the foreign one stays exactly once.
console.log('\nMerging twice:');
const once = runMerge({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo old' }] }] }
});
fs.writeFileSync(TMP_SETTINGS, JSON.stringify(once, null, 2));
execSync(`node "${MERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8' });
const twice = JSON.parse(fs.readFileSync(TMP_SETTINGS, 'utf-8'));
assert('second merge changes nothing', twice, once);
assert('foreign hook appears once',
    commandsOf(twice.hooks.PreToolUse).filter(c => c === 'echo old').length, 1);

// Test 2c: an older copy of one of this project's hooks -- a different
// timeout, a stale matcher -- is replaced, not kept alongside the new one.
console.log('\nStale copy of our own hook is replaced:');
result = runMerge({
    hooks: {
        PreToolUse: [{ matcher: 'Edit', hooks: [
            { type: 'command', command: 'node "$HOME/.claude/hooks/pre-commit-review.js"', timeout: 1 }
        ] }]
    }
});
assert('pre-commit-review.js wired exactly once',
    commandsOf(result.hooks.PreToolUse).filter(c => c.includes('pre-commit-review.js')).length, 1);
assert('stale Edit group dropped', result.hooks.PreToolUse.some(g => g.matcher === 'Edit'), false);

// Test 2d: ownership is by script name, not substring. A user hook called
// my-pre-commit-review.js is theirs.
console.log('\nSimilarly named foreign hook:');
result = runMerge({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
        { type: 'command', command: 'node "$HOME/bin/my-pre-commit-review.js"' }
    ] }] }
});
assert('my-pre-commit-review.js kept',
    commandsOf(result.hooks.PreToolUse).includes('node "$HOME/bin/my-pre-commit-review.js"'), true);

// Test 2e: a settings.json that will not parse is left alone. Replacing it
// with `{}` plus our hooks would discard everything the user had.
console.log('\nUnparseable settings.json:');
const handEdited = '{\n  "model": "opus",\n}\n';
fs.writeFileSync(TMP_SETTINGS, handEdited);
let badExit = 0;
let badErr = '';
try {
    execSync(`node "${MERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
    badExit = e.status;
    badErr = String(e.stderr || '');
}
assert('exits non-zero', badExit !== 0, true);
assert('file left byte-identical', fs.readFileSync(TMP_SETTINGS, 'utf-8'), handEdited);
assert('says nothing changed', /not valid JSON/.test(badErr) && /nothing has been changed/.test(badErr), true);
assert('no stack trace', /at Object\.|node:internal/.test(badErr), false);

// Test 3: Preserves non-hook settings
console.log('\nPreserves all other settings:');
result = runMerge({
    apiKeyHelper: 'python helper.py',
    env: { SOME_VAR: '1' },
    permissions: { allow: ['Bash(git:*)'] },
    model: 'opus',
    statusLine: { type: 'command', command: 'echo hi' }
});
assert('preserves apiKeyHelper', result.apiKeyHelper, 'python helper.py');
assert('preserves env', result.env.SOME_VAR, '1');
assert('preserves permissions', result.permissions.allow[0], 'Bash(git:*)');
assert('preserves model', result.model, 'opus');
assert('preserves statusLine', result.statusLine.type, 'command');

// Test 4: Hook content matches config
console.log('\nHook content correctness:');
result = runMerge({ model: 'opus' });
// Every matcher and every command in the config survives the merge verbatim.
for (const [event, groups] of Object.entries(hooksConfig)) {
    groups.forEach((group, i) => {
        const merged = result.hooks[event][i];
        assert(`${event}[${i}] matcher preserved`, merged.matcher, group.matcher);
        assert(`${event}[${i}] commands preserved`,
            merged.hooks.map(h => h.command), group.hooks.map(h => h.command));
    });
}

// Test 5: Creates backup, byte-for-byte. Re-serialising the parsed object
// would lose the user's own formatting.
console.log('\nBackup creation:');
const original = '{"model":   "opus"}\n';
fs.writeFileSync(TMP_SETTINGS, original);
execSync(`node "${MERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8' });
const backupFiles = fs.readdirSync(TMP_DIR).filter(f => f.startsWith('test-settings.json.backup'));
assert('creates backup file', backupFiles.length > 0, true);
assert('backup is the original bytes',
    backupFiles.some(f => fs.readFileSync(path.join(TMP_DIR, f), 'utf-8') === original), true);

// Cleanup backups
backupFiles.forEach(f => fs.unlinkSync(path.join(TMP_DIR, f)));
if (fs.existsSync(TMP_SETTINGS)) fs.unlinkSync(TMP_SETTINGS);

console.log(`\n=================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
