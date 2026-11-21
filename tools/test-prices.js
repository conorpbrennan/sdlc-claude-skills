// Tests for tools/lib/prices.js: per-model-id list prices and the cost functions.
// Run: node tools/test-prices.js
'use strict';

// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('../src/hooks/lib/isolate-git-env.js').isolateGitEnv();

const { family, priceFor, cost, cacheWriteCost } = require('./lib/prices.js');

const M = 1e6;
let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS: ' + name); }
    else { failed += 1; console.log('  FAIL: ' + name + (detail !== undefined ? ' -- ' + JSON.stringify(detail) : '')); }
}

function near(a, b) {
    return typeof a === 'number' && Math.abs(a - b) < 1e-9;
}

// Columns: label, model, usage, expected USD.
const COST_ROWS = [
    ['opus-5-5 mixed usage', 'claude-opus-5-5',
        { input_tokens: M, output_tokens: M, cache_read_input_tokens: M,
            cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: M / 2 } },
        // 4 + 20 + 0.20 + 0.5M 5m write (4*1.25*0.5=2.5) + 0.5M 1h write (4*2*0.5=4)
        4 + 20 + 0.2 + 2.5 + 4],
    ['sonnet-5-5 1M cache read', 'claude-sonnet-5-5', { cache_read_input_tokens: M }, 0.10],
    ['sonnet-5-5 1M 5m write', 'claude-sonnet-5-5', { cache_creation_input_tokens: M }, 2.5],
    ['sonnet-5-5 1M 1h write', 'claude-sonnet-5-5',
        { cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: M } }, 4],
    // Prompt exactly 100,000: low tier. 100K * 0.10 / 1M = 0.01
    ['haiku-5-5 prompt exactly 100,000', 'claude-haiku-5-5', { input_tokens: 100000 }, 0.01],
    // Prompt 100,001 (60,000 cache reads): long tier on every token.
    // 40,001*0.50 + 60,000*0.05 = 20000.5 + 3000 = 23000.5 per M; + 1000 output * 2.50 = 2500
    ['haiku-5-5 100,001 with 60,000 cache reads', 'claude-haiku-5-5',
        { input_tokens: 40001, cache_read_input_tokens: 60000, output_tokens: 1000 }, (23000.5 + 2500) / M],
    ['fable-5-1 1M input and 1M output', 'claude-fable-5-1', { input_tokens: M, output_tokens: M }, 60],
    ['fable-5-2 1M input and 1M output', 'claude-fable-5-2', { input_tokens: M, output_tokens: M }, 48],
    ['unknown family', 'claude-mystery-1', { input_tokens: M, output_tokens: M }, 0],
];

for (const [label, model, usage, expected] of COST_ROWS) {
    const got = cost(model, usage);
    ok('cost: ' + label, near(got, expected), { got, expected });
}

const FAMILY_ROWS = [
    ['claude-opus-5-5', 'opus'], ['claude-sonnet-5-5', 'sonnet'], ['claude-haiku-5-5', 'haiku'],
    ['claude-fable-5-1', 'fable'], ['claude-fable-5-2', 'fable'], ['claude-mystery-1', 'other'], [undefined, 'other'],
];
for (const [model, expected] of FAMILY_ROWS) {
    ok('family of ' + model, family(model) === expected, family(model));
}

ok('priceFor unknown model is null', priceFor('claude-mystery-1', 0) === null);
ok('cacheWriteCost unknown model is zero', cacheWriteCost('claude-mystery-1', { cache_creation_input_tokens: M }).w5m === 0);
const hw = cacheWriteCost('claude-haiku-5-5', { input_tokens: 100000, cache_creation_input_tokens: 1 });
ok('cacheWriteCost uses the long-tier input rate', near(hw.w5m, 0.5 * 1.25 / M), hw);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
