// PreToolUse hook: Block direct edits/writes to ~/.claude/ directory
// Enforces the rule that all changes must be made in the project directory
// first, then deployed via install-skills.sh
const fs = require('fs');
const userHome = process.env.USERPROFILE || process.env.HOME || '';

// Read hook input from stdin (Claude Code pipes JSON to hooks via stdin)
let hookData = {};
try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) {}
const parsed = hookData.tool_input || {};

const filePath = parsed.file_path || '';
if (!filePath) {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

const normalize = (p) => p.replace(/\\/g, '/').toLowerCase();
const normalizedPath = normalize(filePath);
const protectedDir = normalize(userHome) + '/.claude/';

// Allow writes to the auto-memory directory (~/.claude/projects/*/memory/)
const isMemoryWrite = /\/\.claude\/projects\/[^/]+\/memory\//.test(normalizedPath);
// Allow writes to the plan-mode directory (~/.claude/plans/)
const isPlanWrite = /\/\.claude\/plans\//.test(normalizedPath);

if (normalizedPath.startsWith(protectedDir) && !isMemoryWrite && !isPlanWrite) {
    console.log(JSON.stringify({
        decision: 'block',
        reason: 'Direct edits to ~/.claude/ are blocked. Make changes in the project directory first, then use install-skills.sh to deploy.'
    }));
} else {
    console.log(JSON.stringify({ decision: 'approve' }));
}
