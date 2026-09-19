// PreToolUse hook: block `git commit` when staged code has not passed review.
//
// Checks, in the order they run. Each names what it looks at; the timing
// log's `via` field carries the same names.
//   command shape      -> block when the command stages, changes directory,
//                         or commits from somewhere other than the index
//                         (lib/commit-command.js). No lock, no marker.
//   repository         -> approve when the cwd is genuinely not a repo;
//                         block when git could not tell (bad GIT_DIR, git
//                         missing). No lock, no marker.
//   staged code        -> approve when no code file is staged; block when
//                         the index cannot be read.
//   marker             -> approve when a fresh PASS marker matches both the
//                         staged-diff hash and the coverage.xml hash: the
//                         review passed. Releases the lock. A fresh BLOCK
//                         marker for the same diff repeats its reason for
//                         30 s so an unchanged retry is not re-dispatched.
//   review in flight   -> block when a fresh lock is bound to this diff and
//                         no marker matched: a review was requested and has
//                         not passed. The lock never approves. A lock for a
//                         different diff is stale and removed.
//   classifier         -> approve a diff with no semantic change (or a small
//                         change confined to presentational paths); writes
//                         the marker.
//   tdd order          -> opt-in repos: block impl edited before its test,
//                         or impl with no test in the diff.
//   coverage           -> Python repos with coverage.xml: approve when
//                         diff-cover and branch thresholds are met; block
//                         with a gap-patching message when they are not;
//                         wait for the parallel hygiene hook to refresh a
//                         stale coverage.xml first.
//   review required    -> block, write the lock, and tell Claude how to run
//                         the review and write the marker.
//
// Every `--amend` is gated like any other commit: it rewrites HEAD with
// whatever is staged, and staged code is what these checks exist to review.
// A hook that throws prints nothing, and PreToolUse reads no decision as
// "proceed". Every failure must be a block, including our own, so this
// is registered before any require: a truncated lib file from a partial
// install must block too, not exit silently.
process.on('uncaughtException', (e) => {
    const reason = 'Pre-commit hook pre-commit-review failed: ' + String((e && e.message) || e).split('\n')[0].slice(0, 200);
    try {
        console.log(JSON.stringify({
            decision: 'block',
            reason,
            systemMessage: 'PRE_COMMIT_GATE: ' + reason +
                '. The hook itself crashed, so the commit cannot be checked. Report this; the ' +
                'hook source is in sdlc-claude-skills/src/hooks/pre-commit-review.js.',
        }));
    } catch (_) { /* nothing more we can do */ }
    process.exit(0);
});

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const timingLog = require('./timing-log');
const tddOrder = require('./lib/tdd-order');
const commitCommand = require('./lib/commit-command');
const gitRead = require('./lib/git-read');

const MARKER_MAX_AGE_MS = 10 * 60 * 1000;
const BLOCK_MARKER_MAX_AGE_MS = 30 * 1000;
const LOCK_MAX_AGE_MS = 5 * 60 * 1000;
const FAST_PASS_LOG_MAX_LINES = 1000;
// Ceiling for the code-only staged diff read. Node's execSync default is
// 1 MiB, which a fixture-heavy commit overflowed in Sep 2026; the read threw,
// was treated as an empty diff, and the commit was approved as trivial.
const DIFF_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

const SOURCE_EXTENSIONS = [
    '.py', '.java', '.js', '.ts', '.tsx', '.jsx',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs',
    '.rb', '.php', '.swift', '.kt', '.scala', '.sql'
];

const EXCLUDE_PATTERNS = [
    /^\.claude\//, /^\.vscode\//, /^\.idea\//,
    /^node_modules\//, /^__pycache__\//
];

const classifier = require('./lib/diff-classifier');
const { classifyDiff, matchesAnyGlob } = classifier;

// ---------------------------------------------------------------------------
// I/O helpers (not exported)
// ---------------------------------------------------------------------------

function approve() {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

function isFileFresh(filePath, maxAge) {
    try { return (Date.now() - fs.statSync(filePath).mtimeMs) < maxAge; }
    catch (e) { return false; }
}

function readMarkerBody(filePath) {
    try { return fs.readFileSync(filePath, 'utf-8').trimEnd(); }
    catch (e) { return null; }
}


// Returns { files, error }. files is null when the index could not be read:
// an unreadable index is not an empty one, and Gate 3 must not approve on it.
function readStagedCodeFiles() {
    const r = gitRead.gitRead(['diff', '--cached', '--name-only'], { maxBuffer: DIFF_MAX_BUFFER_BYTES });
    if (r.out === null) return { files: null, error: r.error };
    const files = r.out.trim().split('\n').filter(f => f.length > 0);
    return {
        files: files.filter(file => {
            if (EXCLUDE_PATTERNS.some(p => p.test(file))) return false;
            const ext = path.extname(file).toLowerCase();
            return SOURCE_EXTENSIONS.includes(ext);
        }),
        error: null,
    };
}

function readStagedDiff(codeFiles, opts) {
    // Diff ONLY the staged code files. Fixture bytes (.xml, .json, .csv) can
    // never change the classification but can inflate the read past any
    // buffer. Paths go as argv entries, never through a shell string.
    //
    // Returns { text, bytes, error }. On failure text is null, NOT '' -- an
    // unreadable diff must never be mistaken for an empty one. Gate 3b treats
    // null as "cannot classify" and skips the fast path (fail closed).
    //
    // NB: the marker hash (Gate 3a) deliberately keeps hashing the FULL
    // staged diff; its job is to detect any change to the commit, not only
    // to code. Do not narrow that read to match this one.
    const o = opts || {};
    const maxBuffer = o.maxBuffer ||
        parseInt(process.env.REVIEW_DIFF_MAX_BUFFER || '', 10) || DIFF_MAX_BUFFER_BYTES;
    try {
        const text = execFileSync('git', ['diff', '--cached', '-U0', '--', ...(codeFiles || [])], {
            encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer, cwd: o.cwd,
        });
        return { text, bytes: Buffer.byteLength(text), error: null };
    } catch (e) {
        const error = e && e.code === 'ENOBUFS'
            ? 'diff exceeded ' + maxBuffer + ' bytes'
            : String((e && e.message) || e).split('\n')[0].slice(0, 200);
        return { text: null, bytes: null, error };
    }
}

function getStagedDiff(codeFiles, opts) {
    return readStagedDiff(codeFiles, opts).text;
}

// null on a failed read (never the hash of an empty diff).
function getStagedDiffHash() {
    return gitRead.stagedDiffHash();
}

function getCoverageXmlHash(covPath) {
    try {
        const buf = fs.readFileSync(covPath);
        return crypto.createHash('sha1').update(buf).digest('hex');
    } catch (e) { return 'none'; }
}

function loadPolicy(toplevel) {
    const configPath = process.env.REVIEW_POLICY_CONFIG ||
        path.join(os.homedir(), '.claude', 'review-policy.json');
    let repoCfg = {};
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        repoCfg = (JSON.parse(raw)?.repos || {})[toplevel] || {};
    } catch (e) { repoCfg = {}; }
    return {
        presentational_paths: repoCfg.presentational_paths || [],
        trivial_line_threshold: repoCfg.trivial_line_threshold ?? 3,
        diff_cover_threshold: repoCfg.diff_cover_threshold ?? 95,
        branch_cover_threshold: repoCfg.branch_cover_threshold ?? 90,
    };
}

function appendFastPassLog(gitDir, reason, hashPrefix, fileCount) {
    const logPath = path.resolve(gitDir, '.claude-fast-pass-log');
    const line = `${new Date().toISOString()} ${reason} ${hashPrefix} files=${fileCount}\n`;
    try {
        fs.appendFileSync(logPath, line);
        // Rotate at cap (keep last FAST_PASS_LOG_MAX_LINES).
        const content = fs.readFileSync(logPath, 'utf-8');
        const lines = content.split('\n');
        if (lines.length > FAST_PASS_LOG_MAX_LINES + 100) {
            fs.writeFileSync(logPath, lines.slice(-FAST_PASS_LOG_MAX_LINES).join('\n'));
        }
    } catch (e) { /* non-fatal */ }
}

// Lock body: `<ISO timestamp>\n<diff hash>`. The hash binds the lock to the
// diff whose review was requested; a lock for another diff is stale.
function writeLock(lockPath, diffHash) {
    try { fs.writeFileSync(lockPath, new Date().toISOString() + '\n' + (diffHash || 'none'), 'utf-8'); }
    catch (e) { /* non-fatal */ }
}

function readLock(lockPath) {
    let body;
    try { body = fs.readFileSync(lockPath, 'utf-8'); } catch (e) { return null; }
    const [ts, diffHash] = body.trim().split('\n');
    const at = Date.parse(ts || '');
    return {
        at: Number.isNaN(at) ? null : at,
        diffHash: diffHash || null,
        fresh: isFileFresh(lockPath, LOCK_MAX_AGE_MS),
    };
}

function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// The one marker recipe. It recomputes both hashes at write time, so it is
// right after a fix-and-rerun (diff changed) or a coverage regeneration
// (coverage.xml changed); a recipe with hashes captured at block time is
// stale by then and costs a wasted review round. printf, not echo: bash's
// builtin echo does not expand \n. The fourth line names the agent and
// round for the timing log; the hook accepts any fourth line.
function markerRecipe(markerPath, coveragePath, tag) {
    const cov = coveragePath
        ? '"$( [ -f ' + shellQuote(coveragePath) + ' ] && sha1sum ' + shellQuote(coveragePath) + " | awk '{print $1}' || echo none )\""
        : 'none';
    return "printf 'PASS\\n%s\\n%s\\n%s' \"$(" + gitRead.HASH_PIPELINE + ")\" " +
        cov + ' ' + shellQuote(tag) + ' > ' + shellQuote(markerPath);
}

// What every review-required block tells Claude, in one place: the rounds
// policy and the marker recipe.
const ROUNDS_POLICY = 'Round 1 is code-reviewer. Rerun with --deep (code-reviewer-deep) only after a ' +
    'FAIL with a CRITICAL or a correctness finding in a parser, gate or shell hunk; a pure scope/' +
    'artefact/secret/churn FAIL reruns on code-reviewer. After two FAILs stop, show the open items, ' +
    'and ask the user to fix-and-rerun or to accept with the gap named in the commit message.';

function writeMarker(markerPath, diffHash, covHash, tag) {
    try {
        const body = `PASS\n${diffHash || 'none'}\n${covHash || 'none'}${tag ? '\n' + tag : ''}`;
        fs.writeFileSync(markerPath, body, 'utf-8');
    } catch (e) { /* non-fatal */ }
}

function writeBlockMarker(markerPath, diffHash, shortReason) {
    if (!diffHash) return;
    const body = ['BLOCK', diffHash, (shortReason || '').slice(0, 200)].join('\n');
    try { fs.writeFileSync(markerPath, body, 'utf-8'); } catch (e) {}
}

function runDiffCover(coveragePath, toplevel, diffCoverThreshold) {
    // DIFF_COVER_CMD may be a bare command name, a full path, or a compound
    // like "node /path/mock.js" (test harness). Pass through shell so the
    // shell parses the cmd verbatim. Quote only the path args.
    //
    // Machine-readable output goes via `--format json:<tmpfile>`. The legacy
    // `--format json` (no path) was dropped in recent diff-cover; its parser
    // rejects the bare value with "dictionary update sequence element #0 has
    // length 1; 2 is required". If an even older diff-cover doesn't accept
    // `json:<path>` the spawn errors and dc.status stays null, so the outer
    // caller falls through to Gate 4 (marker-based path).
    const cmd = process.env.DIFF_COVER_CMD || 'diff-cover';
    const reportPath = path.join(
        os.tmpdir(),
        `claude-dc-${process.pid}-${Date.now()}.json`
    );
    const args = [
        coveragePath,
        '--compare-branch=HEAD',
        '--fail-under=' + diffCoverThreshold,
        '--format', 'json:' + reportPath,
    ];
    try {
        const shellCmd = cmd + ' ' + args.map(a => `"${a}"`).join(' ');
        const result = spawnSync(shellCmd, {
            cwd: toplevel, encoding: 'utf-8', timeout: 10000, shell: true,
        });
        const stdout = result.stdout || '';
        let parsed = null;
        try {
            if (fs.existsSync(reportPath)) {
                parsed = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
            }
        } catch (e) { parsed = null; }
        try { if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath); } catch (e) {}
        return { status: result.status, signal: result.signal, stdout, parsed };
    } catch (e) {
        try { if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath); } catch (_) {}
        return { status: null, signal: null, stdout: '', parsed: null, error: e };
    }
}

function readBranchCoverage(coveragePath, stagedFiles, toplevel) {
    // Parse coverage.xml <class filename="..."> entries for branches-covered /
    // branches-valid. Returns the minimum branch-cov percentage across the
    // staged files that are present in coverage.xml. Files absent from the
    // XML count as 100% (can't regress what isn't measured here; diff-cover
    // still catches them via line coverage).
    let xml;
    try { xml = fs.readFileSync(coveragePath, 'utf-8'); }
    catch (e) { return null; }
    const classRe = /<class\b[^>]*filename="([^"]+)"[^>]*branches-covered="(\d+)"[^>]*branches-valid="(\d+)"/g;
    const altRe = /<class\b[^>]*filename="([^"]+)"[^>]*/g; // fallback for attr ordering
    const perFile = {};
    let m;
    while ((m = classRe.exec(xml)) !== null) {
        const [, filename, covered, valid] = m;
        const v = parseInt(valid, 10);
        const pct = v === 0 ? 100 : (parseInt(covered, 10) / v) * 100;
        perFile[filename.replace(/\\/g, '/')] = pct;
    }
    const stagedNormalised = stagedFiles.map(f => f.replace(/\\/g, '/'));
    let minPct = 100;
    for (const f of stagedNormalised) {
        // Match by suffix — coverage.xml filenames may be absolute or package-relative.
        const hit = Object.keys(perFile).find(k => k === f || k.endsWith('/' + f) || f.endsWith('/' + k));
        if (hit !== undefined) minPct = Math.min(minPct, perFile[hit]);
    }
    return minPct;
}

function extractUncovered(parsed) {
    if (!parsed || !parsed.src_stats) return [];
    const out = [];
    for (const [file, stats] of Object.entries(parsed.src_stats)) {
        const lines = stats.violation_lines || stats.violation_lines_list || [];
        if (lines && lines.length) out.push({ file, lines });
    }
    return out;
}

function findCoverageXml(toplevel) {
    if (process.env.COVERAGE_XML_PATH) {
        return fs.existsSync(process.env.COVERAGE_XML_PATH)
            ? process.env.COVERAGE_XML_PATH : null;
    }
    const p = path.join(toplevel, 'coverage.xml');
    return fs.existsSync(p) ? p : null;
}

function sanitizePath(p) {
    return p.replace(/[^a-zA-Z0-9_./()\- ]/g, '_');
}

// --- Stale-coverage handling -------------------------------------------------
// When coverage.xml is older than any staged file we wait for the parallel
// pre-commit-hygiene hook (which runs pytest-cov) to refresh it, instead of
// running pytest-cov ourselves and racing for the same file.

function loadHygieneRepoCfg(toplevel) {
    const cfgPath = process.env.HYGIENE_REPOS_CONFIG ||
        path.join(os.homedir(), '.claude', 'hygiene-repos.json');
    try {
        const raw = fs.readFileSync(cfgPath, 'utf-8');
        return (JSON.parse(raw)?.repos || {})[toplevel] || null;
    } catch (e) { return null; }
}

function isCovCheck(check) {
    const name = (check.name || '').toLowerCase();
    const cmd = check.command || '';
    return name.includes('cov') || /--cov(-report|-branch|=|\b)/.test(cmd);
}

function hygieneHasCovCheck(repoCfg) {
    if (!repoCfg) return false;
    return (repoCfg.checks || []).some(isCovCheck);
}

function pollForFreshCoverage(covPath, newerThanMs, timeoutMs) {
    // Spin-wait for coverage.xml to become at least as fresh as `newerThanMs`.
    // Used when the hygiene hook is running pytest-cov in parallel and we want
    // to consume its result instead of duplicating the work.
    // Polling resolution is 500ms via Atomics.wait (synchronous, no timers).
    const POLL_INTERVAL_MS = 500;
    const sab = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const st = fs.statSync(covPath);
            if (st.mtimeMs >= newerThanMs) return true;
        } catch (e) { /* file may not exist yet */ }
        const left = deadline - Date.now();
        if (left <= 0) break;
        Atomics.wait(sab, 0, 0, Math.min(POLL_INTERVAL_MS, left));
    }
    return false;
}

// ---------------------------------------------------------------------------
// Gate 3e: TDD-order check (opt-in via ~/.claude/tdd-order-repos.json).
// ---------------------------------------------------------------------------

function loadTddOrderRepos() {
    const cfgPath = process.env.TDD_ORDER_REPOS_CONFIG ||
        path.join(os.homedir(), '.claude', 'tdd-order-repos.json');
    try {
        const raw = fs.readFileSync(cfgPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.repos) ? parsed.repos : [];
    } catch (e) { return []; }
}

function repoIsOptedIn(toplevel, repos) {
    if (!toplevel) return false;
    const norm = s => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const target = norm(toplevel);
    return repos.some(r => norm(r) === target);
}

// null when the index could not be read (never [] for a failure).
function getAllStagedPaths() {
    const r = gitRead.gitRead(['diff', '--cached', '--name-only'], { maxBuffer: DIFF_MAX_BUFFER_BYTES });
    return r.out === null ? null : r.out.trim().split('\n').filter(Boolean);
}

// Returns { action: 'block'|'continue', status, firstTestPath, firstImplPath, mode, reason }.
// action='continue' means the gate did not fire (skip / dry-run / not code_first).
// action='block' means caller should emit a block decision.
function evaluateTddOrderGate(toplevel, transcriptPath) {
    const repos = loadTddOrderRepos();
    if (!repoIsOptedIn(toplevel, repos)) {
        return { action: 'continue', reason: 'not-opted-in' };
    }
    if (!transcriptPath) {
        return { action: 'continue', reason: 'no-transcript' };
    }
    const stagedPaths = getAllStagedPaths();
    if (stagedPaths === null) {
        // Fail closed: an opted-in repo whose index cannot be read gets no
        // TDD-order verdict, and no verdict is not a pass.
        return { action: 'block', status: 'unreadable', reason: 'staged-paths-unreadable' };
    }
    if (stagedPaths.length === 0) {
        return { action: 'continue', reason: 'no-staged-paths' };
    }
    let result;
    try {
        result = tddOrder.classifyTddOrder({ stagedPaths, transcriptPath });
    } catch (e) {
        return { action: 'continue', reason: 'classifier-error:' + (e.message || 'unknown') };
    }
    // Block both code_first (impl edited before test) and no_tests (impl
    // touched, no test file in the diff). Together they guarantee every
    // substantive code change in an opted-in repo arrives with a paired
    // test edited in the right order. To bypass for a genuine edge case,
    // remove the repo from ~/.claude/tdd-order-repos.json -- a deliberate,
    // visible action rather than a shell-rc footgun.
    if (result.status === 'code_first' || result.status === 'no_tests') {
        return {
            action: 'block',
            status: result.status,
            firstTestPath: result.firstTestPath || '',
            firstImplPath: result.firstImplPath || '',
            reason: result.status,
        };
    }
    return { action: 'continue', reason: 'status:' + result.status };
}

// ---------------------------------------------------------------------------
// Main (hook entrypoint)
// ---------------------------------------------------------------------------

function main() {
    let hookData = {};
    try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) {}
    const input = hookData.tool_input?.command || '';

    const shape = commitCommand.classifyCommitCommand(input);
    if (shape.kind === 'not-a-commit') {
        process.exit(0);
    }

    const hookTimer = timingLog.timer();
    const hookMeta = { hook: 'pre-commit-review' };
    function endHook(decision, extra) {
        timingLog.logEvent('hook.end', { ...hookMeta, decision, total_ms: hookTimer(), ...(extra || {}) });
    }
    // The one way out on a block: the decision on stdout for the harness,
    // the hook.end event for the timing log, then exit. Lock and marker
    // writes stay at the call sites, since each check decides differently.
    function block(via, reason, systemMessage) {
        console.log(JSON.stringify({ decision: 'block', reason, systemMessage }));
        endHook('block', { via });
        process.exit(0);
    }
    timingLog.logEvent('hook.start', { ...hookMeta });

    // Command shape: the index must be what will be committed. Deliberately no lock
    // and no marker: a retry with the same command shape must block again.
    if (shape.kind === 'unreliable') {
        block('command-unreliable', shape.reason,
            commitCommand.blockMessage(shape.reason));
    }

    // Repository: not in one -> approve. "Could not tell" is not "not a
    // repo": a bad GIT_DIR or a broken git breaks every later read too, so
    // block here, with no lock and no marker.
    const repo = gitRead.locateRepo();
    // A `cd` before the commit may leave the repository the hook inspected.
    const cdReason = commitCommand.directoryChangeReason(shape.cds, process.cwd(), repo.toplevel);
    if (cdReason) {
        block('command-directory-change', cdReason,
            commitCommand.blockMessage(cdReason));
    }
    if (repo.notARepo) { endHook('approve', { via: 'repo-none' }); approve(); }
    if (!repo.gitDir) {
        const reason = 'Repository could not be located (' + repo.error + ')';
        block('repo-unreadable', reason,
            'PRE_COMMIT_REVIEW: ' + reason + ', so the commit cannot be checked. ' +
                'Retry; if it persists, check GIT_DIR/GIT_WORK_TREE, PATH, and the cwd.');
    }
    const gitDir = repo.gitDir;

    const MARKER_FILE = path.resolve(gitDir, '.claude-last-review');
    const LOCK_FILE = path.resolve(gitDir, '.claude-review-in-progress');

    // Staged code: none -> approve. An unreadable index is NOT
    // "no staged code": block outright, with no lock and no marker, so the
    // retry re-reads the index. Every later gate needs this list, so there
    // is nothing to fall through to.
    const staged = readStagedCodeFiles();
    if (staged.files === null) {
        const reason = 'Staged file list could not be read (' + staged.error + ')';
        timingLog.logEvent('staged_files_read', { ...hookMeta, ok: false, error: staged.error });
        block('staged-unreadable', reason,
            'PRE_COMMIT_REVIEW: ' + reason + ', so the commit cannot be checked. ' +
                'Retry; if it persists, check the repository state (index.lock, GIT_DIR, cwd).');
    }
    const codeFiles = staged.files;
    if (codeFiles.length === 0) { endHook('approve', { via: 'staged-no-code' }); approve(); }

    const toplevel = repo.toplevel;
    const policy = loadPolicy(toplevel);
    const diffHash = getStagedDiffHash();
    const coveragePath = findCoverageXml(toplevel);
    const covHash = coveragePath ? getCoverageXmlHash(coveragePath) : 'none';
    hookMeta.repo = toplevel || null;
    hookMeta.diff_hash_prefix = (diffHash || '').slice(0, 8);
    hookMeta.n_staged_files = codeFiles.length;

    // Marker: a fresh PASS marker matching both hashes means the review passed.
    const markerBody = readMarkerBody(MARKER_FILE);
    const markerFresh = isFileFresh(MARKER_FILE, MARKER_MAX_AGE_MS);
    const markerFreshShort = isFileFresh(MARKER_FILE, BLOCK_MARKER_MAX_AGE_MS);
    if (markerFresh && markerBody) {
        const parts = markerBody.split('\n');
        if (parts[0] === 'PASS' && parts.length >= 3 && diffHash) {
            if (parts[1] === diffHash && parts[2] === covHash) {
                // The review this lock was written for has passed: measure it
                // (lock -> marker match is the sub-agent's wall clock) and
                // release it.
                const lock = readLock(LOCK_FILE);
                if (lock && lock.at !== null) {
                    timingLog.logEvent('review.completed_inferred', {
                        ...hookMeta, duration_ms: Date.now() - lock.at, marker_tag: parts[3] || null,
                    });
                }
                try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
                appendFastPassLog(gitDir, 'hash-short-circuit', (diffHash || '').slice(0, 8), codeFiles.length);
                endHook('approve', { via: 'marker-match', marker_tag: parts[3] || null });
                approve();
            }
        }
        if (parts[0] === 'BLOCK' && parts.length >= 2 && diffHash &&
            markerFreshShort && parts[1] === diffHash) {
            const priorReason = parts[2] || 'prior block (no reason recorded)';
            timingLog.logEvent('review.requested', { ...hookMeta, via: 'marker-block-repeat' });
            block('marker-block-repeat', 'Same diff blocked < 30s ago',
                'PRE_COMMIT_REVIEW: ' + priorReason + '. Same staged diff was just blocked. Modify the diff or run `rm ' + MARKER_FILE + '` to force a fresh review.');
        }
    }

    // Review in flight: a fresh lock for THIS diff and no matching marker.
    // Block until the marker matches (the check above) or the requester removes the
    // lock. A lock written for a different diff is stale: the diff changed
    // after the block, so every gate below gets its normal chance.
    const lock = readLock(LOCK_FILE);
    if (lock && lock.fresh) {
        if (lock.diffHash && diffHash && lock.diffHash === diffHash) {
            const ago = lock.at !== null ? Math.round((Date.now() - lock.at) / 1000) : null;
            const reason = 'A review was requested' + (ago !== null ? ' ' + ago + 's ago' : '') +
                ' for this exact staged diff and no PASS marker matches it';
            block('review-in-flight', reason,
                'PRE_COMMIT_REVIEW: ' + reason + '. Finish that review and, on ' +
                    'TDD_GATE: PASS, run exactly: ' + markerRecipe(MARKER_FILE, coveragePath, 'code-reviewer:round1:PASS') +
                    ' (replace code-reviewer:round1 with the agent and round used); or run `rm ' +
                    shellQuote(LOCK_FILE) + '` to request a fresh review.');
        }
        try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
    }

    // Classifier: trivial-diff fast path over the staged CODE files only.
    // A read failure (null) is not an empty diff: skip the fast path and let
    // the review gates below decide. The note is carried into the default
    // block message so the developer can see why the fast path was skipped.
    const diffRead = readStagedDiff(codeFiles);
    timingLog.logEvent('staged_diff_read', {
        ...hookMeta, bytes: diffRead.bytes, ok: diffRead.text !== null, error: diffRead.error,
    });
    let diffReadNote = '';
    let semanticNote = '';
    if (diffRead.text === null) {
        diffReadNote = 'Staged diff could not be read (' + diffRead.error + '), so the trivial-diff fast path was skipped. ';
    } else {
        const classification = classifyDiff(diffRead.text);
        semanticNote = ' (' + classification.semanticAdded + ' semantic lines added, ' +
            classification.semanticRemoved + ' removed)';
        let fastPathReason = null;
        if (classification.semanticAdded === 0 && classification.semanticRemoved === 0) {
            fastPathReason = 'trivial-diff';
        } else if (
            classification.semanticAdded <= policy.trivial_line_threshold &&
            classification.semanticRemoved === 0 &&
            policy.presentational_paths.length > 0 &&
            codeFiles.every(f => matchesAnyGlob(f, policy.presentational_paths))
        ) {
            fastPathReason = 'presentational';
        }
        if (fastPathReason) {
            writeMarker(MARKER_FILE, diffHash, covHash, fastPathReason);
            appendFastPassLog(gitDir, fastPathReason, (diffHash || '').slice(0, 8), codeFiles.length);
            endHook('approve', { via: 'classifier-' + fastPathReason });
            approve();
        }
    }

    // TDD order (opt-in repos only). Blocks both code_first
    // (impl edited before test) and no_tests (impl touched, no test in
    // the diff). Mandatory for opted-in repos; the opt-in list is the
    // only knob.
    const tddGate = evaluateTddOrderGate(toplevel, hookData.transcript_path);
    timingLog.logEvent('tdd_order_gate', {
        ...hookMeta,
        action: tddGate.action,
        status: tddGate.status || null,
        reason: tddGate.reason,
    });
    if (tddGate.action === 'block') {
        // No lock for an unreadable index: the retry must re-read.
        if (tddGate.status !== 'unreadable') writeLock(LOCK_FILE, diffHash);
        let reason;
        let remedy;
        if (tddGate.status === 'unreadable') {
            reason = 'TDD gate: staged file list could not be read, so the commit cannot be checked.';
            remedy = ' Retry; if it persists, check the repository state (index.lock, GIT_DIR, cwd).';
        } else if (tddGate.status === 'no_tests') {
            reason = 'TDD gate: no_tests commit blocked. Impl files were ' +
                'touched but no test file is in the diff.';
            remedy = ' Add a paired test for the change before committing.';
        } else {
            const detail = (tddGate.firstTestPath && tddGate.firstImplPath)
                ? ' Impl ' + sanitizePath(tddGate.firstImplPath) +
                  ' was edited before test ' + sanitizePath(tddGate.firstTestPath) + '.'
                : '';
            reason = 'TDD gate: code_first commit blocked.' + detail;
            remedy = ' Split the commit so the test edit goes in first, or amend ' +
                'the test before the impl edit.';
        }
        if (tddGate.status !== 'unreadable') {
            writeBlockMarker(MARKER_FILE, diffHash, 'tdd-order: ' + tddGate.status);
        }
        timingLog.logEvent('review.requested', { ...hookMeta, via: 'tdd-order' });
        block('tdd-order', reason,
            'PRE_COMMIT_REVIEW: ' + reason + remedy +
                ' To bypass for a genuine edge case, remove this repo from ' +
                '~/.claude/tdd-order-repos.json.');
    }

    // Coverage: hook-level threshold check (Python only, coverage.xml must exist).
    // Passes if diff-cover exits 0 AND per-file branch coverage on staged
    // files meets the policy threshold AND coverage.xml is fresher than any
    // staged source file. Also passes when diff-cover exits non-zero but
    // produces no uncovered lines (empty-gap false-positive guard). Fails
    // with actionable gaps => gap-patching dispatch.
    //
    // Staleness handling: if coverage.xml is older than any staged file and
    // the repo has a hygiene cov check configured, wait for the parallel
    // hygiene hook to refresh coverage.xml (no duplicate pytest-cov). Block
    // with a clear message when there's no hygiene cov check or the wait
    // times out (typically because hygiene's earlier checks failed).
    let effectiveCovHash = covHash;
    if (coveragePath) {
        const covStat = (() => { try { return fs.statSync(coveragePath); } catch (e) { return null; } })();
        const newestStagedMtime = codeFiles
            .map(f => { try { return fs.statSync(path.join(toplevel, f)).mtimeMs; } catch (e) { return 0; } })
            .reduce((a, b) => Math.max(a, b), 0);
        let coverageFresh = covStat && covStat.mtimeMs >= newestStagedMtime;
        if (!coverageFresh) {
            // Hygiene hook runs pytest-cov in parallel; wait for it to refresh
            // coverage.xml rather than running pytest twice in parallel.
            const hygieneCfg = loadHygieneRepoCfg(toplevel);
            const deferToHygiene = hygieneHasCovCheck(hygieneCfg);
            const waitTimer = timingLog.timer();
            if (deferToHygiene) {
                const waitTimeoutMs = parseInt(process.env.COV_WAIT_TIMEOUT_MS || '120000', 10);
                const fresh = pollForFreshCoverage(coveragePath, newestStagedMtime, waitTimeoutMs);
                timingLog.logEvent('regen.coverage', {
                    ...hookMeta,
                    duration_ms: waitTimer(),
                    attempted: true,
                    success: fresh,
                    via: 'wait-for-hygiene',
                });
                if (fresh) {
                    try {
                        const newStat = fs.statSync(coveragePath);
                        coverageFresh = newStat.mtimeMs >= newestStagedMtime;
                        effectiveCovHash = getCoverageXmlHash(coveragePath);
                    } catch (e) { coverageFresh = false; }
                }
            } else {
                timingLog.logEvent('regen.coverage', {
                    ...hookMeta,
                    duration_ms: waitTimer(),
                    attempted: false,
                    success: false,
                    via: 'no-hygiene-config',
                });
            }
            if (!coverageFresh) {
                timingLog.logEvent('review.requested', { ...hookMeta, via: 'coverage-stale' });
                writeLock(LOCK_FILE, diffHash);
                const blockTag = deferToHygiene ? 'wait-for-hygiene timed out' : 'no hygiene cov check';
                writeBlockMarker(MARKER_FILE, diffHash, 'coverage-stale: ' + blockTag);
                const reason = deferToHygiene
                    ? 'Hygiene did not produce fresh coverage.xml in time'
                    : 'coverage.xml is stale (older than staged files) and no hygiene cov check is configured';
                const guidance = deferToHygiene
                    ? ' Wait for the hygiene hook to finish or check why it failed (ruff/pytest), then retry the commit.'
                    : ' Regenerate manually: pytest --cov --cov-branch --cov-report=xml -q (or run /commit-prep).';
                block('coverage-stale', reason,
                    'PRE_COMMIT_REVIEW: ' + reason + '.' + guidance);
            }
        }
        const dcTimer = timingLog.timer();
        const dc = runDiffCover(coveragePath, toplevel, policy.diff_cover_threshold);
        const dcDurationMs = dcTimer();
        const minBranchCov = readBranchCoverage(coveragePath, codeFiles, toplevel);
        const branchCovOk = minBranchCov === null || minBranchCov >= policy.branch_cover_threshold;
        timingLog.logEvent('diff_cover', {
            ...hookMeta,
            duration_ms: dcDurationMs,
            status: dc.status,
            branch_cov_ok: !!branchCovOk,
            min_branch_cov: minBranchCov,
        });
        const dcRan = dc.status !== null;
        const dcOk = dc.status === 0;
        const uncovered = dcRan ? extractUncovered(dc.parsed) : [];
        // Empty-gap guard: diff-cover sometimes returns non-zero exit while the
        // src_stats payload reports no uncovered lines (e.g. its
        // total_percent_covered metric is below threshold but every individual
        // line is covered). Dispatching a gap-patching sub-agent in that case
        // wastes ~3 minutes "fixing" nothing. If branch coverage is also fine,
        // approve as thresholds-met-empty-gap.
        const haveActionableGap = uncovered.length > 0 || (minBranchCov !== null && !branchCovOk);
        if (dcRan && !haveActionableGap) {
            const tag = dcOk ? 'thresholds-met' : 'thresholds-met-empty-gap';
            writeMarker(MARKER_FILE, diffHash, effectiveCovHash, tag);
            appendFastPassLog(gitDir, tag, (diffHash || '').slice(0, 8), codeFiles.length);
            endHook('approve', { via: 'coverage-' + tag });
            approve();
        }
        if (dcRan && haveActionableGap) {
            // Coverage gap: gap-patching dispatch.
            const uncoveredSummary = uncovered.length
                ? uncovered.map(u => `${sanitizePath(u.file)}:${u.lines.slice(0, 10).join(',')}`).join(' ')
                : '(no per-file detail)';
            const branchNote = (!branchCovOk)
                ? ` Branch coverage ${minBranchCov.toFixed(1)}% < ${policy.branch_cover_threshold}% threshold.`
                : '';
            timingLog.logEvent('review.requested', { ...hookMeta, via: 'coverage-gap-patch' });
            writeLock(LOCK_FILE, diffHash);
            writeBlockMarker(MARKER_FILE, diffHash, 'coverage-gap-patch: ' + uncovered.length + ' uncovered file(s)');
            block('coverage-gap-patch', 'Coverage thresholds not met',
                'PRE_COMMIT_REVIEW: diff-cover reported uncovered lines.' + branchNote +
                    ' Dispatch ONE gap-patching sub-agent per the <gap-patching-mode> section of the ' +
                    'code-review-pre-commit skill. Thresholds: diff-cover ' + policy.diff_cover_threshold +
                    '%, branch ' + policy.branch_cover_threshold + '%. Uncovered: ' + uncoveredSummary +
                    '. On success run exactly: ' + markerRecipe(MARKER_FILE, coveragePath, 'gap-patch:round1:PASS') + '.');
        }
        // dc.status === null: diff-cover absent or errored. Fall through to the default block.
    }

    // Review required: nothing above approved. Write the lock and say how to proceed.
    timingLog.logEvent('review.requested', { ...hookMeta, via: 'review-required' });
    writeLock(LOCK_FILE, diffHash);
    const fileList = codeFiles.map(sanitizePath).join(', ');
    let reason;
    if (markerFresh && markerBody === '') {
        reason = 'Review marker is empty. Run /code-review-pre-commit --fresh and write the marker with the printf command below if the review passes.';
    } else if (markerFresh && markerBody && markerBody.split('\n')[0] !== 'PASS') {
        reason = 'Last review did not pass the review gate (marker body: ' + markerBody.split('\n')[0] + '). Fix the failing items and rerun /code-review-pre-commit --fresh.';
    } else if (markerFresh && markerBody && markerBody.split('\n').length < 3) {
        reason = 'Review marker has no hashes (a legacy one-line PASS no longer approves). Rerun the review and write the marker with the printf command below.';
    } else {
        reason = 'Code review required before commit';
    }
    reason = diffReadNote + reason;
    writeBlockMarker(MARKER_FILE, diffHash, 'review-required: ' + reason.split('\n')[0].slice(0, 120));
    block('review-required', reason,
        'PRE_COMMIT_REVIEW: ' + diffReadNote + 'Run /code-review-pre-commit --fresh on the ' +
        'staged files: ' + fileList + semanticNote + '. ' + ROUNDS_POLICY +
        ' On TDD_GATE: PASS run exactly: ' + markerRecipe(MARKER_FILE, coveragePath, 'code-reviewer:round1:PASS') +
        ' (replace code-reviewer:round1 with the agent and round used). On TDD_GATE: FAIL do not write the marker.');
}

if (require.main === module) {
    main();
}

module.exports = {
    ...classifier,
    readBranchCoverage,
    pollForFreshCoverage,
    hygieneHasCovCheck,
    isCovCheck,
    extractUncovered,
    loadTddOrderRepos,
    repoIsOptedIn,
    evaluateTddOrderGate,
    readStagedDiff,
    getStagedDiff,
    readStagedCodeFiles,
    getAllStagedPaths,
    markerRecipe,
    readLock,
    writeLock,
};
