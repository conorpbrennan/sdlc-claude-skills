// Tests for lib/branch-review.js: base resolution, the branch diff hash and the
// branch-review marker verdict. Real git in scratch repos with an `origin` remote;
// nothing is mocked.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const br = require('./lib/branch-review.js');
const { markerPaths } = require('./lib/review-markers.js');

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

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
const write = (dir, rel, body) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
};
const commit = (dir, msg) => {
    git(['add', '-A'], dir);
    git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', msg], dir);
};

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-review-'));
let counter = 0;

// A clone of a bare `origin` holding `main` (origin/HEAD set unless told not to),
// checked out on branch `feat`. The clone's path holds a space and a quote.
function newRepo(opts) {
    const n = ++counter;
    const bare = path.join(sb, `origin-${n}.git`);
    const dir = path.join(sb, `work ${n}'s repo`);
    git(['init', '-q', '--bare', '-b', 'main', bare], sb);
    fs.mkdirSync(dir);
    git(['init', '-q', '-b', 'main', '.'], dir);
    git(['config', 'user.email', 't@t'], dir);
    git(['config', 'user.name', 't'], dir);
    git(['remote', 'add', 'origin', bare], dir);
    write(dir, 'seed.txt', 'seed\n');
    commit(dir, 'seed');
    git(['push', '-q', 'origin', 'main'], dir);
    git(['fetch', '-q', 'origin'], dir);
    if (!(opts && opts.noOriginHead)) git(['remote', 'set-head', 'origin', 'main'], dir);
    git(['checkout', '-q', '-b', 'feat'], dir);
    return dir;
}

console.log('branch-review tests');
console.log('===================');

console.log('\nresolveBase:');
const baseRows = [
    { name: 'origin/HEAD set', setup: () => newRepo(), cfg: undefined, want: { source: 'origin-head', refNull: false } },
    { name: 'configBase valid', setup: () => newRepo({ noOriginHead: true }), cfg: 'main', want: { source: 'config', refNull: false } },
    { name: 'configBase names a missing ref', setup: () => newRepo(), cfg: 'nope', want: { source: 'config', refNull: true } },
    { name: 'origin/HEAD unset, no configBase', setup: () => newRepo({ noOriginHead: true }), cfg: undefined, want: { source: null, refNull: true } },
    { name: 'configBase starts with a dash', setup: () => newRepo(), cfg: '-x', want: { source: 'config', refNull: true } },
];
for (const row of baseRows) {
    const r = br.resolveBase(row.setup(), row.cfg);
    assert(row.name, { source: r.source, refNull: r.ref === null }, row.want);
    if (row.want.refNull) assert(`${row.name}: error says what to set`, /base|set-head/.test(r.error), true);
}
const okRepo = newRepo();
assert('origin/HEAD resolves to origin/main', br.resolveBase(okRepo, undefined).ref, 'origin/main');
assert('readBranch names the branch', br.readBranch(okRepo), { name: 'feat', detached: false, error: null });
git(['checkout', '-q', '--detach'], okRepo);
assert('readBranch flags a detached HEAD', br.readBranch(okRepo).detached, true);

console.log('\ncheckFresh:');
const recipeFor = (dir, base) => br.markerRecipe({
    toplevel: markerPaths(dir).toplevel, markerPath: markerPaths(dir).branch, base, tag: br.RECIPE_TAG,
});
const review = (dir) => execFileSync('bash', ['-c', recipeFor(dir, 'origin/main')], { cwd: dir });
const freshRows = [
    { name: 'fresh', want: 'fresh', setup: (d) => { write(d, 'src/a.js', 'a\n'); commit(d, 'a'); review(d); } },
    { name: 'no marker', want: 'missing', setup: (d) => { write(d, 'src/a.js', 'a\n'); commit(d, 'a'); } },
    { name: 'non-feature commit after the marker', want: 'stale', setup: (d) => {
        write(d, 'src/a.js', 'a\n'); commit(d, 'a'); review(d);
        write(d, 'src/b.js', 'b\n'); commit(d, 'b'); } },
    { name: 'features-only commit after the marker', want: 'fresh', setup: (d) => {
        write(d, 'src/a.js', 'a\n'); commit(d, 'a'); review(d);
        write(d, 'features/x.md', 'x\n'); commit(d, 'f'); } },
    { name: 'no commit ahead of base', want: 'empty', setup: () => {} },
    { name: 'marker with line 3 blank', want: 'missing', setup: (d) => {
        write(d, 'src/a.js', 'a\n'); commit(d, 'a');
        fs.writeFileSync(markerPaths(d).branch, 'PASS\nabc123\n\ntag'); } },
    { name: 'git dir unreadable', want: 'error', setup: (d) => {
        write(d, 'src/a.js', 'a\n'); commit(d, 'a'); review(d); fs.renameSync(path.join(d, '.git'), path.join(d, '.git-moved')); } },
];
for (const row of freshRows) {
    const d = newRepo();
    const markerFile = markerPaths(d).branch;
    row.setup(d);
    const r = br.checkFresh({ cwd: d, base: 'origin/main', markerFile });
    assert(row.name, r.state, row.want);
}

console.log('\nRecipe round trip (path with a space and a quote, run from a subdirectory):');
{
    const d = newRepo();
    write(d, 'sub/deep/f.txt', 'f\n');
    commit(d, 'f');
    execFileSync('bash', ['-c', recipeFor(d, 'origin/main')], { cwd: path.join(d, 'sub', 'deep') });
    const m = br.readMarker(markerPaths(d).branch);
    assert('marker head is the current HEAD', m.head, git(['rev-parse', 'HEAD'], d));
    assert('marker tag is the recipe tag', m.tag, br.RECIPE_TAG);
    assert('checkFresh is fresh', br.checkFresh({ cwd: d, base: 'origin/main', markerFile: markerPaths(d).branch }).state, 'fresh');
}

console.log('\ndiffHash equals the recipe pipeline (rename, binary file, features change):');
{
    const d = newRepo();
    write(d, 'old name.txt', 'line one\nline two\nline three\nline four\n');
    commit(d, 'base file');
    git(['push', '-q', 'origin', 'feat:main'], d);
    git(['fetch', '-q', 'origin'], d);
    git(['mv', 'old name.txt', 'new.txt'], d);
    fs.writeFileSync(path.join(d, 'bin.dat'), Buffer.from([0, 1, 2, 255, 0, 7]));
    write(d, 'features/x.md', 'feature\n');
    commit(d, 'rename, binary, feature');
    write(d, 'src/y.js', 'y\n');
    commit(d, 'y');
    const marker = path.join(sb, 'pipeline-marker');
    execFileSync('bash', ['-c', br.markerRecipe({ toplevel: markerPaths(d).toplevel, markerPath: marker, base: 'origin/main', tag: 't' })], { cwd: d });
    const written = fs.readFileSync(marker, 'utf-8').split('\n');
    assert('diffHash equals the pipeline hash', br.diffHash(d, 'origin/main'), written[2]);
    assert('the hash is 40 hex characters', /^[0-9a-f]{40}$/.test(written[2]), true);
    assert('diffHash is null on a bad base', br.diffHash(d, 'no-such-ref'), null);
}

console.log('\nnumstat and groupByTopDir:');
{
    const d = newRepo();
    write(d, 'root.txt', 'a\nb\n');
    write(d, 'src/one.js', '1\n2\n3\n');
    write(d, 'docs/two.md', 'x\n');
    write(d, 'src/sub/three.js', 'q\n');
    write(d, 'features/skip.md', 'skipped\n');
    fs.writeFileSync(path.join(d, 'src', 'pic.bin'), Buffer.from([0, 1, 0, 2]));
    commit(d, 'files');
    const rows = br.numstat(d, 'origin/main');
    const byPath = Object.fromEntries(rows.map(r => [r.path, r.added + r.removed]));
    assert('numstat rows, binary counts 0, features left out', byPath, {
        'docs/two.md': 1, 'root.txt': 2, 'src/one.js': 3, 'src/pic.bin': 0, 'src/sub/three.js': 1,
    });
    const groups = br.groupByTopDir(rows).sort((x, y) => x.dir.localeCompare(y.dir));
    assert('groups by first path component', groups.map(g => [g.dir, g.files.length, g.lines]), [
        ['docs', 1, 1], ['root.txt', 1, 2], ['src', 3, 4],
    ]);
    assert('files is an array of paths', groups.find(g => g.dir === 'docs').files, ['docs/two.md']);
    assert('numstat is null on a bad base', br.numstat(d, 'no-such-ref'), null);
}

fs.rmSync(sb, { recursive: true, force: true });

console.log('\n===================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
