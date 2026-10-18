#!/usr/bin/env node
// CLI over lib/review-config.js, run by the review skill.
//
//   node review-config-cli.js review --round <n> [--model <m>] [--repo <path>]
//   node review-config-cli.js plan-review [--repo <path>]
//
// Prints one JSON line. The repo defaults to the git toplevel of the cwd and
// the staged paths come from `git diff --cached`. A git failure does not stop
// the answer: the staged paths are then empty and a warning says why.
'use strict';

const path = require('path');
const { gitRead, locateRepo, splitNul } = require('./lib/git-read.js');
const { resolveReview, resolvePlanReview } = require('./lib/review-config.js');

function parseArgs(argv) {
    const out = { cmd: argv[0], flags: {} };
    for (let i = 1; i < argv.length; i++) {
        if (argv[i].startsWith('--')) out.flags[argv[i].slice(2)] = argv[++i];
    }
    return out;
}

function main(argv) {
    const { cmd, flags } = parseArgs(argv);
    const warnings = [];
    let repoRoot = flags.repo ? path.resolve(flags.repo) : null;
    if (!repoRoot) {
        const loc = locateRepo(process.cwd());
        if (loc.toplevel) repoRoot = loc.toplevel;
        else {
            repoRoot = process.cwd();
            warnings.push('not inside a git repository: ' + (loc.error || 'no repo config or staged paths'));
        }
    }

    if (cmd === 'plan-review') {
        const res = resolvePlanReview({ repoRoot });
        res.warnings = warnings.concat(res.warnings);
        console.log(JSON.stringify(res));
        return 0;
    }
    if (cmd === 'review') {
        const round = parseInt(flags.round, 10);
        if (!Number.isInteger(round) || round < 1) {
            console.error('review needs --round <n>, n >= 1');
            return 2;
        }
        const staged = gitRead(['diff', '--cached', '--name-only', '-z'], { cwd: repoRoot });
        let stagedPaths = [];
        if (staged.out === null) warnings.push('could not read staged paths: ' + staged.error);
        else stagedPaths = splitNul(staged.out);
        const res = resolveReview({
            repoRoot,
            stagedPaths,
            round,
            override: flags.model ? { model: flags.model } : undefined,
        });
        res.warnings = warnings.concat(res.warnings);
        console.log(JSON.stringify(res));
        return 0;
    }
    console.error('usage: review-config-cli.js review --round <n> [--model <m>] [--repo <path>] | plan-review [--repo <path>]');
    return 2;
}

process.exit(main(process.argv.slice(2)));
