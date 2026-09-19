// Tests for lib/source-files.js: the one definition of "is this path code?".
//
// Written before the implementation. Four hooks each carried their own copy of
// SOURCE_EXTENSIONS and EXCLUDE_PATTERNS. At HEAD those copies were effectively
// identical, and all four were blind to shell -- none listed `.sh` or `.ps1` -- so
// this change both consolidates them and adds shell, which is a behaviour change:
//
//   - the review gate approved a shell-only diff via `staged-no-code`, with no
//     review requested at all;
//   - lib/feature-file.js read the same commit as docs-only, so `install.sh` could
//     go to `main` with no branch and no feature file (verified before the change:
//     hasSourceFile(['install.sh']) was false).
//
// Consolidating is the part that keeps it fixed: four copies of a list that decides
// whether code gets reviewed will drift eventually, and the drift is silent. The
// guard at the bottom of this file fails if any hook grows its own copy again.
const fs = require('fs');
const path = require('path');

const src = require('./lib/source-files.js');

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

console.log('source-files tests');
console.log('==================');

console.log('\nWhat counts as source:');
for (const f of [
    'install.sh', 'uninstall.sh', 'src/test-install.sh', 'DEPLOY.SH',
    'claude-commit-notify.ps1',
    'src/hooks/pre-commit-review.js', 'tools/analyze-review-timing.py',
    'Main.java', 'app.go', 'lib.rs', 'q.sql',
]) {
    assert(`source: ${f}`, src.isSourcePath(f), true);
}
for (const f of ['README.md', 'package.json', 'config.yaml', 'LICENSE', '.gitignore', 'notes.txt']) {
    assert(`not source: ${f}`, src.isSourcePath(f), false);
}

console.log('\nExcluded paths, whatever the extension:');
for (const f of [
    '.claude/hooks/pre-commit-review.js',
    '.vscode/task.js',
    'node_modules/x/index.js',
    'frontend/node_modules/pkg/install.sh',
    '__pycache__/x.py',
    'vendor/lib/configure.sh',
    'third_party/x/build.sh',
    '.venv/bin/activate.sh',
    'venv/bin/activate.sh',
]) {
    assert(`excluded: ${f}`, src.isSourcePath(f), false);
}

// `dist/` and `build/` are deliberately NOT excluded. They were briefly, on the
// reasoning that they hold generated output, and that un-gated
// `build/scripts/release.sh` containing `rm -rf "$HOME/.claude"`. Plenty of
// projects keep hand-written source there (Chromium's `build/*.py`), and an
// exclusion list is the one place a wrong entry makes the gate quietly weaker.
for (const f of ['dist/entrypoint.sh', 'build/generated/run.ps1', 'build/scripts/release.sh', 'dist/app.py']) {
    assert(`still gated: ${f}`, src.isSourcePath(f), true);
}
// A directory that merely starts with an excluded name is not excluded.
for (const f of ['vendoring/tool.sh', 'buildkit/run.sh', 'distribution/x.js']) {
    assert(`not excluded: ${f}`, src.isSourcePath(f), true);
}

console.log('\nThe narrower sets:');
assert('classifier reads .js', src.classifierUnderstands('a.js'), true);
assert('classifier reads .py', src.classifierUnderstands('a.py'), true);
// The whole point: shell is source, but the diff classifier cannot read it, so it
// must never be scored as trivial.
assert('classifier does NOT read .sh', src.classifierUnderstands('a.sh'), false);
assert('classifier does NOT read .ps1', src.classifierUnderstands('a.ps1'), false);
assert('coverage measures .py', src.coverageMeasurable('a.py'), true);
assert('coverage does not measure .sh', src.coverageMeasurable('a.sh'), false);
assert('coverage does not measure .js', src.coverageMeasurable('a.js'), false);

console.log('\nEvery classifier/coverage language is also source:');
for (const ext of src.CLASSIFIER_LANGUAGES) {
    assert(`${ext} is in SOURCE_EXTENSIONS`, src.SOURCE_EXTENSIONS.includes(ext), true);
}
for (const ext of src.COVERAGE_LANGUAGES) {
    assert(`${ext} is in SOURCE_EXTENSIONS`, src.SOURCE_EXTENSIONS.includes(ext), true);
}

console.log('\nThe lists cannot be mutated by a caller:');
assert('SOURCE_EXTENSIONS frozen', Object.isFrozen(src.SOURCE_EXTENSIONS), true);
assert('EXCLUDE_PATTERNS frozen', Object.isFrozen(src.EXCLUDE_PATTERNS), true);

console.log('\nConsumers agree with the shared definition:');
const featureFile = require('./lib/feature-file.js');
for (const f of ['install.sh', 'uninstall.sh', 'src/hooks/x.js', 'README.md', 'notify.ps1']) {
    assert(`feature-file agrees on ${f}`, featureFile.isSourceFile(f), src.isSourcePath(f));
}
// The regression that motivated this: the feature gate must see a shell-only
// commit as source, so it is blocked on trunk like any other code change.
assert('a shell-only commit counts as source work', featureFile.hasSourceFile(['install.sh', 'uninstall.sh']), true);

console.log('\nDrift guard -- only one file may define these lists:');
// Scans all of src/, not just src/hooks/, and strips comments before matching so
// that prose describing the pattern is not itself a violation -- the fix this guard
// enforces has to be explainable in a comment. `(?:const|let|var)\\s+NAME\\s*=` with
// no initialiser shape catches `= [...]`, `= new Set(...)`, `= Array.of(...)` and
// `= '.py'.split(',')` alike, while a re-export (`const { NAME } = require(...)`)
// does not match because of the brace.
const srcDir = path.join(__dirname, '..');
const offenders = [];
function stripComments(text) {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'tmp') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { scan(full); continue; }
        if (!entry.name.endsWith('.js')) continue;
        if (entry.name.startsWith('test-')) continue;
        if (full === path.join(__dirname, 'lib', 'source-files.js')) continue;
        const text = stripComments(fs.readFileSync(full, 'utf-8'));
        for (const name of ['SOURCE_EXTENSIONS', 'EXCLUDE_PATTERNS', 'CLASSIFIER_LANGUAGES', 'COVERAGE_LANGUAGES']) {
            if (new RegExp('(?:const|let|var)\\s+' + name + '\\s*=').test(text)) {
                offenders.push(path.relative(srcDir, full) + ' defines ' + name);
            }
        }
    }
}
scan(srcDir);
assert('no hook defines its own copy', offenders, []);

console.log('\n==================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
