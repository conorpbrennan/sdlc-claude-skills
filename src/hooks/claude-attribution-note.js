// PostToolUse hook: Add structured git note with Claude attribution metadata
// Attaches machine-readable metadata to commits without modifying the commit itself
const { execSync } = require('child_process');

const input = process.env.CLAUDE_TOOL_INPUT || '';

// Only run after git commit (not amend -- note already exists on original)
if (!input.includes('git commit') || input.includes('--amend')) {
    process.exit(0);
}

// Verify we're in a git repo
try {
    execSync('git rev-parse --is-inside-work-tree', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
    });
} catch (e) {
    process.exit(0);
}

const note = [
    'ai-generated: true',
    'tool: claude-code',
    'model: claude-opus-4-6',
    'timestamp: ' + new Date().toISOString(),
].join('\n');

try {
    execSync('git notes --ref=claude-attribution append -m ' + JSON.stringify(note), {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
    });
} catch (e) {
    // Note failure is non-fatal -- don't break the workflow
}
