// PreToolUse hook: Block git commit commands missing Co-Authored-By trailer
// Ensures all Claude-generated commits are explicitly attributed
const fs = require('fs');

// Read hook input from stdin (Claude Code pipes JSON to hooks via stdin)
let hookData = {};
try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) {}
const input = hookData.tool_input?.command || '';

function approve() {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

// Only intercept git commit commands (not amend -- those inherit the message)
if (!input.includes('git commit') || input.includes('--amend')) {
    approve();
}

// Skip commits that don't use -m (e.g. --allow-empty, merge commits)
if (!input.includes('-m')) {
    approve();
}

// Check for Co-Authored-By anywhere in the command (covers heredoc and inline)
if (input.includes('Co-Authored-By:')) {
    approve();
}

console.log(JSON.stringify({
    decision: 'block',
    reason: 'Git commits must include a Co-Authored-By trailer for Claude attribution'
}));
