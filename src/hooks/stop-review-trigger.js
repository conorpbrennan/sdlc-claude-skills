// Stop hook: Enforce code review before session ends
// Gate sequence: Lock -> Git repo -> Code changes -> Marker -> Block
// Circuit breaker: lock file prevents re-entry for 5 minutes
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.USERPROFILE || process.env.HOME;
const MARKER_FILE = path.join(HOME, '.claude-last-review');
const LOCK_FILE = path.join(HOME, '.claude-review-in-progress');
const PENDING_FILE = path.join(HOME, '.claude-pending-review');
const MARKER_MAX_AGE_MS = 10 * 60 * 1000;
const LOCK_MAX_AGE_MS = 5 * 60 * 1000;

const SOURCE_EXTENSIONS = [
    '.py', '.java', '.js', '.ts', '.tsx', '.jsx',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs',
    '.rb', '.php', '.swift', '.kt', '.scala', '.sql'
];

const EXCLUDE_PATTERNS = [
    /^\.claude\//, /^\.vscode\//, /^\.idea\//,
    /^node_modules\//, /^__pycache__\//
];

function approve() {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

function isFileFresh(filePath, maxAge) {
    try {
        const stat = fs.statSync(filePath);
        return (Date.now() - stat.mtimeMs) < maxAge;
    } catch (e) {
        return false;
    }
}

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

function getChangedCodeFiles() {
    try {
        const output = execSync('git diff --name-only && git diff --name-only --staged', {
            encoding: 'utf-8',
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const files = [...new Set(output.trim().split('\n').filter(f => f.length > 0))];
        return files.filter(file => {
            if (EXCLUDE_PATTERNS.some(p => p.test(file))) return false;
            const ext = path.extname(file).toLowerCase();
            return SOURCE_EXTENSIONS.includes(ext);
        });
    } catch (e) {
        return [];
    }
}

// Gate 1: Lock file fresh -> approve (circuit breaker)
if (isFileFresh(LOCK_FILE, LOCK_MAX_AGE_MS)) {
    approve();
}

// Gate 2: Not in git repo -> approve
if (!isInsideGitRepo()) {
    approve();
}

// Gate 3: No code files changed -> check pending review marker
const codeFiles = getChangedCodeFiles();

// Gate 3.5: Pending review marker exists and fresh -> block (committed but unreviewed)
if (codeFiles.length === 0 && isFileFresh(PENDING_FILE, MARKER_MAX_AGE_MS)) {
    try {
        const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
        const pendingFiles = pending.files.join(', ');
        fs.writeFileSync(LOCK_FILE, new Date().toISOString(), 'utf-8');
        console.log(JSON.stringify({
            decision: 'block',
            reason: 'Post-commit code review not completed',
            systemMessage: 'POST_COMMIT_REVIEW: Run /code-review --fresh on: ' + pendingFiles + '. After review completes, run: touch ~/.claude-last-review && rm -f ~/.claude-pending-review'
        }));
        process.exit(0);
    } catch (e) {
        // Fall through if marker can't be read
    }
}

if (codeFiles.length === 0) {
    approve();
}

// Gate 4: Marker file fresh -> approve (recent review completed)
if (isFileFresh(MARKER_FILE, MARKER_MAX_AGE_MS)) {
    approve();
}

// All gates failed -> block and create lock file
try {
    fs.writeFileSync(LOCK_FILE, new Date().toISOString(), 'utf-8');
} catch (e) {
    // Lock file write failure is non-fatal
}

const fileList = codeFiles.join(', ');
console.log(JSON.stringify({
    decision: 'block',
    reason: 'Code review required',
    systemMessage: 'REVIEW_REQUIRED: Run /code-review --context on these modified files before stopping: ' + fileList + '. After review completes, run: touch ~/.claude-last-review'
}));
