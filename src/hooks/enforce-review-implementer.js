// UserPromptSubmit hook: Enforce use of code-review-implementer skill
// When user asks to implement/fix/apply code review findings, inject a
// systemMessage directing Claude to use the skill with a Sonnet subagent.
const fs = require('fs');
const { skill } = require('./lib/plugin-names');

// Read hook input from stdin (Claude Code pipes JSON to hooks via stdin)
let hookData = {};
try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) {}
const input = hookData.user_prompt || hookData.content || '';

function approve(msg) {
    const result = { decision: 'approve' };
    if (msg) result.systemMessage = msg;
    console.log(JSON.stringify(result));
    process.exit(0);
}

// Normalize for matching
const lower = input.toLowerCase();

// Must mention review-related terms
const reviewTerms = ['review', 'finding', 'findings', 'actionable', 'critical issue', 'important issue', 'advisory'];
const hasReview = reviewTerms.some(t => lower.includes(t));

// Must mention implementation-related terms
const implTerms = ['implement', 'fix', 'apply', 'address', 'resolve', 'remediate'];
const hasImpl = implTerms.some(t => lower.includes(t));

if (!hasReview || !hasImpl) {
    approve();
}

// Both conditions met -- inject enforcement message
approve(
    'ENFORCE_REVIEW_IMPLEMENTER: The user is requesting implementation of code review findings. ' +
    'You MUST use the ' + skill('code-review-implementer') + ' skill (invoke via Skill tool with skill: "' +
    skill('code-review-implementer') + '") ' +
    'to handle this. Do NOT implement the changes directly -- delegate to a Sonnet subagent as the skill requires. ' +
    'Pass the appropriate scope argument (all, critical, important, or item numbers) based on the user\'s request.'
);
