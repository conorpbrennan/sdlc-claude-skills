#!/usr/bin/env node
// CLI over lib/steps.js, run by /sdlc:steps.
//
//   node steps-cli.js list [--repo <path>] [--json]
//   node steps-cli.js set <id> <on|off> [--file user|repo] [--repo <path>]
//
// Prints every sdlc workflow step with its state and where that state comes
// from. The repo defaults to the git toplevel of the cwd, else none. The
// lookup is one listSteps call. Exit 0 whatever the config holds.
//
// `set` writes one switch (a step id, or an area id) through
// review-config.updateConfigFile and prints the list line of each affected
// step. Exit 2 for a refused request (nothing written), 1 when the writer
// refused the file.
'use strict';

const { locateRepo } = require('./lib/git-read.js');
const { AREAS, listSteps, stepStates, SOURCE_USER, SOURCE_REPO, SOURCE_ALIAS } = require('./lib/steps.js');
const { updateConfigFile, userConfigPath, repoConfigPath } = require('./lib/review-config.js');

const GUARD_FOOTER = 'Guard areas (tdd, review, commit-conventions) switch from the user file only.';
const LABEL_DEFAULT = 'default';
const LABEL_USER = 'user file';
const LABEL_REPO = 'repo file';
const LABEL_ALIAS = 'alias';
const STATE_ON = 'on';
const STATE_OFF = 'off';
const GAP = '  ';
const STEPS_KEY = 'steps';
const ENABLED_KEY = 'enabled';
const FILE_USER = 'user';
const FILE_REPO = 'repo';
const USAGE_LIST = 'node steps-cli.js list [--repo <path>] [--json]';
const USAGE_SET = 'node steps-cli.js set <id> <on|off> [--file user|repo] [--repo <path>]';

// Args:
//   argv: arguments after the command name.
// Returns: { flags, positional, error }. `--json` takes no value; `--repo` and
//   `--file` need one. Other words are positional.
function parseArgs(argv) {
    const out = { flags: {}, positional: [], error: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--json') {
            out.flags.json = true;
        } else if (a === '--repo' || a === '--file') {
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) out.error = `${a} needs a value`;
            else { out.flags[a.slice(2)] = next; i++; }
        } else if (a.startsWith('--')) {
            out.error = `unknown argument '${a}'`;
        } else {
            out.positional.push(a);
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
//   state: a state from listSteps or stepStates.
// Returns: the one `list` line for the state, without the trailing newline.
function formatLine(state) {
    return [state.area || '', state.id, state.on ? STATE_ON : STATE_OFF, sourceLabel(state), state.detail || ''].join(GAP).trimEnd();
}

// Args:
//   flagRepo: the --repo value or undefined.
// Returns: the repo root: the flag, else the git toplevel of the cwd, else null.
function resolveRepo(flagRepo) {
    if (flagRepo) return flagRepo;
    return locateRepo(process.cwd()).toplevel || null;
}

// Args:
//   args: parseArgs result for `set` (positional: id, on|off).
// Returns: the exit code. Validates everything before the one write.
function runSet(args) {
    const [id, value, extra] = args.positional;
    const areaIds = Object.keys(AREAS);
    const stepIds = [].concat(...Object.values(AREAS).map(a => a.steps));
    const area = AREAS[id] ? id : Object.keys(AREAS).find(a => AREAS[a].steps.includes(id));
    if (!id || !area) {
        console.error(`unknown id '${id || ''}'; area ids: ${areaIds.join(', ')}; or a step id: ${stepIds.join(', ')}`);
        return 2;
    }
    if (value !== STATE_ON && value !== STATE_OFF || extra !== undefined) {
        console.error(`${id}: say on or off. usage: ${USAGE_SET}`);
        return 2;
    }
    const file = args.flags.file || FILE_USER;
    if (file !== FILE_USER && file !== FILE_REPO) {
        console.error(`--file must be user or repo, not '${file}'`);
        return 2;
    }
    const repoRoot = resolveRepo(args.flags.repo);
    if (file === FILE_REPO && AREAS[area].guard) {
        console.error(`${id} is a guard step; it switches in the user file only`);
        return 2;
    }
    if (file === FILE_REPO && !repoRoot) {
        console.error('--file repo needs a repo; no repo found. Pass --repo <path>');
        return 2;
    }
    const target = file === FILE_REPO ? repoConfigPath(repoRoot) : userConfigPath();
    const on = value === STATE_ON;
    const isArea = Boolean(AREAS[id]);
    const res = updateConfigFile(target, data => {
        if (!data[STEPS_KEY] || typeof data[STEPS_KEY] !== 'object' || Array.isArray(data[STEPS_KEY])) data[STEPS_KEY] = {};
        const block = data[STEPS_KEY];
        if (typeof block[area] === 'boolean') block[area] = { [ENABLED_KEY]: block[area] };
        else if (!block[area] || typeof block[area] !== 'object' || Array.isArray(block[area])) block[area] = {};
        block[area][isArea ? ENABLED_KEY : id] = on;
    });
    if (!res.ok) {
        console.error(`${res.path}: ${res.error}. Nothing was written.`);
        return 1;
    }
    const ids = isArea ? AREAS[id].steps : [id];
    const result = stepStates(ids, repoRoot ? { repoRoot } : {});
    for (const s of ids) console.log(formatLine(result.states[s]));
    for (const w of result.warnings) console.log(`warning: ${w}`);
    return 0;
}

// Args:
//   argv: process arguments after the script name.
// Returns: the exit code; output goes to stdout. Usage errors give 2.
function main(argv) {
    const [cmd, ...rest] = argv;
    const args = parseArgs(rest);
    if (cmd === 'set' && !args.error) return runSet(args);
    if (cmd !== 'list' || args.error || args.positional.length || args.flags.file) {
        console.error(`${args.error || 'usage'}: ${USAGE_LIST}\n       ${USAGE_SET}`);
        return 2;
    }
    const repoRoot = resolveRepo(args.flags.repo);
    const result = listSteps(repoRoot ? { repoRoot } : {});
    if (args.flags.json) console.log(JSON.stringify({ steps: result.states, warnings: result.warnings }));
    else process.stdout.write(formatText(result));
    return 0;
}

process.exitCode = main(process.argv.slice(2));
