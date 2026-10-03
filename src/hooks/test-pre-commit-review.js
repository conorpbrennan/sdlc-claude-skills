// Tests for pre-commit-review.js PreToolUse hook.
// Two suites:
//   1. Unit tests for the exported classifier (classifyDiff, isLineSemantic).
//   2. Integration tests via spawnSync (original suite plus new-gate cases).
const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const HOOK_PATH = path.join(__dirname, 'pre-commit-review.js');
const REPO_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
const GIT_DIR = path.resolve(REPO_ROOT, execSync('git rev-parse --git-dir', {
    encoding: 'utf-8', cwd: REPO_ROOT,
}).trim());
const MARKER = path.resolve(GIT_DIR, '.claude-last-review');
const LOCK = path.resolve(GIT_DIR, '.claude-review-in-progress');
const DUMMY = path.resolve(REPO_ROOT, 'tmp', 'pre-commit-hook-test.py');
const TMP_DIR = path.resolve(REPO_ROOT, 'tmp');
const COV_XML = path.resolve(TMP_DIR, 'pre-commit-hook-test-coverage.xml');
const POLICY_PATH = path.resolve(TMP_DIR, 'pre-commit-hook-test-policy.json');
const DIFF_COVER_STUB = path.resolve(TMP_DIR, 'mock-diff-cover.js');

function runHook(command, extraEnv = {}, opts = {}) {
    const result = spawnSync('node', [HOOK_PATH], {
        input: JSON.stringify({ tool_input: { command }, ...(opts.input || {}) }),
        encoding: 'utf-8',
        cwd: opts.cwd || REPO_ROOT,
        env: { ...process.env, ...extraEnv },
    });
    if (!result.stdout.trim()) return { decision: 'silent' };
    return JSON.parse(result.stdout.trim());
}

function cleanLock() { try { fs.unlinkSync(LOCK); } catch (e) {} }
function cleanMarker() { try { fs.unlinkSync(MARKER); } catch (e) {} }
function cleanAll() { cleanLock(); cleanMarker(); }
function writeMarker(body) { fs.writeFileSync(MARKER, body, 'utf-8'); }
function readMarker() { try { return fs.readFileSync(MARKER, 'utf-8'); } catch (e) { return null; } }

function stageDummyContent(content) {
    fs.mkdirSync(path.dirname(DUMMY), { recursive: true });
    fs.writeFileSync(DUMMY, content, 'utf-8');
    execSync(`git add -f "${DUMMY}"`, { cwd: REPO_ROOT });
}
function unstageDummy() {
    try { execSync(`git reset HEAD "${DUMMY}"`, { cwd: REPO_ROOT, stdio: 'pipe' }); } catch (e) {}
    try { fs.unlinkSync(DUMMY); } catch (e) {}
}

const FIXTURE_XML = path.resolve(TMP_DIR, 'pre-commit-hook-test-fixture.xml');
function stageLargeFixture(bytes) {
    // A generated non-code file large enough to overflow Node's default 1 MiB
    // execSync buffer when included in the staged diff.
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const row = '<row id="1" value="fixture-data-fixture-data-fixture-data"/>\n';
    fs.writeFileSync(FIXTURE_XML, '<rows>\n' + row.repeat(Math.ceil(bytes / row.length)) + '</rows>\n', 'utf-8');
    execSync(`git add -f "${FIXTURE_XML}"`, { cwd: REPO_ROOT });
}
function unstageLargeFixture() {
    try { execSync(`git reset HEAD "${FIXTURE_XML}"`, { cwd: REPO_ROOT, stdio: 'pipe' }); } catch (e) {}
    try { fs.unlinkSync(FIXTURE_XML); } catch (e) {}
}
// A git shim on PATH that fails every `git diff` read and passes everything
// else to the real git. Simulates an index that cannot be read (index.lock,
// bad GIT_DIR) without breaking rev-parse.
const GIT_SHIM_DIR = path.resolve(TMP_DIR, 'git-shim');
const GIT_SHIM_COUNTER = path.resolve(GIT_SHIM_DIR, 'calls');
// failArg: fail any invocation whose argv contains this word.
// fromCall: only fail from the Nth such invocation on (1 = first).
function writeGitShim(failArg = 'diff', fromCall = 1) {
    const realGit = execSync('command -v git', { encoding: 'utf-8', shell: '/bin/bash' }).trim();
    fs.mkdirSync(GIT_SHIM_DIR, { recursive: true });
    try { fs.unlinkSync(GIT_SHIM_COUNTER); } catch (e) {}
    const shim = path.resolve(GIT_SHIM_DIR, 'git');
    fs.writeFileSync(shim, [
        '#!/bin/bash',
        'for a in "$@"; do',
        '  if [ "$a" = ' + JSON.stringify(failArg) + ' ]; then',
        '    n=$(( $(cat ' + JSON.stringify(GIT_SHIM_COUNTER) + ' 2>/dev/null || echo 0) + 1 ))',
        '    echo "$n" > ' + JSON.stringify(GIT_SHIM_COUNTER),
        '    if [ "$n" -ge ' + fromCall + ' ]; then echo "fatal: simulated git failure" >&2; exit 128; fi',
        '  fi',
        'done',
        'exec ' + JSON.stringify(realGit) + ' "$@"',
        '',
    ].join('\n'), { mode: 0o755 });
    return GIT_SHIM_DIR + path.delimiter + process.env.PATH;
}
function cleanGitShim() { try { fs.rmSync(GIT_SHIM_DIR, { recursive: true, force: true }); } catch (e) {} }
// A git shim on PATH that makes any invocation whose argv contains `emptyArg`
// print nothing and exit 0, and passes everything else to the real git.
// Simulates a read that "succeeds" with an empty diff. Shares GIT_SHIM_DIR, so
// cleanGitShim removes it.
function writeGitEmptyShim(emptyArg = '-U0') {
    const realGit = execSync('command -v git', { encoding: 'utf-8', shell: '/bin/bash' }).trim();
    fs.mkdirSync(GIT_SHIM_DIR, { recursive: true });
    const shim = path.resolve(GIT_SHIM_DIR, 'git');
    fs.writeFileSync(shim, [
        '#!/bin/bash',
        'for a in "$@"; do',
        '  if [ "$a" = ' + JSON.stringify(emptyArg) + ' ]; then exit 0; fi',
        'done',
        'exec ' + JSON.stringify(realGit) + ' "$@"',
        '',
    ].join('\n'), { mode: 0o755 });
    return GIT_SHIM_DIR + path.delimiter + process.env.PATH;
}

// A directory that is guaranteed not to be inside this repository.
const NON_REPO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pcr-nonrepo-'));
function cleanNonRepoDir() { try { fs.rmSync(NON_REPO_DIR, { recursive: true, force: true }); } catch (e) {} }

const FAST_PASS_LOG = path.resolve(GIT_DIR, '.claude-fast-pass-log');
function fastPassLogLines() {
    try { return fs.readFileSync(FAST_PASS_LOG, 'utf-8').split('\n').filter(Boolean).length; }
    catch (e) { return 0; }
}

// The hash the hook uses: the staged diff with feature records excluded.
function stagedDiffHash() {
    return execSync("git diff --cached -- ':(top,exclude)features/*.md' | git hash-object --stdin", {
        encoding: 'utf-8', cwd: REPO_ROOT, shell: true,
    }).trim();
}
const FEATURE_DUMMY = path.resolve(REPO_ROOT, 'features', 'pre-commit-hook-test.md');
function stageFeatureDummy() {
    fs.writeFileSync(FEATURE_DUMMY, '# test record\n', 'utf-8');
    execSync(`git add -f "${FEATURE_DUMMY}"`, { cwd: REPO_ROOT });
}
function unstageFeatureDummy() {
    try { execSync(`git reset HEAD "${FEATURE_DUMMY}"`, { cwd: REPO_ROOT, stdio: 'pipe' }); } catch (e) {}
    try { fs.unlinkSync(FEATURE_DUMMY); } catch (e) {}
}

function sha1(buf) {
    return crypto.createHash('sha1').update(buf).digest('hex');
}

function writeCoverageXml(content) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(COV_XML, content, 'utf-8');
}
function cleanCoverageXml() { try { fs.unlinkSync(COV_XML); } catch (e) {} }

function writePolicy(cfg) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(POLICY_PATH, JSON.stringify(cfg), 'utf-8');
}
function cleanPolicy() { try { fs.unlinkSync(POLICY_PATH); } catch (e) {} }

function writeDiffCoverStub(exitCode, uncoveredLines = []) {
    // Cross-platform Node stub so tests work on Windows cmd.exe. The hook
    // shells out via DIFF_COVER_CMD, so the stub is invoked as `node <path>`.
    // The stub also records argv to a side file so tests can assert that
    // --fail-under=<N> was propagated from the policy.
    //
    // The hook invokes diff-cover as `--format json:<tmpfile>`; the stub
    // parses its own argv, writes the JSON payload to that file, and also
    // prints it to stdout so ad-hoc invocations keep working.
    const payload = JSON.stringify({
        total_percent_covered: exitCode === 0 ? 100 : 50,
        src_stats: uncoveredLines.length
            ? Object.fromEntries(uncoveredLines.map(u => [u.file, { violation_lines: u.lines }]))
            : {},
    });
    const argvLogPath = JSON.stringify(path.resolve(TMP_DIR, 'diff-cover-argv.log'));
    const script = `const fs = require('fs');
const argv = process.argv.slice(2);
fs.writeFileSync(${argvLogPath}, argv.join(' '));
const payload = ${JSON.stringify(payload)};
const fmtIdx = argv.indexOf('--format');
if (fmtIdx !== -1 && argv[fmtIdx + 1] && argv[fmtIdx + 1].startsWith('json:')) {
    const target = argv[fmtIdx + 1].slice('json:'.length);
    try { fs.writeFileSync(target, payload); } catch (e) {}
}
process.stdout.write(payload);
process.exit(${exitCode});
`;
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(DIFF_COVER_STUB, script, 'utf-8');
}
function readDiffCoverArgv() {
    try { return fs.readFileSync(path.resolve(TMP_DIR, 'diff-cover-argv.log'), 'utf-8'); }
    catch (e) { return ''; }
}
function cleanDiffCoverStub() { try { fs.unlinkSync(DIFF_COVER_STUB); } catch (e) {} }

let passed = 0;
let failed = 0;
function assert(name, actual, expected) {
    if (actual === expected) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} -- expected "${expected}", got "${actual}"`); failed++; }
}
function assertContains(name, haystack, needle) {
    if (typeof haystack === 'string' && haystack.includes(needle)) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} -- expected to contain "${needle}", got "${haystack}"`); failed++; }
}
function assertTrue(name, cond) { assert(name, !!cond, true); }
function assertFalse(name, cond) { assert(name, !!cond, false); }

console.log('pre-commit-review hook tests');
console.log('============================');

// The integration tests exercise the hook via spawnSync against the real repo
// index. Any files already staged by the caller would bleed into classifyDiff
// and break assertions. Snapshot the staged set, unstage, and restage at the
// end via try/finally at the bottom of this file.
function snapshotStaged() {
    try {
        const out = execSync('git diff --cached --name-only', {
            encoding: 'utf-8', cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        return out ? out.split('\n').filter(f => f && f !== path.relative(REPO_ROOT, DUMMY).replace(/\\/g, '/')) : [];
    } catch (e) { return []; }
}
function unstageFiles(files) {
    for (const f of files) {
        try { execSync(`git reset HEAD "${f}"`, { cwd: REPO_ROOT, stdio: 'pipe' }); }
        catch (e) { /* ignore */ }
    }
}
function restageFiles(files) {
    for (const f of files) {
        try { execSync(`git add -f "${f}"`, { cwd: REPO_ROOT, stdio: 'pipe' }); }
        catch (e) { /* ignore */ }
    }
}
const PRE_STAGED = snapshotStaged();
unstageFiles(PRE_STAGED);

// =========================================================================
// Suite 1: Classifier unit tests (exported from pre-commit-review.js)
// =========================================================================
console.log('\n[UNIT] isSourcePath / SOURCE_EXTENSIONS');
{
    const m = require(HOOK_PATH);
    // Shell is code. Omitting it meant a diff touching only install.sh and
    // uninstall.sh -- the two scripts that delete paths under ~/.claude and
    // rewrite the user's global config -- produced zero code files and was
    // approved via `staged-no-code`, with no review ever requested.
    assertTrue('install.sh is source', m.isSourcePath('install.sh'));
    assertTrue('uninstall.sh is source', m.isSourcePath('uninstall.sh'));
    assertTrue('a nested .sh is source', m.isSourcePath('src/hooks/test-tdd-order.sh'));
    assertTrue('.ps1 is source', m.isSourcePath('claude-commit-notify.ps1'));
    assertTrue('.SH uppercase is source', m.isSourcePath('DEPLOY.SH'));
    assertTrue('.js is still source', m.isSourcePath('src/hooks/pre-commit-review.js'));
    assertTrue('.py is still source', m.isSourcePath('tools/analyze-review-timing.py'));
    assert('.md is not source', m.isSourcePath('README.md'), false);
    assert('.json is not source', m.isSourcePath('package.json'), false);
    // The exclusions still win over the extension, or installing this project
    // would gate every skill and agent file it ships.
    assert('.claude/ is excluded even for .js', m.isSourcePath('.claude/hooks/pre-commit-review.js'), false);
    assert('node_modules is excluded', m.isSourcePath('node_modules/x/index.js'), false);
    // Vendored and generated shell: nobody here wrote it, and `.sh` being source
    // now makes these reachable.
    assert('nested node_modules is excluded', m.isSourcePath('frontend/node_modules/pkg/install.sh'), false);
    assert('vendor/ is excluded', m.isSourcePath('vendor/lib/configure.sh'), false);
    assert('third_party/ is excluded', m.isSourcePath('third_party/x/build.sh'), false);
    // dist/ and build/ are NOT excluded -- see test-source-files.js, which owns the
    // exclusion cases now and asserts they stay gated.
    assert('.venv/ is excluded', m.isSourcePath('.venv/bin/activate.sh'), false);
    // ...but a directory that merely starts with an excluded name is not.
    assertTrue('vendored-looking name is still source', m.isSourcePath('vendoring/tool.sh'));
    assertTrue('buildkit is still source', m.isSourcePath('buildkit/run.sh'));
    assertTrue('the list carries .sh', m.SOURCE_EXTENSIONS.includes('.sh'));
    assertTrue('the list carries .ps1', m.SOURCE_EXTENSIONS.includes('.ps1'));
}

console.log('\n[UNIT] Classifier: isLineSemantic');
const mod = require(HOOK_PATH);
const { isLineSemantic, classifyDiff, readBranchCoverage,
    pollForFreshCoverage, hygieneHasCovCheck, isCovCheck, extractUncovered } = mod;

// Trivial lines
assertFalse('blank line is trivial', isLineSemantic(''));
assertFalse('whitespace-only is trivial', isLineSemantic('    '));
assertFalse('python # comment is trivial', isLineSemantic('# just a note'));
assertFalse('indented # comment is trivial', isLineSemantic('    # indented'));
assertFalse('js // comment is trivial', isLineSemantic('// a remark'));
assertFalse('pure literal string assignment is trivial', isLineSemantic('x = "foo"'));
assertFalse('pure literal number assignment is trivial', isLineSemantic('count = 42'));
assertFalse('pure literal list is trivial', isLineSemantic('items = [1, 2, 3]'));
assertFalse('pure literal dict is trivial', isLineSemantic('cfg = {"a": 1}'));
assertFalse('None assignment is trivial', isLineSemantic('x = None'));

// Semantic: keyword-bearing
assertTrue('def line is semantic', isLineSemantic('def foo():'));
assertTrue('async def is semantic', isLineSemantic('async def foo():'));
assertTrue('class line is semantic', isLineSemantic('class Bar:'));
assertTrue('if line is semantic', isLineSemantic('if x > 0:'));
assertTrue('for line is semantic', isLineSemantic('for i in range(10):'));
assertTrue('raise line is semantic', isLineSemantic('raise ValueError("bad")'));
assertTrue('return line is semantic', isLineSemantic('return x + 1'));
assertTrue('import line is semantic', isLineSemantic('import os'));
assertTrue('from ... import is semantic', isLineSemantic('from pathlib import Path'));

// Semantic: bare call (no =, no keyword)
assertTrue('bare method call is semantic', isLineSemantic('obj.method_that_raises()'));
assertTrue('bare function call is semantic', isLineSemantic('do_work(42)'));

// Semantic: assignment with non-literal RHS
assertTrue('assignment with call RHS is semantic', isLineSemantic('y = foo()'));
assertTrue('assignment with expression RHS is semantic', isLineSemantic('total = a + b'));

// Edge: == is not assignment
assertFalse('equality comparison alone is trivial', isLineSemantic('# x == 1'));

console.log('\n[UNIT] Classifier: classifyDiff');

const trivialDiff = [
    'diff --git a/foo.py b/foo.py',
    'index abc..def 100644',
    '--- a/foo.py',
    '+++ b/foo.py',
    '@@ -0,0 +1,2 @@',
    '+# a new comment',
    '+x = "hello"',
].join('\n');
const tc1 = classifyDiff(trivialDiff);
assert('trivial diff: semanticAdded == 0', tc1.semanticAdded, 0);
assert('trivial diff: semanticRemoved == 0', tc1.semanticRemoved, 0);

const semanticDiff = [
    'diff --git a/foo.py b/foo.py',
    '--- a/foo.py',
    '+++ b/foo.py',
    '@@ -0,0 +1,2 @@',
    '+def greet():',
    '+    return "hi"',
].join('\n');
const tc2 = classifyDiff(semanticDiff);
assertTrue('semantic diff: semanticAdded >= 1', tc2.semanticAdded >= 1);

const removeSemanticDiff = [
    'diff --git a/foo.py b/foo.py',
    '--- a/foo.py',
    '+++ b/foo.py',
    '@@ -1,3 +1,2 @@',
    ' x = 1',
    '-    raise ValueError("x")',
    '+# replaced with comment',
].join('\n');
const tc3 = classifyDiff(removeSemanticDiff);
assertTrue('diff removing a raise: semanticRemoved >= 1', tc3.semanticRemoved >= 1);

console.log('\n[UNIT] git-read');
const gitReadLib = require(path.join(__dirname, 'lib', 'git-read.js'));
{
    const located = gitReadLib.locateRepo(REPO_ROOT);
    assertTrue('locateRepo finds this repo', !!located.gitDir && !!located.toplevel);
    const outside = gitReadLib.locateRepo(NON_REPO_DIR);
    assertTrue('locateRepo reports a genuine non-repo', outside.notARepo === true);
    stageDummyContent('def h():\n    return 1\n');
    assert('stagedDiffHash matches the git pipeline', gitReadLib.stagedDiffHash(REPO_ROOT), stagedDiffHash());
    const plainPipeline = execSync('git diff --cached | git hash-object --stdin', { encoding: 'utf-8', cwd: REPO_ROOT, shell: true }).trim();
    assert('with no feature record staged the hash equals the plain pipeline', gitReadLib.stagedDiffHash(REPO_ROOT), plainPipeline);
    const before = gitReadLib.stagedDiffHash(REPO_ROOT);
    stageFeatureDummy();
    assert('staging a feature record does not move the hash', gitReadLib.stagedDiffHash(REPO_ROOT), before);
    assert('the shell pipeline agrees with the feature record staged', stagedDiffHash(), before);
    unstageFeatureDummy();
    unstageDummy();
    assert('stagedDiffHash of an empty index matches the pipeline', gitReadLib.stagedDiffHash(REPO_ROOT), stagedDiffHash());
    if (process.platform !== 'win32') {
        const savedPath = process.env.PATH;
        process.env.PATH = writeGitShim('diff');
        try {
            assert('stagedDiffHash is null when git diff fails', gitReadLib.stagedDiffHash(REPO_ROOT), null);
        } finally { process.env.PATH = savedPath; }
        process.env.PATH = writeGitShim('rev-parse');
        try {
            const broken = gitReadLib.locateRepo(REPO_ROOT);
            assertTrue('locateRepo failure is not reported as non-repo', broken.notARepo === false && broken.gitDir === null);
            assertContains('locateRepo carries the error', broken.error || '', 'simulated');
        } finally { process.env.PATH = savedPath; }
        cleanGitShim();
    }
    const savedGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(os.tmpdir(), 'nonexistent-git-dir-' + process.pid);
    try {
        const bad = gitReadLib.locateRepo(REPO_ROOT);
        assertTrue('bad GIT_DIR is a failure, not a non-repo', bad.notARepo === false && bad.gitDir === null);
    } finally {
        if (savedGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = savedGitDir;
    }
}

console.log('\n[UNIT] resolvePythonCmd');
assertTrue('a python interpreter is resolved on this host', !!mod.resolvePythonCmd());

console.log('\n[UNIT] readBranchCoverage');

const covXmlFull = `<?xml version="1.0"?><coverage>
  <packages><package><classes>
    <class filename="pkg/a.py" branches-covered="9" branches-valid="10"/>
    <class filename="pkg/b.py" branches-covered="5" branches-valid="10"/>
    <class filename="other/c.py" branches-covered="10" branches-valid="10"/>
  </classes></package></packages>
</coverage>`;
fs.mkdirSync(TMP_DIR, { recursive: true });
const COV_FULL = path.resolve(TMP_DIR, 'pre-commit-hook-test-branch-cov.xml');
fs.writeFileSync(COV_FULL, covXmlFull, 'utf-8');

assert('min branch cov across two staged files', readBranchCoverage(COV_FULL, ['pkg/a.py', 'pkg/b.py']), 50);
assert('single staged file with 90%', readBranchCoverage(COV_FULL, ['pkg/a.py']), 90);
assert('staged file absent from xml -> 100 (default)', readBranchCoverage(COV_FULL, ['missing.py']), 100);
try { fs.unlinkSync(COV_FULL); } catch (e) {}

console.log('\n[UNIT] isCovCheck / hygieneHasCovCheck');

assertTrue('check named "pytest-cov" is cov',
    isCovCheck({ name: 'pytest-cov', command: 'pytest' }));
assertTrue('check command with --cov is cov',
    isCovCheck({ name: 'tests', command: 'pytest --cov=src --cov-report=xml' }));
assertTrue('check command with --cov-branch is cov',
    isCovCheck({ name: 'tests', command: 'pytest --cov-branch' }));
assertFalse('plain ruff check is not cov',
    isCovCheck({ name: 'ruff', command: 'ruff check' }));
assertFalse('plain pytest without --cov is not cov',
    isCovCheck({ name: 'tests', command: 'pytest -q' }));

assertFalse('null repoCfg has no cov check', hygieneHasCovCheck(null));
assertFalse('empty repoCfg has no cov check', hygieneHasCovCheck({}));
assertFalse('repoCfg without cov-named check', hygieneHasCovCheck({
    checks: [{ name: 'ruff', command: 'ruff check' }],
}));
assertTrue('repoCfg with cov-named check', hygieneHasCovCheck({
    checks: [{ name: 'ruff', command: 'ruff check' }, { name: 'pytest-cov', command: 'true' }],
}));

console.log('\n[UNIT] pollForFreshCoverage');

const POLL_PATH = path.resolve(TMP_DIR, 'pre-commit-hook-test-poll.xml');
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.writeFileSync(POLL_PATH, '', 'utf-8');
// Mark file as 1 minute old, then poll requiring "newer than now-30s" —
// initially stale, should time out quickly.
const oldTime = new Date(Date.now() - 60_000);
fs.utimesSync(POLL_PATH, oldTime, oldTime);
const newerThan = Date.now() - 30_000;
const t0 = Date.now();
const timedOut = !pollForFreshCoverage(POLL_PATH, newerThan, 600);
const elapsed = Date.now() - t0;
assertTrue('poll times out when file stays stale', timedOut);
assertTrue('poll honours timeout (under 1.5s)', elapsed < 1500);

// Touch file fresh, expect immediate success.
fs.utimesSync(POLL_PATH, new Date(), new Date());
const ok = pollForFreshCoverage(POLL_PATH, newerThan, 600);
assertTrue('poll returns true when file is already fresh', ok);
try { fs.unlinkSync(POLL_PATH); } catch (e) {}

console.log('\n[UNIT] extractUncovered');

assert('extractUncovered: null parsed', extractUncovered(null).length, 0);
assert('extractUncovered: missing src_stats', extractUncovered({}).length, 0);
assert('extractUncovered: empty src_stats', extractUncovered({ src_stats: {} }).length, 0);
assert('extractUncovered: empty violation_lines',
    extractUncovered({ src_stats: { 'a.py': { violation_lines: [] } } }).length, 0);
const ex = extractUncovered({ src_stats: { 'a.py': { violation_lines: [3, 4] } } });
assert('extractUncovered: returns one entry for non-empty list', ex.length, 1);
assert('extractUncovered: file name preserved', ex[0].file, 'a.py');

// =========================================================================
// Suite 2: Integration tests -- original gate precedence
// =========================================================================
console.log('\n[INT] Ignored commands (silent exit):');
cleanAll();
assert('silent on git status', runHook('git status').decision, 'silent');
assert('git commit --amend is gated, not ignored', runHook('git commit --amend -m x').decision !== 'silent', true);

console.log('\n[INT] Gate 4 (legacy marker body governs approval):');
try {
    // =====================================================================
    // Gate 0: a command that stages (or switches branch, or commits by
    // pathspec) in the same Bash invocation as the commit is blocked before
    // any index-based gate runs. Incident: `git add ... && git commit ...`
    // approved via gate3-no-staged-code because the hook ran before add.
    // =====================================================================
    console.log('\n[INT] Gate 0 (index unreliable at hook time):');
    cleanAll();
    // Trivial staged content: every later gate would fast-path approve this,
    // so a block here can only come from Gate 0.
    stageDummyContent('# comment only\n');
    let r0 = runHook('git add tmp/other.py && git commit -m x');
    assert('git add && git commit blocks', r0.decision, 'block');
    assertContains('gate0 message names the staging command', r0.systemMessage || '', 'git add');
    assertContains('gate0 message says how to proceed', r0.systemMessage || '', 'separate command');
    assertFalse('gate0 writes no lock', fs.existsSync(LOCK));
    assertFalse('gate0 writes no marker', fs.existsSync(MARKER));
    assert('git commit -am blocks', runHook('git commit -am x').decision, 'block');
    assert('git commit with pathspec blocks', runHook('git commit -m x tmp/other.py').decision, 'block');
    assert('git checkout main && git commit blocks', runHook('git checkout main && git commit -m x').decision, 'block');
    assert('git -C elsewhere commit blocks', runHook('git -C /elsewhere commit -m x').decision, 'block');
    assert('bash -c wrapped commit blocks', runHook('bash -c "git commit -m x"').decision, 'block');
    assert('plain commit whose message mentions git add still fast-paths',
        runHook('git commit -m "handle git add correctly"').decision, 'approve');
    assert('git log --grep commit is silent', runHook('git log --grep commit').decision, 'silent');
    unstageDummy();
    cleanAll();

    // Use semantic content so classifier does not fast-path; we exercise Gate 4.
    stageDummyContent('def foo():\n    return 1\n');

    cleanAll();
    let r = runHook('git commit -m x');
    assert('blocks when no marker present', r.decision, 'block');
    assertContains('block message tells user to run review', r.systemMessage || '', '/sdlc:code-review-pre-commit');

    cleanLock();
    writeMarker('');
    r = runHook('git commit -m x');
    assert('blocks on empty marker body', r.decision, 'block');
    assertContains('empty-body block cites empty marker', r.reason || '', 'marker is empty');

    cleanLock();
    writeMarker('FAIL');
    r = runHook('git commit -m x');
    assert('blocks on FAIL marker body', r.decision, 'block');
    assertContains('FAIL-body block cites FAIL in reason', r.reason || '', 'FAIL');

    cleanLock();
    writeMarker('PASS');
    r = runHook('git commit -m x');
    assert('a legacy one-line PASS body no longer approves', r.decision, 'block');
    assertContains('legacy-body block explains', r.reason || '', 'no hashes');

    cleanLock();
    writeMarker('PASS\n');
    r = runHook('git commit -m x');
    assert('legacy PASS with trailing newline no longer approves', r.decision, 'block');

    cleanLock();
    writeMarker('pass');
    r = runHook('git commit -m x');
    assert('blocks on lowercase "pass" (exact-match required)', r.decision, 'block');

    console.log('\n[INT] Gate 2 (review in flight: the lock never approves):');
    cleanAll();
    // Semantic content is staged from the Gate 4 block above.
    const g2Hash = stagedDiffHash();
    fs.writeFileSync(LOCK, new Date().toISOString() + '\n' + g2Hash, 'utf-8');
    r = runHook('git commit -m x');
    assert('fresh lock for this diff blocks', r.decision, 'block');
    assertContains('in-flight block says a review was requested', r.reason || '', 'review was requested');
    assertContains('in-flight block names the lock to remove', r.systemMessage || '', 'rm ');
    assertContains('in-flight block carries the marker recipe', r.systemMessage || '', "printf 'PASS");
    assert('lock is kept while the review is in flight', fs.existsSync(LOCK), true);
    // A matching PASS marker opens the gate and releases the lock.
    writeMarker(`PASS\n${g2Hash}\nnone\ncode-reviewer:round1:PASS`);
    r = runHook('git commit -m x');
    assert('matching marker approves despite the lock', r.decision, 'approve');
    assert('lock is released on the marker match', fs.existsSync(LOCK), false);
    // A lock for a different diff is stale: removed, and the gates run.
    cleanAll();
    fs.writeFileSync(LOCK, new Date().toISOString() + '\ndeadbeefdeadbeef', 'utf-8');
    r = runHook('git commit -m x');
    assert('stale lock does not approve', r.decision, 'block');
    assert('stale lock is replaced by one bound to this diff', (mod.readLock(LOCK) || {}).diffHash, g2Hash);
    // A legacy one-line lock (timestamp only) is stale too.
    cleanAll();
    fs.writeFileSync(LOCK, new Date().toISOString(), 'utf-8');
    r = runHook('git commit -m x');
    assert('legacy lock does not approve', r.decision, 'block');
    assert('legacy lock is replaced by one bound to this diff', (mod.readLock(LOCK) || {}).diffHash, g2Hash);
    // --amend with staged code is gated exactly like a commit.
    cleanAll();
    r = runHook('git commit --amend --no-edit');
    assert('--amend with staged code blocks for review', r.decision, 'block');

    console.log('\n[INT] Block message carries the recomputing marker recipe:');
    cleanAll();
    r = runHook('git commit -m x');
    assert('default block writes a lock bound to the diff', (mod.readLock(LOCK) || {}).diffHash, stagedDiffHash());
    assertContains('recipe recomputes the diff hash with the shared pipeline', r.systemMessage || '', '$(' + gitReadLib.HASH_PIPELINE + ')');
    assertContains('recipe uses printf', r.systemMessage || '', "printf 'PASS");
    assertContains('recipe writes the absolute marker path', r.systemMessage || '', MARKER);
    assertContains('message states the rounds policy', r.systemMessage || '', 'After two FAILs stop');
    assertContains('message reports semantic line counts', r.systemMessage || '', 'semantic lines added');
    // Executing the recipe verbatim must produce a marker the hook accepts.
    {
        const m = (r.systemMessage || '').match(/run exactly: (printf .*?) \(replace/);
        assertTrue('recipe is extractable from the message', !!m);
        if (m) {
            const res = spawnSync('bash', ['-c', m[1]], { cwd: REPO_ROOT, encoding: 'utf-8' });
            assert('recipe runs cleanly', res.status, 0);
            cleanLock();
            r = runHook('git commit -m x');
            assert('marker written by the recipe approves the retry', r.decision, 'approve');
            assertContains('marker carries the agent tag', readMarker() || '', 'code-reviewer:round1:PASS');
        }
    }

    // =====================================================================
    // Suite 3: New gates -- 3a hash short-circuit, 3b classifier, 3c diff-cover
    // =====================================================================
    console.log('\n[INT] Gate 3a (combined-hash short-circuit):');
    cleanAll();
    const diffHash = stagedDiffHash();
    // coverage.xml absent -> cov hash is 'none'
    writeMarker(`PASS\n${diffHash}\nnone`);
    r = runHook('git commit -m x');
    assert('approves on matching diff hash + absent coverage', r.decision, 'approve');

    cleanLock();
    writeMarker(`PASS\ndeadbeefdeadbeef\nnone`);
    r = runHook('git commit -m x');
    assert('falls through on hash mismatch (still semantic content)', r.decision, 'block');

    // With coverage.xml present, cov hash is real sha1. When Gate 3a's
    // short-circuit cannot approve, the hook falls through to Gate 3c which
    // will invoke diff-cover. Stub it to exit non-zero so the fall-through
    // case deterministically blocks even in environments where real
    // diff-cover is installed and would pass on the tiny fixture coverage.xml.
    cleanLock(); cleanMarker();
    writeCoverageXml('<coverage></coverage>');
    writeDiffCoverStub(1);
    const covHash = sha1('<coverage></coverage>');
    writeMarker(`PASS\n${diffHash}\n${covHash}`);
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
    });
    assert('approves when both diff and coverage hashes match', r.decision, 'approve');

    cleanLock();
    // Force the gap-patch branch with concrete uncovered lines so the cov-hash
    // mismatch falls through Gate 3a -> Gate 3c -> 3d block (not the empty-gap
    // approval added by the false-positive guard).
    writeDiffCoverStub(1, [{ file: 'tmp/pre-commit-hook-test.py', lines: [1, 2] }]);
    writeMarker(`PASS\n${diffHash}\ndifferenthash`);
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
    });
    assert('blocks when diff hash matches but coverage hash differs', r.decision, 'block');
    cleanCoverageXml();
    cleanDiffCoverStub();

    console.log('\n[INT] Gate 3b (trivial-diff classifier):');
    cleanAll();
    unstageDummy();

    // whitespace-only additions (new file of only blank lines)
    stageDummyContent('\n\n\n');
    r = runHook('git commit -m x');
    assert('fast-path approves whitespace-only staged content', r.decision, 'approve');
    assertContains('marker tagged trivial-diff', readMarker() || '', 'trivial-diff');

    cleanAll();
    // comment-only addition
    stageDummyContent('# just a note\n# another line\n');
    r = runHook('git commit -m x');
    assert('fast-path approves comment-only staged content', r.decision, 'approve');

    cleanAll();
    // pure literal assignment
    stageDummyContent('x = "foo"\ny = 42\n');
    r = runHook('git commit -m x');
    assert('fast-path approves pure literal assignments', r.decision, 'approve');

    cleanAll();
    // call RHS: NOT trivial
    stageDummyContent('y = foo()\n');
    r = runHook('git commit -m x');
    assert('does NOT fast-path assignment with call RHS', r.decision, 'block');

    cleanAll();
    // bare call: NOT trivial
    stageDummyContent('obj.method()\n');
    r = runHook('git commit -m x');
    assert('does NOT fast-path bare method call', r.decision, 'block');

    cleanAll();
    // def: NOT trivial
    stageDummyContent('def foo():\n    pass\n');
    r = runHook('git commit -m x');
    assert('does NOT fast-path def', r.decision, 'block');

    cleanAll();
    // raise: NOT trivial
    stageDummyContent('raise ValueError("x")\n');
    r = runHook('git commit -m x');
    assert('does NOT fast-path raise', r.decision, 'block');

    // =====================================================================
    // Gate 3b must fail closed: a staged diff the hook cannot read is not a
    // trivial diff. Incident: a 13 MB fixture-heavy commit overflowed the
    // 1 MiB execSync default, the read returned '', and the classifier saw
    // zero semantic lines -> trivial-diff approval without review.
    // =====================================================================
    console.log('\n[INT] Gate 3b large-diff fail-closed:');
    cleanAll();
    unstageDummy();
    stageDummyContent('def foo():\n    return 1\n');
    stageLargeFixture(2 * 1024 * 1024);
    const logBefore = fastPassLogLines();
    r = runHook('git commit -m x');
    assert('semantic change + 2 MB fixture is NOT fast-path approved', r.decision, 'block');
    assert('fast-pass log gained no line', fastPassLogLines(), logBefore);
    assertFalse('no PASS marker written', (readMarker() || '').startsWith('PASS'));

    console.log('\n[UNIT] getStagedDiff reads only the staged code files:');
    const dummyRel = path.relative(REPO_ROOT, DUMMY).replace(/\\/g, '/');
    const codeOnly = mod.getStagedDiff([dummyRel]);
    assertTrue('code-only read returns a string', typeof codeOnly === 'string');
    assertContains('code-only read contains the def', codeOnly || '', '+def foo');
    assertFalse('code-only read excludes the fixture bytes', (codeOnly || '').includes('fixture-data'));
    assertTrue('classifier sees the semantic line', classifyDiff(codeOnly).semanticAdded >= 1);
    unstageLargeFixture();

    console.log('\n[UNIT] getStagedDiff returns null on a failed read:');
    assert('overflowing maxBuffer yields null, not empty string',
        mod.getStagedDiff([dummyRel], { maxBuffer: 16 }), null);
    assert('git error yields null', mod.getStagedDiff([dummyRel], { cwd: NON_REPO_DIR }), null);

    console.log('\n[INT] Gate 3b null read does not fast-path:');
    cleanAll();
    // Force the code-only read to overflow so the hook takes the null path.
    r = runHook('git commit -m x', { REVIEW_DIFF_MAX_BUFFER: '16' });
    assert('null diff read blocks instead of approving', r.decision, 'block');
    assertContains('block message says the diff could not be read',
        r.systemMessage || '', 'could not be read');
    assertFalse('null read writes no PASS marker', (readMarker() || '').startsWith('PASS'));

    // =====================================================================
    // Subdirectory commits. `--name-only` prints root-relative paths, so a
    // diff read that resolves them against a subdirectory cwd matches nothing
    // and git returns '' with exit 0. Incident: 33 staged code files read as a
    // 0-byte diff and were approved via trivial-diff.
    // =====================================================================
    console.log('\n[UNIT] readStagedDiff fails closed on an empty read over staged code files:');
    cleanAll();
    stageDummyContent('def foo():\n    return 1\n');
    const emptyRead = mod.readStagedDiff([dummyRel], { cwd: path.join(REPO_ROOT, 'src') });
    assert('empty read over staged code files yields null text', emptyRead.text, null);
    assertContains('empty read error names the empty diff', emptyRead.error || '', 'empty diff');

    console.log('\n[INT] Gate 3b from a subdirectory does not fast-path a semantic change:');
    cleanAll();
    stageDummyContent('def foo():\n    return 1\n');
    const subLogBefore = fastPassLogLines();
    r = runHook('git commit -m x', {}, { cwd: path.join(REPO_ROOT, 'src') });
    assertTrue('subdir semantic change is not approved', r.decision !== 'approve');
    assertFalse('subdir semantic change writes no PASS marker', (readMarker() || '').startsWith('PASS'));
    assert('subdir semantic change adds no fast-pass log line', fastPassLogLines(), subLogBefore);

    console.log('\n[INT] Gate 3b from a subdirectory still fast-paths a trivial diff:');
    cleanAll();
    stageDummyContent('# comment only\n');
    r = runHook('git commit -m x', {}, { cwd: path.join(REPO_ROOT, 'src') });
    assert('subdir comment-only change is approved', r.decision, 'approve');
    assertContains('subdir comment-only marker tagged trivial-diff', readMarker() || '', 'trivial-diff');

    if (process.platform !== 'win32') {
        console.log('\n[INT] Gate 3b empty diff read fails closed from the root:');
        cleanAll();
        stageDummyContent('def foo():\n    return 1\n');
        const TDD_CFG3 = path.resolve(TMP_DIR, 'pre-commit-hook-test-tdd-mandate3.json');
        fs.writeFileSync(TDD_CFG3, JSON.stringify({ exempt_repos: [REPO_ROOT] }), 'utf-8');
        try {
            r = runHook('git commit -m x',
                { PATH: writeGitEmptyShim('-U0'), TDD_MANDATE_CONFIG: TDD_CFG3 });
            assertTrue('empty diff read is not approved', r.decision !== 'approve');
            assertFalse('empty diff read writes no PASS marker', (readMarker() || '').startsWith('PASS'));
            assertContains('empty diff read message says the diff could not be read',
                r.systemMessage || '', 'could not be read');
        } finally {
            try { fs.unlinkSync(TDD_CFG3); } catch (e) {}
            cleanGitShim();
        }
    }
    unstageDummy();
    cleanAll();

    // =====================================================================
    // Unreadable index: a failed `git diff --cached --name-only` must not
    // read as "no staged code". Second-pass sweep, item A.
    // =====================================================================
    console.log('\n[INT] Gate 1 distinguishes non-repo from unreadable repo:');
    cleanAll();
    stageDummyContent('def foo():\n    return 1\n');
    r = runHook('git commit -m x', { GIT_DIR: path.join(os.tmpdir(), 'nonexistent-git-dir-' + process.pid) });
    assert('bad GIT_DIR blocks', r.decision, 'block');
    assertContains('bad GIT_DIR message says the repo could not be located', r.systemMessage || '', 'could not be located');
    assertFalse('bad GIT_DIR writes no lock', fs.existsSync(LOCK));
    assertFalse('bad GIT_DIR writes no marker', fs.existsSync(MARKER));
    r = runHook('git commit -m x', {}, { cwd: NON_REPO_DIR });
    assert('genuine non-repo cwd approves', r.decision, 'approve');

    console.log('\n[INT] A crashing hook blocks, never approves by silence:');
    if (process.platform !== 'win32') {
        // A truncated lib file (partial install) must block at load time too.
        const HOOK_COPY = fs.mkdtempSync(path.join(os.tmpdir(), 'pcr-hookcopy-'));
        fs.cpSync(path.join(__dirname), HOOK_COPY, { recursive: true, filter: p => !/test-|\.sh$/.test(path.basename(p)) || fs.statSync(p).isDirectory() });
        fs.writeFileSync(path.join(HOOK_COPY, 'lib', 'git-read.js'), 'this is not javascript (', 'utf-8');
        for (const hook of ['pre-commit-review.js', 'pre-commit-feature.js', 'pre-commit-hygiene.js']) {
            const res = spawnSync('node', [path.join(HOOK_COPY, hook)], {
                input: JSON.stringify({ tool_input: { command: 'git commit -m x' } }),
                encoding: 'utf-8', cwd: REPO_ROOT, env: process.env,
            });
            let out = null;
            try { out = JSON.parse((res.stdout || '').trim()); } catch (e) { out = null; }
            assert(hook + ' with a broken lib blocks instead of exiting silently', out && out.decision, 'block');
        }
        fs.rmSync(HOOK_COPY, { recursive: true, force: true });
    }
    r = runHook('git commit -m x', { REVIEW_POLICY_CONFIG: '/dev/null/not-a-file' });
    assertTrue('unreadable policy path does not crash the hook', r.decision === 'block' || r.decision === 'approve');
    // Force a throw inside main via a poisoned TDD config path that is a directory.
    r = runHook('git commit -m x', { TDD_ORDER_REPOS_CONFIG: REPO_ROOT });
    assertTrue('directory as config path does not crash the hook', r.decision === 'block' || r.decision === 'approve');

    console.log('\n[INT] Gate 0 directory change before the commit:');
    cleanAll();
    stageDummyContent('# comment only\n');
    r = runHook('cd ' + NON_REPO_DIR + ' && git commit -m x');
    assert('cd out of the repo blocks', r.decision, 'block');
    assertContains('cd block names the repository', r.systemMessage || '', 'leaves the repository');
    r = runHook('cd "$SOMEWHERE" && git commit -m x');
    assert('dynamic cd blocks', r.decision, 'block');
    r = runHook('cd ' + REPO_ROOT + ' && git commit -m x', {}, { cwd: NON_REPO_DIR });
    assert('cd into a repo from outside blocks', r.decision, 'block');
    r = runHook('cd src && git commit -m x');
    assert('cd within the repo proceeds (trivial fast path)', r.decision, 'approve');
    unstageDummy();
    cleanAll();
    stageDummyContent('def foo():\n    return 1\n');
    if (process.platform !== 'win32') {
        r = runHook('git commit -m x', { PATH: writeGitShim('rev-parse') });
        assert('rev-parse failure blocks', r.decision, 'block');
        assertContains('rev-parse failure names the error', r.systemMessage || '', 'simulated');
        cleanGitShim();
    }
    unstageDummy();
    cleanAll();

    if (process.platform !== 'win32') {
        console.log('\n[INT] Gate 3e unreadable paths write no marker:');
        cleanAll();
        stageDummyContent('def foo():\n    return 1\n');
        // The first --name-only read (Gate 3) succeeds; the second, inside the
        // TDD gate, fails. diffHash is real by then, so the marker guard is
        // what stands between the block and a cached BLOCK marker.
        const TDD_CFG2 = path.resolve(TMP_DIR, 'pre-commit-hook-test-tdd-repos2.json');
        fs.writeFileSync(TDD_CFG2, JSON.stringify({ repos: [REPO_ROOT] }), 'utf-8');
        r = runHook('git commit -m x',
            { PATH: writeGitShim('--name-only', 2), TDD_ORDER_REPOS_CONFIG: TDD_CFG2 },
            { input: { transcript_path: '/nonexistent/transcript.jsonl' } });
        assert('tdd gate unreadable paths block', r.decision, 'block');
        assertContains('tdd gate unreadable message', r.systemMessage || '', 'could not be read');
        assertFalse('tdd gate unreadable writes no marker', fs.existsSync(MARKER));
        assertFalse('tdd gate unreadable writes no lock', fs.existsSync(LOCK));
        try { fs.unlinkSync(TDD_CFG2); } catch (e) {}
        cleanGitShim();
        unstageDummy();
        cleanAll();

        console.log('\n[INT] Gate 3 unreadable index fails closed:');
        cleanAll();
        stageDummyContent('def foo():\n    return 1\n');
        const shimPath = writeGitShim();
        r = runHook('git commit -m x', { PATH: shimPath });
        assert('unreadable index blocks', r.decision, 'block');
        assertContains('block says the file list could not be read', r.systemMessage || '', 'could not be read');
        assertFalse('unreadable index writes no lock', fs.existsSync(LOCK));
        assertFalse('unreadable index writes no marker', fs.existsSync(MARKER));

        console.log('\n[UNIT] readStagedCodeFiles / getAllStagedPaths return null on failure:');
        const savedPath = process.env.PATH;
        process.env.PATH = shimPath;
        try {
            assert('readStagedCodeFiles files is null', mod.readStagedCodeFiles().files, null);
            assertContains('readStagedCodeFiles carries the error', mod.readStagedCodeFiles().error || '', 'simulated');
            assert('getAllStagedPaths is null', mod.getAllStagedPaths(), null);
            // TDD gate on an opted-in repo: unreadable paths must block, not continue.
            const TDD_CFG = path.resolve(TMP_DIR, 'pre-commit-hook-test-tdd-repos.json');
            fs.writeFileSync(TDD_CFG, JSON.stringify({ repos: [REPO_ROOT] }), 'utf-8');
            process.env.TDD_ORDER_REPOS_CONFIG = TDD_CFG;
            const gate = mod.evaluateTddOrderGate(REPO_ROOT, '/nonexistent/transcript.jsonl');
            assert('tdd gate blocks on unreadable paths', gate.action, 'block');
            assert('tdd gate status is unreadable', gate.status, 'unreadable');
            delete process.env.TDD_ORDER_REPOS_CONFIG;
            try { fs.unlinkSync(TDD_CFG); } catch (e) {}
        } finally {
            process.env.PATH = savedPath;
        }
        // Sanity: with the real git back, the same staging is readable.
        assertTrue('real git reads the staged list again', Array.isArray(mod.readStagedCodeFiles().files));
        cleanGitShim();
        unstageDummy();
        cleanAll();
    }

    console.log('\n[INT] Gate 3c (hook-level diff-cover):');
    cleanAll();
    // Stage semantic content so the classifier does not fast-path.
    stageDummyContent('def foo():\n    return 1\n');
    // Put a coverage.xml in place so the hook considers diff-cover.
    writeCoverageXml('<coverage></coverage>');

    // diff-cover reports 0 (thresholds met) -> approve without sub-agent.
    writeDiffCoverStub(0);
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
    });
    assert('approves when diff-cover stub exits 0', r.decision, 'approve');
    assertContains('marker tagged thresholds-met', readMarker() || '', 'thresholds-met');
    assertContains('hook passes --fail-under to diff-cover',
        readDiffCoverArgv(), '--fail-under=95');

    cleanAll();
    // diff-cover reports non-zero -> block with gap-patching systemMessage.
    writeDiffCoverStub(1, [{ file: 'tmp/pre-commit-hook-test.py', lines: [1, 2] }]);
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
    });
    assert('blocks when diff-cover stub exits non-zero', r.decision, 'block');
    assertContains('gap-patching systemMessage mentions uncovered',
        r.systemMessage || '', 'gap-patching');

    // Policy-driven threshold: if policy says 80, stub should receive 80.
    cleanAll();
    writeDiffCoverStub(0);
    writePolicy({ repos: { [REPO_ROOT.replace(/\\/g, '/')]: { diff_cover_threshold: 80 } } });
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
        REVIEW_POLICY_CONFIG: POLICY_PATH,
    });
    assert('policy threshold 80 is wired into diff-cover', r.decision, 'approve');
    assertContains('policy threshold propagates to --fail-under',
        readDiffCoverArgv(), '--fail-under=80');
    cleanPolicy();

    // Branch coverage below threshold -> block even though diff-cover exits 0.
    cleanAll();
    // Simulate: stage tmp/pre-commit-hook-test.py with branch cov 40%.
    const branchXml = `<?xml version="1.0"?><coverage><packages><package><classes>
        <class filename="tmp/pre-commit-hook-test.py" branches-covered="4" branches-valid="10"/>
    </classes></package></packages></coverage>`;
    writeCoverageXml(branchXml);
    writeDiffCoverStub(0);
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
    });
    assert('blocks when branch coverage is below threshold', r.decision, 'block');
    assertContains('branch-cov block message mentions branch coverage',
        r.systemMessage || '', 'Branch coverage');

    cleanDiffCoverStub();
    cleanCoverageXml();

    console.log('\n[INT] Gate 3c staleness guard (no hygiene config):');
    cleanAll();
    // Write coverage.xml FIRST, then stage a newer dummy file. Force mtimes to
    // guarantee the ordering across filesystems with coarse time resolution.
    writeCoverageXml('<coverage></coverage>');
    const staleTime = new Date(Date.now() - 60 * 1000); // 1 minute ago
    fs.utimesSync(COV_XML, staleTime, staleTime);
    stageDummyContent('def foo():\n    return 1\n');
    writeDiffCoverStub(1, [{ file: 'tmp/pre-commit-hook-test.py', lines: [1, 2] }]);
    // Point HYGIENE_REPOS_CONFIG at a non-existent file so auto-regen declines.
    const EMPTY_HYGIENE = path.resolve(TMP_DIR, 'pre-commit-hook-test-empty-hygiene.json');
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
        HYGIENE_REPOS_CONFIG: EMPTY_HYGIENE,
    });
    assert('stale coverage + no hygiene config blocks commit', r.decision, 'block');
    assertContains('stale-cov block cites staleness', r.reason || '', 'stale');
    assertContains('stale-cov message mentions regenerate', r.systemMessage || '', 'Regenerate');
    assertFalse('stale-cov does NOT dispatch gap-patching',
        (r.systemMessage || '').includes('gap-patching'));
    cleanDiffCoverStub();
    cleanCoverageXml();

    console.log('\n[INT] Gate 3c staleness wait-for-hygiene (success):');
    cleanAll();
    // Stale coverage.xml + hygiene cov-check configured. A sidecar process
    // touches coverage.xml shortly after the hook starts polling, simulating
    // the parallel hygiene hook finishing pytest-cov.
    writeCoverageXml('<coverage></coverage>');
    fs.utimesSync(COV_XML, staleTime, staleTime);
    stageDummyContent('def foo():\n    return 1\n');
    writeDiffCoverStub(0);
    const HYGIENE_CFG = path.resolve(TMP_DIR, 'pre-commit-hook-test-hygiene.json');
    const toplevelKey = REPO_ROOT.replace(/\\/g, '/');
    fs.writeFileSync(HYGIENE_CFG, JSON.stringify({
        repos: { [toplevelKey]: {
            setup: [],
            checks: [{ name: 'pytest-cov', command: 'true' }],
            timeoutMs: 30000,
        }},
    }), 'utf-8');
    // Spawn detached sidecar that bumps coverage.xml mtime after 250ms.
    const { spawn } = require('child_process');
    const sidecar = spawn('node', ['-e', `
        setTimeout(() => {
            try { require('fs').utimesSync(${JSON.stringify(COV_XML)}, new Date(), new Date()); }
            catch (e) {}
        }, 250);
    `], { detached: true, stdio: 'ignore' });
    sidecar.unref();
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
        HYGIENE_REPOS_CONFIG: HYGIENE_CFG,
        COV_WAIT_TIMEOUT_MS: '5000',
    });
    assert('wait-for-hygiene refreshes coverage and approves', r.decision, 'approve');
    assertContains('wait-for-hygiene writes thresholds-met marker',
        readMarker() || '', 'thresholds-met');
    cleanDiffCoverStub();
    cleanCoverageXml();

    console.log('\n[INT] Gate 3c staleness wait-for-hygiene (timeout):');
    cleanAll();
    writeCoverageXml('<coverage></coverage>');
    fs.utimesSync(COV_XML, staleTime, staleTime);
    stageDummyContent('def foo():\n    return 1\n');
    writeDiffCoverStub(0);
    // Same hygiene config, but no sidecar — wait should time out.
    fs.writeFileSync(HYGIENE_CFG, JSON.stringify({
        repos: { [toplevelKey]: {
            setup: [],
            checks: [{ name: 'pytest-cov', command: 'true' }],
            timeoutMs: 30000,
        }},
    }), 'utf-8');
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
        HYGIENE_REPOS_CONFIG: HYGIENE_CFG,
        COV_WAIT_TIMEOUT_MS: '500',
    });
    assert('wait-for-hygiene timeout blocks commit', r.decision, 'block');
    assertContains('timeout block cites hygiene', r.reason || '', 'Hygiene did not produce');
    assertContains('timeout message guides user to hygiene', r.systemMessage || '', 'hygiene hook');
    try { fs.unlinkSync(HYGIENE_CFG); } catch (e) {}
    cleanDiffCoverStub();
    cleanCoverageXml();

    console.log('\n[INT] Gate 3c empty-gap false-positive guard:');
    cleanAll();
    stageDummyContent('def foo():\n    return 1\n');
    // diff-cover stub: non-zero exit, but src_stats has no uncovered lines.
    // Branch coverage absent (default 100). Should approve via empty-gap guard.
    writeCoverageXml('<coverage></coverage>');
    writeDiffCoverStub(1);  // exitCode=1, no uncovered lines arg -> empty src_stats
    r = runHook('git commit -m x', {
        COVERAGE_XML_PATH: COV_XML,
        DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
    });
    assert('approves when diff-cover exits non-zero with no uncovered lines',
        r.decision, 'approve');
    assertContains('marker tagged thresholds-met-empty-gap',
        readMarker() || '', 'thresholds-met-empty-gap');
    cleanDiffCoverStub();
    cleanCoverageXml();

    console.log('\n[INT] Non-Python / no coverage.xml: Gate 3c skipped:');
    cleanAll();
    stageDummyContent('def foo():\n    return 1\n');
    // No coverage.xml, no DIFF_COVER_CMD -> should fall through to Gate 4 (block).
    r = runHook('git commit -m x');
    assert('falls through to Gate 4 without coverage.xml', r.decision, 'block');

    // =====================================================================
    // Suite 4: BLOCK marker repeat (marker-block-repeat)
    // =====================================================================
    console.log('\n[INT] BLOCK marker repeat within 30s:');

    // Case 1: BLOCK marker written within 30s with matching hash -> re-emit block.
    cleanAll();
    stageDummyContent('def phase4():\n    return 42\n');
    const p4DiffHash = stagedDiffHash();
    // Write a fresh BLOCK marker (mtime = now, well within 30s TTL).
    writeMarker('BLOCK\n' + p4DiffHash + '\ngate-default-block: Code review required before commit');
    r = runHook('git commit -m x');
    assert('block marker repeats within 30s on hash match (decision)', r.decision, 'block');
    assert('block marker re-emit gives the short reason', (r.reason || '') === 'Same diff blocked < 30s ago', true);

    // Case 2: BLOCK marker present but staged-diff hash differs -> fall through to fresh review.
    cleanLock();
    writeMarker('BLOCK\ndeadbeef1234567890abcdef\ngate-default-block: some old block');
    r = runHook('git commit -m x');
    // The hash doesn't match so the repeat does not fire; hook falls to the default block.
    assert('block marker is ignored when its hash differs (decision)', r.decision, 'block');
    // The reason should NOT be the 30s re-emit reason — it should be the fresh default reason.
    assertFalse('stale block marker does not repeat its reason', (r.reason || '') === 'Same diff blocked < 30s ago');
} finally {
    unstageDummy();
    unstageFeatureDummy();
    unstageLargeFixture();
    cleanGitShim();
    cleanNonRepoDir();
    cleanAll();
    cleanCoverageXml();
    cleanDiffCoverStub();
    cleanPolicy();
    // Restore any files that were staged before the test started.
    restageFiles(PRE_STAGED);
}

console.log(`\n============================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
