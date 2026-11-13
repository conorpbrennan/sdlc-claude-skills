// Tests for lib/branch-repos-write.js: enableRepo and disableRepo over a config
// path. Real files in a scratch dir under the OS temp dir; the real home is never used.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');

const cfg = require('./lib/branch-repos-config.js');
const { enableRepo, disableRepo } = require('./lib/branch-repos-write.js');

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

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-repos-write-'));
let counter = 0;

// Args:
//   prefix: string, a name part.
// Returns:
//   string: a new empty directory under the scratch dir (real path).
function mkdir(prefix) {
    const d = path.join(scratch, prefix + '-' + counter++);
    fs.mkdirSync(d, { recursive: true });
    return fs.realpathSync(d);
}

// Args:
//   content: string | null, the file text, or null for no file.
// Returns:
//   string: the config path in a fresh directory.
function setup(content) {
    const file = path.join(mkdir('cfg'), 'branch-repos-config.json');
    if (content !== null) fs.writeFileSync(file, content);
    return file;
}

// Args:
//   file: string, a path.
// Returns:
//   string | null: the file text, or null when it cannot be read.
function slurp(file) {
    try {
        return fs.readFileSync(file, 'utf-8');
    } catch (e) {
        return null;
    }
}

// Args:
//   file: string, a config path.
// Returns:
//   string[]: names in the config's directory that are not the config itself.
function strays(file) {
    return fs.readdirSync(path.dirname(file)).filter(n => n !== path.basename(file));
}

const repoA = mkdir('repoA');
const repoB = mkdir('repoB');
const json = o => JSON.stringify(o);
const doc = (repos, extra) => json(Object.assign({ version: 1 }, extra || {}, { repos }));

// 1. enableRepo, one table.
console.log('enableRepo:');
const linkA = path.join(mkdir('links'), 'linkA');
fs.symlinkSync(repoA, linkA);
const enableRows = [
    ['no file', null, { toplevel: repoA, mode: 'advisory' }, 'created', { version: 1, repos: { [repoA]: { mode: 'advisory' } } }],
    ['merge keeps all', json({ version: 1, extra: [1], repos: { [repoB]: { mode: 'enforce' }, [repoA]: { base: 'origin/dev', mystery: 7 } } }),
        { toplevel: repoA, mode: 'enforce' }, 'updated',
        { version: 1, extra: [1], repos: { [repoB]: { mode: 'enforce' }, [repoA]: { base: 'origin/dev', mystery: 7, mode: 'enforce' } } }],
    ['new key beside another', doc({ [repoB]: { mode: 'enforce' } }), { toplevel: repoA, mode: 'advisory' }, 'added',
        { version: 1, repos: { [repoB]: { mode: 'enforce' }, [repoA]: { mode: 'advisory' } } }],
    ['existing enforce kept', doc({ [repoA]: { mode: 'enforce' } }), { toplevel: repoA }, 'unchanged', { version: 1, repos: { [repoA]: { mode: 'enforce' } } }],
    ['no mode, none set', doc({ [repoA]: {} }), { toplevel: repoA }, 'updated', { version: 1, repos: { [repoA]: { mode: 'advisory' } } }],
    ['same mode', doc({ [repoA]: { mode: 'enforce' } }), { toplevel: repoA, mode: 'enforce' }, 'unchanged', { version: 1, repos: { [repoA]: { mode: 'enforce' } } }],
    ['trailing-slash key reused', doc({ [repoA + '/']: { mode: 'advisory' } }), { toplevel: repoA, mode: 'enforce' }, 'updated',
        { version: 1, repos: { [repoA + '/']: { mode: 'enforce' } } }],
    ['symlink path reuses real key', doc({ [repoA]: { mode: 'advisory' } }), { toplevel: linkA, mode: 'enforce' }, 'updated',
        { version: 1, repos: { [repoA]: { mode: 'enforce' } } }],
    ['bad mode refused', doc({}), { toplevel: repoA, mode: 'loud' }, null, null],
    ['entry is an array refused', doc({ [repoA]: [] }), { toplevel: repoA, mode: 'enforce' }, null, null],
];
for (const [name, before, call, action, after] of enableRows) {
    const file = setup(before);
    const r = enableRepo(Object.assign({ configPath: file }, call));
    assert(name + ': ok', r.ok, action !== null);
    if (action !== null) {
        assert(name + ': action', r.action, action);
        assert(name + ': file', JSON.parse(slurp(file)), after);
    } else {
        assert(name + ': has error and bytes equal', [typeof r.error, slurp(file)], ['string', before]);
    }
    assert(name + ': no strays', strays(file), []);
}
{
    const file = setup(null);
    enableRepo({ configPath: file, toplevel: repoA, mode: 'enforce' });
    const first = slurp(file);
    const r = enableRepo({ configPath: file, toplevel: repoA, mode: 'enforce' });
    assert('twice: second unchanged, bytes equal', [r.action, slurp(file)], ['unchanged', first]);
}

// 2. Refusals for both functions.
console.log('refusals:');
const dirAsFile = mkdir('dirfile');
const refuseRows = [
    ['unparsable', '{ nope'],
    ['no repos', json({ version: 1 })],
    ['repos an array', json({ version: 1, repos: [] })],
    ['directory as the file', null],
];
for (const [name, content] of refuseRows) {
    for (const fn of ['enable', 'disable']) {
        const file = content === null ? dirAsFile : setup(content);
        const r = fn === 'enable' ? enableRepo({ configPath: file, toplevel: repoA, mode: 'enforce' }) : disableRepo({ configPath: file, toplevel: repoA });
        assert(`${name} / ${fn}: refused`, [r.ok, typeof r.error], [false, 'string']);
        if (content !== null) assert(`${name} / ${fn}: bytes equal`, slurp(file), content);
    }
}
{
    const file = setup(doc({ [repoA]: 5 }));
    const r = disableRepo({ configPath: file, toplevel: repoA });
    assert('disable on a non-object entry is refused, bytes equal', [r.ok, slurp(file)], [false, doc({ [repoA]: 5 })]);
}

// 3. disableRepo, one table.
console.log('disableRepo:');
const disableRows = [
    ['removes only this entry', doc({ [repoA]: { mode: 'enforce' }, [repoB]: { base: 'x' } }, { keep: 1 }), true,
        { version: 1, keep: 1, repos: { [repoB]: { base: 'x' } } }],
    ['absent entry', doc({ [repoB]: {} }), false, { version: 1, repos: { [repoB]: {} } }],
    ['last entry removed', doc({ [repoA]: {} }, { keep: 1 }), true, { version: 1, keep: 1, repos: {} }],
    ['two spellings both removed', doc({ [repoA]: {}, [repoA + '/']: {}, [repoB]: {} }), true, { version: 1, repos: { [repoB]: {} } }],
    ['no file', null, false, null],
];
for (const [name, before, removed, after] of disableRows) {
    const file = setup(before);
    const r = disableRepo({ configPath: file, toplevel: repoA });
    assert(name + ': ok and removed', [r.ok, r.removed], [true, removed]);
    assert(name + ': file', slurp(file) === null ? null : JSON.parse(slurp(file)), after);
    if (!removed) assert(name + ': bytes equal', slurp(file), before);
    assert(name + ': no strays', strays(file), []);
}

// 4. Write: no temp file after a failed write, and the key round-trips through ownEntry.
console.log('write:');
{
    const blocker = path.join(mkdir('blocker'), 'afile');
    fs.writeFileSync(blocker, 'x');
    const file = path.join(blocker, 'sub', 'cfg.json');
    const r = enableRepo({ configPath: file, toplevel: repoA, mode: 'advisory' });
    assert('failed write: not ok, nothing created', [r.ok, fs.readdirSync(path.dirname(blocker))], [false, ['afile']]);
}
{
    const file = path.join(mkdir('fresh'), 'newdir', 'cfg.json');
    const r = enableRepo({ configPath: file, toplevel: repoA, mode: 'advisory' });
    assert('missing directory is created, no strays', [r.ok, strays(file)], [true, []]);
}
for (const [name, top] of [['plain', repoA], ['symlinked', linkA], ['trailing slash', repoA + '/']]) {
    const file = setup(null);
    const r = enableRepo({ configPath: file, toplevel: top, mode: 'advisory' });
    const found = cfg.ownEntry(cfg.readReposConfig(file).repos, top);
    assert(name + ': key round-trips', [r.ok, found && found.key, r.key], [true, r.key, found && found.key]);
    assert(name + ': found at all', found !== null, true);
}

// 5. Nested repo: an ancestor is listed, the nested toplevel is not.
console.log('nested repo:');
{
    const nested = path.join(repoB, 'inner');
    fs.mkdirSync(nested, { recursive: true });
    const file = setup(doc({ [repoB]: { mode: 'enforce', base: 'origin/dev' } }));
    assert('ownEntry null for nested before', cfg.ownEntry(cfg.readReposConfig(file).repos, nested), null);
    const r = enableRepo({ configPath: file, toplevel: nested, mode: 'advisory' });
    const after = JSON.parse(slurp(file));
    assert('nested gets its own key', [r.ok, r.action], [true, 'added']);
    assert('ancestor entry equal', after.repos[repoB], { mode: 'enforce', base: 'origin/dev' });
    assert('nested entry', after.repos[nested], { mode: 'advisory' });
}

fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
