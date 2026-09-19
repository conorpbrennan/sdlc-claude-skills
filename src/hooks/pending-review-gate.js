// PreToolUse hook: Block Bash commands until post-commit review is completed
// Gate sequence: No marker -> Lock fresh -> Block with review request
// Shares lock file with stop-review-trigger.js to prevent double-blocking
const fs = require('fs');
const path = require('path');

const HOME = process.env.USERPROFILE || process.env.HOME;
const PENDING_FILE = path.join(HOME, '.claude-pending-review');
const LOCK_FILE = path.join(HOME, '.claude-review-in-progress');
const MARKER_MAX_AGE_MS = 10 * 60 * 1000;
const LOCK_MAX_AGE_MS = 5 * 60 * 1000;

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

// Gate 1: No pending-review marker or stale (> 10 min) -> approve
if (!isFileFresh(PENDING_FILE, MARKER_MAX_AGE_MS)) {
    approve();
}

// Gate 2: Lock file fresh (< 5 min) -> approve (already requested review)
if (isFileFresh(LOCK_FILE, LOCK_MAX_AGE_MS)) {
    approve();
}

// Gate 3: Block. Create lock file and request review.
let pendingFiles = '';
try {
    const pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8'));
    pendingFiles = pending.files.join(', ');
} catch (e) {
    // If marker can't be read, approve rather than block with bad data
    approve();
}

try {
    fs.writeFileSync(LOCK_FILE, new Date().toISOString(), 'utf-8');
} catch (e) {
    // Lock write failure is non-fatal
}

console.log(JSON.stringify({
    decision: 'block',
    reason: 'Post-commit code review pending',
    systemMessage: 'POST_COMMIT_REVIEW: Run /code-review --fresh on: ' + pendingFiles + '. After review completes, run: touch ~/.claude-last-review && rm -f ~/.claude-pending-review'
}));
