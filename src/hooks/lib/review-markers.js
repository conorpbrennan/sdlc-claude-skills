// Where a review marker, lock or pending-review record lives.
//
// One rule: inside the repository's git dir, never in $HOME. Three hooks used to
// keep these in the user's home directory, which made them global to the machine,
// and the consequence was observed live -- a commit of `App.java` in an unrelated
// project wrote `$HOME/.claude-pending-review`, and that blocked Bash commands in
// a session working on this repository, naming a file that does not exist here.
// A review is a fact about one diff in one repository; its bookkeeping belongs
// with that repository.
//
// Resolving against `rev-parse --git-dir` also makes these paths worktree-correct
// with no extra work: in a linked worktree that command returns
// `.git/worktrees/<name>`, so two worktrees of one repository get separate
// markers. Verified, not assumed -- see test-review-markers.js, which writes a
// marker in the main worktree and asserts the linked one cannot see it. That is
// why no hash of the worktree path is needed: the git dir already is the scope.
//
// `pre-commit-review.js` resolved its own paths this way from the start; this
// module exists so the other hooks share one definition rather than three.
const path = require('path');
const gitRead = require('./git-read');

// The commit gate's marker and lock. pre-commit-review.js owns these and writes a
// body: `PASS\n<diff>\n<cov>\n<tag>` or `BLOCK\n<diff>\n<reason>`.
const MARKER_NAME = '.claude-last-review';
const LOCK_NAME = '.claude-review-in-progress';

// The session/post-commit gates get their OWN names, and this is load-bearing.
// Moving these out of $HOME and into the git dir would otherwise make them the
// SAME FILE as the commit gate's -- and stop-review-trigger.js's gate approves on
// freshness alone, without reading the body, so a `BLOCK` record written by the
// commit gate would read as "a review completed recently" and approve a session
// end. The old code had the same NAME in a different directory; scoping it per
// repository without renaming would have turned a name collision into a real one.
const SESSION_MARKER_NAME = '.claude-last-session-review';
const POST_LOCK_NAME = '.claude-post-review-in-progress';
const PENDING_NAME = '.claude-pending-review';

// { gitDir, toplevel, notARepo, error, marker, lock, pending }
//
// The three paths are null whenever the repository could not be located, whether
// because there is none or because git could not be read. A caller must not
// substitute a shared location in that case: no repository means no bookkeeping,
// so the hook should do nothing rather than reach for a global file.
function markerPaths(cwd) {
    const dir = cwd || process.cwd();
    const repo = gitRead.locateRepo(dir);
    if (!repo.gitDir) {
        return {
            gitDir: null,
            toplevel: null,
            notARepo: Boolean(repo.notARepo),
            error: repo.error || null,
            marker: null,
            lock: null,
            sessionMarker: null,
            postLock: null,
            pending: null,
        };
    }
    // `--git-dir` is relative ('.git') in a main worktree and absolute in a linked
    // one, so resolve it against the cwd we asked about.
    const base = path.resolve(dir, repo.gitDir);
    return {
        gitDir: base,
        toplevel: repo.toplevel,
        notARepo: false,
        error: null,
        marker: path.join(base, MARKER_NAME),
        lock: path.join(base, LOCK_NAME),
        sessionMarker: path.join(base, SESSION_MARKER_NAME),
        postLock: path.join(base, POST_LOCK_NAME),
        pending: path.join(base, PENDING_NAME),
    };
}

module.exports = {
    MARKER_NAME,
    LOCK_NAME,
    SESSION_MARKER_NAME,
    POST_LOCK_NAME,
    PENDING_NAME,
    markerPaths,
};
