#!/usr/bin/env node
// CLI over the branch-review libraries, run by the branch-review skill.
//
//   node branch-review-cli.js plan [--repo <path>]
//   node branch-review-cli.js check-report <file>
//   node branch-review-cli.js enable [--mode advisory|enforce] [--repo <path>]
//   node branch-review-cli.js disable [--repo <path>]
//   node branch-review-cli.js status [--repo <path>]
//
// Prints one JSON line. `plan` reads the repo and prints what the reviewer needs
// (base, changed files, cap, groups, marker path and the recipe that writes the
// marker); on any failure it prints { ok: false, error } and exits 1.
// `check-report` prints the parsed verdict and exits 0 on PASS, 1 on FAIL. A
// usage error or an unreadable report file exits 2. Neither subcommand writes.
// `enable` and `disable` list and unlist the repo in the branch-review repos config
// through the branch-repos-write lib (the only writer); `status` reads and prints
// { step, listed, mode, base, baseSource, configPath, warnings }. Exit 0 ok, 1
// refused or failed, 2 usage. None of them edits sdlc-review.json or a settings.json.
'use strict';

const fs = require('fs');
const path = require('path');
const { gitRead, locateRepo } = require('./lib/git-read.js');
const { agent, cmd } = require('./lib/plugin-names.js');
const { markerPaths } = require('./lib/review-markers.js');
const { resolveBranchReview } = require('./lib/review-config.js');
const { readReposConfig, configPath, ownEntry, baseOf, modeOf } = require('./lib/branch-repos-config.js');
const { enableRepo, disableRepo } = require('./lib/branch-repos-write.js');
const { stepState } = require('./lib/steps.js');
const { parseReport } = require('./lib/branch-report.js');
const { RECIPE_TAG, readBranch, resolveBase, numstat, groupByTopDir, markerRecipe } = require('./lib/branch-review.js');

const CMD_PLAN = 'plan';
const CMD_CHECK = 'check-report';
const CMD_ENABLE = 'enable';
const CMD_DISABLE = 'disable';
const CMD_STATUS = 'status';
const FLAG_PREFIX = '--';
const FLAG_REPO = 'repo';
const FLAG_MODE = 'mode';
const MODE_ADVISORY = 'advisory';
const MODE_ENFORCE = 'enforce';
const STEP_ID = 'pre-pr-branch-review';
const STEPS_COMMAND = 'steps';
const STEP_ON = 'on';
const STEP_OFF = 'off';
const MSG_NOT_LISTED = 'not listed';
const SUBCOMMAND_FLAGS = {
    [CMD_ENABLE]: [FLAG_MODE, FLAG_REPO],
    [CMD_DISABLE]: [FLAG_REPO],
    [CMD_STATUS]: [FLAG_REPO],
};
const REVIEWER = 'code-reviewer-deep';
const VERDICT_PASS = 'PASS';
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;
const USAGE = 'usage: branch-review-cli.js plan [--repo <path>] | check-report <file>'
    + ' | enable [--mode advisory|enforce] [--repo <path>] | disable [--repo <path>] | status [--repo <path>]';

// Args: argv - the arguments after the script name.
// Returns: { cmd, flags, positional, repeated, error }. A flag with no value (last
// on the line, or followed by another flag) is a usage error, reported through
// `error`. `repeated` lists the flags given more than once (the last value wins in
// `flags`; only the new subcommands treat a repeat as an error).
function parseArgs(argv) {
    const out = { cmd: argv[0], flags: {}, positional: [], repeated: [], error: null };
    for (let i = 1; i < argv.length; i++) {
        if (!argv[i].startsWith(FLAG_PREFIX)) {
            out.positional.push(argv[i]);
            continue;
        }
        const next = argv[i + 1];
        if (next === undefined || next.startsWith(FLAG_PREFIX)) {
            out.error = argv[i] + ' needs a value';
            continue;
        }
        const name = argv[i].slice(FLAG_PREFIX.length);
        if (Object.prototype.hasOwnProperty.call(out.flags, name)) out.repeated.push(name);
        out.flags[name] = next;
        i++;
    }
    return out;
}

// Args: error - one line. Returns: the failure object for `plan`.
function failure(error) {
    return { ok: false, error };
}

// Args: toplevel - the git toplevel; warnings - array, appended to.
// Returns: { ok: true, base } with `base` the configured base or null, or
// { ok: false, error } for an invalid configured base. A missing file, an
// unlisted repo or a config error all give base null; a config error warns.
function configuredBase(toplevel, warnings) {
    const cfg = readReposConfig(configPath());
    if (cfg.error) warnings.push(cfg.error);
    if (!cfg.repos) return { ok: true, base: null };
    const own = ownEntry(cfg.repos, toplevel);
    if (!own) return { ok: true, base: null };
    const b = baseOf(own.entry);
    if (!b.ok) return { ok: false, error: 'the configured base for ' + own.key + ' is not a usable ref name' };
    return { ok: true, base: b.base };
}

// Args: flags - parsed flags. Returns: the plan object (see the header) or a failure.
function plan(flags) {
    const loc = locateRepo(flags[FLAG_REPO] ? path.resolve(flags[FLAG_REPO]) : process.cwd());
    if (!loc.toplevel) return failure('not inside a git repository: ' + (loc.error || 'no repository found'));
    const toplevel = loc.toplevel;
    const warnings = [];

    const branch = readBranch(toplevel);
    if (branch.name === null) return failure('could not read the branch: ' + branch.error);
    if (branch.detached) return failure('HEAD is detached: check out a branch first');

    const cfgBase = configuredBase(toplevel, warnings);
    if (!cfgBase.ok) return failure(cfgBase.error);
    const base = resolveBase(toplevel, cfgBase.base);
    if (base.ref === null) return failure(base.error);

    const rows = numstat(toplevel, base.ref);
    if (rows === null) return failure('could not read the diff against ' + base.ref);
    if (rows.length === 0) return failure('no changes ahead of ' + base.ref);

    const head = gitRead(['rev-parse', 'HEAD'], { cwd: toplevel });
    if (head.out === null || !head.out.trim()) return failure('could not read HEAD: ' + head.error);
    const status = gitRead(['status', '--porcelain'], { cwd: toplevel });
    if (status.out === null) return failure('could not read the tree status: ' + status.error);

    const review = resolveBranchReview({ repoRoot: toplevel });
    warnings.push(...review.warnings);
    const changedLines = rows.reduce((n, r) => n + r.added + r.removed, 0);
    const overCap = changedLines > review.maxChangedLines;
    const markerPath = markerPaths(toplevel).branch;
    return {
        ok: true,
        toplevel,
        branch: branch.name,
        head: head.out.trim(),
        base: base.ref,
        baseSource: base.source,
        changedLines,
        files: rows.map(r => r.path),
        cap: review.maxChangedLines,
        overCap,
        groups: overCap ? groupByTopDir(rows) : [],
        maxRounds: review.maxRounds,
        model: review.model,
        agent: agent(REVIEWER),
        markerPath,
        recipe: markerRecipe({ toplevel, markerPath, base: base.ref, tag: RECIPE_TAG }),
        dirty: status.out.trim() !== '',
        warnings,
    };
}

// Args: positional - the non-flag arguments after `check-report`.
// Returns: the exit code; prints the parsed report.
function checkReport(positional) {
    if (positional.length !== 1) {
        console.error(USAGE);
        return EXIT_USAGE;
    }
    let text;
    try {
        text = fs.readFileSync(positional[0], 'utf-8');
    } catch (e) {
        console.error('could not read ' + positional[0] + ': ' + String((e && e.message) || e).split('\n')[0]);
        return EXIT_USAGE;
    }
    const res = parseReport(text);
    console.log(JSON.stringify(res));
    return res.verdict === VERDICT_PASS ? EXIT_OK : EXIT_FAIL;
}

// Args: parsed - a parseArgs result for enable, disable or status.
// Returns: string | null, the usage error, or null when the arguments are valid.
function repoCommandError(parsed) {
    if (parsed.error) return parsed.error;
    const allowed = SUBCOMMAND_FLAGS[parsed.cmd];
    const unknown = Object.keys(parsed.flags).filter(f => !allowed.includes(f));
    if (unknown.length > 0) return 'unknown flag: ' + FLAG_PREFIX + unknown[0];
    if (parsed.positional.length > 0) return 'unexpected argument: ' + parsed.positional[0];
    if (parsed.repeated.length > 0) return 'flag given twice: ' + FLAG_PREFIX + parsed.repeated[0];
    const mode = parsed.flags[FLAG_MODE];
    if (mode !== undefined && mode !== MODE_ADVISORY && mode !== MODE_ENFORCE) {
        return FLAG_PREFIX + FLAG_MODE + ' must be ' + MODE_ADVISORY + ' or ' + MODE_ENFORCE;
    }
    return null;
}

// Args: flags - parsed flags; needBranch - true when a detached HEAD refuses.
// Returns: { ok: true, toplevel, warnings } or { ok: false, error }. A detached HEAD
// is a refusal when needBranch is set and a warning otherwise.
function locate(flags, needBranch) {
    const loc = locateRepo(flags[FLAG_REPO] ? path.resolve(flags[FLAG_REPO]) : process.cwd());
    if (!loc.toplevel) return failure('not inside a git repository: ' + (loc.error || 'no repository found'));
    const warnings = [];
    const branch = readBranch(loc.toplevel);
    if (branch.name === null) {
        if (needBranch) return failure('could not read the branch: ' + branch.error);
        warnings.push('could not read the branch: ' + branch.error);
    } else if (branch.detached) {
        if (needBranch) return failure('HEAD is detached: check out a branch first');
        warnings.push('HEAD is detached: check out a branch first');
    }
    return { ok: true, toplevel: loc.toplevel, warnings };
}

// Args: toplevel - the git toplevel. Returns: { on, warnings } from stepState (read only).
function stepOf(toplevel) {
    const st = stepState(STEP_ID, { cwd: toplevel });
    return { on: st.on, warnings: st.warnings || [] };
}

// Args: flags - parsed flags (repo, mode). Returns: the enable result object.
function enable(flags) {
    const loc = locate(flags, true);
    if (!loc.ok) return loc;
    const res = enableRepo({ configPath: configPath(), toplevel: loc.toplevel, mode: flags[FLAG_MODE] });
    if (!res.ok) return failure(res.error);
    const step = stepOf(loc.toplevel);
    const warnings = [...loc.warnings, ...step.warnings];
    if (!step.on) {
        warnings.push('the ' + STEP_ID + ' step is off, so the gate does not run; '
            + cmd(STEPS_COMMAND) + ' ' + STEP_ON + ' branch-review turns it on');
    }
    return {
        ok: true, action: res.action, toplevel: loc.toplevel, key: res.key,
        mode: res.mode, configPath: configPath(), warnings,
    };
}

// Args: flags - parsed flags (repo). Returns: the disable result object.
function disable(flags) {
    const loc = locate(flags, true);
    if (!loc.ok) return loc;
    const res = disableRepo({ configPath: configPath(), toplevel: loc.toplevel });
    if (!res.ok) return failure(res.error);
    return {
        ok: true, removed: res.removed, toplevel: loc.toplevel, key: res.key,
        configPath: configPath(), message: res.removed ? 'removed ' + res.key : MSG_NOT_LISTED,
    };
}

// Args: flags - parsed flags (repo). Returns: the status object; writes nothing.
function status(flags) {
    const loc = locate(flags, false);
    if (!loc.ok) return loc;
    const file = configPath();
    const step = stepOf(loc.toplevel);
    const warnings = [...loc.warnings, ...step.warnings];
    const cfg = readReposConfig(file);
    if (cfg.error) warnings.push(cfg.error);
    const own = cfg.repos ? ownEntry(cfg.repos, loc.toplevel) : null;
    const out = {
        step: step.on ? STEP_ON : STEP_OFF, listed: own !== null, mode: own ? modeOf(own.entry) : null,
        base: null, baseSource: null, configPath: file, warnings,
    };
    const b = own ? baseOf(own.entry) : { ok: true, base: null };
    if (!b.ok) {
        warnings.push('the configured base for ' + own.key + ' is not a usable ref name');
        return out;
    }
    const base = resolveBase(loc.toplevel, b.base);
    if (base.ref === null) {
        warnings.push(base.error);
        return out;
    }
    out.base = base.ref;
    out.baseSource = base.source;
    return out;
}

// Args: argv - the arguments after the script name. Returns: the exit code.
function main(argv) {
    const parsed = parseArgs(argv);
    const { flags, positional, error } = parsed;
    const sub = parsed.cmd;
    const repoCommands = { [CMD_ENABLE]: enable, [CMD_DISABLE]: disable, [CMD_STATUS]: status };
    if (Object.prototype.hasOwnProperty.call(repoCommands, sub)) {
        const bad = repoCommandError(parsed);
        if (bad) {
            console.error(bad);
            return EXIT_USAGE;
        }
        const out = repoCommands[sub](flags);
        console.log(JSON.stringify(out));
        return out.ok === false ? EXIT_FAIL : EXIT_OK;
    }
    if (error || (sub !== CMD_PLAN && sub !== CMD_CHECK)) {
        console.error(error || USAGE);
        return EXIT_USAGE;
    }
    if (sub === CMD_CHECK) return checkReport(positional);
    const res = plan(flags);
    console.log(JSON.stringify(res));
    return res.ok ? EXIT_OK : EXIT_FAIL;
}

process.exitCode = main(process.argv.slice(2));
