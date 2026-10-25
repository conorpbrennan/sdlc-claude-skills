#!/usr/bin/env node
// CLI over lib/steps.js, run by /sdlc:steps.
//
//   node steps-cli.js list [--repo <path>] [--json]
//
// Prints every sdlc workflow step with its state and where that state comes
// from. The repo defaults to the git toplevel of the cwd, else none. The
// lookup is one listSteps call. Exit 0 whatever the config holds.
'use strict';

const { locateRepo } = require('./lib/git-read.js');
const { listSteps, SOURCE_USER, SOURCE_REPO, SOURCE_ALIAS } = require('./lib/steps.js');

const GUARD_FOOTER = 'Guard areas (tdd, review, commit-conventions) switch from the user file only.';
const LABEL_DEFAULT = 'default';
const LABEL_USER = 'user file';
const LABEL_REPO = 'repo file';
const LABEL_ALIAS = 'alias';
const STATE_ON = 'on';
const STATE_OFF = 'off';
const GAP = '  ';

// Args:
//   argv: arguments after the command name.
// Returns: { flags: { [name]: string|true }, error: string|null }. `--json`
//   takes no value; `--repo` needs one.
function parseArgs(argv) {
    const out = { flags: {}, error: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--json') {
            out.flags.json = true;
        } else if (a === '--repo') {
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) out.error = '--repo needs a value';
            else { out.flags.repo = next; i++; }
        } else {
            out.error = `unknown argument '${a}'`;
        }
    }
    return out;
}

// Args:
//   state: a state from listSteps.
// Returns: the source label, e.g. `user file (steps.hygiene)`.
function sourceLabel(state) {
    const where = { [SOURCE_USER]: LABEL_USER, [SOURCE_REPO]: LABEL_REPO, [SOURCE_ALIAS]: LABEL_ALIAS }[state.source];
    if (!where) return LABEL_DEFAULT;
    return state.key ? `${where} (${state.key})` : where;
}

// Args:
//   result: { states, warnings } from listSteps.
// Returns: the text report, newline-ended: padded table, warnings, footer.
function formatText(result) {
    const rows = result.states.map(s => [s.area || '', s.id, s.on ? STATE_ON : STATE_OFF, sourceLabel(s), s.detail || '']);
    const widths = [0, 1, 2, 3].map(c => Math.max(...rows.map(r => r[c].length)));
    const lines = rows.map(r => r.map((v, c) => (c < 4 ? v.padEnd(widths[c]) : v)).join(GAP).trimEnd());
    for (const w of result.warnings) lines.push(`warning: ${w}`);
    lines.push(GUARD_FOOTER);
    return lines.join('\n') + '\n';
}

// Args:
//   argv: process arguments after the script name.
// Returns: the exit code; output goes to stdout. Usage errors give 2.
function main(argv) {
    const [cmd, ...rest] = argv;
    const args = parseArgs(rest);
    if (cmd !== 'list' || args.error) {
        console.error(`${args.error || 'usage'}: node steps-cli.js list [--repo <path>] [--json]`);
        return 2;
    }
    let repoRoot = args.flags.repo || null;
    if (!repoRoot) {
        const loc = locateRepo(process.cwd());
        repoRoot = loc.toplevel || null;
    }
    const result = listSteps(repoRoot ? { repoRoot } : {});
    if (args.flags.json) console.log(JSON.stringify({ steps: result.states, warnings: result.warnings }));
    else process.stdout.write(formatText(result));
    return 0;
}

process.exitCode = main(process.argv.slice(2));
