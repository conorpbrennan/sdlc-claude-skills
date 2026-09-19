// PreToolUse hook: Block Bash commands until post-commit review is completed
// Gate sequence: No marker -> Lock fresh -> Block with review request
// Shares lock file with stop-review-trigger.js to prevent double-blocking
const fs = require('fs');
const reviewMarkers = require('./lib/review-markers');

const MARKER_MAX_AGE_MS = 10 * 60 * 1000;
const LOCK_MAX_AGE_MS = 5 * 60 * 1000;

// Per repository and per worktree, never $HOME. These used to live in the user's
// home directory, so a pending review recorded in one project blocked Bash
// commands in every other: observed live, where a commit of `App.java` elsewhere
// blocked this repository's session and told it to review a file it does not have.
const paths = reviewMarkers.markerPaths(process.cwd());
const PENDING_FILE = paths.pending;
// The post-review lock, NOT the commit gate's: sharing that file would let a
// blocked commit suppress this gate for five minutes, and pre-commit-review.js
// deletes a lock whose body it does not recognise.
const LOCK_FILE = paths.postLock;

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

// Gate 0: Not in a repository, or git unreadable -> approve. There is no
// per-repository record to consult, and falling back to a shared one is the bug
// this hook just had.
if (!PENDING_FILE) {
    approve();
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
    // Name the real paths. The old text said `touch ~/.claude-last-review`, which
    // created a file in $HOME that no gate reads -- the commit gate's marker is
    // the per-repository one, so the remedy quietly did nothing.
    systemMessage: 'POST_COMMIT_REVIEW: Run /code-review --fresh on: ' + pendingFiles +
        '. After the review completes, run: rm -f ' + PENDING_FILE +
        ' (this record is for this repository and worktree only).'
}));
