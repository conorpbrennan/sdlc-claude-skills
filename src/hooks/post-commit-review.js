// PostToolUse hook: Trigger independent code review after git commit
// Writes pending-review marker and outputs systemMessage when committed files include source code
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.USERPROFILE || process.env.HOME;
const PENDING_FILE = path.join(HOME, '.claude-pending-review');

const input = process.env.CLAUDE_TOOL_INPUT || '';

if (!input.includes('git commit') || input.includes('--amend')) {
    process.exit(0);
}

const SOURCE_EXTENSIONS = [
    '.py', '.java', '.js', '.ts', '.tsx', '.jsx',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs',
    '.rb', '.php', '.swift', '.kt', '.scala', '.sql'
];

const EXCLUDE_PATTERNS = [
    /^\.claude\//, /^\.vscode\//, /^\.idea\//,
    /^node_modules\//, /^__pycache__\//
];

function isInsideGitRepo() {
    try {
        execSync('git rev-parse --is-inside-work-tree', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return true;
    } catch (e) {
        return false;
    }
}

function getCommittedFiles() {
    // Try diff-tree first (works for first commit too)
    try {
        const output = execSync('git diff-tree --no-commit-id --name-only -r HEAD', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const files = output.trim().split('\n').filter(f => f.length > 0);
        if (files.length > 0) return files;
    } catch (e) {
        // Fall through
    }

    // Fallback: git log
    try {
        const output = execSync('git log -1 --name-only --pretty=format:', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return output.trim().split('\n').filter(f => f.length > 0);
    } catch (e) {
        return [];
    }
}

if (!isInsideGitRepo()) {
    process.exit(0);
}

const allFiles = getCommittedFiles();
const codeFiles = allFiles.filter(file => {
    if (EXCLUDE_PATTERNS.some(p => p.test(file))) return false;
    const ext = path.extname(file).toLowerCase();
    return SOURCE_EXTENSIONS.includes(ext);
});

if (codeFiles.length === 0) {
    process.exit(0);
}

// Write pending-review marker so the PreToolUse gate can enforce review
try {
    const commitHash = execSync('git rev-parse --short HEAD', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    fs.writeFileSync(PENDING_FILE, JSON.stringify({
        commit: commitHash,
        files: codeFiles,
        timestamp: new Date().toISOString()
    }), 'utf-8');
} catch (e) {
    // Marker write failure is non-fatal
}

const fileList = codeFiles.join(', ');
console.log(JSON.stringify({
    systemMessage: 'POST_COMMIT_REVIEW: Run /code-review --fresh on the committed code files: ' + fileList + '. After review completes, run: touch ~/.claude-last-review && rm -f ~/.claude-pending-review'
}));
