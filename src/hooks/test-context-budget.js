// Tests for lib/context-budget.js: the block text and the idempotent append.
require('./lib/isolate-git-env.js').isolateGitEnv();

const { BUDGET_MARKER, BUDGET_BLOCK, withBudget } = require('./lib/context-budget.js');

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}\n    expected: ${e}\n    actual:   ${a}`);
        failed++;
    }
}

console.log('block');
assert('block starts with the marker', BUDGET_BLOCK.startsWith(BUDGET_MARKER), true);
assert('block states the tool-call ceiling', BUDGET_BLOCK.includes('more than about 40 tool calls'), true);
assert('block tells the agent to finish the task', BUDGET_BLOCK.includes('finish the task'), true);
assert('block has no stop-and-report instruction', /stop, report what is done/i.test(BUDGET_BLOCK), false);
assert('block forbids handing back early', BUDGET_BLOCK.includes('Do not stop early to hand back.'), true);

console.log('withBudget');
assert('appends after a blank line', withBudget('task'), `task\n\n${BUDGET_BLOCK}`);
assert('second pass is a no-op', withBudget(withBudget('task')), null);
assert('marker anywhere blocks the append', withBudget(`a ${BUDGET_MARKER} b`), null);
for (const p of [undefined, null, '', '  \n', 7, {}, ['x']]) {
    assert(`non-prompt left alone: ${JSON.stringify(p)}`, withBudget(p), null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
