// PreToolUse hook: Block git commit if ruff/pytest checks fail in opted-in repos.
// Opt-in via ~/.claude/hygiene-repos.json keyed by git toplevel (forward slashes).
// A hook that throws prints nothing, and PreToolUse reads no decision as
// "proceed". Every failure must be a block, including our own, so this
// is registered before any require: a truncated lib file from a partial
// install must block too, not exit silently.
process.on('uncaughtException', (e) => {
    const reason = 'Pre-commit hook %s failed: ' + String((e && e.message) || e).split('\n')[0].slice(0, 200);
    try {
        console.log(JSON.stringify({
            decision: 'block',
            reason: reason.replace('%s', 'pre-commit-hygiene'),
            systemMessage: 'PRE_COMMIT_GATE: ' + reason.replace('%s', 'pre-commit-hygiene') +
                '. The hook itself crashed, so the commit cannot be checked. Report this; the ' +
                'hook source is in sdlc-claude-skills/src/hooks/pre-commit-hygiene.js.',
        }));
    } catch (_) { /* nothing more we can do */ }
    process.exit(0);
});

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');
const timingLog = require('./timing-log');
const commitCommand = require('./lib/commit-command');
const gitRead = require('./lib/git-read');

const hookTimer = timingLog.timer();
const hookMeta = { hook: 'pre-commit-hygiene' };
function endHook(decision, extra) {
    timingLog.logEvent('hook.end', { ...hookMeta, decision, total_ms: hookTimer(), ...(extra || {}) });
}

// On Windows, spawnSync('bash') fails with ENOENT because Node's spawn uses CreateProcess
// which does not search PATH for bare executable names without the .exe extension.
// Resolve the full path at startup via 'where' (Windows) so spawnSync can find it.
// On POSIX, 'bash' resolves normally.
function resolveBash() {
    if (os.platform() !== 'win32') return 'bash';
    try {
        const result = execSync('where bash.exe', {
            encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'], shell: true
        });
        // where returns backslash paths; Node spawnSync requires forward slashes on Windows.
        return result.trim().split('\n')[0].trim().replace(/\\/g, '/');
    } catch (e) {
        return 'bash.exe'; // last resort
    }
}
const BASH_EXEC = resolveBash();

const MARKER_MAX_AGE_MS = 10 * 60 * 1000;
// Allow test override via env var; production always uses ~/.claude/hygiene-repos.json
const CONFIG_PATH = process.env.HYGIENE_REPOS_CONFIG || path.join(os.homedir(), '.claude', 'hygiene-repos.json');

// --- Input parse -----------------------------------------------------------
let hookData = {};
try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) {}
const input = hookData.tool_input?.command || '';

const shape = commitCommand.classifyCommitCommand(input);
// An amend rewrites HEAD with whatever is staged, so it is gated like any
// other commit.
if (shape.kind === 'not-a-commit') {
    approve();  // Non-commit bash invocation — stay silent (don't spam the log).
}

timingLog.logEvent('hook.start', { ...hookMeta });

// The staged set the checks run against must be what gets committed. A
// command that stages in the same breath (`git add && git commit`,
// `git commit -a`) would have the checks run on the wrong files. Fail closed.
if (shape.kind === 'unreliable') {
    endHook('block', { via: 'index-unreliable' });
    block(shape.reason, commitCommand.blockMessage(shape.reason));
}

// --- Helpers ---------------------------------------------------------------
function approve() {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

function block(reason, systemMessage) {
    console.log(JSON.stringify({ decision: 'block', reason, systemMessage }));
    process.exit(0);
}

// null on a failed read (never the hash of an empty diff); the marker
// short-circuit below requires a real hash.
function stagedDiffHash() {
    return gitRead.stagedDiffHash();
}

// Compute staged Python context for use by check commands via env vars.
// Returns { files: string[], pkgs: string[] } where files are absolute
// forward-slash paths of staged .py files and pkgs are their unique parent
// dirs, or null when the index could not be read. The canonical checks are
// wrapped in `if [ -n "$STAGED_PY" ]`, so an empty context would pass them
// vacuously: a failed read must refuse, never return empty.
function stagedPyContext(toplevel) {
    try {
        const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
            encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd: toplevel,
            maxBuffer: 64 * 1024 * 1024,
        });
        const files = output.trim().split('\n')
            .map(f => f.trim())
            .filter(f => f.endsWith('.py'));
        const absFiles = files.map(f => (toplevel + '/' + f).replace(/\\/g, '/'));
        const pkgSet = new Set(files.map(f => {
            const dir = f.includes('/') ? f.replace(/\/[^/]+$/, '') : '.';
            return dir;
        }));
        const pkgs = [...pkgSet].filter(Boolean);
        return { files: absFiles, pkgs };
    } catch (e) { return null; }
}

function loadConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const cfg = JSON.parse(raw);
        return cfg?.repos || {};
    } catch (e) { return {}; }
}

function readMarker(file) {
    try {
        const [verdict, hash] = fs.readFileSync(file, 'utf-8').trim().split('\n');
        const stat = fs.statSync(file);
        const fresh = (Date.now() - stat.mtimeMs) < MARKER_MAX_AGE_MS;
        return { verdict, hash, fresh };
    } catch (e) { return null; }
}

// --- Gate logic ------------------------------------------------------------
// "Could not tell" is not "not a repo": block rather than skip the checks.
const repo = gitRead.locateRepo();
// A `cd` before the commit may leave the repository the hook inspected.
const cdReason = commitCommand.directoryChangeReason(shape.cds, process.cwd(), repo.toplevel);
if (cdReason) {
    endHook('block', { via: 'directory-change' });
    block(cdReason, commitCommand.blockMessage(cdReason));
}
if (repo.notARepo) { endHook('approve', { via: 'no-toplevel' }); approve(); }
if (!repo.toplevel) {
    endHook('block', { via: 'repo-unreadable' });
    block('Repository could not be located (' + repo.error + ')',
        'PRE_COMMIT_HYGIENE: git could not locate the repository (' + repo.error + '), ' +
        'so the checks cannot run. Retry; if it persists, check GIT_DIR/GIT_WORK_TREE, ' +
        'PATH, and the cwd.');
}
const toplevel = repo.toplevel;
hookMeta.repo = toplevel;

const repos = loadConfig();
const repoCfg = repos[toplevel];
if (!repoCfg) { endHook('approve', { via: 'no-repo-config' }); approve(); }

const dir = repo.gitDir;
const marker = path.resolve(dir, '.claude-last-hygiene');
const currentHash = stagedDiffHash();
hookMeta.diff_hash_prefix = (currentHash || '').slice(0, 8);
const prior = readMarker(marker);
if (currentHash && prior && prior.fresh && prior.verdict === 'PASS' && prior.hash === currentHash) {
    endHook('approve', { via: 'marker-hit' });
    approve();
}

// --- Run checks ------------------------------------------------------------
const setup = (repoCfg.setup || []).join(' && ');
const checks = repoCfg.checks || [];
const timeoutMs = repoCfg.timeoutMs || 180000;

// Compute staged Python context once and export to each check via environment.
const pyCtx = stagedPyContext(toplevel);
if (pyCtx === null) {
    endHook('block', { via: 'staged-context-unreadable' });
    block('Staged file list could not be read',
        'PRE_COMMIT_HYGIENE: git could not read the staged file list, so the checks ' +
        'would run over an empty file set and pass vacuously. Retry; if it persists, ' +
        'check the repository state (index.lock, GIT_DIR, cwd).');
}
const STAGED_PY = pyCtx.files.join('\n');
const STAGED_PY_PKGS = pyCtx.pkgs.join(',');

let failedCheck = null;
let failureOutput = '';

for (const check of checks) {
    const script = [setup, check.command].filter(Boolean).join(' && ');
    const checkTimer = timingLog.timer();
    const result = spawnSync(BASH_EXEC, ['-c', 'set -euo pipefail; ' + script], {
        cwd: toplevel,
        encoding: 'utf-8',
        timeout: timeoutMs,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, STAGED_PY, STAGED_PY_PKGS }
    });
    const success = !(result.status !== 0 || result.signal);
    timingLog.logEvent('hygiene.check', {
        ...hookMeta,
        check: check.name,
        duration_ms: checkTimer(),
        success,
    });
    if (!success) {
        failedCheck = check.name;
        failureOutput = (result.stderr || '') + (result.stdout || '');
        break;
    }
}

if (failedCheck) {
    // Keep last ~40 lines of combined output to stay within systemMessage budget.
    const tail = failureOutput.trim().split('\n').slice(-40).join('\n');
    endHook('block', { failed_check: failedCheck });
    block(
        'Hygiene check failed: ' + failedCheck,
        'PRE_COMMIT_HYGIENE: ' + failedCheck + ' failed. Fix and retry. Tail:\n' + tail
    );
}

// All checks passed -- write marker (only if we have a real hash), approve.
if (currentHash) {
    try {
        fs.writeFileSync(marker, 'PASS\n' + currentHash, 'utf-8');
    } catch (e) { /* non-fatal */ }
}
endHook('approve', { via: 'all-checks-passed' });
approve();
