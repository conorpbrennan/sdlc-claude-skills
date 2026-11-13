// Tests for lib/branch-repos-config.js: the config path, the file read, the
// mode and base of an entry, and the two repo lookups. Real files in a scratch dir.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');

const cfg = require('./lib/branch-repos-config.js');

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

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-repos-config-'));

// 1. baseOf and modeOf, one table.
console.log('baseOf and modeOf:');
const entryRows = [
    ['no keys', {}, { base: { ok: true, base: null }, mode: 'advisory' }],
    ['mode enforce', { mode: 'enforce' }, { base: { ok: true, base: null }, mode: 'enforce' }],
    ['mode loud', { mode: 'loud' }, { base: { ok: true, base: null }, mode: null }],
    ['entry is an array', [], { base: { ok: true, base: null }, mode: null }],
    ['base origin/dev', { base: 'origin/dev' }, { base: { ok: true, base: 'origin/dev' }, mode: 'advisory' }],
    ['base -x', { base: '-x' }, { base: { ok: false }, mode: 'advisory' }],
    ['base empty', { base: '' }, { base: { ok: false }, mode: 'advisory' }],
    ['base 5', { base: 5 }, { base: { ok: false }, mode: 'advisory' }],
];
for (const [name, entry, want] of entryRows) {
    assert(name, { base: cfg.baseOf(entry), mode: cfg.modeOf(entry) }, want);
}

// 2. readReposConfig, one table.
console.log('readReposConfig:');
const dirAsFile = path.join(scratch, 'a-directory');
fs.mkdirSync(dirAsFile);
const fileRows = [
    ['missing file', path.join(scratch, 'absent.json'), 'missing'],
    ['unreadable (a directory)', dirAsFile, 'error'],
    ['bad JSON', '{not json', 'error'],
    ['no repos', '{"version":1}', 'error'],
    ['repos an array', '{"repos":[]}', 'error'],
    ['valid', '{"repos":{"/x":{"mode":"advisory"}}}', 'repos'],
];
fileRows.forEach(([name, content, key], i) => {
    let file = content;
    if (!content.startsWith('/')) {
        file = path.join(scratch, 'case' + i + '.json');
        fs.writeFileSync(file, content);
    }
    const got = cfg.readReposConfig(file);
    assert(name, Object.keys(got), [key]);
    if (key === 'error') assert(name + ' message names the file', got.error.includes(file), true);
});

// 3. configPath honours the env.
console.log('configPath:');
const saved = process.env[cfg.ENV_CONFIG];
process.env[cfg.ENV_CONFIG] = '/tmp/custom.json';
assert('env set', cfg.configPath(), '/tmp/custom.json');
delete process.env[cfg.ENV_CONFIG];
assert('env unset', cfg.configPath(), path.join(os.homedir(), '.claude', 'branch-review-repos.json'));
if (saved !== undefined) process.env[cfg.ENV_CONFIG] = saved;

// 4. Ancestor listed, nested repo unlisted.
console.log('entryFor and ownEntry:');
const parent = path.join(scratch, 'parent');
const nested = path.join(parent, 'nested');
fs.mkdirSync(nested, { recursive: true });
const repos = { [parent]: { mode: 'enforce' } };
assert('ownEntry of the nested repo is null', cfg.ownEntry(repos, nested), null);
assert('entryFor the nested cwd returns the ancestor',
    cfg.entryFor(repos, cfg.realNormalized(nested)),
    { key: parent, entry: { mode: 'enforce' } });
assert('ownEntry of the listed repo', cfg.ownEntry(repos, parent), { key: parent, entry: { mode: 'enforce' } });

fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
