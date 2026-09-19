// PostToolUse hook (Bash / git commit): update features/<slug>.md with the
// files touched by HEAD and prepend a history entry. Never creates stubs —
// creation is session-start-feature.js's job.
//
// Design goals (see .claude/plans/automated-feature-tracking.md):
//   - Post-commit, non-blocking. Hook exits 0 regardless of outcome.
//   - Deterministic: no LLM calls; slug from branch, fallback to subject.
//   - Stages the updated feature file so the NEXT commit picks it up.
//   - Idempotent: re-running on the same commit is a no-op.

const fs = require('fs');
const path = require('path');
const gitRead = require('./lib/git-read');
const timingLog = require('./timing-log');
const ff = require('./lib/feature-file');
const commitCommand = require('./lib/commit-command');

const BLOCKLIST_BRANCHES = ff.BLOCKLIST_BRANCHES;

const SUBJECT_SLUG_BLOCKLIST = new Set([
    'fix', 'wip', 'tmp', 'temp', 'test', 'chore', 'doc', 'docs',
]);

function readToolInput() {
    // Current Claude Code passes tool input via env var (older hooks rely on
    // this). Fall back to stdin JSON if available.
    if (process.env.CLAUDE_TOOL_INPUT) {
        return process.env.CLAUDE_TOOL_INPUT;
    }
    try {
        const raw = fs.readFileSync(0, 'utf-8');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.tool_input && parsed.tool_input.command) {
                return parsed.tool_input.command;
            }
        }
    } catch (e) { /* ignore */ }
    return '';
}

function gitRepoRoot(cwd) {
    return gitRead.locateRepo(cwd).toplevel;
}

// null on any git error. args is an argv array, never a shell string: the
// branch name is user-controlled text, it is the slug, and git accepts `$`,
// backticks and parentheses in a ref name. Built as a string, a branch called
// `feat$(rm -rf ~)` runs when the record is staged. Same rule as the
// pre-commit hook, same reason.
function runGit(args, cwd) {
    const r = gitRead.gitRead(args, { cwd });
    return r.out === null ? null : r.out.trim();
}

function committedFiles(cwd) {
    // diff-tree works for the first commit (no parent); name-only -r
    // matches post-commit-review.js's proven recipe.
    const out = runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], cwd);
    if (!out) return [];
    return out.split('\n').map(s => s.trim()).filter(Boolean);
}

const hasSourceFile = ff.hasSourceFile;
const onlyFeatureFiles = ff.onlyFeatureFiles;

function parentCount(cwd) {
    const out = runGit(['rev-list', '--parents', '-n', '1', 'HEAD'], cwd);
    if (!out) return 1;
    const parts = out.split(/\s+/).filter(Boolean);
    return Math.max(0, parts.length - 1);
}

function slugifySubject(subject) {
    if (!subject) return null;
    const slug = subject
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    if (!slug) return null;
    if (SUBJECT_SLUG_BLOCKLIST.has(slug)) return null;
    if (slug.length < 4) return null;
    if (!slug.includes('-') && slug.length < 8) return null;
    return slug;
}

function resolveSlug(cwd) {
    const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    if (branch && !BLOCKLIST_BRANCHES.has(branch) && !branch.includes(' ')) {
        return { slug: branch, source: 'branch' };
    }
    const subject = runGit(['log', '-1', '--pretty=%s', 'HEAD'], cwd);
    const slug = slugifySubject(subject);
    if (slug) return { slug, source: 'subject' };
    return { slug: null, source: null };
}

const today = ff.today;

function updateFeatureFile(featurePath, committed, shortSha, subject) {
    let content = fs.readFileSync(featurePath, 'utf-8');

    content = ff.setLastUpdated(content);
    content = ff.mergeFilesInvolved(content, committed);

    const entry = [
        '- ' + today() + ' `' + shortSha + '` — ' + subject,
        ...committed.map(f => '  - ' + f),
    ].join('\n');
    content = ff.prependHistory(content, entry);

    fs.writeFileSync(featurePath, content);
}

function main() {
    const stop = timingLog.timer();
    const input = readToolInput();

    // The classifier, not a substring match: a commit MESSAGE that mentions
    // --amend is still a commit, and an amend keeps its existing record.
    // `hasCommit`, not `kind`: a shape the pre-commit hooks call unreliable
    // (`git commit -a`, `git add x && git commit`) has already committed by
    // the time this hook runs, whether or not those hooks were installed,
    // and its record is still due.
    const shape = commitCommand.classifyCommitCommand(input);
    if (!shape.hasCommit || shape.amend) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', mode: shape.amend ? 'skip-amend' : 'skip-not-commit',
            duration_ms: stop(),
        });
        return;
    }

    const cwd = process.cwd();
    const repo = gitRepoRoot(cwd);
    if (!repo) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', mode: 'skip-not-a-repo',
            duration_ms: stop(),
        });
        return;
    }

    if (fs.existsSync(path.join(repo, '.claude', 'feature-tracking.disabled'))) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, mode: 'skip-disabled',
            duration_ms: stop(),
        });
        return;
    }

    if (parentCount(repo) > 1) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, mode: 'skip-merge-commit',
            duration_ms: stop(),
        });
        return;
    }

    const files = committedFiles(repo);
    if (files.length === 0) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, mode: 'skip-no-files',
            duration_ms: stop(),
        });
        return;
    }

    if (onlyFeatureFiles(files)) {
        // Loop guard: our own commits that only touch features/ files.
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, mode: 'skip-features-only',
            duration_ms: stop(),
        });
        return;
    }

    if (!hasSourceFile(files)) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, mode: 'skip-no-source',
            duration_ms: stop(),
        });
        return;
    }

    const { slug, source } = resolveSlug(repo);
    if (!slug) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, mode: 'skip-no-slug',
            duration_ms: stop(),
        });
        return;
    }

    const featurePath = path.join(repo, 'features', slug + '.md');
    if (!fs.existsSync(featurePath)) {
        // Creation is SessionStart's job. Log and bail.
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, slug, source,
            mode: 'skip-no-stub', duration_ms: stop(),
        });
        process.stderr.write(
            '[feature] No features/' + slug + '.md stub found. '
            + 'Creation is handled at session start on a feature branch. '
            + 'Run `/feature-new ' + slug + ' "<requirement>"` to seed it.\n'
        );
        return;
    }

    const shortSha = runGit(['rev-parse', '--short', 'HEAD'], repo) || '???????';
    const subject = runGit(['log', '-1', '--pretty=%s', 'HEAD'], repo) || '(no subject)';

    // Exclude the feature file itself from the committed-files list we record
    // (it's recorded implicitly by being under features/).
    const codeFiles = files.filter(f => !(f.startsWith('features/') && f.endsWith('.md')));

    try {
        updateFeatureFile(featurePath, codeFiles, shortSha, subject);
    } catch (e) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, slug, source,
            mode: 'update-failed', error: String(e.message || e),
            duration_ms: stop(),
        });
        return;
    }

    // Staging is the half the next commit depends on. Reporting "staged" when
    // the add failed is how a record silently stops shipping. gitRead rather
    // than runGit here, for the same reason as the pre-commit hook: git's
    // stderr is the only account of why, and the user needs it.
    const add = gitRead.gitRead(
        ['add', '--', 'features/' + slug + '.md'], { cwd: repo }
    );
    if (add.out === null) {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', repo, slug, source,
            mode: 'stage-failed', commit_sha: shortSha, error: add.error,
            n_files: codeFiles.length, duration_ms: stop(),
        });
        process.stderr.write(
            '[feature] features/' + slug + '.md updated but NOT staged ('
            + add.error + '); it will not ship with the next commit until '
            + 'you add it.\n'
        );
        return;
    }

    timingLog.logEvent('feature.post_commit', {
        hook: 'post-commit-feature', repo, slug, source,
        mode: 'append', commit_sha: shortSha,
        n_files: codeFiles.length, duration_ms: stop(),
    });

    process.stderr.write(
        '[feature] features/' + slug + '.md updated (staged for next commit)\n'
    );
}

try {
    main();
} catch (e) {
    try {
        timingLog.logEvent('feature.post_commit', {
            hook: 'post-commit-feature', mode: 'crashed',
            error: String(e.message || e),
        });
    } catch (_) { /* ignore */ }
    process.exit(0);
}
