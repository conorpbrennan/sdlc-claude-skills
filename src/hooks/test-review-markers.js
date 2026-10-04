// Tests for lib/review-markers.js: where a review marker, lock or pending-review
// record lives.
//
// Written before the implementation. The bug it pins is concrete: three hooks
// (pending-review-gate.js, stop-review-trigger.js, post-commit-review.js) kept
// these files in $HOME, so they were shared by every repository and every session
// on the machine. Observed live -- a commit of `App.java` in an unrelated project
// wrote $HOME/.claude-pending-review and blocked Bash commands in a session
// working on this repository, twice, with a message naming a file that does not
// exist here.
//
// pre-commit-review.js already did the right thing, resolving its marker against
// `rev-parse --git-dir`. That is also worktree-correct for free: in a linked
// worktree --git-dir returns `.git/worktrees/<name>`, so two worktrees of one
// repository get separate markers without any hashing. These tests assert both
// properties.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const markers = require('./lib/review-markers.js');

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

function newRepo(dir) {
    fs.mkdirSync(dir, { recursive: true });
    git(['init', '-q', '.'], dir);
    git(['config', 'user.email', 't@t'], dir);
    git(['config', 'user.name', 't'], dir);
    fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
    git(['add', 'seed.txt'], dir);
    git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'seed'], dir);
    return dir;
}

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'review-markers-'));
const repoA = newRepo(path.join(sb, 'repo-a'));
const repoB = newRepo(path.join(sb, 'repo-b'));

console.log('review-markers tests');
console.log('====================');

console.log('\nEvery path is inside the repository, not $HOME:');
const a = markers.markerPaths(repoA);
const home = process.env.USERPROFILE || process.env.HOME;
for (const key of ['marker', 'lock', 'pending']) {
    assert(`${key} is under the git dir`, a[key].startsWith(path.resolve(repoA, '.git')), true);
    // The specific regression: not a dotfile in the user's home directory.
    assert(`${key} is not directly in $HOME`, path.dirname(a[key]) === home, false);
}
assert('marker keeps the documented name', path.basename(a.marker), '.claude-last-review');
assert('lock keeps the documented name', path.basename(a.lock), '.claude-review-in-progress');
assert('pending keeps its name', path.basename(a.pending), '.claude-pending-review');

console.log('\nTwo repositories never share a path:');
const b = markers.markerPaths(repoB);
for (const key of ['marker', 'lock', 'pending']) {
    assert(`${key} differs between repos`, a[key] === b[key], false);
}
// The live failure, reproduced as an assertion: a record written by one repo must
// not be visible to another.
fs.writeFileSync(a.pending, JSON.stringify({ commit: 'deadbee', files: ['App.java'] }));
assert('repo B cannot see repo A\'s pending record', fs.existsSync(b.pending), false);
fs.unlinkSync(a.pending);

console.log('\nLinked worktrees never share a path:');
const linked = path.join(sb, 'linked');
git(['worktree', 'add', '-q', linked, '-b', 'second'], repoA);
const w = markers.markerPaths(linked);
for (const key of ['marker', 'lock', 'pending']) {
    assert(`${key} differs from the main worktree`, a[key] === w[key], false);
}
assert('linked worktree path goes under worktrees/', w.marker.includes(path.join('worktrees', 'linked')), true);
fs.writeFileSync(a.lock, new Date().toISOString());
assert('a lock in the main worktree is invisible in the linked one', fs.existsSync(w.lock), false);
fs.unlinkSync(a.lock);

console.log('\nOutside a repository:');
const notRepo = path.join(sb, 'plain-dir');
fs.mkdirSync(notRepo);
const n = markers.markerPaths(notRepo);
assert('reports notARepo', n.notARepo, true);
assert('offers no marker path', n.marker, null);
// A hook that cannot locate a repo must not fall back to a shared location; the
// caller is expected to no-op instead.
assert('offers no lock path', n.lock, null);
assert('offers no pending path', n.pending, null);

console.log('\nUnreadable git state is not mistaken for "no repo":');
const broken = markers.markerPaths(path.join(sb, 'does-not-exist-at-all'));
// Not `typeof ... === 'boolean'`, which markerPaths makes true by construction for
// every input and would still pass if an unreadable git state were reported as
// "no repo" -- the exact confusion this case is named for.
assert('an unreadable git state is NOT notARepo', broken.notARepo, false);
assert('and it records why', typeof broken.error, 'string');
assert('no paths offered', broken.marker, null);

fs.rmSync(sb, { recursive: true, force: true });

console.log('\n====================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
