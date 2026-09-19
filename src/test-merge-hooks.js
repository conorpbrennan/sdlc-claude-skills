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

// Test 2: Replaces existing hooks section
console.log('\nSettings with existing hooks:');
result = runMerge({
    model: 'opus',
    hooks: {
        PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo old', timeout: 1000 }] }
        ]
    }
});
for (const [event, groups] of Object.entries(hooksConfig)) {
    assert(`${event} matches config`, result.hooks[event].length, groups.length);
}

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

// Test 5: Creates backup
console.log('\nBackup creation:');
fs.writeFileSync(TMP_SETTINGS, JSON.stringify({ model: 'opus' }, null, 2));
execSync(`node "${MERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8' });
const backupFiles = fs.readdirSync(TMP_DIR).filter(f => f.startsWith('test-settings.json.backup'));
assert('creates backup file', backupFiles.length > 0, true);

// Cleanup backups
backupFiles.forEach(f => fs.unlinkSync(path.join(TMP_DIR, f)));
if (fs.existsSync(TMP_SETTINGS)) fs.unlinkSync(TMP_SETTINGS);

console.log(`\n=================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
