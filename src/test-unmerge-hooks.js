// Tests for unmerge-hooks.js
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./hooks/lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const UNMERGE_SCRIPT = path.join(__dirname, 'unmerge-hooks.js');
const MERGE_SCRIPT = path.join(__dirname, '..', 'legacy', 'merge-hooks.js');
const HOOKS_CONFIG = path.join(__dirname, '..', 'legacy', 'hooks-config.json');
const TMP_DIR = path.join(__dirname, '..', 'tmp');
const TMP_SETTINGS = path.join(TMP_DIR, 'test-unmerge-settings.json');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

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

function write(settings) {
    fs.writeFileSync(TMP_SETTINGS, JSON.stringify(settings, null, 2));
}

function unmerge() {
    execSync(`node "${UNMERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8' });
    return JSON.parse(fs.readFileSync(TMP_SETTINGS, 'utf-8'));
}

const hooksConfig = JSON.parse(fs.readFileSync(HOOKS_CONFIG, 'utf-8'));

console.log('unmerge-hooks tests');
console.log('===================');

// Test 1: a full install is fully reversed -- merge then unmerge is a no-op
// on everything except the hooks this project owns.
console.log('\nRound trip (merge then unmerge):');
write({ model: 'opus', apiKeyHelper: 'helper.py', env: { X: '1' } });
execSync(`node "${MERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8' });
let result = unmerge();
assert('hooks section removed entirely', result.hooks, undefined);
assert('preserves model', result.model, 'opus');
assert('preserves apiKeyHelper', result.apiKeyHelper, 'helper.py');
assert('preserves env', result.env.X, '1');

// Test 2: a foreign hook in the same matcher group survives.
console.log('\nForeign hooks survive:');
write({
    hooks: {
        PreToolUse: [
            {
                matcher: 'Bash',
                hooks: [
                    { type: 'command', command: 'node "$HOME/.claude/hooks/pre-commit-review.js"', timeout: 2000 },
                    { type: 'command', command: 'node "$HOME/.claude/hooks/someone-elses-hook.js"', timeout: 1000 }
                ]
            }
        ]
    }
});
result = unmerge();
assert('group kept', result.hooks.PreToolUse.length, 1);
assert('only the foreign hook remains', result.hooks.PreToolUse[0].hooks.length, 1);
assert('foreign hook is the survivor',
    result.hooks.PreToolUse[0].hooks[0].command.includes('someone-elses-hook.js'), true);

// Test 3: a whole foreign event is untouched.
console.log('\nForeign event untouched:');
write({
    hooks: {
        Notification: [
            { matcher: '', hooks: [{ type: 'command', command: 'node other.js' }] }
        ],
        PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$HOME/.claude/hooks/pre-commit-feature.js"' }] }
        ]
    }
});
result = unmerge();
assert('foreign event survives', result.hooks.Notification.length, 1);
assert('emptied event dropped', result.hooks.PreToolUse, undefined);

// Test 3b: ownership is by script name, not substring. includes() treated a
// user's my-pre-commit-review.js as ours and deleted it on uninstall.
console.log('\nSimilarly named foreign hook:');
write({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
        { type: 'command', command: 'node "$HOME/bin/my-pre-commit-review.js"' },
        { type: 'command', command: 'node "$HOME/.claude/hooks/pre-commit-review.js"' }
    ] }] }
});
result = unmerge();
assert('only the lookalike remains',
    result.hooks.PreToolUse[0].hooks.map(h => h.command), ['node "$HOME/bin/my-pre-commit-review.js"']);

// Test 3c: the script name must end the token. A backup of one of our hooks,
// or a .json named like one, is the user's.
console.log('\nOur script name inside a longer token:');
write({
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
        { type: 'command', command: 'node "$HOME/bin/pre-commit-review.js.bak"' },
        { type: 'command', command: 'lint --cfg pre-commit-review.json' },
        { type: 'command', command: 'node "$HOME/.claude/hooks/pre-commit-review.js"' }
    ] }] }
});
result = unmerge();
assert('backup and .json lookalikes remain',
    result.hooks.PreToolUse[0].hooks.map(h => h.command),
    ['node "$HOME/bin/pre-commit-review.js.bak"', 'lint --cfg pre-commit-review.json']);

// Test 4: idempotent -- a second run changes nothing and does not throw.
console.log('\nIdempotence:');
write({ model: 'opus' });
result = unmerge();
assert('no hooks section, still no hooks section', result.hooks, undefined);
assert('settings otherwise intact', result.model, 'opus');

// Test 5: every hook the config names is recognised as ours.
console.log('\nOwnership covers the whole config:');
const owned = [];
for (const groups of Object.values(hooksConfig)) {
    for (const g of groups) for (const h of g.hooks) owned.push(h.command);
}
write({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: owned.map(c => ({ type: 'command', command: c })) }] } });
result = unmerge();
assert(`all ${owned.length} configured hooks removed`, result.hooks, undefined);

// Test 6: a backup is written before any change.
console.log('\nBackup creation:');
write({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$HOME/.claude/hooks/pre-commit-review.js"' }] }] } });
unmerge();
const backups = fs.readdirSync(TMP_DIR).filter(f => f.startsWith('test-unmerge-settings.json.backup'));
assert('creates backup file', backups.length > 0, true);

// Test 7: a missing settings.json is not an error.
console.log('\nMissing settings.json:');
fs.unlinkSync(TMP_SETTINGS);
let exitCode = 0;
try {
    execSync(`node "${UNMERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
    exitCode = e.status;
}
assert('exits 0 when there is nothing to do', exitCode, 0);

// Test 8: a settings.json that will not parse must stop the uninstall with a
// readable message and leave the file exactly as it was. uninstall.sh runs
// this before deleting the hook scripts, so failing here leaves a machine that
// is still fully installed -- far better than one whose settings.json points
// at scripts that are gone, since a hook command that cannot run fails open.
console.log('\nUnparseable settings.json:');
const handEdited = '{\n  "model": "opus",\n}\n';
fs.writeFileSync(TMP_SETTINGS, handEdited);
let badExit = 0;
let badErr = '';
try {
    execSync(`node "${UNMERGE_SCRIPT}" "${TMP_SETTINGS}" "${HOOKS_CONFIG}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
    badExit = e.status;
    badErr = String(e.stderr || '');
}
assert('exits non-zero', badExit !== 0, true);
assert('file left byte-identical', fs.readFileSync(TMP_SETTINGS, 'utf-8'), handEdited);
assert('names the file and says nothing changed', /not valid JSON/.test(badErr) && /nothing has been changed/.test(badErr), true);
assert('no stack trace', /at Object\.|node:internal/.test(badErr), false);

// Test 9: the same guard on the project's own config, which is read first.
console.log('\nUnparseable hooks-config.json:');
const BAD_CONFIG = path.join(TMP_DIR, 'test-unmerge-bad-config.json');
fs.writeFileSync(BAD_CONFIG, '{ not json');
write({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$HOME/.claude/hooks/pre-commit-review.js"' }] }] } });
const settingsBefore = fs.readFileSync(TMP_SETTINGS, 'utf-8');
let cfgExit = 0;
try {
    execSync(`node "${UNMERGE_SCRIPT}" "${TMP_SETTINGS}" "${BAD_CONFIG}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
    cfgExit = e.status;
}
assert('exits non-zero', cfgExit !== 0, true);
assert('settings.json untouched', fs.readFileSync(TMP_SETTINGS, 'utf-8'), settingsBefore);
fs.unlinkSync(BAD_CONFIG);

fs.readdirSync(TMP_DIR)
    .filter(f => f.startsWith('test-unmerge-settings.json.backup'))
    .forEach(f => fs.unlinkSync(path.join(TMP_DIR, f)));
if (fs.existsSync(TMP_SETTINGS)) fs.unlinkSync(TMP_SETTINGS);

console.log('\n===================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
