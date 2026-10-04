// Tests for pre-commit-review.js PreToolUse hook.
// Two suites:
//   1. Unit tests for the exported classifier (classifyDiff, isLineTrivial).
//   2. Integration tests via spawnSync (original suite plus new-gate cases).
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const { spawnSync, execSync, execFileSync } = require('child_process');
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

// Gate isolation. The integration cases stage a lone dummy .py with no test
// beside it, so under the TDD mandate (on by default) its no_tests block fires
// first and the coverage gate, the review-required block and its message
// never run. Every case that targets a
// gate other than the TDD gate therefore runs with the mandate exempting this
// repository, through a scratch config (the same pattern the subdir empty-read
// case uses). Cases that target the TDD gate pass `realMandate: true` and run
// under the mandate as installed; an explicit TDD_MANDATE_CONFIG in extraEnv
// also wins.
const TDD_EXEMPT_CFG = path.resolve(TMP_DIR, 'pre-commit-hook-test-tdd-exempt.json');
function writeTddExemptCfg() {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(TDD_EXEMPT_CFG, JSON.stringify({ exempt_repos: [REPO_ROOT] }), 'utf-8');
}
function cleanTddExemptCfg() { try { fs.unlinkSync(TDD_EXEMPT_CFG); } catch (e) {} }

function runHook(command, extraEnv = {}, opts = {}) {
    const isolation = opts.realMandate ? {} : { TDD_MANDATE_CONFIG: TDD_EXEMPT_CFG };
    const result = spawnSync('node', [HOOK_PATH], {
        input: JSON.stringify({ tool_input: { command }, ...(opts.input || {}) }),
        encoding: 'utf-8',
        cwd: opts.cwd || REPO_ROOT,
        env: { ...process.env, ...isolation, ...extraEnv },
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

// A NEW file is never trivial (round 2, item 3), and nothing under tmp/ is
// tracked, so a case that needs a fast-path-eligible change appends `extra` to a
// tracked code file, straight into the index (the working tree is never touched),
// keeping its HEAD mode. unstageTracked() puts the index entry back.
const TRACKED_REL = 'tools/analyze-review-timing.py';
function stageTrackedAppend(extra) {
    const mode = execFileSync('git', ['ls-tree', 'HEAD', '--', TRACKED_REL],
        { cwd: REPO_ROOT, encoding: 'utf-8' }).split(' ')[0];
    const head = execFileSync('git', ['show', 'HEAD:' + TRACKED_REL], { cwd: REPO_ROOT, encoding: 'utf-8' });
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'],
        { cwd: REPO_ROOT, encoding: 'utf-8', input: head + extra }).trim();
    execFileSync('git', ['update-index', '--cacheinfo', mode + ',' + blob + ',' + TRACKED_REL], { cwd: REPO_ROOT });
}
function unstageTracked() {
    try { execFileSync('git', ['reset', '-q', 'HEAD', '--', TRACKED_REL], { cwd: REPO_ROOT }); } catch (e) {}
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
function writeGitEmptyShim(emptyArg = '-U1') {
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
    return execSync(require(path.join(__dirname, 'lib', 'git-read.js')).HASH_PIPELINE, {
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
// and break assertions, so they are unstaged here, and the index is put back
// at the end.
//
// Put back byte for byte, from a copy of the index file taken before anything
// touches it. Re-adding the staged paths staged their working-tree content,
// so an unstaged edit to a staged file ended up staged.
//
// The copy is a file, not a buffer, because a kill cannot be caught: this
// suite is synchronous throughout, so Node never dispatches a signal handler,
// and registering one only stops the default kill. On a normal exit or a
// crash the `exit` event renames the copy back over the index. After a kill
// the copy stays, and the next run refuses to start until the user restores
// it or deletes it -- restoring it unasked could overwrite staging done since.
// Work staged from another terminal while the suite runs is lost either way.
const INDEX_PATH = path.resolve(REPO_ROOT, execSync('git rev-parse --git-path index', {
    encoding: 'utf-8', cwd: REPO_ROOT,
}).trim());
const INDEX_COPY = INDEX_PATH + '.pre-commit-review-test';
// Single quotes: a path holding `$` or a backtick must not expand when pasted.
const shQuote = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
const RESTORE_CMD = 'mv ' + shQuote(INDEX_COPY) + ' ' + shQuote(INDEX_PATH);
if (fs.existsSync(INDEX_COPY)) {
    console.log('An earlier run of this suite was interrupted and left your index at\n  ' + INDEX_COPY +
        '\nRestore it with `' + RESTORE_CMD + '`, or delete it if you have staged since, then rerun.');
    process.exit(2);
}
// What the caller had staged and unstaged, checked again after the restore:
// a regression here must fail the suite, not just pass while corrupting.
const diffFingerprint = () => ['--cached', null].map(flag => sha1(execSync(
    'git diff --binary --no-ext-diff' + (flag ? ' ' + flag : ''),
    { cwd: REPO_ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }))).join(' ');
const CALLER_DIFFS = diffFingerprint();
const HAD_INDEX = fs.existsSync(INDEX_PATH);
if (HAD_INDEX) {
    // Copy, then rename: a kill mid-copy must not leave a truncated copy that
    // the next run would tell the user to restore over a good index.
    fs.copyFileSync(INDEX_PATH, INDEX_COPY + '.tmp');
    fs.renameSync(INDEX_COPY + '.tmp', INDEX_COPY);
}
let indexRestored = false;
function restoreIndex() {
    if (indexRestored) return;
    // Rename, not a write in place: a restore cut short leaves the copy whole.
    if (HAD_INDEX) fs.renameSync(INDEX_COPY, INDEX_PATH);
    else try { fs.unlinkSync(INDEX_PATH); } catch (e) { /* none was made */ }
    indexRestored = true;
}
// The crash path. A throw here would be swallowed behind the original error,
// so say what failed and how to recover, and keep the exit non-zero.
process.on('exit', () => {
    try { restoreIndex(); } catch (e) {
        console.error('Could not restore your index (' + e.message + '). Run: ' + RESTORE_CMD);
        process.exitCode = 1;
    }
});

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

console.log('\n[UNIT] Classifier: isLineTrivial');
const mod = require(HOOK_PATH);
const { classifyDiff, readBranchCoverage,
    pollForFreshCoverage, hygieneHasCovCheck, isCovCheck, extractUncovered } = mod;

// The classifier is inverted: a line is trivial only when it is blank, wholly a
// comment for its file's language, or wholly one block comment. Everything else
// counts, so a line the classifier does not understand is never waved through.
// `missing` keeps the table readable (and red, not crashed) before the export exists.
function trivial(line, ext) {
    return typeof mod.isLineTrivial === 'function' ? mod.isLineTrivial(line, ext) : 'missing';
}
{
    const ALL = ['.py', '.rb', '.php', '.js', '.ts', '.tsx', '.jsx', '.java', '.c', '.cpp',
        '.h', '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.scala', '.sql', '.sh', '.ps1', ''];
    const C_STYLE = ['.js', '.ts', '.tsx', '.jsx', '.java', '.c', '.cpp', '.h', '.hpp', '.cs',
        '.go', '.rs', '.swift', '.kt', '.scala', '.php'];
    const HASH = ['.py', '.rb', '.php'];
    const BLOCK = [...C_STYLE, '.sql'];
    const SQL = ['.sql'];
    const not = (langs) => ALL.filter(e => !langs.includes(e));
    // [line, exts where it is trivial]. Every other extension in ALL must score it
    // non-trivial: a marker not listed for a language is never a comment in it.
    const TABLE = [
        // The verified-facts lines (plan section 1): the old classifier scored
        // every one of these as trivial.
        ['assert user.is_admin', []],
        ['is_admin = True', []],
        ['ALLOWED = ["*"]', []],
        ['os.system(', []],
        ['@admin_required', []],
        ['counter++;', []],
        ['throw err;', []],
        ['del x', []],
        // Round-1 F4: a preprocessor directive, a pointer write, a leading comment.
        ['#define X 1', ['.py', '.rb', '.php']],
        ['*flag = 1;', []],
        ['/* note */ run();', []],
        // A block-comment continuation cannot be told from a dereference in a hunk.
        [' * x', []],
        ['*/', []],
        ['/*', []],
        // Literals are code: they are what the old literal-RHS rule waved through.
        ['x = "foo"', []],
        ['count = 42', []],
        ['"""A docstring."""', []],
        ["'// not a comment'", []],
        ['x = "# not a comment"', []],
        // Trivial forms, each only for its own languages.
        ['', ALL],
        ['    ', ALL],
        ['\t', ALL],
        ['# x', HASH],
        ['    # indented', HASH],
        ['// x', C_STYLE],
        ['    // indented', C_STYLE],
        ['/* x */', BLOCK],
        ['  /** doc */  ', BLOCK],
        ['-- x', SQL],
        // `--` is a decrement outside SQL, and no language here comments with `;`.
        ['--x', []],
        ['; x', []],
        // Comments that change what runs.
        ['// note \\', []],                         // C splices the next line into the comment
        ['# note \\', []],
        ['// \\u000a run();', []],                  // Java decodes \u000a before lexing
        ['// x ??/', []],                           // trigraph backslash
        ['/* a /* b */', []],                       // opens two levels in Rust/Swift/Kotlin/Scala
        ['// closes */ early', []],
        ['#[Route("/admin")]', []],                 // PHP 8 attribute, not a comment
        ['// x ?> <?php run(); ?>', []],            // PHP leaves code mode at ?>
        ['#!/usr/bin/env python', []],
        ['# -*- coding: latin-1 -*-', []],          // PEP 263 source encoding
        ['# frozen_string_literal: true', []],      // Ruby magic comment
        ['//go:build linux', []],
        ['//go:linkname f runtime.f', []],
        ['// +build linux', []],
        ['//export Add', []],                       // cgo export
        // cgo preamble C in Go; elsewhere `// #123` is an issue reference.
        ['// #include <stdlib.h>', C_STYLE.filter(e => e !== '.go')],
        ['/// <reference path="x.d.ts" />', []],    // TypeScript triple-slash directive
        ['/*!50000 DROP TABLE users */', []],       // MySQL executable comment
        ['/*+ INDEX(t) */', []],                    // optimizer hint
        // Review C1: a line terminator the language honours but git does not split
        // on ends the comment, and the code after it runs. Proven end to end: the
        // hook approved `// x\rrequire("child_process").execSync("id")` in app.js.
        ['# x\rimport os; os.system("id")', []],
        ["// x require('child_process').execSync('id')", []],
        ['// x\rRuntime.getRuntime().exec("id");', []],
        ['// x\rsystem("id");', []],
        ['// x\u0085System.Environment.Exit(1);', []],
        ['// x run();', []],
        ['# x import os', []],
        ['// x\r\r', []],                           // only ONE trailing CR is a CRLF ending
        // Review A1: only space and tab are trimmed; NBSP and a BOM are not blanks.
        [' # x', []],
        ['﻿// x', []],
        [' ', []],
    ];
    // Directives are checked in every language, not only the one they bind in:
    // a directive-shaped comment elsewhere costs a review, the fail-closed side.
    for (const [line, trivialIn] of TABLE) {
        const expectTrivial = new Set(trivialIn);
        const wrong = ALL.filter(ext => trivial(line, ext) !== expectTrivial.has(ext));
        assert('isLineTrivial ' + JSON.stringify(line) + ' is trivial exactly in [' +
            trivialIn.join(' ') + ']', wrong.join(' '), '');
    }
    assert('extension case does not matter', trivial('// x', '.JS'), true);
    assert('an unknown extension knows only blank lines', trivial('// x', '.zz'), false);
    assert('an unknown extension still reads blank as trivial', trivial('   ', '.zz'), true);
    assert('a CRLF line ending does not change the verdict', trivial('// x\r', '.js'), true);
    assert('a CRLF line ending on code stays non-trivial', trivial('run();\r', '.js'), false);
    // The per-line Python spawn is gone with the literal-RHS rule.
    assert('resolvePythonCmd is no longer exported', typeof mod.resolvePythonCmd, 'undefined');
    assert('isPureLiteralRHS is no longer exported', typeof mod.isPureLiteralRHS, 'undefined');
    assert('isLineSemantic is no longer exported', typeof mod.isLineSemantic, 'undefined');
}

console.log('\n[UNIT] Classifier: classifyDiff');

const trivialDiff = [
    'diff --git a/foo.py b/foo.py',
    'index abc..def 100644',
    '--- a/foo.py',
    '+++ b/foo.py',
    '@@ -0,0 +1,2 @@',
    '+# a new comment',
    '+',
].join('\n');
const tc1 = classifyDiff(trivialDiff);
assert('trivial diff: semanticAdded == 0', tc1.semanticAdded, 0);
assert('trivial diff: semanticRemoved == 0', tc1.semanticRemoved, 0);

// Review C2/I3: a file section git shows with no hunk (binary, mode-only, or any
// shape the classifier cannot see into) is unknown content, so it counts on both
// sides: neither the trivial-diff nor the presentational path may take it.
const binaryDiff = [
    'diff --git a/app.js b/app.js',
    'new file mode 100644',
    'index 0000000..1234567',
    'Binary files /dev/null and b/app.js differ',
].join('\n');
const tb = classifyDiff(binaryDiff);
assert('a Binary files section counts as added', tb.semanticAdded, 1);
assert('a Binary files section counts as removed', tb.semanticRemoved, 1);
const modeOnlyDiff = [
    'diff --git a/app.js b/app.js',
    'old mode 100644',
    'new mode 100755',
].join('\n');
const tm = classifyDiff(modeOnlyDiff);
assert('a mode-only section counts as added', tm.semanticAdded, 1);
assert('a mode-only section counts as removed', tm.semanticRemoved, 1);
// A hunk-less section followed by a trivial one, and the other way round: each
// section is judged on its own.
assert('a hunk-less section before a trivial one still counts',
    classifyDiff(modeOnlyDiff + '\n' + trivialDiff).semanticAdded, 1);
assert('a hunk-less section after a trivial one still counts',
    classifyDiff(trivialDiff + '\n' + modeOnlyDiff).semanticAdded, 1);
assert('a Binary files line after a hunk still counts',
    classifyDiff(trivialDiff + '\nBinary files a/foo.py and b/foo.py differ').semanticAdded, 1);
assert('an empty diff is still trivial', classifyDiff('').semanticAdded, 0);

// `semanticAdded` / `semanticRemoved` now count NON-TRIVIAL lines, so a literal
// assignment counts.
const literalDiff = [
    'diff --git a/foo.py b/foo.py',
    '--- a/foo.py',
    '+++ b/foo.py',
    '@@ -0,0 +1 @@',
    '+x = "hello"',
].join('\n');
assert('a literal assignment counts as non-trivial', classifyDiff(literalDiff).semanticAdded, 1);

// The source-files.js incident shape: deleting two list entries changes what the
// gates call code, and the old classifier saw no keyword, call or assignment.
const listEntryDiff = [
    'diff --git a/src/hooks/lib/source-files.js b/src/hooks/lib/source-files.js',
    '--- a/src/hooks/lib/source-files.js',
    '+++ b/src/hooks/lib/source-files.js',
    '@@ -26 +25,0 @@',
    "-    '.sh', '.ps1',",
].join('\n');
assert('deleting a list entry counts as a removed non-trivial line',
    classifyDiff(listEntryDiff).semanticRemoved, 1);

// The language comes from each file's own header: `#` is a comment in a.py and a
// directive in b.c, in the same diff.
const twoLangDiff = [
    'diff --git a/a.py b/a.py',
    '--- a/a.py',
    '+++ b/a.py',
    '@@ -0,0 +1 @@',
    '+# note',
    'diff --git a/b.c b/b.c',
    '--- a/b.c',
    '+++ b/b.c',
    '@@ -0,0 +1 @@',
    '+#define X 1',
].join('\n');
const tl = classifyDiff(twoLangDiff);
assert('per-file language: only the .c directive counts', tl.semanticAdded, 1);
assert('per-file language: attributed to b.c', JSON.stringify(tl.perFileAdded), '{"b.c":1}');

// A deleted file's `+++` is /dev/null: the path comes from `--- a/`. Deleting a
// whole file is never trivial (round 2, item 3), so its one opaque count lands on
// gone.py.
const deletedDiff = [
    'diff --git a/gone.py b/gone.py',
    'deleted file mode 100644',
    '--- a/gone.py',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-# only a comment',
].join('\n');
const td = classifyDiff(deletedDiff);
assert('a deleted comment-only file counts as removed', td.semanticRemoved, 1);
assert('...attributed to its `--- a/` path', JSON.stringify(td.perFileRemoved), '{"gone.py":1}');

// Inside a hunk a removed `-- x` is `--- x` and an added `++ x` is `+++ x`: they
// are content lines, not file headers.
const headerLookalikeDiff = [
    'diff --git a/q.js b/q.js',
    '--- a/q.js',
    '+++ b/q.js',
    '@@ -1 +1 @@',
    '--- x;',
    '+++ y;',
].join('\n');
const hl = classifyDiff(headerLookalikeDiff);
assert('a removed `-- x;` in JS is a content line, counted', hl.semanticRemoved, 1);
assert('an added `++ y;` in JS is a content line, counted', hl.semanticAdded, 1);

// Line continuation: with a line of context (-U1), a line that follows one ending
// in a backslash is part of that line, so it is never trivial on its own. In C a
// comment or blank line inside a macro body ends or rewrites the macro.
const continuationDiff = [
    'diff --git a/m.c b/m.c',
    '--- a/m.c',
    '+++ b/m.c',
    '@@ -1,2 +1,3 @@',
    ' #define CHECK(x) \\',
    '+// note',
    '     abort();',
].join('\n');
assert('a comment after a continued line counts', classifyDiff(continuationDiff).semanticAdded, 1);
const continuationBlankRemoved = [
    'diff --git a/m.c b/m.c',
    '--- a/m.c',
    '+++ b/m.c',
    '@@ -1,3 +1,2 @@',
    ' #define CHECK(x) \\',
    '-',
    ' abort();',
].join('\n');
assert('removing a blank line after a continued line counts',
    classifyDiff(continuationBlankRemoved).semanticRemoved, 1);
const contextOnlyComment = [
    'diff --git a/m.c b/m.c',
    '--- a/m.c',
    '+++ b/m.c',
    '@@ -1,2 +1,3 @@',
    ' int x;',
    '+// note',
    ' int y;',
].join('\n');
assert('a comment after an ordinary context line stays trivial',
    classifyDiff(contextOnlyComment).semanticAdded, 0);
assert('a "no newline" marker is not a content line',
    classifyDiff(trivialDiff + '\n\\ No newline at end of file').semanticAdded, 0);
// An unquotable path (git quotes it) yields no known extension: blank lines only.
const quotedDiff = [
    'diff --git "a/sp\\303\\251c.py" "b/sp\\303\\251c.py"',
    '--- "a/sp\\303\\251c.py"',
    '+++ "b/sp\\303\\251c.py"',
    '@@ -0,0 +1,2 @@',
    '+# note',
    '+',
].join('\n');
assert('a quoted path falls back to blank-only: the comment counts',
    classifyDiff(quotedDiff).semanticAdded, 1);

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

// Round 2, item 1: colour codes. A diff read with colour forced on has no line
// starting `diff --git`, so the classifier would never enter a section. Any ESC
// byte, or a non-empty read with no section header, fails closed.
const ESC = '\x1b';
const ansiDiff = [
    ESC + '[1mdiff --git a/app.js b/app.js' + ESC + '[m',
    ESC + '[1m--- a/app.js' + ESC + '[m',
    ESC + '[1m+++ b/app.js' + ESC + '[m',
    ESC + '[36m@@ -1 +1,2 @@' + ESC + '[m',
    ' let a = 1;',
    ESC + '[32m+require("child_process").execSync("id");' + ESC + '[m',
].join('\n');
const ta = classifyDiff(ansiDiff);
assertTrue('an ANSI-coloured diff counts a non-trivial added line', ta.semanticAdded >= 1);
assertTrue('...and a removed one', ta.semanticRemoved >= 1);
assertTrue('an ESC byte inside an otherwise trivial diff counts',
    classifyDiff(trivialDiff.replace('# a new comment', '# a ' + ESC + '[m comment')).semanticAdded >= 1);
assertTrue('a non-empty read with no `diff --git` line counts',
    classifyDiff('--- a/app.js\n+++ b/app.js\n@@ -0,0 +1 @@\n+// x\n').semanticAdded >= 1);

// Round 2, item 2: a symlink's hunk is its target and a gitlink's is a commit id,
// so neither reads as source: a symlink to `//tmp/evil.js` is not a `//` comment.
// Any header naming mode 120000 or 160000 makes the section opaque, whatever its
// hunk shows.
const linkSection = (headers, minus, plus) => [
    'diff --git a/src/plugin.js b/src/plugin.js', ...headers,
    '--- a/src/plugin.js', '+++ b/src/plugin.js', '@@ -1 +1 @@',
    '-' + minus, '\\ No newline at end of file',
    '+' + plus, '\\ No newline at end of file',
].join('\n');
for (const [label, headers] of [
    ['index line 120000 (symlink retarget)', ['index 1111111..2222222 120000']],
    ['index line 160000 (gitlink update)', ['index 1111111..2222222 160000']],
    ['old/new mode into 120000', ['old mode 100644', 'new mode 120000', 'index 1111111..2222222']],
    ['old/new mode out of 160000', ['old mode 160000', 'new mode 100644', 'index 1111111..2222222']],
]) {
    const t = classifyDiff(linkSection(headers, '//opt/good/plugin.js', '//tmp/evil.js'));
    assert('a section with ' + label + ' counts as added', t.semanticAdded, 1);
    assert('a section with ' + label + ' counts as removed', t.semanticRemoved, 1);
}
const newLink = [
    'diff --git a/src/plugin.js b/src/plugin.js', 'new file mode 120000', 'index 0000000..2222222',
    '--- /dev/null', '+++ b/src/plugin.js', '@@ -0,0 +1 @@', '+//tmp/evil.js',
    '\\ No newline at end of file',
].join('\n');
assert('a new symlink counts as added', classifyDiff(newLink).semanticAdded, 1);
const newGitlink = [
    'diff --git a/vendor/lib.js b/vendor/lib.js', 'new file mode 160000', 'index 0000000..2222222',
    '--- /dev/null', '+++ b/vendor/lib.js', '@@ -0,0 +1 @@', '+// x',
].join('\n');
const tg = classifyDiff(newGitlink);
assert('a new gitlink counts as added', tg.semanticAdded, 1);
assert('a new gitlink counts as removed', tg.semanticRemoved, 1);
// The mode must be the whole field: 100644 is not a link.
assert('an ordinary index line leaves a comment trivial',
    classifyDiff(linkSection(['index 1111111..2222222 100644'], '// a', '// b')).semanticAdded, 0);

// Round 2, item 3: adding or deleting a whole file is never trivial. A new
// comment-only auth.js shadows auth/index.js; deleting a required file breaks it.
const newCommentFile = [
    'diff --git a/auth.js b/auth.js', 'new file mode 100644', 'index 0000000..2222222',
    '--- /dev/null', '+++ b/auth.js', '@@ -0,0 +1 @@', '+// placeholder',
].join('\n');
const tn = classifyDiff(newCommentFile);
assert('a new comment-only file counts as added', tn.semanticAdded, 1);
assert('a new comment-only file counts as removed', tn.semanticRemoved, 1);
assert('...attributed to its path', JSON.stringify(tn.perFileAdded), '{"auth.js":1}');
const newEmptyFile = ['diff --git a/a.js b/a.js', 'new file mode 100644', 'index 0000000..e69de29'].join('\n');
assert('a new empty file counts once, not twice', classifyDiff(newEmptyFile).semanticAdded, 1);

// Round 2, item 5: removing a whole-line block comment can change what an
// enclosing comment covers. Here `/* note */` ends the `/* legacy` comment; without
// it, `require_auth();` is commented out.
const blockStateDiff = [
    'diff --git a/a.js b/a.js', '--- a/a.js', '+++ b/a.js', '@@ -1,4 +1,3 @@',
    ' /* legacy',
    '-/* note */',
    ' require_auth();',
    ' /* end */',
].join('\n');
assertTrue('removing a whole-line block comment counts as removed',
    classifyDiff(blockStateDiff).semanticRemoved >= 1);
const blockAdded = [
    'diff --git a/a.js b/a.js', '--- a/a.js', '+++ b/a.js', '@@ -1,2 +1,3 @@',
    ' let a = 1;', '+/* note */', ' let b = 2;',
].join('\n');
assert('adding a whole-line block comment stays trivial', classifyDiff(blockAdded).semanticAdded, 0);
const lineCommentRemoved = [
    'diff --git a/a.js b/a.js', '--- a/a.js', '+++ b/a.js', '@@ -1,3 +1,2 @@',
    ' let a = 1;', '-// note', ' let b = 2;',
].join('\n');
assert('removing a line comment stays trivial', classifyDiff(lineCommentRemoved).semanticRemoved, 0);

// Round 3: `diff.submodule=log` or `diff` prints a gitlink bump as bare
// `Submodule ...` lines (and `  > msg` lines for `diff`), with no `diff --git`
// header and no hunk. Structure the classifier does not recognise is opaque:
// outside a section any non-empty line, inside a hunk any line not starting
// with ' ', '+', '-' or '\\' (or empty), and in a header window any line that is
// not a git extended header.
const SUBMODULE_SHORT = 'Submodule lib.js 38d3c01...95b1963 (commits not present)';
const commentSection = [
    'diff --git a/src/app.js b/src/app.js', 'index 1111111..2222222 100644',
    '--- a/src/app.js', '+++ b/src/app.js', '@@ -1 +1,2 @@', ' const x = 1;', '+// ok',
].join('\n');
assert('the comment-only section alone is trivial', classifyDiff(commentSection).semanticAdded, 0);
{
    const before = classifyDiff(SUBMODULE_SHORT + '\n' + commentSection);
    assertTrue('a Submodule line before a comment-only section counts as added', before.semanticAdded >= 1);
    assertTrue('...and as removed', before.semanticRemoved >= 1);
    const inside = classifyDiff(commentSection + '\n' + SUBMODULE_SHORT + '\n');
    assertTrue('a Submodule line inside a hunk counts as added', inside.semanticAdded >= 1);
    assertTrue('...and as removed', inside.semanticRemoved >= 1);
    const logLines = classifyDiff(commentSection + '\n  > bump the vendored lib\n');
    assertTrue('a `  > msg` line inside a hunk counts as added', logLines.semanticAdded >= 1);
    assertTrue('...and as removed', logLines.semanticRemoved >= 1);
    const window = classifyDiff(commentSection.replace('index 1111111..2222222 100644',
        'index 1111111..2222222 100644\n' + SUBMODULE_SHORT));
    assertTrue('an unknown line in a header window counts as added', window.semanticAdded >= 1);
    assertTrue('...and as removed', window.semanticRemoved >= 1);
    // diff.suppressBlankEmpty prints an empty context line as '' rather than ' '.
    assert('an empty line inside a hunk stays trivial',
        classifyDiff(commentSection.replace('@@ -1 +1,2 @@\n const x = 1;',
            '@@ -1,2 +1,3 @@\n const x = 1;\n')).semanticAdded, 0);
    // The hunk header's counts bound the hunk: a missing or an extra line is a
    // format this function does not know.
    assertTrue('a hunk with an extra context line counts',
        classifyDiff(commentSection + '\n const y = 2;').semanticAdded >= 1);
    assertTrue('a hunk cut short counts',
        classifyDiff(commentSection.replace('@@ -1 +1,2 @@', '@@ -1,2 +1,3 @@')).semanticAdded >= 1);
    assertTrue('an unparseable hunk header counts',
        classifyDiff(commentSection.replace('@@ -1 +1,2 @@', '@@ junk @@')).semanticAdded >= 1);
}
// Every extended header git emits between `diff --git` and the first `@@`, taken
// from real `git diff --cached -C -C -B --binary` output: none of them may trip
// the structural check. The binary-patch section is opaque on its own (1 and 1);
// everything else is trivial, so the totals and per-file maps are exactly what the
// classifier gave before the check existed.
const everyHeaderDiff = [
    'diff --git a/b.bin b/b.bin',
    'index 677273046bce3115f56c248238f3b83f77cfc239..2644ae276b0d4cc2a5d84751622ca22642c2120d 100644',
    'GIT binary patch',
    'literal 7',
    'OcmZQzWlPG;GXekv6ajYt',
    '',
    'literal 6',
    'NcmZQzWJ=1+0{{Yf0X+Z!',
    '',
    'diff --git a/a.js b/copied.js',
    'similarity index 88%',
    'copy from a.js',
    'copy to copied.js',
    'index b1a5077..9daf094 100644',
    '--- a/a.js',
    '+++ b/copied.js',
    '@@ -6 +6,2 @@ line5',
    ' // end',
    '+// c',
    'diff --git a/m.js b/m.js',
    'old mode 100644',
    'new mode 100755',
    'index 587be6b..226dc81',
    '--- a/m.js',
    '+++ b/m.js',
    '@@ -1 +1,2 @@',
    ' x',
    '+// m',
    'diff --git a/a.js b/renamed.js',
    'similarity index 82%',
    'rename from a.js',
    'rename to renamed.js',
    'index b1a5077..16b58be 100644',
    '--- a/a.js',
    '+++ b/renamed.js',
    '@@ -6 +6,2 @@ line5',
    ' // end',
    '+// more',
    'diff --git a/big.js b/big.js',
    'dissimilarity index 72%',
    'index e8823e1..26e04c7 100644',
    '--- a/big.js',
    '+++ b/big.js',
    '@@ -1,2 +1,2 @@',
    '-// one',
    '+// two',
    ' // three',
    'diff --git "a/sp ace.js" "b/sp ace.js"',
    'index 1111111..2222222 100644',
    '--- "a/sp ace.js"',
    '+++ "b/sp ace.js"',
    '@@ -1 +1,2 @@',
    ' x',
    '+',
    '\\ No newline at end of file',
    '',
].join('\n');
assert('every legitimate header type: classification unchanged',
    JSON.stringify(classifyDiff(everyHeaderDiff)),
    JSON.stringify({ semanticAdded: 1, semanticRemoved: 1, perFileAdded: {}, perFileRemoved: {} }));

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

console.log('\n[UNIT] briefPathList');
assert('short list: every path, no ellipsis', mod.briefPathList(['a.py', 'b.py'], 3), 'a.py, b.py');
assert('exactly max: no ellipsis', mod.briefPathList(['a', 'b', 'c'], 3), 'a, b, c');
assert('over max: the first max, then an ellipsis', mod.briefPathList(['a', 'b', 'c', 'd'], 3), 'a, b, c, ...');
assert('paths are sanitized', mod.briefPathList(['a;rm -rf.py'], 3), 'a_rm -rf.py');

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
writeTddExemptCfg();
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
    // so a block here can only come from Gate 0. A comment appended to a tracked
    // file, since a new file is never trivial (round 2, item 3).
    stageTrackedAppend('# comment only\n');
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
    unstageTracked();
    cleanAll();

    // Use semantic content so classifier does not fast-path; we exercise Gate 4.
    stageDummyContent('def foo():\n    return 1\n');

    cleanAll();
    let r = runHook('git commit -m x');
    assert('blocks when no marker present', r.decision, 'block');
    assertContains('block message tells user to run review', r.systemMessage || '', '/sdlc:code-review-pre-commit');
    // The timing-log path comes from the hook's own location, so it is right
    // wherever the toolchain is installed (plugin cache, source checkout).
    assertContains('block message carries the timing-log command at the hook\'s own path',
        r.systemMessage || '', 'node "' + path.join(__dirname, 'timing-log.js') + '" review.completed');
    assertFalse('block message does not assume ~/.claude/hooks',
        /(\$HOME|~)\/\.claude\/hooks/.test(r.systemMessage || ''));

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
    assertTrue('a lock with no note adds nothing before the message',
        (r.systemMessage || '').startsWith('PRE_COMMIT_REVIEW: A review was requested'));
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
    // The dummy is a new file: its two lines plus one opaque count on each side
    // for the whole-file add (round 2, item 3).
    assertContains('message reports non-trivial line counts', r.systemMessage || '', '(3 non-trivial lines added, 1 removed)');
    // Executing the recipe verbatim must produce a marker the hook accepts.
    {
        const m = (r.systemMessage || '').match(/run exactly: (printf .*?) \(replace/);
        assertTrue('recipe is extractable from the message', !!m);
        // The policy names agents namespaced; the marker tag is a label and
        // stays bare, and TAG_NOTE says so outright.
        assertContains('recipe tag is the bare agent name', (m && m[1]) || '',
            " 'code-reviewer:round1:PASS' > ");
        assertFalse('recipe carries no namespaced name', /sdlc:/.test((m && m[1]) || 'sdlc:'));
        assertContains('TAG_NOTE says "bare agent name"', r.systemMessage || '', 'bare agent name');
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

    // whitespace-only additions to a tracked file
    stageTrackedAppend('\n\n\n');
    r = runHook('git commit -m x');
    assert('fast-path approves whitespace-only staged content', r.decision, 'approve');
    assertContains('marker tagged trivial-diff', readMarker() || '', 'trivial-diff');

    cleanAll();
    // comment-only addition to a tracked file
    stageTrackedAppend('# just a note\n# another line\n');
    r = runHook('git commit -m x');
    assert('fast-path approves comment-only staged content', r.decision, 'approve');
    unstageTracked();

    // Round 2, item 3: a NEW file is never trivial, whatever it holds. A new
    // comment-only module can shadow another one on the import path.
    cleanAll();
    stageDummyContent('\n\n\n');
    r = runHook('git commit -m x');
    assert('a new whitespace-only file is not fast-pathed', r.decision, 'block');
    assertFalse('...with no trivial-diff tag', (readMarker() || '').includes('trivial-diff'));
    cleanAll();
    stageDummyContent('# just a note\n# another line\n');
    r = runHook('git commit -m x');
    assert('a new comment-only file is not fast-pathed', r.decision, 'block');
    assertFalse('...with no PASS marker', (readMarker() || '').startsWith('PASS'));

    cleanAll();
    // pure literal assignment: a value change is a behaviour change
    stageDummyContent('x = "foo"\ny = 42\n');
    r = runHook('git commit -m x');
    assert('does NOT fast-path literal assignments', r.decision, 'block');
    assertFalse('literal assignments write no PASS marker', (readMarker() || '').startsWith('PASS'));

    cleanAll();
    // A docstring is code to the classifier: it is not a comment in any language.
    stageDummyContent('"""Module docstring."""\n');
    r = runHook('git commit -m x');
    assert('does NOT fast-path a docstring', r.decision, 'block');

    // The TDD gate runs BEFORE every fast path. A comment-only change with no test,
    // in a repository under the mandate, is blocked by the TDD gate and never
    // approved as trivial-diff. TDD_MANDATE_CONFIG points at a file that does not
    // exist, so the installed config cannot exempt this repo: the mandate stands.
    const NO_MANDATE_CFG = path.resolve(TMP_DIR, 'pre-commit-hook-test-no-such-mandate.json');
    console.log('\n[INT] No fast path runs before the TDD gate:');
    cleanAll();
    unstageDummy();
    stageTrackedAppend('# just a note\n');
    r = runHook('git commit -m x', { TDD_MANDATE_CONFIG: NO_MANDATE_CFG },
        { realMandate: true, input: { transcript_path: '' } });
    assert('comment-only, no test, mandate on: blocked', r.decision, 'block');
    assertContains('...by the TDD gate', r.systemMessage || '', 'no_tests');
    assertFalse('...with no PASS marker', (readMarker() || '').startsWith('PASS'));
    assertFalse('...and no trivial-diff tag', (readMarker() || '').includes('trivial-diff'));
    unstageTracked();

    // A crash in the TDD check is no verdict, and no verdict is not a pass: the
    // same comment-only change must be blocked, naming the error, never approved
    // trivial-diff. The crash is simulated without touching lib/tdd-order.js: a
    // --require preload replaces classifyTddOrder on the module's shared exports
    // object, which is the object the hook's own require() returns.
    console.log('\n[INT] A crash in the TDD check blocks, and opens no fast path:');
    const TDD_CRASH_PRELOAD = path.resolve(TMP_DIR, 'pre-commit-hook-test-tdd-crash.js');
    fs.writeFileSync(TDD_CRASH_PRELOAD,
        'const m = require(' + JSON.stringify(path.join(__dirname, 'lib', 'tdd-order.js')) + ');\n' +
        'm.classifyTddOrder = () => { throw new Error("simulated tdd-order crash"); };\n', 'utf-8');
    cleanAll();
    unstageDummy();
    stageTrackedAppend('# just a note\n');
    r = runHook('git commit -m x',
        { TDD_MANDATE_CONFIG: NO_MANDATE_CFG, NODE_OPTIONS: '--require ' + JSON.stringify(TDD_CRASH_PRELOAD) },
        { realMandate: true, input: { transcript_path: '' } });
    assert('comment-only, TDD check crashes, mandate on: blocked', r.decision, 'block');
    assertContains('...naming the TDD check error', r.systemMessage || '', 'simulated tdd-order crash');
    assertFalse('...with no PASS marker', (readMarker() || '').startsWith('PASS'));
    assertFalse('...and no trivial-diff tag', (readMarker() || '').includes('trivial-diff'));
    // Like an unreadable index: no lock and no BLOCK marker, so the retry
    // re-runs the check rather than replaying a cached block.
    assertFalse('...writes no marker', fs.existsSync(MARKER));
    assertFalse('...writes no lock', fs.existsSync(LOCK));
    unstageTracked();
    try { fs.unlinkSync(TDD_CRASH_PRELOAD); } catch (e) {}
    cleanAll();

    console.log('\n[UNIT] evaluateTddOrderGate on a throwing classifier blocks:');
    {
        const tddOrderMod = require(path.join(__dirname, 'lib', 'tdd-order.js'));
        const realClassify = tddOrderMod.classifyTddOrder;
        const savedMandateCfg = process.env.TDD_MANDATE_CONFIG;
        process.env.TDD_MANDATE_CONFIG = NO_MANDATE_CFG;
        stageTrackedAppend('# just a note\n');
        tddOrderMod.classifyTddOrder = () => { throw new Error('simulated tdd-order crash'); };
        try {
            const gate = mod.evaluateTddOrderGate(REPO_ROOT, '');
            assert('throwing classifier: gate blocks', gate.action, 'block');
            assert('throwing classifier: status is classifier-error', gate.status, 'classifier-error');
            assertContains('throwing classifier: reason names the error', gate.reason || '', 'simulated tdd-order crash');
        } finally {
            tddOrderMod.classifyTddOrder = realClassify;
            if (savedMandateCfg === undefined) delete process.env.TDD_MANDATE_CONFIG;
            else process.env.TDD_MANDATE_CONFIG = savedMandateCfg;
            unstageTracked();
        }
        // A throw that carries no message still blocks, with a reason.
        tddOrderMod.classifyTddOrder = () => { throw undefined; };   // eslint-disable-line no-throw-literal
        process.env.TDD_MANDATE_CONFIG = NO_MANDATE_CFG;
        stageTrackedAppend('# just a note\n');
        try {
            const gate = mod.evaluateTddOrderGate(REPO_ROOT, '');
            assert('messageless throw: gate blocks', gate.action, 'block');
            assertContains('messageless throw: reason still set', gate.reason || '', 'classifier-error');
        } finally {
            tddOrderMod.classifyTddOrder = realClassify;
            if (savedMandateCfg === undefined) delete process.env.TDD_MANDATE_CONFIG;
            else process.env.TDD_MANDATE_CONFIG = savedMandateCfg;
            unstageTracked();
        }
    }

    console.log('\n[INT] Presentational path (Q1: opt-in, counts non-trivial lines):');
    const POLICY_KEY = REPO_ROOT.replace(/\\/g, '/');
    cleanAll();
    // Each eligible case edits a tracked file the policy lists: a new file is
    // never trivial (round 2, item 3) and counts one removed line, which the
    // presentational rule refuses.
    writePolicy({ repos: { [POLICY_KEY]: { presentational_paths: ['tmp/**', TRACKED_REL], trivial_line_threshold: 3 } } });
    unstageDummy();
    stageTrackedAppend('TITLE = "Report"\nshow(TITLE)\n');
    r = runHook('git commit -m x', { REVIEW_POLICY_CONFIG: POLICY_PATH });
    assert('2 non-trivial lines inside a configured path: approved', r.decision, 'approve');
    assertContains('...tagged presentational', readMarker() || '', 'presentational');

    cleanAll();
    stageTrackedAppend('a = 1\nb = 2\nc = 3\nd = 4\n');
    r = runHook('git commit -m x', { REVIEW_POLICY_CONFIG: POLICY_PATH });
    assert('4 non-trivial lines over a threshold of 3: blocked', r.decision, 'block');

    // Review I4: a removed non-trivial line never takes the presentational path,
    // even when the added count is within the threshold. Nothing under tmp/ is
    // tracked, so the removal is staged in a tracked file the policy also lists,
    // straight into the index (the working tree is never touched), and reset after.
    {
        cleanAll();
        unstageDummy();
        unstageTracked();
        const REMOVED_REL = 'src/hooks/lib/plugin-names.js';
        writePolicy({ repos: { [POLICY_KEY]: {
            presentational_paths: ['tmp/**', REMOVED_REL], trivial_line_threshold: 3 } } });
        const headBody = execFileSync('git', ['show', 'HEAD:' + REMOVED_REL], { cwd: REPO_ROOT, encoding: 'utf-8' });
        const target = headBody.split('\n').find(l => /^\s*(?:const|module\.exports|'use strict')/.test(l));
        assertTrue('the removal fixture has a non-trivial line to remove', !!target);
        const blob = execFileSync('git', ['hash-object', '-w', '--stdin'],
            { cwd: REPO_ROOT, encoding: 'utf-8', input: headBody.replace(target + '\n', '') }).trim();
        try {
            execFileSync('git', ['update-index', '--cacheinfo', '100644,' + blob + ',' + REMOVED_REL], { cwd: REPO_ROOT });
            r = runHook('git commit -m x', { REVIEW_POLICY_CONFIG: POLICY_PATH });
            assert('1 non-trivial line removed inside configured paths: blocked', r.decision, 'block');
            // Proves the classifier saw exactly the removal, so the block comes from
            // the presentational rule's removed-lines clause and nothing earlier.
            assertContains('...by the review gate, counting 0 added and 1 removed',
                r.systemMessage || '', '(0 non-trivial lines added, 1 removed)');
            assertFalse('...not tagged presentational', (readMarker() || '').includes('presentational'));
            assertFalse('...with no PASS marker', (readMarker() || '').startsWith('PASS'));
        } finally {
            try { execFileSync('git', ['reset', '-q', 'HEAD', '--', REMOVED_REL], { cwd: REPO_ROOT }); } catch (e) {}
        }
        writePolicy({ repos: { [POLICY_KEY]: { presentational_paths: ['tmp/**', TRACKED_REL], trivial_line_threshold: 3 } } });
    }

    cleanAll();
    stageTrackedAppend('TITLE = "Report"\n');
    r = runHook('git commit -m x', { TDD_MANDATE_CONFIG: NO_MANDATE_CFG, REVIEW_POLICY_CONFIG: POLICY_PATH },
        { realMandate: true, input: { transcript_path: '' } });
    assert('presentational-eligible, no test, mandate on: blocked', r.decision, 'block');
    assertContains('...by the TDD gate', r.systemMessage || '', 'no_tests');
    assertFalse('...not tagged presentational', (readMarker() || '').includes('presentational'));

    cleanAll();
    writePolicy({ repos: { [POLICY_KEY]: { presentational_paths: ['docs/**'], trivial_line_threshold: 3 } } });
    stageTrackedAppend('TITLE = "Report"\n');
    r = runHook('git commit -m x', { REVIEW_POLICY_CONFIG: POLICY_PATH });
    assert('a file outside the configured paths: blocked', r.decision, 'block');

    cleanAll();
    cleanPolicy();
    stageTrackedAppend('TITLE = "Report"\n');
    r = runHook('git commit -m x');
    assert('no presentational_paths configured: blocked (off by default)', r.decision, 'block');
    unstageTracked();

    // Round 2, item 3: a new file inside a configured path is not presentational,
    // even with non-trivial lines under the threshold.
    cleanAll();
    writePolicy({ repos: { [POLICY_KEY]: { presentational_paths: ['tmp/**'], trivial_line_threshold: 3 } } });
    stageDummyContent('TITLE = "Report"\nshow(TITLE)\n');
    r = runHook('git commit -m x', { REVIEW_POLICY_CONFIG: POLICY_PATH });
    assert('a new file inside a configured path: blocked', r.decision, 'block');
    assertFalse('...not tagged presentational', (readMarker() || '').includes('presentational'));
    cleanPolicy();

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

    console.log('\n[UNIT] readCoverageDrift fails closed:');
    // A failed read is not "nothing drifted": that would let thresholds-met
    // approve over files it never saw.
    assert('git error yields null files, not an empty list',
        mod.readCoverageDrift(NON_REPO_DIR).files, null);

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
    unstageDummy();
    stageTrackedAppend('# comment only\n');
    r = runHook('git commit -m x', {}, { cwd: path.join(REPO_ROOT, 'src') });
    assert('subdir comment-only change is approved', r.decision, 'approve');
    assertContains('subdir comment-only marker tagged trivial-diff', readMarker() || '', 'trivial-diff');
    unstageTracked();

    if (process.platform !== 'win32') {
        console.log('\n[INT] Gate 3b empty diff read fails closed from the root:');
        cleanAll();
        stageDummyContent('def foo():\n    return 1\n');
        const TDD_CFG3 = path.resolve(TMP_DIR, 'pre-commit-hook-test-tdd-mandate3.json');
        fs.writeFileSync(TDD_CFG3, JSON.stringify({ exempt_repos: [REPO_ROOT] }), 'utf-8');
        try {
            r = runHook('git commit -m x',
                { PATH: writeGitEmptyShim('-U1'), TDD_MANDATE_CONFIG: TDD_CFG3 });
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
    // Unusual filenames (step 9). Paths are staged straight into the index
    // (no working-tree file), so names Windows cannot create still work, and
    // removed with update-index, which reads paths literally.
    // =====================================================================
    const stageBlob = (rel, content) => {
        const blob = execFileSync('git', ['hash-object', '-w', '--stdin'],
            { cwd: REPO_ROOT, encoding: 'utf-8', input: content }).trim();
        execFileSync('git', ['update-index', '--add', '--cacheinfo', '100644,' + blob + ',' + rel], { cwd: REPO_ROOT });
    };
    const unstageBlob = rel => {
        try { execFileSync('git', ['update-index', '--force-remove', '--', rel], { cwd: REPO_ROOT, stdio: 'pipe' }); }
        catch (e) {}
    };

    console.log('\n[INT] A non-ASCII code filename is not approved as staged-no-code:');
    cleanAll();
    const accented = 'tmp/pcr-café.py';
    stageBlob(accented, 'def foo():\n    return 1\n');
    try {
        r = runHook('git commit -m x');
        assertTrue('staged café.py is not approved', r.decision !== 'approve');
        assertFalse('staged café.py writes no PASS marker', (readMarker() || '').startsWith('PASS'));
        cleanAll();
        r = runHook('git commit -m x', {}, { realMandate: true, input: { transcript_path: '' } });
        assertContains('staged café.py with no test: TDD gate blocks no_tests', r.systemMessage || '', 'no_tests');
    } finally {
        unstageBlob(accented);
        cleanAll();
    }

    console.log('\n[INT] A file named like pathspec magic cannot hide a sibling from the diff read:');
    cleanAll();
    stageBlob(':(exclude)evil.py', 'x = 1\n');
    stageBlob('evil.py', 'import os\nos.system("rm -rf /")\n');
    stageTrackedAppend('# comment only\n');
    try {
        r = runHook('git commit -m x');
        assertTrue('magic-named sibling: not approved', r.decision !== 'approve');
        assertFalse('magic-named sibling: no PASS marker', (readMarker() || '').startsWith('PASS'));
    } finally {
        unstageBlob(':(exclude)evil.py');
        unstageBlob('evil.py');
        unstageTracked();
        cleanAll();
    }

    // =====================================================================
    // Step 3a: "has a test" means the staged test diff ADDS test code. A
    // test-named file alone (empty, or a blank line in an unrelated test) does
    // not satisfy the mandate; the test-path diff is read and must add a line
    // that is neither blank nor a comment.
    // =====================================================================
    const tddBlocked = res => /^TDD gate/.test(res.reason || '') || /no_tests|code_first/.test(res.systemMessage || '');
    const runMandate = (extraEnv, opts) => runHook((opts && opts.command) || 'git commit -m x',
        { TDD_MANDATE_CONFIG: NO_MANDATE_CFG, ...(extraEnv || {}) },
        { realMandate: true, input: { transcript_path: '' }, ...(opts || {}) });
    const IMPL_REL = 'tmp/pcr-billing.py';
    const TEST_REL = 'tmp/test_pcr_billing.py';

    console.log('\n[INT] An empty test file does not satisfy the mandate:');
    cleanAll();
    unstageDummy();
    stageBlob(IMPL_REL, 'def bill():\n    return 1\n');
    stageBlob(TEST_REL, '');
    try {
        r = runMandate();
        assert('impl + 0-byte test file: blocked', r.decision, 'block');
        assertContains('...as no_tests', r.systemMessage || '', 'no_tests');
    } finally {
        unstageBlob(TEST_REL);
        unstageBlob(IMPL_REL);
        cleanAll();
    }

    console.log('\n[INT] A blank line added to an unrelated test does not satisfy the mandate:');
    const OTHER_TEST_REL = 'src/hooks/test-commit-command.js';
    stageBlob(IMPL_REL, 'def bill():\n    return 1\n');
    {
        const mode = execFileSync('git', ['ls-tree', 'HEAD', '--', OTHER_TEST_REL],
            { cwd: REPO_ROOT, encoding: 'utf-8' }).split(' ')[0];
        const head = execFileSync('git', ['show', 'HEAD:' + OTHER_TEST_REL], { cwd: REPO_ROOT, encoding: 'utf-8' });
        const blob = execFileSync('git', ['hash-object', '-w', '--stdin'],
            { cwd: REPO_ROOT, encoding: 'utf-8', input: head + '\n' }).trim();
        execFileSync('git', ['update-index', '--cacheinfo', mode + ',' + blob + ',' + OTHER_TEST_REL], { cwd: REPO_ROOT });
    }
    try {
        r = runMandate();
        assert('impl + blank line in an unrelated test: blocked', r.decision, 'block');
        assertContains('...as no_tests', r.systemMessage || '', 'no_tests');
    } finally {
        try { execFileSync('git', ['reset', '-q', 'HEAD', '--', OTHER_TEST_REL], { cwd: REPO_ROOT }); } catch (e) {}
        unstageBlob(IMPL_REL);
        cleanAll();
    }

    console.log('\n[INT] A test that adds test code satisfies the mandate:');
    stageBlob(IMPL_REL, 'def bill():\n    return 1\n');
    stageBlob(TEST_REL, 'from pcr_billing import bill\n\ndef test_bill():\n    assert bill() == 1\n');
    try {
        r = runMandate();
        assertFalse('impl + a real test: not blocked by the TDD gate', tddBlocked(r));
        // From a subdirectory too: the test diff is read at the toplevel, where the
        // repo-relative paths resolve.
        cleanAll();
        r = runMandate({}, { cwd: path.join(REPO_ROOT, 'src') });
        assertFalse('...nor from a subdirectory', tddBlocked(r));
    } finally {
        unstageBlob(TEST_REL);
        unstageBlob(IMPL_REL);
        cleanAll();
    }

    if (process.platform !== 'win32') {
        console.log('\n[INT] An unreadable test diff blocks:');
        stageBlob(IMPL_REL, 'def bill():\n    return 1\n');
        stageBlob(TEST_REL, 'def test_bill():\n    assert True\n');
        try {
            r = runMandate({ PATH: writeGitShim('-U0') });
            assert('unreadable test diff: blocked', r.decision, 'block');
            assertContains('...saying the test diff could not be read', r.systemMessage || '', 'test diff could not be read');
            assertFalse('...writes no marker', fs.existsSync(MARKER));
            assertFalse('...writes no lock', fs.existsSync(LOCK));
        } finally {
            cleanGitShim();
            unstageBlob(TEST_REL);
            unstageBlob(IMPL_REL);
            cleanAll();
        }
    }

    // --amend: the test committed in HEAD is part of the result, so it counts even
    // though `git diff --cached` (index against HEAD) cannot see it. Built in a
    // throwaway repository with plumbing, so this suite never commits here.
    console.log('\n[INT] --amend counts a test already in HEAD, root commit or not:');
    const buildRepo = commits => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcr-amend-'));
        const g = (args, input) => execFileSync('git', args,
            { cwd: dir, encoding: 'utf-8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        g(['init', '-q']);
        let parent = null;
        for (const files of commits) {
            for (const [rel, content] of Object.entries(files)) {
                fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
                fs.writeFileSync(path.join(dir, rel), content, 'utf-8');
                g(['add', '--', rel]);
            }
            const tree = g(['write-tree']);
            parent = g(['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit-tree', tree,
                ...(parent ? ['-p', parent] : []), '-m', 'c']);
            g(['update-ref', 'HEAD', parent]);
        }
        // The amend's own staged change: the implementation only.
        fs.writeFileSync(path.join(dir, 'src', 'app.py'), 'def app():\n    return 2\n', 'utf-8');
        g(['add', '--', 'src/app.py']);
        return dir;
    };
    const AMEND = { command: 'git commit --amend --no-edit' };
    const APP = { 'src/app.py': 'def app():\n    return 1\n' };
    const REAL_TEST = { 'tests/test_app.py': 'def test_app():\n    assert app() == 2\n' };
    const EMPTY_TEST = { 'tests/test_app.py': '' };
    for (const [name, commits, wantBlocked] of [
        ['amend of a root commit whose test is in HEAD: passes', [{ ...APP, ...REAL_TEST }], false],
        ['amend of a non-root commit whose test is in HEAD: passes', [{ 'README.md': 'x\n' }, { ...APP, ...REAL_TEST }], false],
        ['amend of a root commit whose HEAD test is empty: no_tests', [{ ...APP, ...EMPTY_TEST }], true],
        // The parent already had the real test; the amended commit adds nothing to it.
        ['amend whose test predates HEAD: no_tests', [{ ...REAL_TEST }, { ...APP, 'tests/test_app.py': REAL_TEST['tests/test_app.py'] + '\n' }], true],
    ]) {
        const dir = buildRepo(commits);
        try {
            r = runMandate({}, { ...AMEND, cwd: dir });
            assert(name, tddBlocked(r), wantBlocked);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }

    console.log('\n[UNIT] The marker hash ignores external diff drivers:');
    cleanAll();
    {
        const savedExt = process.env.GIT_EXTERNAL_DIFF;
        process.env.GIT_EXTERNAL_DIFF = 'true';   // prints nothing for every file
        try {
            stageDummyContent('def foo():\n    return 1\n');
            const h1 = gitReadLib.stagedDiffHash(REPO_ROOT);
            stageDummyContent('def foo():\n    return 2\n');
            const h2 = gitReadLib.stagedDiffHash(REPO_ROOT);
            assertTrue('hash moves with content under GIT_EXTERNAL_DIFF', h1 !== h2);
        } finally {
            if (savedExt === undefined) delete process.env.GIT_EXTERNAL_DIFF;
            else process.env.GIT_EXTERNAL_DIFF = savedExt;
            unstageDummy();
        }
        for (const flag of ['--no-ext-diff', '--no-textconv', '--text', "':(top,exclude)features/*.md'"]) {
            assertContains('HASH_PIPELINE carries ' + flag, gitReadLib.HASH_PIPELINE, flag);
        }
    }
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

    console.log('\n[UNIT] Requiring the hook as a library leaves crash handling alone:');
    // The crash handler turns any throw into a block and exit 0. Installed by a
    // plain require, it did that to this suite: a test that threw printed a
    // block and exited 0, with no Results line, so a crashed run read as a pass.
    {
        const probe = (code) => spawnSync('node', ['-e', code], { encoding: 'utf-8' });
        const req = 'require(' + JSON.stringify(HOOK_PATH) + ');';
        const added = probe('const n = process.listenerCount("uncaughtException"); ' + req +
            ' console.log(process.listenerCount("uncaughtException") - n);');
        assert('require adds no uncaughtException listener', (added.stdout || '').trim(), '0');
        const thrown = probe(req + ' throw new Error("a test threw");');
        assertTrue('a throw after require exits non-zero', thrown.status !== 0);
        assertFalse('a throw after require prints no hook decision',
            (thrown.stdout || '').includes('"decision"'));
    }

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
    // A TDD-gate input, so it runs under the real mandate.
    r = runHook('git commit -m x', { TDD_ORDER_REPOS_CONFIG: REPO_ROOT }, { realMandate: true });
    assertTrue('directory as config path does not crash the hook', r.decision === 'block' || r.decision === 'approve');

    console.log('\n[INT] Gate 0 directory change before the commit:');
    cleanAll();
    unstageDummy();
    stageTrackedAppend('# comment only\n');
    r = runHook('cd ' + NON_REPO_DIR + ' && git commit -m x');
    assert('cd out of the repo blocks', r.decision, 'block');
    assertContains('cd block names the repository', r.systemMessage || '', 'leaves the repository');
    r = runHook('cd "$SOMEWHERE" && git commit -m x');
    assert('dynamic cd blocks', r.decision, 'block');
    r = runHook('cd ' + REPO_ROOT + ' && git commit -m x', {}, { cwd: NON_REPO_DIR });
    assert('cd into a repo from outside blocks', r.decision, 'block');
    r = runHook('cd src && git commit -m x');
    assert('cd within the repo proceeds (trivial fast path)', r.decision, 'approve');
    unstageTracked();
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
        // Targets the TDD gate's own read, so it runs under the real mandate.
        r = runHook('git commit -m x',
            { PATH: writeGitShim('--name-only', 2), TDD_ORDER_REPOS_CONFIG: TDD_CFG2 },
            { input: { transcript_path: '/nonexistent/transcript.jsonl' }, realMandate: true });
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
    // The patched tests are written to the working tree, not the index, so the
    // gap block hands out no marker recipe. Nor does it write a review lock: no
    // review was requested, and the lock's retry message says to write the
    // marker on TDD_GATE: PASS. The retries run in scratch repositories below.
    assertFalse('gap-patching systemMessage carries no marker recipe',
        (r.systemMessage || '').includes('printf'));
    assertContains('gap-patching systemMessage says to stage the new tests',
        r.systemMessage || '', 'git add');
    assertFalse('the gap block writes no review lock', fs.existsSync(LOCK));

    console.log('\n[INT] After a gap block, nothing approves that diff without its tests:');
    // Scratch repositories: these scenarios plant untracked tests and unstaged
    // edits, which in this checkout would mix with the developer's own. Built
    // with plumbing, as the --amend cases are.
    const withScratchRepo = (files, fn, opts = {}) => {
        const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pcr-gap-')));
        const cfg = dir + '-tdd.json';
        const g = args => execFileSync('git', args,
            { cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        const write = (rel, content) => {
            fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
            fs.writeFileSync(path.join(dir, rel), content, 'utf-8');
        };
        const gitDir = path.join(dir, '.git');
        const covXml = path.join(dir, 'coverage.xml');
        const s = {
            dir, g, write,
            marker: path.join(gitDir, '.claude-last-review'),
            lock: path.join(gitDir, '.claude-review-in-progress'),
            // pytest reran: coverage.xml changes and is newer than every staged file.
            rerunCoverage: () => fs.writeFileSync(covXml,
                '<coverage><!-- ' + Date.now() + ' ' + Math.random() + ' --></coverage>', 'utf-8'),
            covHash: () => sha1(fs.readFileSync(covXml)),
            diffHash: () => gitReadLib.stagedDiffHash(dir),
            age: (file, seconds) => {
                const old = new Date(Date.now() - seconds * 1000);
                fs.utimesSync(file, old, old);
            },
            run: () => runHook('git commit -m x', {
                TDD_MANDATE_CONFIG: cfg,
                COVERAGE_XML_PATH: covXml,
                DIFF_COVER_CMD: 'node ' + DIFF_COVER_STUB,
            }, { cwd: dir }),
        };
        try {
            fs.writeFileSync(cfg, JSON.stringify({ exempt_repos: opts.mandate ? [] : [dir] }), 'utf-8');
            g(['init', '-q']);
            write('README.md', 'x\n');
            g(['add', '--', 'README.md']);
            const tree = g(['write-tree']);
            g(['update-ref', 'HEAD',
                g(['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit-tree', tree, '-m', 'c'])]);
            for (const [rel, content] of Object.entries(files)) {
                write(rel, content);
                g(['add', '--', rel]);
            }
            fn(s);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.rmSync(cfg, { force: true });
        }
    };
    const APP_PY = { 'app.py': 'def app():\n    return 1\n' };
    const APP_TEST = { 'tests/test_app.py': 'from app import app\n\ndef test_app():\n    assert app() == 1\n' };
    const APP_UNCOVERED = [{ file: 'app.py', lines: [2] }];
    const DRIFT_NOTE = 'measured with files the index does not hold';
    // The gap block, then the gap-patcher's work: a test written, coverage
    // rerun and passing, nothing staged.
    const gapThenPatch = s => {
        s.rerunCoverage();
        writeDiffCoverStub(1, APP_UNCOVERED);
        r = s.run();
        assert('scratch: the gap block fires', r.decision, 'block');
        assertFalse('scratch: the gap block writes no review lock', fs.existsSync(s.lock));
        s.write('tests/test_app.py', APP_TEST['tests/test_app.py']);
        s.rerunCoverage();
        writeDiffCoverStub(0);
    };

    // The retry with the test unstaged. Coverage passes only because pytest ran
    // a test the index does not hold, so the hook must not approve on coverage,
    // and the review it asks for instead is told which test that is -- for a
    // diff coverage can fully measure and for one it cannot, and however much
    // unrelated work is staged meanwhile.
    for (const [shape, files] of [['all-Python', APP_PY], ['mixed', { ...APP_PY, 'deploy.sh': 'echo deploy\n' }]]) {
        withScratchRepo(files, s => {
            gapThenPatch(s);
            s.age(s.marker, 60);
            r = s.run();
            assert(shape + ' diff, test unstaged: not approved', r.decision, 'block');
            assertContains(shape + ' diff, test unstaged: the review is told the test is not staged',
                r.systemMessage || '', DRIFT_NOTE + ' (tests/test_app.py)');

            s.write('README.md', 'y\n');
            s.g(['add', '--', 'README.md']);
            r = s.run();
            assert(shape + ' diff, unrelated file staged: not approved', r.decision, 'block');
            assertContains(shape + ' diff, unrelated file staged: the test is still named',
                r.systemMessage || '', DRIFT_NOTE + ' (tests/test_app.py)');

            s.g(['add', '--', 'tests/test_app.py']);
            s.rerunCoverage();
            r = s.run();
            if (shape === 'all-Python') {
                assert('all-Python diff, test staged: approved on coverage', r.decision, 'approve');
                assertContains('all-Python diff, test staged: the hook\'s own thresholds-met marker',
                    fs.readFileSync(s.marker, 'utf-8'), 'thresholds-met');
            } else {
                // deploy.sh is outside coverage, so the commit still needs a
                // review -- but no longer one warned about a missing test.
                assertFalse('mixed diff, test staged: no drift reported',
                    (r.systemMessage || '').includes(DRIFT_NOTE));
            }
        });
    }

    console.log('\n[UNIT] readCoverageDrift reads the working tree without writing the index:');
    withScratchRepo({ ...APP_PY, ...APP_TEST }, s => {
        // A stat-only change is not drift, and reading must not refresh the
        // index: a parallel hook's `git add` would lose that race on index.lock.
        const later = new Date(Date.now() + 60 * 1000);
        fs.utimesSync(path.join(s.dir, 'app.py'), later, later);
        const indexPath = path.join(s.dir, '.git', 'index');
        const indexBefore = fs.statSync(indexPath).mtimeMs;
        assert('a touched but unchanged file is not drift',
            JSON.stringify(mod.readCoverageDrift(s.dir).files), '[]');
        assert('reading drift leaves the index file untouched', fs.statSync(indexPath).mtimeMs, indexBefore);

        // What does count: a staged file deleted from the working tree, and an
        // untracked test inside an untracked directory, with a space in its
        // name. An untracked module that is not a test or conftest.py does not.
        fs.unlinkSync(path.join(s.dir, 'app.py'));
        s.write('tests/new dir/test a.py', 'def test_a():\n    pass\n');
        s.write('notes.py', 'x = 1\n');
        assert('drift lists the deleted file and the untracked test, not the module',
            JSON.stringify((mod.readCoverageDrift(s.dir).files || []).slice().sort()),
            JSON.stringify(['app.py', 'tests/new dir/test a.py']));
    });
    withScratchRepo({ ...APP_PY, '.gitignore': 'tests/test_local*.py\nscratch/\n.venv/\n' }, s => {
        // Ignored by a pattern that names the file: listed, and marked ignored.
        s.write('tests/test_local_a.py', 'def test_a():\n    pass\n');
        // Inside a wholly ignored directory: git reports the directory, not its
        // contents, so this is the documented limit -- and why a .venv full of
        // packaged test files neither slows the read nor floods it.
        s.write('scratch/test_s.py', 'def test_s():\n    pass\n');
        s.write('.venv/lib/site-packages/pkg/tests/test_pkg.py', 'def test_p():\n    pass\n');
        const drift = mod.readCoverageDrift(s.dir);
        assert('a pattern-ignored test is drift',
            JSON.stringify(drift.files), JSON.stringify(['tests/test_local_a.py']));
        assert('... and is reported as ignored',
            JSON.stringify(drift.ignored), JSON.stringify(['tests/test_local_a.py']));
    });
    // An ignored directory that holds a tracked file is walked, so a new test
    // inside it is seen: the blind spot is only a directory git can skip whole.
    withScratchRepo({ ...APP_PY, '.gitignore': 'tests/local/\n' }, s => {
        s.write('tests/local/keep.py', 'x = 1\n');
        s.g(['add', '-f', '--', 'tests/local/keep.py']);
        s.write('tests/local/test_new_local.py', 'def test_n():\n    pass\n');
        assert('a test in an ignored directory holding a tracked file is drift',
            JSON.stringify(mod.readCoverageDrift(s.dir).ignored),
            JSON.stringify(['tests/local/test_new_local.py']));
    });

    console.log('\n[INT] thresholds-met needs coverage.xml to match the index:');
    // Control: nothing drifted, so coverage approves.
    withScratchRepo({ ...APP_PY, ...APP_TEST }, s => {
        s.rerunCoverage();
        writeDiffCoverStub(0);
        assert('no drift: thresholds-met approves', s.run().decision, 'approve');
    });
    // pytest loads a root conftest.py unconditionally, test-named or not.
    withScratchRepo({ ...APP_PY, ...APP_TEST }, s => {
        s.write('conftest.py', 'import pytest\n');
        s.rerunCoverage();
        writeDiffCoverStub(0);
        r = s.run();
        assert('untracked conftest.py: not approved', r.decision, 'block');
        assertFalse('untracked conftest.py: no thresholds-met marker',
            (fs.existsSync(s.marker) ? fs.readFileSync(s.marker, 'utf-8') : '').includes('thresholds-met'));
        assertContains('untracked conftest.py: named', r.systemMessage || '', 'conftest.py');
        assertContains('untracked conftest.py: the stash route is given',
            r.systemMessage || '', 'git stash push --keep-index --include-untracked');
        // The retry lands on review-in-flight, which runs before coverage is
        // read. It must still say what the index lacks, or the reviewer
        // dispatched from that message reviews without knowing.
        s.age(s.marker, 60);   // past the 30s same-diff repeat window
        r = s.run();
        assert('drift retry: review in flight', r.reason && r.reason.startsWith('A review was requested'), true);
        assertContains('drift retry: the in-flight message repeats the drift note',
            r.systemMessage || '', 'measured with files the index does not hold (conftest.py)');
        assertContains('drift retry: the note ends its sentence before the reason',
            r.systemMessage || '', 'after the commit. A review was requested');
    });
    // A gitignored test file: pytest collects it, `git status` leaves it out
    // unless asked, and `git add` refuses it -- so it is drift, and the message
    // must say why staging it plainly fails.
    withScratchRepo({ ...APP_PY, ...APP_TEST, '.gitignore': 'tests/test_local*.py\n' }, s => {
        s.write('tests/test_local_app.py', 'def test_local():\n    pass\n');
        s.rerunCoverage();
        writeDiffCoverStub(0);
        r = s.run();
        assert('gitignored test file: not approved', r.decision, 'block');
        assertContains('gitignored test file: named',
            r.systemMessage || '', 'tests/test_local_app.py');
        assertContains('gitignored test file: the message says it is gitignored',
            r.systemMessage || '', 'gitignored');
    });
    // Both kinds at once: the note must not call the untracked one gitignored.
    withScratchRepo({ ...APP_PY, ...APP_TEST, '.gitignore': 'tests/test_local*.py\n' }, s => {
        s.write('tests/test_local_app.py', 'def test_local():\n    pass\n');
        s.write('tests/test_new.py', 'def test_new():\n    pass\n');
        s.rerunCoverage();
        writeDiffCoverStub(0);
        r = s.run();
        assert('untracked and gitignored drift: not approved', r.decision, 'block');
        assertContains('untracked and gitignored drift: only the ignored one is called gitignored',
            r.systemMessage || '', 'Of these, the following are gitignored, so `git add` refuses them ' +
                'and the stash leaves them: tests/test_local_app.py.');
    });

    console.log('\n[INT] Only a block that requests a review leaves a review lock:');
    // The lock means "a review was requested for this diff". The retry's
    // review-in-flight block says to write the marker on TDD_GATE: PASS, and it
    // runs before the TDD and coverage gates. A block that asked for a code
    // change or fresh coverage must leave the retry to the gate that blocked it.
    withScratchRepo(APP_PY, s => {
        r = s.run();
        assertContains('mandate on, no test staged: the TDD gate blocks', r.systemMessage || '', 'TDD gate');
        assertFalse('the TDD block writes no review lock', fs.existsSync(s.lock));
        s.age(s.marker, 60);
        r = s.run();
        assertContains('the retry is judged by the TDD gate again', r.systemMessage || '', 'TDD gate');
        assertFalse('the TDD retry offers no marker recipe', (r.systemMessage || '').includes('printf'));
    }, { mandate: true });
    withScratchRepo({ ...APP_PY, ...APP_TEST }, s => {
        s.rerunCoverage();
        s.age(path.join(s.dir, 'coverage.xml'), 600);   // older than every staged file
        writeDiffCoverStub(0);
        r = s.run();
        assertContains('stale coverage: blocked as stale', r.systemMessage || '', 'coverage.xml is stale');
        assertFalse('the stale-coverage block writes no review lock', fs.existsSync(s.lock));
        s.age(s.marker, 60);
        r = s.run();
        assertContains('coverage still stale: the retry is blocked as stale again',
            r.systemMessage || '', 'coverage.xml is stale');
        assertFalse('coverage still stale: no marker recipe', (r.systemMessage || '').includes('printf'));
        s.rerunCoverage();
        s.age(s.marker, 60);   // past the 30s same-diff repeat window
        r = s.run();
        assert('coverage refreshed: the retry is measured and approved', r.decision, 'approve');
    });

    console.log('\n[INT] The 30s repeat fires only when nothing the hook checks has changed:');
    // A stale-coverage block is cleared by fresh coverage, which leaves the
    // staged diff as it was. Repeating on the diff alone turned a quick retry
    // after regenerating coverage into the same block with advice that did
    // not apply.
    withScratchRepo({ ...APP_PY, ...APP_TEST }, s => {
        s.rerunCoverage();
        s.age(path.join(s.dir, 'coverage.xml'), 600);   // older than every staged file
        writeDiffCoverStub(0);
        r = s.run();
        assertContains('stale coverage: blocked as stale', r.systemMessage || '', 'coverage.xml is stale');
        r = s.run();
        assert('nothing changed: the quick retry repeats', r.reason, 'Same diff blocked < 30s ago');
        assertContains('nothing changed: the repeat names what it compared', r.systemMessage || '',
            'Nothing this hook checks has changed since (the staged diff and coverage.xml)');
        s.rerunCoverage();
        r = s.run();
        assert('coverage refreshed within 30s: the retry is measured and approved', r.decision, 'approve');
    });
    withScratchRepo({ ...APP_PY, ...APP_TEST }, s => {
        s.write('app.py', 'def app():\n    return 2\n');
        s.rerunCoverage();
        writeDiffCoverStub(0);
        r = s.run();
        assert('staged file with unstaged edits: not approved', r.decision, 'block');
        assertContains('staged file with unstaged edits: the drift is named',
            r.systemMessage || '', 'measured with files the index does not hold (app.py)');
    });

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
    assertFalse('the hygiene timeout writes no review lock', fs.existsSync(LOCK));
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
    unstageTracked();
    unstageFeatureDummy();
    unstageLargeFixture();
    cleanGitShim();
    cleanNonRepoDir();
    cleanAll();
    cleanCoverageXml();
    cleanDiffCoverStub();
    cleanPolicy();
    cleanTddExemptCfg();
    // Put the caller's index back exactly as it was, and prove it.
    restoreIndex();
    assert('the caller\'s staged and unstaged diffs are as they were before the suite',
        diffFingerprint(), CALLER_DIFFS);
}

console.log(`\n============================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
