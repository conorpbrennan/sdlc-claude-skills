// The context-budget block appended to generic sub-agent prompts by
// agent-tier-gate.js. Every tool result stays in a sub-agent's context and is
// re-read on each later turn, so the block asks for small results without
// cutting what the agent needs. Deliberately soft: no hard turn count, no blind tail, no stop-and-hand-back.
'use strict';

const BUDGET_MARKER = '## Context budget (sdlc)';

const BUDGET_BLOCK = `${BUDGET_MARKER}
Every tool result stays in your context and is re-read on every later turn. Keep it small without losing what you need:
- Bound command output to what answers the question: failures only (\`pytest -q\`, \`--quiet\`, \`grep -E\` on the log). Use head/tail only when you know where the answer sits. If the cause is not visible, rerun narrower; never guess from cut-off output.
- Locate before reading: Grep or Glob first, then Read with offset/limit around the hit. Read a whole file when you need the whole file.
- Do not re-read a file or re-run a command whose output you already have.
- If you expect the task to need more than about 40 tool calls, say so in your first progress note, then finish the task. Do not stop early to hand back.`;

// Returns the prompt with the budget block appended, or null when it must stay as is.
//
// Args:
//   prompt: the Agent call's prompt, any type.
// Returns:
//   the new prompt string, or null if the prompt is not a non-empty string or
//   already carries the marker.
function withBudget(prompt) {
    if (typeof prompt !== 'string' || !prompt.trim()) return null;
    if (prompt.includes(BUDGET_MARKER)) return null;
    return `${prompt}\n\n${BUDGET_BLOCK}`;
}

module.exports = { BUDGET_MARKER, BUDGET_BLOCK, withBudget };
