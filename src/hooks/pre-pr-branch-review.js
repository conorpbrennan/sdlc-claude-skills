// PreToolUse hook: check the branch-review marker before `gh pr create`.
//
// Opt-in per repository through ~/.claude/branch-review-repos.json (override the
// path with BRANCH_REVIEW_REPOS_CONFIG), keyed by git toplevel:
//   { "version": 1, "repos": { "<toplevel>": { "mode": "advisory" | "enforce", "base": "<ref>" } } }
// A repo that is not listed is not gated. A missing mode means advisory. A missing
// base means the ref origin/HEAD points at.
//   advisory: a missing, stale or unreadable review prints a notice (a
//             systemMessage, shown to the user, not to Claude) and the PR is allowed.
//   enforce:  the same states block the PR, with a reason that names the fix.
//
// Decision order. Each ends the hook:
//   1. Not a `gh pr create` command: approve. No git read, no config read.
//   2. The step `pre-pr-branch-review` is off: approve. Before the config read.
//   3. No config file: approve. An unreadable or unparsable config: block, mode unknown.
//   4. No listed key holds the cwd: approve, with no git process started. cwd not
//      in a repository, or no listed key equals the toplevel: approve. Any other
//      locate error: report state `error` in the holding key's mode.
//   5. An invalid `mode` or `base` in the repo's own entry: block in every mode.
//   6. Read the branch: a read error is `error`, a detached HEAD is `detached`.
//   7. Resolve the base: no ref is `no-base`.
//   8. checkFresh. Fresh: approve. Missing, stale, empty, error: report.
// Advisory mode never blocks. The exceptions are the crash handler below (a hook
// that throws prints nothing, and no output reads as "proceed") and the config
// errors in steps 3 and 5.
//
// The hook never runs the review and never writes a marker. The deny text carries
// a recipe that the person who ran the review pastes.
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
//   - The round in the marker's tag is not checked.
//   - `git push`, `gh pr merge` and web PRs are not gated.
//
// A hook that throws prints nothing. This handler is registered before any
// require: a truncated lib file from a partial install must block too.
process.on('uncaughtException', (e) => {
    const reason = 'Pre-PR hook %s failed: ' + String((e && e.message) || e).split('\n')[0].slice(0, 200);
    try {
        // The lib/hook-output.js deny shape, inline: no require has run yet.
        const message = 'PRE_PR_BRANCH_REVIEW: ' + reason.replace('%s', 'pre-pr-branch-review') +
            '. The hook itself crashed, so the branch review cannot be checked. Report this; the ' +
            'hook source is in sdlc-claude-skills/src/hooks/pre-pr-branch-review.js.';
        console.log(JSON.stringify({
            hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: message },
            decision: 'block',
            reason: reason.replace('%s', 'pre-pr-branch-review'),
            systemMessage: message,
        }));
    } catch (_) { /* nothing more we can do */ }
    process.exit(0);
});

const fs = require('fs');

const { isPrCreate } = require('./lib/pr-command');
const { STATE, RECIPE_TAG, readBranch, resolveBase, markerRecipe, checkFresh } = require('./lib/branch-review');
const reposConfig = require('./lib/branch-repos-config');
const { locateRepo } = require('./lib/git-read');
const { markerPaths } = require('./lib/review-markers');
const hookOutput = require('./lib/hook-output');
const steps = require('./lib/steps');
const { cmd } = require('./lib/plugin-names');

const STEP_ID = 'pre-pr-branch-review';
const MESSAGE_TAG = 'PRE_PR_BRANCH_REVIEW: ';
const REVIEW_COMMAND = 'branch-review';
const STATE_NO_BASE = 'no-base';
const STATE_DETACHED = 'detached';
const DECISION_APPROVE = 'approve';
const ROUND_NOTE = 'Before running it, replace round<n> with the round used.';
const FIX_NO_BASE = 'Set `base` in the repo\'s entry in the branch-review repos config, or run `git remote set-head origin -a`.';
const FIX_DETACHED = 'Check out a branch before opening the PR.';
const FIX_CONFIG_PREFIX = 'Fix the config file ';
const FIX_CONFIG_SUFFIX = ' (unreadable, not valid JSON or no "repos" object), then retry.';
const FIX_ERROR = 'Fix the git problem named above, then retry.';
const FIX_EMPTY = 'The branch has no changes ahead of its base; there is nothing to review. Check the `base` setting.';

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
//   state: string, the review state.
//   detail: string, what the state means here.
//   fix: string, the fix text, with the recipe lines when there is one.
//   mode: string | null, null when the mode cannot be known.
// Returns:
//   object: the deny output for enforce or an unknown mode, the notice for advisory.
function report(state, detail, fix, mode) {
    const base = MESSAGE_TAG + 'branch review is ' + state + '. ' + detail + '\n' + fix;
    if (mode === reposConfig.MODE_ADVISORY) {
        return hookOutput.notice(base + '\nThe PR is allowed anyway (advisory mode).');
    }
    return hookOutput.deny('Branch review is ' + state + ': ' + detail, base);
}

// Args:
//   toplevel: string, the repository's git toplevel.
//   markerFile: string, the marker path.
//   baseRef: string, the resolved base ref.
// Returns:
//   string: the fix text with the recipe on its own line.
function recipeFix(toplevel, markerFile, baseRef) {
    const recipe = markerRecipe({ toplevel, markerPath: markerFile, base: baseRef, tag: RECIPE_TAG });
    return 'Fix: run ' + cmd(REVIEW_COMMAND) + '. When it passes, record the marker with this command. ' +
        ROUND_NOTE + '\n' + recipe;
}

// --- Input -----------------------------------------------------------------
let hookData = {};
try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) { /* no command: approve below */ }
const command = hookData && hookData.tool_input && hookData.tool_input.command;

// 1. Every other Bash call ends here: no config read, no git.
if (!isPrCreate(command)) approve();

// 2. Step switch, before the config read.
const stepRead = steps.stepState(STEP_ID, { cwd: process.cwd() });
for (const w of stepRead.warnings) process.stderr.write(STEP_ID + ': ' + w + '\n');
if (!stepRead.on) approve();

// 3. Config.
const config = reposConfig.readReposConfig(reposConfig.configPath());
if (config.missing) approve();
if (config.error) emit(report(STATE.ERROR, config.error, FIX_CONFIG_PREFIX + reposConfig.configPath() + FIX_CONFIG_SUFFIX, null));

// 4. D9: no git is spawned unless a listed key holds the cwd.
const cwd = reposConfig.realNormalized(process.cwd());
const holder = reposConfig.entryFor(config.repos, cwd);
if (holder === null) approve();
const repo = locateRepo(cwd);
if (repo.notARepo) approve();
if (repo.error) {
    emit(report(STATE.ERROR, 'Could not locate the repository: ' + repo.error, FIX_ERROR, reposConfig.modeOf(holder.entry)));
}
const toplevel = reposConfig.normalize(repo.toplevel);
const own = reposConfig.ownEntry(config.repos, toplevel);
if (own === null) approve();
const entry = own.entry;

// 5. The repo's own mode and base. An invalid one cannot be enforced or relaxed.
const mode = reposConfig.modeOf(entry);
if (mode === null) {
    emit(report(STATE.ERROR, 'The mode for ' + own.key + ' is not "' + reposConfig.MODE_ADVISORY + '" or "' +
        reposConfig.MODE_ENFORCE + '".', 'Fix the mode in the branch-review repos config.', null));
}
const configured = reposConfig.baseOf(entry);
if (!configured.ok) {
    emit(report(STATE.ERROR, 'The base for ' + own.key + ' must be a non-empty ref that does not start with "-".',
        'Fix the base in the branch-review repos config.', null));
}

// 6. Branch.
const branch = readBranch(toplevel);
if (branch.error) emit(report(STATE.ERROR, 'Could not read the branch: ' + branch.error, FIX_ERROR, mode));
if (branch.detached) emit(report(STATE_DETACHED, 'HEAD is detached, so there is no branch to review.', FIX_DETACHED, mode));

// 7. Base.
const base = resolveBase(toplevel, configured.base);
if (base.ref === null) emit(report(STATE_NO_BASE, base.error, FIX_NO_BASE, mode));

// 8. Fresh approves; any other state is a notice or a block.
const markerFile = markerPaths(toplevel).branch;
if (!markerFile) emit(report(STATE.ERROR, 'Could not locate the marker path.', FIX_ERROR, mode));
const result = checkFresh({ cwd: toplevel, base: base.ref, markerFile });
if (result.state === STATE.FRESH) approve();
let fix = FIX_ERROR;
if (result.state === STATE.MISSING || result.state === STATE.STALE) fix = recipeFix(toplevel, markerFile, base.ref);
if (result.state === STATE.EMPTY) fix = FIX_EMPTY;
emit(report(result.state, result.detail, fix, mode));
