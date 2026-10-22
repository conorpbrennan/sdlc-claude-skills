// Tests for lib/added-tests.js: the shape of the tests a unified diff adds.
//
// One table of unified diffs with the expected counts, one loop, one assert per
// field. The `+++` case proves a file header that mentions `def test_` is never
// counted as an added line.
require('./lib/isolate-git-env.js').isolateGitEnv();

const { countAddedTests } = require('./lib/added-tests.js');

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

function diff(file, lines) {
    return [
        `diff --git a/${file} b/${file}`,
        `--- a/${file}`,
        `+++ b/${file}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map(l => '+' + l),
        '',
    ].join('\n');
}

const CASES = [
    {
        name: 'py single test',
        diff: diff('tests/test_a.py', [
            'def test_a():', '    assert f() == 1',
        ]),
        want: { testFunctions: 1, testLines: 2, sourceLines: 0, parametrised: 0, singleAssert: 1, mockOnly: 0 },
    },
    {
        name: 'py parametrised with three rows',
        diff: diff('tests/test_b.py', [
            '@pytest.mark.parametrize("x", [',
            '    1,', '    2,', '    3,',
            '])',
            'def test_b(x):',
            '    assert f(x) == x',
        ]),
        want: { testFunctions: 1, testLines: 7, sourceLines: 0, parametrised: 1, singleAssert: 1, mockOnly: 0 },
    },
    {
        name: 'py mock-only',
        diff: diff('tests/test_c.py', [
            'def test_c(m):',
            '    run(m)',
            '    m.send.assert_called_once()',
        ]),
        want: { testFunctions: 1, testLines: 3, sourceLines: 0, parametrised: 0, singleAssert: 1, mockOnly: 1 },
    },
    {
        name: 'js test(',
        diff: diff('src/foo.test.js', [
            "test('adds', () => {", '    expect(add(1, 2)).toBe(3);', '});',
        ]),
        want: { testFunctions: 1, testLines: 3, sourceLines: 0, parametrised: 0, singleAssert: null, mockOnly: null },
    },
    {
        name: 'java @Test',
        diff: diff('src/test/java/FooTest.java', [
            '@Test', 'void adds() {', '    assertEquals(3, add(1, 2));', '}',
        ]),
        want: { testFunctions: 1, testLines: 4, sourceLines: 0, parametrised: 0, singleAssert: null, mockOnly: null },
    },
    {
        name: 'go TestMain is not a test',
        diff: diff('pkg/foo_test.go', ['func TestMain(m *testing.M) {', '    os.Exit(m.Run())', '}']),
        want: { testFunctions: 0, testLines: 3, sourceLines: 0, parametrised: 0, singleAssert: null, mockOnly: null },
    },
    {
        name: 'go TestFoo is a test',
        diff: diff('pkg/foo_test.go', ['func TestFoo(t *testing.T) {', '    Add(1, 2)', '}']),
        want: { testFunctions: 1, testLines: 3, sourceLines: 0, parametrised: 0, singleAssert: null, mockOnly: null },
    },
    {
        name: 'js test.each is one function, one parametrised',
        diff: diff('src/foo.test.js', ['test.each([[1, 2], [3, 4]])("adds %i", (a, b) => {', '  expect(a).toBe(a);', '});']),
        want: { testFunctions: 1, testLines: 3, sourceLines: 0, parametrised: 1, singleAssert: null, mockOnly: null },
    },
    {
        name: 'source-only diff',
        diff: diff('src/foo.py', ['def test_not_a_test_file():', '    return 1']),
        want: { testFunctions: 0, testLines: 0, sourceLines: 2, parametrised: 0, singleAssert: null, mockOnly: null },
    },
    {
        name: 'test file with only a comment added',
        diff: diff('tests/test_d.py', ['# def test_commented():']),
        want: { testFunctions: 0, testLines: 0, sourceLines: 0, parametrised: 0, singleAssert: 0, mockOnly: 0 },
    },
    {
        name: '+++ header that mentions def test_',
        diff: [
            'diff --git a/src/x.py b/src/x.py',
            '--- a/src/x.py',
            '+++ b/tests/def test_header.py',
            '@@ -1 +1 @@',
            '+x = 1',
            '',
        ].join('\n'),
        want: { testFunctions: 0, testLines: 1, sourceLines: 0, parametrised: 0, singleAssert: 0, mockOnly: 0 },
    },
];

console.log('added-tests');
console.log('===========');
for (const c of CASES) {
    const got = countAddedTests(c.diff);
    console.log(`\n${c.name}:`);
    for (const field of Object.keys(c.want)) {
        assert(`${c.name}: ${field}`, got[field], c.want[field]);
    }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
