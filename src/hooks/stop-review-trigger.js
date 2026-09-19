// Stop hook: Enforce code review before session ends
// Gate sequence: Lock -> Git repo -> Code changes -> Marker -> Block
// Circuit breaker: lock file prevents re-entry for 5 minutes
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Per repository and per worktree, never $HOME. A global marker meant one
// project's review state governed every other project on the machine, and
// MARKER_FILE in particular shared its NAME with the commit gate's per-repository
// marker while living somewhere the commit gate never reads -- so the remedy these
// hooks printed, `touch ~/.claude-last-review`, silently did nothing.
const reviewMarkers = require('./lib/review-markers');
const reviewPaths = reviewMarkers.markerPaths(process.cwd());
const MARKER_FILE = reviewPaths.sessionMarker;
const LOCK_FILE = reviewPaths.postLock;
const PENDING_FILE = reviewPaths.pending;

// No repository located -> nothing to record, and no shared location to fall back
// on. Do nothing rather than emit instructions naming a null path.
if (!MARKER_FILE) {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}
const MARKER_MAX_AGE_MS = 10 * 60 * 1000;
const LOCK_MAX_AGE_MS = 5 * 60 * 1000;

// One shared definition, in lib/source-files.js -- four hooks used to keep their
// own copy, and all four were blind to shell. See that file for what changed.
const sourceFiles = require('./lib/source-files');
const { SOURCE_EXTENSIONS, EXCLUDE_PATTERNS } = sourceFiles;

function approve() {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

// True when the marker's body records a pass. An empty marker counts as a pass so
// that `touch <marker>` -- what this hook's own message tells the user to run --
// still works; a body whose first line is BLOCK does not.
function markerRecordsPass(filePath) {
    let body;
    try {
        body = fs.readFileSync(filePath, 'utf-8').trim();
    } catch (e) {
        return false;
    }
    if (body === '') return true;
    return body.split('\n')[0].trim().toUpperCase() !== 'BLOCK';
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
            systemMessage: 'POST_COMMIT_REVIEW: Run /code-review --fresh on: ' + pendingFiles + '. After the review completes, run: rm -f ' + PENDING_FILE
        }));
        process.exit(0);
    } catch (e) {
        // Fall through if marker can't be read
    }
}

if (codeFiles.length === 0) {
    approve();
}

// Gate 4: a fresh marker recording a PASS -> approve (a review completed).
//
// The body is read, not just the mtime. Freshness alone is not evidence of a pass:
// a marker file also records failures, and approving on presence would let a
// recorded block end the session as though it had been reviewed. The marker this
// gate reads is its own (`.claude-last-session-review`), but the body check is the
// part that must not be skipped whatever the filename.
if (isFileFresh(MARKER_FILE, MARKER_MAX_AGE_MS) && markerRecordsPass(MARKER_FILE)) {
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
    systemMessage: 'REVIEW_REQUIRED: Run /code-review --context on these modified files before stopping: ' + fileList + '. After the review completes, run: touch ' + MARKER_FILE
}));
