#!/usr/bin/env node
// PreToolUse hook on the Agent tool: keeps volume work on Sonnet. A general-purpose,
// Explore or Plan dispatch with no model is rewritten to Sonnet; an Opus or Fable
// dispatch must carry a "TIER: opus: <reason>" line in its prompt or it is denied.
// It also appends the shared context-budget block to those prompts (lib/context-budget.js).
// Threat model: honest habit, not adversarial input. This is a cost gate, so any
// parse error or odd input prints nothing and exits 0 (fail open).
'use strict';

const { deny } = require('./lib/hook-output');
const { withBudget } = require('./lib/context-budget');
const { agent } = require('./lib/plugin-names');

// Agent types whose model this gate steers. Every other type decides its own model:
// sdlc:* reviewers via sdlc-review.json, fork by inheriting, user agents by frontmatter.
// An empty or missing type means general-purpose.
const GATED_TYPES = new Set(['', 'general-purpose', 'explore', 'plan', 'implementer', agent('implementer')]);

const EXPENSIVE_MODEL = /opus|fable/i;
const TIER_LINE = /^\s*tier:\s*(?:opus|fable)\s*[:\-–—]\s*\S/im;

const DENY_REASON = 'Opus dispatch without a stated reason. Opus is for plans, plan source review and judgement calls. Add a line "TIER: opus: <why>" to the prompt, or dispatch with model: "sonnet".';

// Builds the allow output that carries the rewritten input.
//
// Args:
//   updatedInput: the full tool input to run with.
// Returns:
//   the object to print.
function allowWith(updatedInput) {
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'allow',
            updatedInput,
        },
    };
}

// Builds an output that rewrites the input and states no permission decision.
//
// Args:
//   updatedInput: the full tool input to run with.
// Returns:
//   the object to print.
function updateOnly(updatedInput) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput } };
}

// Decides what to print for one Agent call: the tier decision, then the
// context-budget append on top of it. One hook writes updatedInput so two
// rewrites cannot clobber each other.
//
// Args:
//   toolInput: the Agent tool's input object.
// Returns:
//   the object to print, or null to leave the call untouched.
function decide(toolInput) {
    const tier = decideTier(toolInput);
    if (tier && tier.hookSpecificOutput.permissionDecision === 'deny') return tier;
    try {
        const type = typeof toolInput.subagent_type === 'string' ? toolInput.subagent_type.trim() : '';
        if (!GATED_TYPES.has(type.toLowerCase())) return tier;
        const base = tier ? tier.hookSpecificOutput.updatedInput : toolInput;
        const prompt = withBudget(base.prompt);
        if (prompt === null) return tier;
        // A tier rewrite already carries allow. A budget-only append carries
        // updatedInput alone: probed on claude -p, the sub-agent saw the appended
        // text with no permissionDecision, so the user's own prompt rules still apply.
        return tier ? allowWith({ ...base, prompt }) : updateOnly({ ...base, prompt });
    } catch (e) {
        // Fail open: the budget is a nicety; the tier decision stands as it was.
        return tier;
    }
}

// Decides the tier gate's own output for one Agent call.
//
// Args:
//   toolInput: the Agent tool's input object.
// Returns:
//   the object to print, or null to leave the call untouched.
function decideTier(toolInput) {
    const type = typeof toolInput.subagent_type === 'string' ? toolInput.subagent_type.trim() : '';
    if (!GATED_TYPES.has(type.toLowerCase())) return null;

    // A non-string model is odd input: leave the call alone (fail open).
    if (toolInput.model !== undefined && toolInput.model !== null && typeof toolInput.model !== 'string') return null;
    const model = typeof toolInput.model === 'string' ? toolInput.model.trim() : '';
    // "inherit" runs the sub-agent on the parent's model (Opus) with no stated reason,
    // so it counts as no model at all.
    if (!model || model.toLowerCase() === 'inherit') {
        // allow skips an interactive permission prompt for this Agent call, and
        // deny rules still win. Accepted here: the rewrite only lowers the model
        // tier, and the rewrite needs a decision on the model change.
        return allowWith({ ...toolInput, model: 'sonnet' });
    }
    if (EXPENSIVE_MODEL.test(model)) {
        const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : '';
        return TIER_LINE.test(prompt) ? null : deny(DENY_REASON, '');
    }
    return null;
}

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
    try {
        const input = JSON.parse(raw);
        const toolInput = input && input.tool_input;
        if (!toolInput || typeof toolInput !== 'object') return;
        const out = decide(toolInput);
        if (out) process.stdout.write(JSON.stringify(out));
    } catch (e) {
        // Fail open: a cost gate must never break a dispatch.
    }
});
