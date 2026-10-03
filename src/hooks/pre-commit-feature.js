// PreToolUse hook: enforce that feature work happens on a feature branch and
// that features/<slug>.md is committed alongside the code it describes.
//
// Two rules, both evaluated only when the staged set contains source files
// (docs/config-only commits are never gated):
//   1. Source commits on main/master/develop/trunk are blocked. Feature work
//      belongs on a branch.
//   2. On a feature branch, features/<branch>.md must exist and carry a real
//      requirement. The file is then staged INTO this commit, so the feature
//      record ships with the code rather than trailing it by one commit.
//
// Opt out per-repo with .claude/feature-tracking.disabled.

// A hook that throws prints nothing, and PreToolUse reads no decision as
// "proceed". Every failure must be a block, including our own, so this
// is registered before any require: a truncated lib file from a partial
// install must block too, not exit silently.
process.on('uncaughtException', (e) => {
    const reason = 'Pre-commit hook %s failed: ' + String((e && e.message) || e).split('\n')[0].slice(0, 200);
    try {
        console.log(JSON.stringify({
            decision: 'block',
            reason: reason.replace('%s', 'pre-commit-feature'),
            systemMessage: 'PRE_COMMIT_GATE: ' + reason.replace('%s', 'pre-commit-feature') +
                '. The hook itself crashed, so the commit cannot be checked. Report this; the ' +
                'hook source is in sdlc-claude-skills/src/hooks/pre-commit-feature.js.',
        }));
    } catch (_) { /* nothing more we can do */ }
    process.exit(0);
});

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const timingLog = require('./timing-log');
const ff = require('./lib/feature-file');
const commitCommand = require('./lib/commit-command');
const gitRead = require('./lib/git-read');
const { cmd } = require('./lib/plugin-names');

const hookTimer = timingLog.timer();
const hookMeta = { hook: 'pre-commit-feature' };

function log(mode, extra) {
    timingLog.logEvent('feature.pre_commit', {
        ...hookMeta, mode, duration_ms: hookTimer(), ...(extra || {}),
    });
}

function approve(mode, extra) {
    log(mode, extra);
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

function block(mode, reason, systemMessage, extra) {
    log(mode, extra);
    console.log(JSON.stringify({ decision: 'block', reason, systemMessage }));
    process.exit(0);
}

// null on any git error. Callers must treat null as "could not read", never
// as "nothing there". args is an argv array, never a shell string: a branch
// name is user-controlled text and git accepts `$`, backticks and `;` in it.
function runGit(args, cwd) {
    try {
        return execFileSync('git', args, {
            cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 64 * 1024 * 1024,
        }).trim();
    } catch (e) {
        return null;
    }
}

// --- Input parse -----------------------------------------------------------
let hookData = {};
try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) { /* ignore */ }
const command = (hookData.tool_input && hookData.tool_input.command) || '';

// An amend rewrites HEAD with whatever is staged, so it is gated like any
// other commit; with nothing staged it approves at the staged-list check.
const shape = commitCommand.classifyCommitCommand(command);
if (shape.kind === 'not-a-commit') {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

// The index the hook is about to read must be what gets committed. A command
// that stages, switches branch, or commits by pathspec in the same breath
// (`git add x && git commit`, `git commit -a`, `git checkout main && git
// commit`) would make every rule below reason about the wrong diff or the
// wrong branch. Fail closed.
if (shape.kind === 'unreliable') {
    block('block-index-unreliable', shape.reason, commitCommand.blockMessage(shape.reason));
}

// `git commit -- <paths>` commits only the listed paths, so anything we stage
// would be silently dropped. Still gate the branch rule, just skip staging.
const hasPathspec = / -- /.test(command);

// --- Gate ------------------------------------------------------------------
// "Could not tell" is not "not a repo": a bad GIT_DIR or a broken git must
// block, since the branch and staged-file rules cannot be checked.
const located = gitRead.locateRepo(process.cwd());
// A `cd` before the commit may leave the repository the hook inspected.
const cdReason = commitCommand.directoryChangeReason(shape.cds, process.cwd(), located.toplevel);
if (cdReason) {
    block('block-directory-change', cdReason, commitCommand.blockMessage(cdReason));
}
if (located.notARepo) approve('skip-not-a-repo');
if (!located.toplevel) {
    block('block-repo-unreadable',
        'Repository could not be located',
        'PRE_COMMIT_FEATURE: git could not locate the repository (' + located.error + '), ' +
        'so the branch and feature-file rules cannot be checked. Retry; if it persists, ' +
        'check GIT_DIR/GIT_WORK_TREE, PATH, and the cwd.');
}
const repo = located.toplevel;
hookMeta.repo = repo;

if (fs.existsSync(path.join(repo, '.claude', 'feature-tracking.disabled'))) {
    approve('skip-disabled');
}

// A conflicted merge resolution is not feature work.
const gitDir = located.gitDir;
if (gitDir && fs.existsSync(path.resolve(repo, gitDir, 'MERGE_HEAD'))) {
    approve('skip-merge');
}

const stagedRaw = runGit(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], repo);
if (stagedRaw === null) {
    // Fail closed: an index we cannot read might hold a source commit on a
    // protected branch. "No diff to reason about" is not a reason to approve.
    block('block-index-unreadable',
        'Staged file list could not be read',
        'PRE_COMMIT_FEATURE: git could not read the staged file list, so the ' +
        'branch and feature-file rules cannot be checked. Retry; if it persists, ' +
        'check the repository state (index.lock, GIT_DIR, cwd).');
}
// -z: NUL-terminated paths are never C-quoted under core.quotePath.
const staged = gitRead.splitNul(stagedRaw);
if (staged.length === 0) {
    // Genuinely nothing staged. Let git itself decide.
    approve('skip-nothing-staged');
}

if (ff.onlyFeatureFiles(staged)) {
    // Bookkeeping commit carrying a trailing history entry. Always allowed,
    // including on main — otherwise the record could never be caught up.
    approve('skip-features-only');
}

if (!ff.hasSourceFile(staged)) {
    // Docs, config, fixtures. Not feature work — never gated.
    approve('skip-no-source');
}

let branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repo);
if (branch === null) {
    // Unborn HEAD (a repository with no commits yet): --abbrev-ref fails,
    // but the symbolic ref still names the branch. Detached HEAD takes the
    // first path and reads as "HEAD".
    branch = runGit(['symbolic-ref', '--short', 'HEAD'], repo);
}
hookMeta.branch = branch;
if (branch === null) {
    // Fail closed: with no branch name, neither the trunk rule nor the
    // feature-file rule can be applied, and "exempt" is not the default.
    block('block-branch-unreadable',
        'Branch name could not be read',
        'PRE_COMMIT_FEATURE: git could not read the current branch name, so the ' +
        'branch and feature-file rules cannot be checked. Retry; if it persists, ' +
        'check the repository state (index.lock, a broken .git).');
}

if (ff.isGatedBranch(branch)) {
    block(
        'blocked-on-trunk',
        'Feature work must happen on a branch, not ' + branch,
        'FEATURE_GATE: this commit stages source files on `' + branch + '`. '
        + 'Feature work belongs on a branch so it gets a feature record.\n\n'
        + 'Create one — your staged changes carry over untouched:\n'
        + '  git checkout -b <slug>\n\n'
        + 'Then ask the user for a one-sentence requirement and run '
        + '`' + cmd('feature-new') + ' <slug> "<their answer>"` before retrying the commit.\n\n'
        + 'If this repo should not be tracked: touch .claude/feature-tracking.disabled',
    );
}

if (!ff.isFeatureBranch(branch)) {
    // release/* and worktree-* branches: exempt by design.
    approve('skip-exempt-branch');
}

const relPath = 'features/' + branch + '.md';
const featurePath = path.join(repo, relPath);

if (!fs.existsSync(featurePath)) {
    // Create the stub here so the requirement prompt has somewhere to land —
    // the branch may have been created after session start.
    let created = false;
    try {
        fs.mkdirSync(path.dirname(featurePath), { recursive: true });
        fs.writeFileSync(featurePath, ff.stubContent(branch, branch), { flag: 'wx' });
        created = true;
    } catch (e) {
        if (e.code !== 'EEXIST') {
            approve('stub-write-failed', { error: String(e.message || e) });
        }
    }
    block(
        'missing-feature-record',
        'No feature record for branch ' + branch,
        'FEATURE_GATE: branch `' + branch + '` has no feature record'
        + (created ? ' — a stub was just created at `' + relPath + '`.' : '.')
        + '\n\nAsk the user: "What\'s the one-sentence requirement for `'
        + branch + '`?" Then run:\n'
        + '  ' + cmd('feature-new') + ' ' + branch + ' "<their answer>"\n\n'
        + 'Retry the commit once the requirement is captured.',
        { created_stub: created },
    );
}

let content;
try {
    content = fs.readFileSync(featurePath, 'utf-8');
} catch (e) {
    approve('read-failed', { error: String(e.message || e) });
}

if (ff.hasTbdRequirement(content)) {
    block(
        'tbd-requirement',
        'Feature requirement for ' + branch + ' is still TBD',
        'FEATURE_GATE: `' + relPath + '` still has a `_TBD_` requirement, so '
        + 'this commit would record nothing useful.\n\n'
        + 'Ask the user: "What\'s the one-sentence requirement for `'
        + branch + '`?" Then run:\n'
        + '  ' + cmd('feature-new') + ' ' + branch + ' "<their answer>"\n\n'
        + 'Retry the commit once the requirement is captured.',
    );
}

// Requirement is real. Fold this commit's file list into the record and stage
// it so it ships WITH the code. The sha-stamped history line is appended
// afterwards by post-commit-feature.js, which cannot know the sha until now.
const codeFiles = staged.filter(f => !ff.isFeatureFile(f));
try {
    let updated = ff.setLastUpdated(content);
    updated = ff.mergeFilesInvolved(updated, codeFiles);
    if (updated !== content) fs.writeFileSync(featurePath, updated);
} catch (e) {
    approve('update-failed', { error: String(e.message || e) });
}

if (hasPathspec) {
    approve('approve-pathspec-no-staging', { n_files: codeFiles.length });
}

// gitRead rather than the local runGit: this is the one call whose failure
// the user has to act on, so its stderr has to survive. git is the only party
// that knows why the add failed, and it says so.
const add = gitRead.gitRead(['add', '--', relPath], { cwd: repo });
if (add.out === null) {
    // The hook exists to put the record in the commit. Approving here ships
    // the commit without it, which makes the gate advisory. Blocking costs a
    // retry, and the retry re-reads the index.
    //
    // The message reports git's reason and offers both remedies rather than
    // classifying the failure itself. Two attempts at that classification
    // failed review: `check-ignore` answers a different question (does a rule
    // match this path), and its two forms are each wrong in a case the other
    // gets right -- index-aware misses a tracked record under `features/`,
    // --no-index calls a lock failure permanent when a rule happens to match.
    // Quoting git needs no proxy and is right in every case.
    block(
        'block-stage-failed',
        'Feature record could not be staged',
        'FEATURE_GATE: `' + relPath + '` was updated but could not be staged '
        + '(' + add.error + '), so it would not ship with this commit.\n\n'
        + 'Retry the commit: a stale `.git/index.lock` clears on the next '
        + 'attempt.\n\n'
        + 'If it blocks again, the record may be ignored by this repository, '
        + 'and then it can never be staged. Either stop ignoring it, or opt '
        + 'this repo out of feature tracking: '
        + 'touch .claude/feature-tracking.disabled',
        { n_files: codeFiles.length, error: add.error }
    );
}

approve('approve-staged', { n_files: codeFiles.length });
