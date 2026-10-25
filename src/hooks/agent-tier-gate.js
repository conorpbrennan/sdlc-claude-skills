#!/usr/bin/env node
// PreToolUse hook on the Agent tool: keeps volume work on Sonnet. A general-purpose,
// Explore or Plan dispatch with no model is rewritten to Sonnet; an Opus or Fable
// dispatch must carry a "TIER: opus: <category>" line in its prompt or it is denied.
// The category is one of: plan writing, plan source review, fail triage (all allowed),
// or user asked (raises a confirm prompt for the owner). Text after the category is
// free. Plan writing is for NEW plans only: when the description or the first sentence of
// the prompt shows an edit of an existing plan (fold, revise, amend, edit, apply findings,
// add to a plan), the dispatch is denied and runs on Sonnet. The check is a keyword
// match on honest wording; a prompt that hides an edit under a neutral description
// passes, and that is a known gap. Any other reason, such as "design judgement", is denied: re-dispatch on Sonnet.
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
const TIER_LINE = /^\s*tier:\s*(?:opus|fable)\s*[:\-–—]\s*(\S.*)$/im;

// The reason must start with one of these (after normalising). ALLOW passes silently,
// ASK raises a confirm prompt for the owner.
const CATEGORY_ALLOW = 'allow';
const CATEGORY_ASK = 'ask';
const TIER_CATEGORIES = [
    ['plan writing', CATEGORY_ALLOW],
    ['plan source review', CATEGORY_ALLOW],
    ['fail triage', CATEGORY_ALLOW],
    ['user asked', CATEGORY_ASK],
];

const PLAN_WRITING = 'plan writing';

// Wording that shows an edit of an existing plan: fold, revise, amend, edit, apply findings,
// update the plan, or "add ... to ... plan" (all within one sentence).
const PLAN_EDIT = /\b(?:fold(?:s|ed|ing)?|revis(?:e|es|ed|ing|ion)|amend(?:s|ed|ing)?|edit(?:s|ed|ing)?|appl(?:y|ies|ying) (?:\w+ )?findings|update (?:the|a) plan|add\b[^.!?\n]*\bto\b[^.!?\n]*\bplan)\b/i;

// Matches the category words that open the text after the TIER prefix, with the separators after them.
const PLAN_WRITING_OPENER = /^\s*plan[\s_-]+writing[\s.:;,\-–—]*/i;

const DENY_REASON = 'Opus and Fable dispatches run only for: plan writing (new plans only), plan source review, fail triage, or user asked. Add a line "TIER: opus: <category>" to the prompt with one of those four categories, or dispatch with model: "sonnet".';

const PLAN_EDIT_DENY_REASON = 'Plan writing is for new plans. Folding findings into, revising or adding to an existing plan runs on Sonnet: re-dispatch with model: "sonnet", or use "TIER: opus: user asked" if the owner wants Opus.';

// Normalises a TIER reason for category matching.
//
// Args:
//   reason: the text after the TIER prefix.
// Returns:
//   the reason lowercased, with - and _ as spaces and whitespace runs collapsed.
function normaliseReason(reason) {
    return reason.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Finds the category a TIER reason starts with.
//
// Args:
//   reason: the text after the TIER prefix.
// Returns:
//   the CATEGORY_* kind for the matching category, or null when none matches.
function categoryKind(reason) {
    const text = normaliseReason(reason);
    for (const [name, kind] of TIER_CATEGORIES) {
        if (!text.startsWith(name)) continue;
        // The category must end at a word boundary: a following letter or digit is a different word.
        if (!/[a-z0-9]/.test(text.charAt(name.length))) return kind;
    }
    return null;
}

// Tells whether an Agent call labelled plan writing is really an edit of an existing plan.
// It reads the description and the first sentence of the prompt after the TIER line.
//
// Args:
//   description: the dispatch description, or any non-string when absent.
//   prompt: the full prompt text.
//   match: the TIER_LINE match on the prompt.
// Returns:
//   true when either text shows an edit of an existing plan.
function isPlanEdit(description, prompt, match) {
    if (typeof description === 'string' && PLAN_EDIT.test(description)) return true;
    const afterTier = prompt.slice(match.index + match[0].length - match[1].length);
    const opening = afterTier.replace(PLAN_WRITING_OPENER, '').trimStart();
    const sentence = opening.split(/[.!?](?:\s|$)|\n/)[0];
    return PLAN_EDIT.test(sentence);
}

// Builds the ask output for an owner-requested model. The owner reads the reason in the prompt.
//
// Args:
//   model: the requested model name.
//   description: the dispatch description, or any non-string when absent.
//   updatedInput: the tool input to run with if approved.
// Returns:
//   the object to print.
function askWith(model, description, updatedInput) {
    const label = typeof description === 'string' && description ? ` "${description}"` : '';
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason: `Sub-agent${label} wants ${model}, stated as owner-requested. Approve only if you asked for this model; otherwise deny and it re-dispatches on Sonnet.`,
            updatedInput,
        },
    };
}

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
        // A tier rewrite already carries its decision (allow or ask). A budget-only append carries
        // updatedInput alone: probed on claude -p, the sub-agent saw the appended
        // text with no permissionDecision, so the user's own prompt rules still apply.
        if (!tier) return updateOnly({ ...base, prompt });
        const next = { ...tier, hookSpecificOutput: { ...tier.hookSpecificOutput, updatedInput: { ...base, prompt } } };
        return next;
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
        const match = TIER_LINE.exec(prompt);
        const kind = match ? categoryKind(match[1]) : null;
        if (kind === CATEGORY_ALLOW) {
            if (normaliseReason(match[1]).startsWith(PLAN_WRITING) && isPlanEdit(toolInput.description, prompt, match)) {
                return deny(PLAN_EDIT_DENY_REASON, '');
            }
            return null;
        }
        if (kind === CATEGORY_ASK) return askWith(model, toolInput.description, toolInput);
        return deny(DENY_REASON, '');
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
