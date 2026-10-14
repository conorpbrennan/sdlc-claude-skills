// PreToolUse hook: check the feature's verification before `gh pr create`.
//
// Opt-in per repository through ~/.claude/verify-repos.json (override the path
// with VERIFY_REPOS_CONFIG), keyed by git toplevel:
//   { "version": 1, "repos": { "<toplevel>": { "mode": "advisory" | "enforce" } } }
// A repo that is not listed is not gated. A missing mode means advisory.
//   advisory: a stale, missing or absent verification prints a notice (a
//             systemMessage, shown to the user, not to Claude) and the PR is allowed.
//   enforce:  the same states block the PR, with a reason that names the fix.
//
// Decision order. Each ends the hook:
//   1. Not a `gh pr create` command: approve. No git read, no config read.
//   2. No config file: approve.
//   3. No listed key equals the cwd's real path or is an ancestor of it:
//      approve, with no git process started.
//   4. cwd is not in a repository, or no listed key equals the toplevel: approve.
//   5. An unreadable or unparsable config, an invalid mode, or a git read that
//      failed: block in enforce mode, a notice in advisory mode, a block when
//      the mode cannot be known.
//   6-8. Read the branch and the feature record, run checkFresh. Fresh: approve.
//      Anything else: a notice (advisory) or a block (enforce).
// Advisory mode never blocks. The one exception is the crash handler below: a
// hook that throws prints nothing, and no output reads as "proceed", so a crash
// must block in every mode.
//
// Threat model: this gate guards honest mistakes in the ordinary commands Claude
// writes, not adversarial shell. Gaps, accepted and not chased (ADVISORY):
//   - isPrCreate (lib/pr-command.js) misses `bash -c "gh pr create"`, `eval`,
//     `$GH pr create`, `gh --repo x pr create` and `sudo -u root gh pr create`.
//   - The hook judges the cwd it was started in. `cd other-repo && gh pr create`
//     is checked against the starting repository, not `other-repo`.
//   - A linked worktree of a listed repo, at a path outside the listed
//     toplevel, is not gated (plan decision D9).
//   - The marker is a local file; whoever can write it can forge a PASS.
//
// A hook that throws prints nothing. This handler is registered before any
// require: a truncated lib file from a partial install must block too.
process.on('uncaughtException', (e) => {
    const reason = 'Pre-PR hook %s failed: ' + String((e && e.message) || e).split('\n')[0].slice(0, 200);
    try {
        // The lib/hook-output.js deny shape, inline: no require has run yet.
        const message = 'PRE_PR_VERIFY: ' + reason.replace('%s', 'pre-pr-verify') +
            '. The hook itself crashed, so the verification cannot be checked. Report this; the ' +
            'hook source is in sdlc-claude-skills/src/hooks/pre-pr-verify.js.';
        console.log(JSON.stringify({
            hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: message },
            decision: 'block',
            reason: reason.replace('%s', 'pre-pr-verify'),
            systemMessage: message,
        }));
    } catch (_) { /* nothing more we can do */ }
    process.exit(0);
});

const fs = require('fs');
const os = require('os');
const path = require('path');

const { isPrCreate } = require('./lib/pr-command');
const { checkFresh } = require('./lib/verification');
const { isFeatureBranch } = require(path.join(__dirname, 'lib', 'feature-file'));
const { locateRepo, gitRead } = require('./lib/git-read');
const hookOutput = require('./lib/hook-output');
const { cmd } = require('./lib/plugin-names');

const ENV_CONFIG = 'VERIFY_REPOS_CONFIG';
const MODE_ADVISORY = 'advisory';
const MODE_ENFORCE = 'enforce';
const STATE_FRESH = 'fresh';
const STATE_NO_RECORD = 'no-record';
const STATE_ERROR = 'error';
const DETACHED_HEAD = 'HEAD';
const FEATURES_DIR = 'features';
const RECORD_EXT = '.md';
const MESSAGE_TAG = 'PRE_PR_VERIFY: ';
const ENOENT = 'ENOENT';
const DECISION_APPROVE = 'approve';

// Prints the approve output and ends the hook.
function approve() {
    console.log(JSON.stringify({ decision: DECISION_APPROVE }));
    process.exit(0);
}

// Prints one hook output and ends the hook.
//
// Args:
//   output: object, from hook-output.js.
function emit(output) {
    console.log(JSON.stringify(output));
    process.exit(0);
}

// Args:
//   p: string, a path.
// Returns:
//   string: forward slashes, no trailing slash (except the root).
function normalize(p) {
    const s = String(p).replace(/\\/g, '/');
    return s.length > 1 ? s.replace(/\/+$/, '') : s;
}

// Args:
//   p: string, a path.
// Returns:
//   string: the normalized real path, or the normalized path when it does not exist.
function realNormalized(p) {
    try {
        return normalize(fs.realpathSync(p));
    } catch (e) {
        return normalize(p);
    }
}

// Args:
//   entry: the config entry for one repo.
// Returns:
//   string | null: the mode, MODE_ADVISORY when absent, null when invalid.
function modeOf(entry) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    if (entry.mode === undefined) return MODE_ADVISORY;
    return entry.mode === MODE_ADVISORY || entry.mode === MODE_ENFORCE ? entry.mode : null;
}

// Args:
//   configPath: string, the config file.
// Returns:
//   { missing: true } | { error: string } | { repos: object }
function readConfig(configPath) {
    let text;
    try {
        text = fs.readFileSync(configPath, 'utf-8');
    } catch (e) {
        if (e && e.code === ENOENT) return { missing: true };
        return { error: 'Could not read ' + configPath + ': ' + String((e && e.message) || e).split('\n')[0] };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { error: 'Could not parse ' + configPath + ' as JSON.' };
    }
    const repos = parsed && parsed.repos;
    if (repos === null || typeof repos !== 'object' || Array.isArray(repos)) {
        return { error: configPath + ' has no "repos" object.' };
    }
    return { repos };
}

// Args:
//   state: string, the verification state.
//   detail: string, what the state means here.
//   recordPath: string, the feature record's path.
//   mode: string | null, null when the mode cannot be known.
// Returns:
//   object: the deny output for enforce or an unknown mode, the notice for advisory.
function report(state, detail, recordPath, mode) {
    const base = MESSAGE_TAG + 'verification is ' + state + '. ' + detail +
        ' Feature record: ' + recordPath + '. Fix: run ' + cmd('verify') + '.';
    if (mode === MODE_ADVISORY) {
        return hookOutput.notice(base + ' The PR is allowed anyway (advisory mode).');
    }
    return hookOutput.deny('Verification is ' + state + ': ' + detail, base);
}

// --- Input -----------------------------------------------------------------
let hookData = {};
try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) { /* no command: approve below */ }
const command = hookData && hookData.tool_input && hookData.tool_input.command;

// 1. Every other Bash call ends here: no config read, no git.
if (!isPrCreate(command)) approve();

// 2. Config.
const configPath = process.env[ENV_CONFIG] || path.join(os.homedir(), '.claude', 'verify-repos.json');
const config = readConfig(configPath);
if (config.missing) approve();
const configRel = path.join(FEATURES_DIR, '<branch>' + RECORD_EXT);
if (config.error) emit(report(STATE_ERROR, config.error, configRel, null));

// 3. D9: no git is spawned unless a listed key holds the cwd.
const cwd = realNormalized(process.cwd());
const entries = Object.keys(config.repos).map(key => ({
    keys: [normalize(key), realNormalized(key)],
    entry: config.repos[key],
}));
function holds(k) {
    return cwd === k || cwd.startsWith(k === '/' ? k : k + '/');
}
const holders = entries.filter(e => e.keys.some(holds));
if (holders.length === 0) approve();
const longest = e => Math.max(...e.keys.filter(holds).map(k => k.length));
const holder = holders.reduce((a, b) => (longest(b) > longest(a) ? b : a));

// 4. Locate the repository.
const repo = locateRepo(cwd);
if (repo.notARepo) approve();
if (repo.error) emit(report(STATE_ERROR, 'Could not locate the repository: ' + repo.error, configRel, modeOf(holder.entry)));
const toplevel = normalize(repo.toplevel);
const own = entries.find(e => e.keys.includes(toplevel) || e.keys.includes(realNormalized(toplevel)));
if (!own) approve();

// 5. The listed repo's own mode. An invalid one cannot be enforced or relaxed.
const mode = modeOf(own.entry);
if (mode === null) {
    emit(report(STATE_ERROR, 'The mode for ' + toplevel + ' in ' + configPath + ' is not "' + MODE_ADVISORY + '" or "' + MODE_ENFORCE + '".', configRel, null));
}

// 6. Branch and feature record.
const branchRead = gitRead(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: toplevel });
if (branchRead.out === null) emit(report(STATE_ERROR, 'Could not read the branch: ' + branchRead.error, configRel, mode));
const branch = branchRead.out.trim();
if (branch === DETACHED_HEAD) emit(report(STATE_NO_RECORD, 'HEAD is detached, so there is no feature branch.', configRel, mode));
const recordRel = FEATURES_DIR + '/' + branch + RECORD_EXT;
if (!isFeatureBranch(branch)) {
    emit(report(STATE_NO_RECORD, 'Branch "' + branch + '" is not a feature branch.', recordRel, mode));
}
let record;
try {
    record = fs.readFileSync(path.join(toplevel, FEATURES_DIR, branch + RECORD_EXT), 'utf-8');
} catch (e) {
    if (e && e.code === ENOENT) emit(report(STATE_NO_RECORD, 'There is no feature record.', recordRel, mode));
    emit(report(STATE_ERROR, 'Could not read the feature record: ' + String((e && e.message) || e).split('\n')[0], recordRel, mode));
}

// 7-8. Fresh approves; any other state is a notice or a block.
const result = checkFresh(toplevel, record);
if (result.state === STATE_FRESH) approve();
emit(report(result.state, result.detail, recordRel, mode));
