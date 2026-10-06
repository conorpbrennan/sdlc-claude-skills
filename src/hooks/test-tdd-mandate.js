// Tests for the TDD mandate: which files count as tests, which commits are
// exempt, and when the gate is in force.
//
// Written before the implementation, which is the rule this file exists to
// enforce. It covers three things the opt-in version got wrong:
//
//   1. The test recogniser missed most real conventions. It matched
//      `test_foo.py` but not `test-foo.js`, so every one of this project's own
//      17 test files classified as IMPL and every commit here would have been
//      blocked as `no_tests`. It also missed `FooTest.java`, `FooTests.cs`,
//      `foo.spec.ts` and a singular `test/` directory.
//   2. The gate was opt-in via an allowlist nobody had created, so it never ran.
//      It is now on everywhere, with an explicit opt-out.
//   3. Order could only be checked from a session transcript, and no transcript
//      meant no gate at all. Absent a transcript the mandate now still requires
//      a test to be PRESENT, which is checkable from the index alone.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const path = require('path');
const fs = require('fs');
const os = require('os');

const tdd = require('./lib/tdd-order.js');

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

console.log('tdd-mandate tests');
console.log('=================');

// ---------------------------------------------------------------- recogniser ---
// Every convention here is one a real repository on this machine could use. A
// miss means the gate calls a tested commit `no_tests` and blocks it.
console.log('\nTest files, by convention:');
const TESTS = [
    // this project's own convention -- hyphen, no directory
    'src/hooks/test-pre-commit-review.js',
    'src/hooks/test-commit-command.js',
    'src/test-install.sh',
    'src/test-claude-md-section.js',
    'test-foo.sh',
    // python
    'tests/test_foo.py',
    'test_foo.py',
    'foo_test.py',
    // js/ts
    'foo.test.js',
    'foo.test.ts',
    'foo.spec.ts',
    'foo.spec.js',
    '__tests__/foo.js',
    // go
    'foo_test.go',
    // java / kotlin / c# -- the capitalised suffix counts only inside a test
    // directory, which is where Maven and Gradle put them anyway
    'src/test/java/com/x/FooTest.java',
    'test/FooTests.cs',
    'spec/FooSpec.kt',
    // ruby
    'spec/foo_spec.rb',
    // directories
    'test/foo.js',
    'tests/foo.bats',
    'spec/support/helper.rb',
];
for (const f of TESTS) assert(`test: ${f}`, tdd.isTestFile(f), true);

// A test file must itself be code. Found by checking risk-claude-skills, which has
// a planning document called `.claude/plans/test-first-ordering-gate.md`: the
// `test-` prefix rule matched it, so a commit of real Python plus that document
// satisfied the mandate with no test in it. Same for a JSON fixture under `tests/`.
// This is the fail-OPEN direction -- a non-code path counted as the paired test.
console.log('\nA test must be code, not just live in a test-ish path:');
const NOT_CODE_TESTS = [
    '.claude/plans/test-first-ordering-gate.md',
    'docs/test-strategy.md',
    'tests/README.md',
    'tests/fixtures/data.json',
    'tests/fixtures/expected.csv',
    'spec/fixtures/payload.yaml',
];
for (const f of NOT_CODE_TESTS) assert(`not a test: ${f}`, tdd.isTestFile(f), false);
assert('code + a test-named doc is still no_tests',
    tdd.classifyFromEvents(['src/api.py', '.claude/plans/test-first-ordering-gate.md'], []).status, 'no_tests');
assert('code + a fixture under tests/ is still no_tests',
    tdd.classifyFromEvents(['src/api.py', 'tests/fixtures/data.json'], []).status, 'no_tests');
// Executable test specifications are code, even though nobody writes application
// logic in them. Requiring isSourcePath broke these two: before the guard, the
// `tests/` directory rule matched them regardless of extension, so a Robot
// Framework or Cucumber suite counted. Losing them flips the failure to the
// BLOCKING direction -- a genuinely tested commit called `no_tests` -- which is
// worse for a user than the fail-open case, because the only remedy on offer is
// disabling the mandate.
console.log('\nExecutable test specs count as tests:');
assert('a Robot Framework suite', tdd.isTestFile('tests/test_login.robot'), true);
assert('a Robot-tested commit is satisfied',
    tdd.classifyFromEvents(['src/api.py', 'tests/test_login.robot'], []).status, 'not_applicable');

// `.feature` is NOT a test here, and that is a decision rather than an oversight: a
// Gherkin scenario carries no assertions (its step definitions do), so accepting it
// would let a commit pass with a specification that executes nothing -- the same
// error as accepting a `test-*.md` plan. See the note in lib/source-files.js.
assert('a Gherkin scenario is not a test', tdd.isTestFile('tests/features/checkout.feature'), false);
assert('code + a bare .feature is not satisfied',
    tdd.classifyFromEvents(['app/checkout.rb', 'tests/features/checkout.feature'], []).status, 'no_tests');
// ...but its step definitions are ordinary code and do count, in their own language.
assert('step definitions in a test dir count',
    tdd.classifyFromEvents(['app/checkout.rb', 'spec/features/checkout_spec.rb'], []).status, 'not_applicable');
// ...and the hole this guard closed stays closed: a data fixture in the same
// directory is still not a test.
assert('a JSON fixture beside them is still not a test', tdd.isTestFile('tests/fixtures/data.json'), false);
assert('code + that fixture is still no_tests',
    tdd.classifyFromEvents(['src/api.py', 'tests/fixtures/data.json'], []).status, 'no_tests');

// ...but a real test in any supported language still counts, including bats, which
// is a shell test framework and therefore code.
assert('a bats test counts', tdd.isTestFile('tests/smoke.bats'), true);
assert('code + a bats test is satisfied',
    tdd.classifyFromEvents(['src/api.py', 'tests/smoke.bats'], []).status, 'not_applicable');

console.log('\nNot test files:');
const NOT_TESTS = [
    'src/hooks/pre-commit-review.js',
    'src/lib/claude-md-section.js',
    'install.sh',
    'uninstall.sh',
    'tools/analyze-review-timing.py',
    // near misses that must not be swept in
    'src/latest.js',
    'src/contest.py',
    'src/protest/main.go',
    'attest.rb',
    'src/testimony.ts',
    'greatest.java',
    // Real production files that a bare `*Spec.*` / `*Test.*` / `*_spec.*` rule
    // swept in. This is the fail-OPEN direction: calling one of these a test moves
    // it out of implPaths AND into testPaths, so a commit of production code with
    // no test stops being `no_tests`. JavaPoet's whole public API is `*Spec.java`;
    // KotlinPoet's is `*Spec.kt`.
    'javapoet/src/main/java/com/squareup/javapoet/TypeSpec.java',
    'javapoet/src/main/java/com/squareup/javapoet/MethodSpec.java',
    'kotlinpoet/src/main/kotlin/FileSpec.kt',
    'forms/layout/ColumnSpec.java',
    'tensorflow/python/framework/tensor_spec.py',
    'src/api_spec.py',
    'openapi/api-spec.ts',
    'stats/t-test.py',
    'src/ab-test.js',
    'FooTest.java',
    'FooTests.cs',
];
for (const f of NOT_TESTS) assert(`not a test: ${f}`, tdd.isTestFile(f), false);

// ------------------------------------------------------- features/ is a test dir ---
// `features/` was hardcoded as EXEMPT because this project keeps its feature-
// tracking records there. That was wrong twice over. It is redundant -- those
// records are `.md`, so the inverted exemption rule (`not code -> no test needed`)
// already covers them -- and its only live effect was exempting CODE under
// `features/`, which is Cucumber's standard test directory. A Cucumber suite was
// therefore invisible to the mandate: step definitions are real Ruby, and they
// neither counted as tests nor as implementation.
//
// It is a test directory now, and that is only safe because isTestFile requires the
// file to be code: a `.md` record in the same directory still cannot be a test.
console.log('\nfeatures/ is Cucumber\'s test directory, not an exemption:');
assert('step definitions are tests', tdd.isTestFile('features/step_definitions/checkout_steps.rb'), true);
assert('a support helper is a test', tdd.isTestFile('features/support/env.rb'), true);
// Cucumber's sub-paths only, never a bare `features/` at any depth. "Feature
// folder" / feature-sliced architecture (Redux, Angular, NestJS) puts real
// business logic under `src/features/<slug>/`, and counting that as a test is
// worse than the blanket exemption it replaced: an exemption merely made the file
// invisible, whereas a false test SUPPLIES THE PAIRING for other genuinely
// untested files staged alongside it.
assert('feature-sliced production code is not a test',
    tdd.isTestFile('src/features/checkout/reducer.js'), false);
assert('...nor at the repo root', tdd.isTestFile('features/checkout/reducer.js'), false);
assert('two untested files, one in a feature folder, still block',
    tdd.classifyFromEvents(['src/features/checkout/reducer.js', 'src/api/other.js'], []).status, 'no_tests');
// The control: the same shape outside a features/ directory must behave identically.
assert('...identical to the same commit elsewhere',
    tdd.classifyFromEvents(['src/modules/checkout/reducer.js', 'src/api/other.js'], []).status, 'no_tests');
// Cucumber's own layout keeps working at any depth, since monorepos nest it.
assert('nested step definitions still count',
    tdd.isTestFile('packages/web/features/step_definitions/login_steps.rb'), true);
assert('a Cucumber-tested commit is satisfied',
    tdd.classifyFromEvents(['app/checkout.rb', 'features/step_definitions/checkout_steps.rb'], []).status, 'not_applicable');
// The records this project keeps there are still exempt, and still not tests --
// they are not code, so neither rule can reach them.
assert('a feature record is not a test', tdd.isTestFile('features/extract-sdlc-toolchain.md'), false);
assert('a feature record is still exempt', tdd.isExemptPath('features/extract-sdlc-toolchain.md'), true);
assert('code + only a feature record is still no_tests',
    tdd.classifyFromEvents(['src/api.py', 'features/some-slug.md'], []).status, 'no_tests');
// A bare .feature stays out: no assertions in it (see lib/source-files.js).
assert('a bare .feature is still not a test', tdd.isTestFile('features/checkout.feature'), false);

// ------------------------------------------------------- configurable exemption ---
// So that a repository never has to patch a shared lib to exempt a directory, which
// is how `features/` came to be hardcoded in the first place.
console.log('\nexempt_paths in the config:');
const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-paths-'));
const pathsCfg = path.join(cfgDir, 'tdd-mandate.json');
fs.writeFileSync(pathsCfg, JSON.stringify({ exempt_paths: ['generated/', 'legacy/vendor_shim.py'] }));
assert('a configured directory prefix is exempt',
    tdd.isExemptPath('generated/api_client.py', { configPath: pathsCfg }), true);
assert('a configured exact file is exempt',
    tdd.isExemptPath('legacy/vendor_shim.py', { configPath: pathsCfg }), true);
// An exact entry must not behave like a prefix. The sibling has to be code itself,
// or it would be exempt for not being code and the assertion would prove nothing --
// which is what `vendor_shim.py.bak` did on the first attempt.
assert('an exact entry does not match a code sibling',
    tdd.isExemptPath('legacy/vendor_shim2.py', { configPath: pathsCfg }), false);
// A directory entry must match on a segment boundary, not mid-filename.
assert('a directory entry does not match mid-filename',
    tdd.isExemptPath('src/pregenerated/api.py', { configPath: pathsCfg }), false);
assert('an unconfigured path is not exempt',
    tdd.isExemptPath('src/api.py', { configPath: pathsCfg }), false);
assert('the gate honours it',
    tdd.classifyFromEvents(['generated/api_client.py'], [], { configPath: pathsCfg }).status, 'not_applicable');
fs.writeFileSync(pathsCfg, '{ not json');
assert('unparseable config exempts nothing', tdd.isExemptPath('src/api.py', { configPath: pathsCfg }), false);
fs.rmSync(cfgDir, { recursive: true, force: true });

// ----------------------------------------------------------------- exemptions ---
// A commit of only these needs no test, or the mandate would block every
// documentation fix.
console.log('\nExempt paths:');
const EXEMPT = [
    'README.md',
    'CLAUDE.md',
    'features/extract-sdlc-toolchain.md',
    '.claude/hooks-config.json',
    'package.json',
    'pyproject.toml',
    'config.yaml',
    'poetry.lock',
    'tmp/scratch.txt',
    '.gitignore',
    'LICENSE',
];
for (const f of EXEMPT) assert(`exempt: ${f}`, tdd.isExemptPath(f), true);

console.log('\nNot exempt (these are code and need tests):');
for (const f of ['install.sh', 'src/hooks/pre-commit-review.js', 'tools/x.py']) {
    assert(`not exempt: ${f}`, tdd.isExemptPath(f), false);
}

// ------------------------------------------------------------- in-force check ---
// On by default, with two escape hatches: a per-repo marker file, matching the
// feature-tracking convention, and a global list.
console.log('\nWhen the mandate is in force:');
const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-mandate-'));
const repoA = path.join(sb, 'repo-a');
const repoB = path.join(sb, 'repo-b');
fs.mkdirSync(path.join(repoA, '.claude'), { recursive: true });
fs.mkdirSync(path.join(repoB, '.claude'), { recursive: true });

assert('on by default, no config at all', tdd.mandateInForce(repoA, { configPath: path.join(sb, 'nope.json') }).inForce, true);

fs.writeFileSync(path.join(repoA, '.claude', 'tdd-mandate.disabled'), '');
const offA = tdd.mandateInForce(repoA, { configPath: path.join(sb, 'nope.json') });
assert('per-repo marker turns it off', offA.inForce, false);
assert('...and says why', offA.reason, 'repo-opted-out');
fs.unlinkSync(path.join(repoA, '.claude', 'tdd-mandate.disabled'));

const cfg = path.join(sb, 'tdd-mandate.json');
fs.writeFileSync(cfg, JSON.stringify({ exempt_repos: [repoB] }));
assert('global list exempts the named repo', tdd.mandateInForce(repoB, { configPath: cfg }).inForce, false);
assert('...but not its neighbour', tdd.mandateInForce(repoA, { configPath: cfg }).inForce, true);

fs.writeFileSync(cfg, '{ not json');
assert('unparseable config does not disable the mandate', tdd.mandateInForce(repoA, { configPath: cfg }).inForce, true);

fs.writeFileSync(cfg, JSON.stringify({ exempt_repos: [repoB.toUpperCase().replace(/\\/g, '/') + '/'] }));
assert('exempt match ignores case and trailing slash', tdd.mandateInForce(repoB, { configPath: cfg }).inForce, false);

// --------------------------------------------------------------- the verdict ---
// classifyFromEvents already covers order. What is new is the no-transcript
// fallback: order cannot be known, but presence still can.
console.log('\nVerdict without a transcript (presence still required):');
const ev = [];
assert('impl with no test is blocked', tdd.classifyFromEvents(['src/a.js'], ev).status, 'no_tests');
assert('impl with a test present passes', tdd.classifyFromEvents(['src/a.js', 'src/test-a.js'], ev).status, 'not_applicable');
assert('docs only is not applicable', tdd.classifyFromEvents(['README.md'], ev).status, 'not_applicable');
assert('tests only is not applicable', tdd.classifyFromEvents(['src/test-a.js'], ev).status, 'not_applicable');

// The fail-open case, as a gate verdict rather than a path predicate.
console.log('\nProduction files that look like specs do not satisfy the gate:');
assert('two *Spec.java production files with no test', tdd.classifyFromEvents(
    ['javapoet/src/main/java/com/squareup/javapoet/TypeSpec.java',
     'javapoet/src/main/java/com/squareup/javapoet/CodeWriter.java'], []).status, 'no_tests');
assert('a *_spec.py module with no test', tdd.classifyFromEvents(
    ['tensorflow/python/framework/tensor_spec.py', 'tensorflow/python/ops.py'], []).status, 'no_tests');
// ...but the real convention still works.
assert('src/test/java/**/FooTest.java is a test', tdd.classifyFromEvents(
    ['src/main/java/Foo.java', 'src/test/java/FooTest.java'], []).status, 'not_applicable');

// .NET puts tests in a `<Name>.Tests` project folder, often upper-cased
// (`CCF.TESTS/`), never in a bare `tests/`. Found in the ccf repo: a commit of
// `CCF.ROOT/X.cs` + `CCF.TESTS/XTests.cs` was blocked as `no_tests`.
console.log('\n.NET test project folders count as test directories:');
const DOTNET_TESTS = [
    'root/CCF.TESTS/Data/FooTests.cs',
    'src/Foo.Tests/BarTests.cs',
    'src/Foo.Specs/BarSpec.cs',
    'src/Tests/FooTests.cs',
];
for (const f of DOTNET_TESTS) assert(`test: ${f}`, tdd.isTestFile(f), true);
// The suffixed file names below put the directory rule alone on trial. A
// `.Tests.Helpers` project is support code, not tests: the folder must END in
// `.Tests` / `.Specs`.
const DOTNET_NOT_TESTS = [
    'src/latest/x.cs',
    'src/contest/x.cs',
    'src/Foo.Testing/x.cs',
    'src/Foo.Tests.Helpers/x.cs',
    'src/latest/FooTests.cs',
    'src/contest/FooTests.cs',
    'src/Foo.Testing/BarTests.cs',
    'src/Foo.Tests.Helpers/BarTests.cs',
];
for (const f of DOTNET_NOT_TESTS) assert(`not a test: ${f}`, tdd.isTestFile(f), false);
assert('CCF.ROOT code + CCF.TESTS test is not no_tests', tdd.classifyFromEvents(
    ['root/CCF.ROOT/X.cs', 'root/CCF.TESTS/XTests.cs'], []).status, 'not_applicable');
assert('two production .cs files with no test is still no_tests', tdd.classifyFromEvents(
    ['root/CCF.ROOT/X.cs', 'root/CCF.ROOT/Data/YTests.cs'], []).status, 'no_tests');

console.log('\nVerdict with a transcript (order enforced):');
const mk = (p, i) => ({ path: p, ts: null, ord: i });
assert('test edited first', tdd.classifyFromEvents(['src/a.js', 'src/test-a.js'], [mk('src/test-a.js', 0), mk('src/a.js', 1)]).status, 'test_first');
assert('impl edited first', tdd.classifyFromEvents(['src/a.js', 'src/test-a.js'], [mk('src/a.js', 0), mk('src/test-a.js', 1)]).status, 'code_first');

fs.rmSync(sb, { recursive: true, force: true });

// ------------------------------------------------- presence means test CODE ---
// A test-named file in the diff is not a test. An empty `test_billing.py`, or a
// blank line added to an unrelated test, satisfied the mandate by name alone. When
// the hook hands the classifier the staged diff of the test paths (`testDiff`), at
// least one ADDED line must be neither blank nor a comment in the file's language.
// A null diff could not be read, and blocks as `unreadable`.
console.log('\nPresence means the test diff adds test code:');
// A -U0 diff of one file, as `git diff --cached -U0` prints it.
const fileDiff = (p, added, opts) => {
    const o = opts || {};
    const head = 'diff --git a/' + p + ' b/' + p + '\n' +
        (o.isNew ? 'new file mode 100644\nindex 0000000..1111111\n--- /dev/null\n'
                 : 'index 1111111..2222222 100644\n--- a/' + p + '\n') +
        '+++ b/' + p + '\n';
    if (!added.length) return o.isNew ? head.split('--- /dev/null')[0].replace('1111111', 'e69de29') : head;
    return head + '@@ -' + (o.isNew ? '0,0' : '5,0') + ' +' + (o.isNew ? '1' : '6') + ',' + added.length + ' @@\n' +
        added.map(l => '+' + l).join('\n') + '\n';
};
const withDiff = (paths, testDiff) => tdd.classifyFromEvents(paths, [], { testDiff }).status;

// The named bypasses.
assert('impl + a 0-byte test_billing.py is no_tests',
    withDiff(['src/billing.py', 'test_billing.py'], fileDiff('test_billing.py', [], { isNew: true })), 'no_tests');
assert('impl + one blank line added to an unrelated test is no_tests',
    withDiff(['src/billing.py', 'tests/test_other.py'], fileDiff('tests/test_other.py', [''])), 'no_tests');
assert('impl + whitespace-only lines added to a test is no_tests',
    withDiff(['src/billing.py', 'tests/test_other.py'], fileDiff('tests/test_other.py', ['    ', '\t'])), 'no_tests');
assert('an empty test diff string is no_tests',
    withDiff(['src/billing.py', 'tests/test_other.py'], ''), 'no_tests');
// Comments cannot satisfy it, in any of the comment syntaxes in use.
for (const [p, line] of [
    ['tests/test_billing.py', '# assert bill() == 1'],
    ['tests/test_billing.py', '    # def test_bill():'],
    ['src/billing.test.js', '// expect(bill()).toBe(1);'],
    ['src/billing.test.js', ' * it("bills", () => {})'],
    ['src/billing.test.js', '/* test("bills") */'],
    ['src/billing.test.js', '/* it( */'],
    ['tests/billing_test.c', '#  assert(x)'],
    ['src/test/java/BillingTest.java', '// @Test'],
    ['tests/test_billing.sql', '-- SELECT ok(true);'],
    ['spec/billing_spec.rb', '# expect(bill).to eq(1)'],
]) {
    assert('a comment is not test code: ' + line.trim(),
        withDiff(['src/billing.py', p], fileDiff(p, [line])), 'no_tests');
}
// Only ADDED lines count. A removed assertion is not a new test.
assert('a removed assertion is not test code', withDiff(['src/billing.py', 'tests/test_b.py'],
    'diff --git a/tests/test_b.py b/tests/test_b.py\nindex 1..2 100644\n--- a/tests/test_b.py\n+++ b/tests/test_b.py\n' +
    '@@ -3 +2,0 @@\n-    assert bill() == 1\n'), 'no_tests');
// Diff headers are not added lines, even when the path looks like test code.
assert('a +++ header is not an added line', withDiff(['src/billing.py', 'tests/test_b.py'],
    fileDiff('tests/test_b.py', [], { isNew: false })), 'no_tests');

// Honest test edits count, whatever their style. The rule is "an added line that is
// neither blank nor a comment", so none of these can be falsely blocked: this repo's
// own helpers, parametrize and table rows, a changed expected value outside an
// assert line, and styles a per-language shape list would miss.
for (const [p, line] of [
    ['src/hooks/test-billing.sh', 'run_test "bills" \\'],
    ['src/hooks/test-billing.js', "ok('bills', bill() === 1);"],
    ['src/hooks/test-billing.js', "blocks('git commit -a', run('git commit -a'));"],
    ['src/hooks/test-billing.js', "allows('git status', run('git status'));"],
    ['tests/test_billing.py', '    (1, 2),'],
    ['src/billing.test.js', '    [1, 2],'],
    ['billing_test.go', '\t\t{"a", 1, 2},'],
    ['tests/test_billing.py', '@pytest.mark.parametrize("a,b", ['],
    ['tests/test_billing.py', '    expected = 5'],
    ['spec/billing_spec.rb', '  it { is_expected.to be_ok }'],
    ['src/test/java/BillingTest.java', '    public void testBill() {'],
    ['billing_test.go', '\tif !reflect.DeepEqual(got, want) {'],
    ['tests/billing_test.rs', '#[test]'],
    ['tests/BillingTest.php', '    #[Test]'],
    ['tests/BillingTests.swift', '    #expect(bill() == 1)'],
    ['tests/BillingTests.swift', '    #require(bill() != nil)'],
    ['tests/billing_test.c', '#include "billing.h"'],
    ['tests/billing_test.c', '#define WANT 1'],
    ['tests/test_login.robot', '*** Test Cases ***'],
    ['tests/billing_test.c', '    *out = bill();'],
    ['tests/test_billing.py', 'def test_x():'],
    ['src/billing.spec.ts', '  expect(bill()).toBe(1);'],
]) {
    assert('honest test edit counts: ' + p.split('.').pop() + ': ' + line.trim(),
        withDiff(['src/billing.py', p], fileDiff(p, [line])), 'not_applicable');
}
// A docstring-only addition is a comment in all but name.
assert('a docstring-only addition is no_tests', withDiff(['src/billing.py', 'tests/test_b.py'],
    fileDiff('tests/test_b.py', ['    """', '    assert bill() == 1', '    """'])), 'no_tests');
assert('a one-line docstring addition is no_tests', withDiff(['src/billing.py', 'tests/test_b.py'],
    fileDiff('tests/test_b.py', ["    '''Bills once.'''"])), 'no_tests');
assert('code after a closed docstring counts', withDiff(['src/billing.py', 'tests/test_b.py'],
    fileDiff('tests/test_b.py', ['    """Bills.', '    """', '    assert bill() == 1'])), 'not_applicable');
// A real test among several test files is enough; the blank one does not veto it.
assert('one real test among a blank-line test change passes',
    withDiff(['src/billing.py', 'tests/test_a.py', 'tests/test_b.py'],
        fileDiff('tests/test_a.py', ['']) + fileDiff('tests/test_b.py', ['def test_b():', '    assert True'])),
    'not_applicable');
// A docstring left open in one file does not swallow the next file's code.
assert('an unclosed docstring does not cross into the next file',
    withDiff(['src/billing.py', 'tests/test_a.py', 'tests/test_b.py'],
        fileDiff('tests/test_a.py', ['"""']) + fileDiff('tests/test_b.py', ['    assert True'])),
    'not_applicable');
// The order verdict is still reached once presence is satisfied.
assert('presence satisfied, then order is judged (test first)',
    tdd.classifyFromEvents(['src/a.js', 'src/test-a.js'], [mk('src/test-a.js', 0), mk('src/a.js', 1)],
        { testDiff: fileDiff('src/test-a.js', ["assert('a', a(), 1);"]) }).status, 'test_first');
assert('presence not satisfied wins over order',
    tdd.classifyFromEvents(['src/a.js', 'src/test-a.js'], [mk('src/test-a.js', 0), mk('src/a.js', 1)],
        { testDiff: fileDiff('src/test-a.js', ['']) }).status, 'no_tests');
// Unreadable.
assert('a null test diff is unreadable', withDiff(['src/billing.py', 'tests/test_b.py'], null), 'unreadable');
assert('a non-string test diff is unreadable',
    withDiff(['src/billing.py', 'tests/test_b.py'], undefined), 'unreadable');
// No impl: nothing to pair, so the diff is not consulted.
assert('tests only with a null diff is still not applicable',
    withDiff(['tests/test_b.py'], null), 'not_applicable');
// No test path at all is no_tests whatever the diff says.
assert('impl only with a null diff is still no_tests', withDiff(['src/billing.py'], null), 'no_tests');
// The convenience wrapper forwards it.
assert('classifyTddOrder forwards testDiff', tdd.classifyTddOrder({
    stagedPaths: ['src/billing.py', 'test_billing.py'], transcriptPath: '',
    testDiff: fileDiff('test_billing.py', [], { isNew: true }) }).status, 'no_tests');
// A path the diff header quotes is still read.
assert('a quoted header path still counts its test code', withDiff(['src/billing.py', 'tests/test_"q".py'],
    'diff --git "a/tests/test_\\"q\\".py" "b/tests/test_\\"q\\".py"\nindex 1..2 100644\n' +
    '--- "a/tests/test_\\"q\\".py"\n+++ "b/tests/test_\\"q\\".py"\n@@ -1,0 +2 @@\n+def test_q():\n'),
    'not_applicable');

console.log('\n=================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
