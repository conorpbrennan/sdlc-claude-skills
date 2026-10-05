// Tests for tools/plugin-version.js: every commit must raise the plugin's
// version, since `/plugin update` ignores a commit that leaves it unchanged.
// Run: node tools/test-plugin-version.js
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('../src/hooks/lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { compareSemver, checkStaged, bumpPatch } = require('./plugin-version.js');

const SCRIPT = path.join(__dirname, 'plugin-version.js');
let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS: ' + name); }
    else { failed += 1; console.log('  FAIL: ' + name + (detail !== undefined ? ' -- ' + JSON.stringify(detail) : '')); }
}

console.log('compareSemver:');
ok('patch raises', compareSemver('1.0.1', '1.0.0') > 0);
ok('equal is equal', compareSemver('1.2.3', '1.2.3') === 0);
ok('numeric, not lexical', compareSemver('1.0.10', '1.0.9') > 0);
ok('major outranks minor', compareSemver('2.0.0', '1.9.9') > 0);
ok('a lower version is lower', compareSemver('1.0.0', '1.0.1') < 0);

// A scratch repo with a committed plugin.json, so HEAD and the index can differ.
function scratch(headVersion) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-version-'));
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf-8' });
    git('init', '-q');
    git('config', 'user.email', 't@t.t');
    git('config', 'user.name', 't');
    fs.mkdirSync(path.join(dir, '.claude-plugin'));
    const write = v => fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'),
        JSON.stringify(v === undefined ? { name: 'p' } : { name: 'p', version: v }, null, 2) + '\n');
    if (headVersion !== null) {
        write(headVersion);
        git('add', '.');
        git('com' + 'mit', '-q', '-m', 'init');
    }
    return { dir, git, write, stage: v => { write(v); git('add', '.'); } };
}

console.log('\ncheckStaged:');
{
    const s = scratch('1.0.0');
    ok('unchanged version fails', checkStaged(s.dir).ok === false);
    ok('the failure says how to bump', /plugin-version\.js bump/.test(checkStaged(s.dir).reason), checkStaged(s.dir));
    s.stage('1.0.1');
    ok('a raised version passes', checkStaged(s.dir).ok === true, checkStaged(s.dir));
    s.write('1.0.2');
    ok('an unstaged bump does not count', checkStaged(s.dir).ok === true &&
        JSON.parse(s.git('show', ':.claude-plugin/plugin.json')).version === '1.0.1');
    s.stage('0.9.0');
    ok('a lowered version fails', checkStaged(s.dir).ok === false);
    s.stage('1.0');
    ok('a non-semver version fails', checkStaged(s.dir).ok === false && /semver/.test(checkStaged(s.dir).reason));
    s.stage(undefined);
    ok('a removed version fails', checkStaged(s.dir).ok === false);
    fs.rmSync(s.dir, { recursive: true, force: true });
}
{
    const s = scratch(undefined);
    s.stage('1.0.0');
    ok('the first version, over none, passes', checkStaged(s.dir).ok === true, checkStaged(s.dir));
    fs.rmSync(s.dir, { recursive: true, force: true });
}
{
    const s = scratch(null);
    s.stage('1.0.0');
    ok('the first commit of a repo passes', checkStaged(s.dir).ok === true, checkStaged(s.dir));
    fs.rmSync(s.dir, { recursive: true, force: true });
}

console.log('\nbumpPatch:');
{
    const s = scratch('1.2.9');
    const file = path.join(s.dir, '.claude-plugin', 'plugin.json');
    ok('returns the new version', bumpPatch(file) === '1.2.10');
    const after = fs.readFileSync(file, 'utf-8');
    ok('writes it, keeping the other fields', JSON.parse(after).version === '1.2.10' && JSON.parse(after).name === 'p');
    ok('keeps the two-space format and final newline', after === JSON.stringify({ name: 'p', version: '1.2.10' }, null, 2) + '\n');
    s.write(undefined);
    let threw = false;
    try { bumpPatch(file); } catch (e) { threw = /no semver version/.test(e.message); }
    ok('refuses a file with no version', threw);
    fs.rmSync(s.dir, { recursive: true, force: true });
}

console.log('\nCLI:');
{
    const s = scratch('1.0.0');
    let r = spawnSync('node', [SCRIPT, 'check'], { cwd: s.dir, encoding: 'utf-8' });
    ok('check exits 1 on an unchanged version', r.status === 1 && /1\.0\.0/.test(r.stderr), r);
    r = spawnSync('node', [SCRIPT, 'bump'], { cwd: s.dir, encoding: 'utf-8' });
    ok('bump prints the new version', r.status === 0 && r.stdout.trim() === '1.0.1', r);
    s.git('add', '.');
    r = spawnSync('node', [SCRIPT, 'check'], { cwd: s.dir, encoding: 'utf-8' });
    ok('check exits 0 once the bump is staged', r.status === 0, r);
    r = spawnSync('node', [SCRIPT, 'nonsense'], { cwd: s.dir, encoding: 'utf-8' });
    ok('an unknown mode exits 2', r.status === 2, r);
    fs.rmSync(s.dir, { recursive: true, force: true });
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
