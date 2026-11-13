#!/usr/bin/env node
// CLI over the branch-review libraries, run by the branch-review skill.
//
//   node branch-review-cli.js plan [--repo <path>]
//   node branch-review-cli.js check-report <file>
//
// Prints one JSON line. `plan` reads the repo and prints what the reviewer needs
// (base, changed files, cap, groups, marker path and the recipe that writes the
// marker); on any failure it prints { ok: false, error } and exits 1.
// `check-report` prints the parsed verdict and exits 0 on PASS, 1 on FAIL. A
// usage error or an unreadable report file exits 2. Neither subcommand writes.
'use strict';

const fs = require('fs');
const path = require('path');
const { gitRead, locateRepo } = require('./lib/git-read.js');
const { agent } = require('./lib/plugin-names.js');
const { markerPaths } = require('./lib/review-markers.js');
const { resolveBranchReview } = require('./lib/review-config.js');
const { readReposConfig, configPath, ownEntry, baseOf } = require('./lib/branch-repos-config.js');
const { parseReport } = require('./lib/branch-report.js');
const { RECIPE_TAG, readBranch, resolveBase, numstat, groupByTopDir, markerRecipe } = require('./lib/branch-review.js');

const CMD_PLAN = 'plan';
const CMD_CHECK = 'check-report';
const FLAG_PREFIX = '--';
const FLAG_REPO = 'repo';
const REVIEWER = 'code-reviewer-deep';
const VERDICT_PASS = 'PASS';
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;
const USAGE = 'usage: branch-review-cli.js plan [--repo <path>] | check-report <file>';

// Args: argv - the arguments after the script name.
// Returns: { cmd, flags, positional, error }. A flag with no value (last on the
// line, or followed by another flag) is a usage error, reported through `error`.
function parseArgs(argv) {
    const out = { cmd: argv[0], flags: {}, positional: [], error: null };
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
        out.flags[argv[i].slice(FLAG_PREFIX.length)] = next;
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

// Args: argv - the arguments after the script name. Returns: the exit code.
function main(argv) {
    const { cmd, flags, positional, error } = parseArgs(argv);
    if (error || (cmd !== CMD_PLAN && cmd !== CMD_CHECK)) {
        console.error(error || USAGE);
        return EXIT_USAGE;
    }
    if (cmd === CMD_CHECK) return checkReport(positional);
    const res = plan(flags);
    console.log(JSON.stringify(res));
    return res.ok ? EXIT_OK : EXIT_FAIL;
}

process.exitCode = main(process.argv.slice(2));
