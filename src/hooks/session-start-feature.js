// SessionStart hook: detect feature branch, create feature stub if missing,
// and inject additionalContext instructing Claude to capture the requirement
// from the user before any build work.
//
// Design goals (see .claude/plans/automated-feature-tracking.md):
//   - Creation happens BEFORE build, so /feature and build skills have
//     something real to load.
//   - Deterministic and fast: one git call, at most one file write.
//   - Never blocks the session — any failure exits 0 silently.
//   - Project-agnostic: works in any git repo; opt out with
//     .claude/feature-tracking.disabled.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const timingLog = require('./timing-log');
const ff = require('./lib/feature-file');

function readStdinSync() {
    try {
        return fs.readFileSync(0, 'utf-8');
    } catch (e) {
        return '';
    }
}

function resolveCwd() {
    const raw = readStdinSync().trim();
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.cwd === 'string' && parsed.cwd) {
                return parsed.cwd;
            }
        } catch (e) { /* ignore — not JSON, fall through */ }
    }
    return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function gitRepoRoot(cwd) {
    try {
        return execSync('git rev-parse --show-toplevel', {
            cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
    } catch (e) {
        return null;
    }
}

function currentBranch(cwd) {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', {
            cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
    } catch (e) {
        return null;
    }
}

const stubContent = ff.stubContent;

function emit(output) {
    // SessionStart hooks inject context via hookSpecificOutput.additionalContext.
    // Returning {} is a valid no-op.
    process.stdout.write(JSON.stringify(output || {}));
}

// Walk subdirectories of `cwd` up to `maxDepth` looking for git repositories
// (directories containing a `.git` entry — directory or worktree-link file).
// Stops descending once a repo is found (a repo's own subdirs are not scanned).
// Skips dotfile dirs and well-known noise paths.
const SCAN_SKIP_DIRS = new Set([
    'node_modules', '__pycache__', '.venv', 'venv', 'env',
    'target', 'build', 'dist', '.idea', '.vscode',
]);

function findGitReposUnder(cwd, maxDepth) {
    const repos = [];
    const stack = [{ dir: cwd, depth: 0 }];
    while (stack.length > 0) {
        const { dir, depth } = stack.pop();
        try {
            const gitPath = path.join(dir, '.git');
            if (fs.existsSync(gitPath)) {
                repos.push(dir);
                continue; // do not descend into a repo's own subdirs
            }
            if (depth >= maxDepth) continue;
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (entry.name.startsWith('.')) continue;
                if (SCAN_SKIP_DIRS.has(entry.name)) continue;
                stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
            }
        } catch (e) { /* unreadable — skip */ }
    }
    return repos;
}

// Process a single git repo: detect branch, ensure feature stub exists,
// return { state, branch, message }. State is logged by the caller.
function processRepo(repo) {
    const disabledMarker = path.join(repo, '.claude', 'feature-tracking.disabled');
    if (fs.existsSync(disabledMarker)) {
        return { state: 'disabled', branch: null, message: null };
    }

    const branch = currentBranch(repo);
    if (!branch) {
        return { state: 'no-branch', branch: null, message: null };
    }

    const isFeatureBranch = ff.isFeatureBranch(branch);

    const featurePath = path.join(repo, 'features', branch + '.md');

    if (!isFeatureBranch) {
        const msg = 'You are on branch `' + branch + '` (in `' + repo
            + '`). Feature tracking records context per feature branch. '
            + 'Create one with `git checkout -b <slug>` before starting new '
            + 'work, or opt out for this repo by creating '
            + '`.claude/feature-tracking.disabled`.';
        return { state: 'unfeatured-branch', branch, message: msg };
    }

    if (fs.existsSync(featurePath)) {
        let hasTBD = false;
        try {
            hasTBD = ff.hasTbdRequirement(fs.readFileSync(featurePath, 'utf-8'));
        } catch (e) { /* non-fatal */ }

        const relPath = 'features/' + branch + '.md';
        let msg = 'Feature context available for branch `' + branch
            + '` (in `' + repo + '`): `' + relPath + '`. '
            + 'Load it with `/feature ' + branch + '`.';
        if (hasTBD) {
            msg += ' The requirement is still `_TBD_` — ask the user for a '
                + 'one-sentence requirement and run `/feature-new ' + branch
                + ' "<their answer>"` before starting implementation work.';
        }
        return {
            state: hasTBD ? 'existing-tbd' : 'existing',
            branch,
            message: msg,
        };
    }

    // needs-stub: ensure the *parent directory of the feature file* exists.
    // Branches with slashes (e.g. "feature/foo") write to nested paths like
    // features/feature/foo.md — mkdir'ing only the top-level features/ used
    // to fail with ENOENT when writing the file.
    try {
        fs.mkdirSync(path.dirname(featurePath), { recursive: true });
        fs.writeFileSync(featurePath, stubContent(branch, branch), { flag: 'wx' });
    } catch (e) {
        if (e.code !== 'EEXIST') {
            return {
                state: 'write-failed',
                branch,
                message: null,
                error: String(e.message || e),
            };
        }
    }

    const relPath = 'features/' + branch + '.md';
    const msg = 'A feature stub has been created at `' + relPath
        + '` (in `' + repo + '`) for branch `' + branch
        + '`. The requirement is currently `_TBD_`.\n\n'
        + 'Before starting any implementation, ask the user:\n'
        + '"What\'s the one-sentence requirement for `' + branch + '`?"\n\n'
        + 'Once the user answers, run:\n'
        + '`/feature-new ' + branch + ' "<their answer>"`\n\n'
        + 'Do not begin build work, edits, or planning until the requirement '
        + 'is captured.';
    return { state: 'stub-created', branch, message: msg };
}

function main() {
    const stop = timingLog.timer();
    const cwd = resolveCwd();

    // Discover one or more git repos to process. Direct hit on cwd is the
    // common case; scanning subdirs handles workspace-root layouts where
    // the user's primary cwd contains nested git repos (e.g. ~/Workspace/X
    // with X/repo-a/, X/repo-b/ underneath).
    let repos = [];
    const directRoot = gitRepoRoot(cwd);
    if (directRoot) {
        repos = [directRoot];
    } else {
        repos = findGitReposUnder(cwd, 4);
    }

    if (repos.length === 0) {
        timingLog.logEvent('feature.session_start', {
            hook: 'session-start-feature', cwd, state: 'not-a-repo',
            duration_ms: stop(),
        });
        return emit({});
    }

    const messages = [];
    for (const repo of repos) {
        const result = processRepo(repo);
        timingLog.logEvent('feature.session_start', {
            hook: 'session-start-feature',
            repo, branch: result.branch, state: result.state,
            ...(result.error ? { error: result.error } : {}),
            scanned_subdirs: !directRoot,
            duration_ms: stop(),
        });
        if (result.message) messages.push(result.message);
    }

    if (messages.length === 0) return emit({});

    const additionalContext = messages.length === 1
        ? messages[0]
        : messages.join('\n\n---\n\n');

    return emit({
        hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext,
        },
    });
}

try {
    main();
} catch (e) {
    // Never fail the session on a hook error.
    try {
        timingLog.logEvent('feature.session_start', {
            hook: 'session-start-feature', state: 'crashed',
            error: String(e.message || e),
        });
    } catch (_) { /* ignore */ }
    process.stdout.write('{}');
    process.exit(0);
}
