// List prices per model id, and the cost of one API message. Single owner of the
// price tables: tools/model-spend.js and tools/usage-fit.js price through `cost`.
'use strict';

// List prices in USD per million tokens, from the live price page. An estimate: it
// ignores discounts and anything the transcript does not record.
// Cache writes: 5-minute = 1.25x input, 1-hour = 2x input, on every model.
const PRICING_DATE = '21 Nov 2026';
const PRICING_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing.md';

// Family defaults: each is the newest model of its family.
// `longPrompt` rates apply to every token when the prompt (input + cache read +
// cache creation tokens of one usage object) is over `over`.
const PRICES = {
    opus: { input: 4, output: 20, cacheRead: 0.20 },
    sonnet: { input: 2, output: 10, cacheRead: 0.10 },
    haiku: {
        input: 0.10, output: 0.50, cacheRead: 0.01,
        longPrompt: { over: 100000, input: 0.50, output: 2.50, cacheRead: 0.05 },
    },
    fable: { input: 8, output: 40, cacheRead: 0.20 },
};

// Exact-id overrides, checked before the family default.
const MODEL_PRICES = {
    // Fable 5.2: $8/$40, cache read $0.20 (5m write $10, 1h write $16 via the multipliers
    // below). Source: bundled claude-api reference, shared/models.md, cached 3 Nov 2026.
    // Explicit so a change to the family default cannot move it silently.
    'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.20 },
    'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
};

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const OTHER = 'other';
const PER_MTOK = 1e6;

// Family of a model id, by substring.
//
// Args:
//   model: model id string, possibly missing.
// Returns:
//   a key of PRICES, or OTHER.
function family(model) {
    const m = String(model || '');
    for (const k of Object.keys(PRICES)) if (m.includes(k)) return k;
    return OTHER;
}

// Rates for one message.
//
// Args:
//   model: model id string.
//   promptTokens: input + cache read + cache creation tokens of the one usage object.
// Returns:
//   {input, output, cacheRead} in USD per million tokens, or null for a model with no price.
function priceFor(model, promptTokens) {
    const p = Object.prototype.hasOwnProperty.call(MODEL_PRICES, model)
        ? MODEL_PRICES[model]
        : PRICES[family(model)];
    if (!p) return null;
    if (p.longPrompt && promptTokens > p.longPrompt.over) return p.longPrompt;
    return p;
}

// Prompt size of one usage object.
//
// Args:
//   u: the message's usage object.
// Returns:
//   input + cache read + cache creation tokens.
function promptTokens(u) {
    return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
}

// Estimated cost of one API message.
//
// Args:
//   model: model id string.
//   u: the message's usage object.
// Returns:
//   USD, 0 for a model with no price.
function cost(model, u) {
    const p = priceFor(model, promptTokens(u));
    if (!p) return 0;
    const w1h = ((u.cache_creation || {}).ephemeral_1h_input_tokens) || 0;
    const w5m = (u.cache_creation_input_tokens || 0) - w1h;
    return ((u.input_tokens || 0) * p.input
        + w5m * p.input * CACHE_WRITE_5M
        + w1h * p.input * CACHE_WRITE_1H
        + (u.cache_read_input_tokens || 0) * p.cacheRead
        + (u.output_tokens || 0) * p.output) / PER_MTOK;
}

// Cache-write cost of one API message, split by TTL.
//
// Args:
//   model: model id string.
//   u: the message's usage object.
// Returns:
//   {w5m, w1h} in USD, both 0 for a model with no price.
function cacheWriteCost(model, u) {
    const p = priceFor(model, promptTokens(u));
    if (!p) return { w5m: 0, w1h: 0 };
    const t1h = ((u.cache_creation || {}).ephemeral_1h_input_tokens) || 0;
    const t5m = (u.cache_creation_input_tokens || 0) - t1h;
    return { w5m: t5m * p.input * CACHE_WRITE_5M / PER_MTOK, w1h: t1h * p.input * CACHE_WRITE_1H / PER_MTOK };
}

module.exports = {
    PRICES, MODEL_PRICES, PRICING_DATE, PRICING_SOURCE, OTHER,
    family, priceFor, cost, cacheWriteCost,
};
