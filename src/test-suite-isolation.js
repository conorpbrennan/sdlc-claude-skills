// Every test suite drops git's repository-locating variables before it runs.
// git exports GIT_DIR, GIT_INDEX_FILE and the rest to the hooks it runs, so a
// suite started from inside one -- a hygiene check, a git hook -- drove the
// outer repository instead of its own temp repos: commits landed on the
// checked-out branch and `user.name t` in its config.
// Run: node src/test-suite-isolation.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { isolateGitEnv } = require(path.join(__dirname, 'hooks', 'lib', 'isolate-git-env.js'));

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS: ' + name); }
    else { failed += 1; console.log('  FAIL: ' + name + (detail !== undefined ? ' -- ' + detail : '')); }
}

console.log('isolateGitEnv drops every variable git calls repository-local:');
{
    const vars = execFileSync('git', ['rev-parse', '--local-env-vars'],
        { encoding: 'utf-8', env: { PATH: process.env.PATH } }).split('\n').filter(Boolean);
    ok('git names GIT_DIR and GIT_INDEX_FILE as local', vars.includes('GIT_DIR') && vars.includes('GIT_INDEX_FILE'));
    for (const v of vars) process.env[v] = '/nonexistent/' + v;
    process.env.GIT_AUTHOR_NAME_KEEP_PROBE = 'kept';
    isolateGitEnv();
    const left = vars.filter(v => v in process.env);
    ok('none is left set', left.length === 0, left.join(', '));
    ok('other variables are kept', process.env.GIT_AUTHOR_NAME_KEEP_PROBE === 'kept');
    delete process.env.GIT_AUTHOR_NAME_KEEP_PROBE;
}

console.log('\nEvery suite isolates itself before it runs:');
{
    const SHELL_LINE = 'unset $(env -i PATH="$PATH" git rev-parse --local-env-vars)';
    const JS_CALL = 'isolateGitEnv()';
    const roots = [__dirname, path.join(__dirname, 'hooks'), path.join(__dirname, '..', 'tools')];
    const suites = roots.flatMap(d => fs.readdirSync(d)
        .filter(f => /^test-.*\.(js|sh)$/.test(f))
        .map(f => path.join(d, f)));
    ok('suites were found', suites.length > 20, suites.length);
    for (const file of suites) {
        const text = fs.readFileSync(file, 'utf-8');
        const want = file.endsWith('.sh') ? SHELL_LINE : JS_CALL;
        ok(path.relative(path.dirname(__dirname), file) + ' calls ' + want, text.includes(want));
    }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
