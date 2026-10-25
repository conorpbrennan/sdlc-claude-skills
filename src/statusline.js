// Claude Code status line: context used % (used/size) | model | session cost [day cost] | git branch.
// Status line renderer: reads the status line JSON on stdin and prints one line.
// As a script it never throws and always exits 0.
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const { dayCost } = require('./lib/day-cost.js');

const GIT_TIMEOUT_MS = 1000;
const NO_GIT = 'no git';
const UNKNOWN_MODEL = '?';
const AMBER_USED = 20;
const RED_USED = 30;
const MILLION = 1000000;

const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// jq's `//`: the first operand that is neither null nor false.
//
// Args:
//   values: candidates in order.
// Returns:
//   the first usable candidate, or undefined.
function firstSet(...values) {
    return values.find((v) => v !== null && v !== undefined && v !== false);
}

// Formats a token count the way the bash does: 54k, 1M, 1.5M.
//
// Args:
//   n: token count.
// Returns:
//   the short string.
function human(n) {
    if (n >= MILLION && n % MILLION === 0) return `${n / MILLION}M`;
    if (n >= MILLION) return `${(n / MILLION).toFixed(1)}M`;
    return `${Math.floor((n + 500) / 1000)}k`;
}

// Runs git in a directory.
//
// Args:
//   dir: working directory to inspect.
//   args: git sub-command and arguments.
// Returns:
//   trimmed stdout, or '' when git fails or times out.
function git(dir, args) {
    try {
        return execFileSync('git', ['-C', dir, '--no-optional-locks', ...args], {
            encoding: 'utf8', timeout: GIT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch (e) {
        return '';
    }
}

// Names the current branch, or the short commit when HEAD is detached.
//
// Args:
//   dir: working directory, '' for none.
// Returns:
//   the branch or commit name, or '' when it cannot be found.
function branchOf(dir) {
    if (!dir) return '';
    return git(dir, ['symbolic-ref', '--short', 'HEAD']) || git(dir, ['rev-parse', '--short', 'HEAD']);
}

// Renders the status line.
//
// Args:
//   input: the status line JSON object (anything else is treated as empty).
//   options: { dayCost } to inject the day cost (number or null) instead of looking it up.
// Returns:
//   the line, with ANSI colours and no trailing newline.
/**
 * Picks the colour escape for the context segment from the used percentage.
 * Green below AMBER_USED (20), amber from 20 to 29, red from RED_USED (30).
 * A non-finite value takes green.
 *
 * @param {number} usedPct The used percentage printed in the segment.
 * @returns {string} The ANSI colour escape.
 */
function usedColour(usedPct) {
    if (!Number.isFinite(usedPct)) return GREEN;
    if (usedPct >= RED_USED) return RED;
    if (usedPct >= AMBER_USED) return AMBER;
    return GREEN;
}

function render(input, options = {}) {
    const data = input && typeof input === 'object' ? input : {};
    const c = data.context_window && typeof data.context_window === 'object' ? data.context_window : {};
    const model = firstSet((data.model || {}).display_name, (data.model || {}).id) || UNKNOWN_MODEL;
    const cost = Number(firstSet((data.cost || {}).total_cost_usd, 0));
    const dirRaw = firstSet((data.workspace || {}).current_dir, data.cwd);
    const dir = typeof dirRaw === 'string' ? dirRaw : '';

    const u = c.current_usage;
    let used = null;
    if (u && typeof u === 'object') {
        used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    }
    const rawSize = Number(c.context_window_size);
    const size = Number.isFinite(rawSize) && rawSize >= 1 ? Math.floor(rawSize) : 0;
    let remaining = 100;
    if (typeof c.remaining_percentage === 'number') remaining = Math.floor(c.remaining_percentage);
    else if (used !== null && Number.isFinite(used) && size > 0) remaining = Math.floor(100 - (used * 100) / size);

    const usedPct = 100 - remaining;
    let ctxStr = `${usedColour(usedPct)}ctx ${usedPct}% used${RESET}`;
    if (size > 0) {
        // Prefer actual usage; fall back to deriving it from the remaining %.
        const shown = used !== null && Number.isFinite(used) ? Math.floor(used) : Math.floor((size * (100 - remaining)) / 100);
        ctxStr += ` ${DIM}(${human(shown)}/${human(size)})${RESET}`;
    }

    let costStr = `$${(Number.isFinite(cost) ? cost : 0).toFixed(2)}`;
    const day = options.dayCost === undefined ? dayCost(data) : options.dayCost;
    if (typeof day === 'number' && Number.isFinite(day)) costStr += ` ${DIM}day $${day.toFixed(2)}${RESET}`;

    const branchStr = `${MAGENTA}${branchOf(dir) || NO_GIT}${RESET}`;
    const sep = `${DIM} | ${RESET}`;
    return [ctxStr, `${CYAN}${model}${RESET}`, costStr, branchStr].join(sep);
}

// Reads all of stdin.
//
// Returns:
//   the text read, '' on any error.
function readStdin() {
    try {
        return fs.readFileSync(0, 'utf8');
    } catch (e) {
        return '';
    }
}

// Script entry: prints the line for the stdin JSON and exits 0 whatever happens.
//
// Returns:
//   nothing.
function main() {
    let input = {};
    try { input = JSON.parse(readStdin()); } catch (e) { input = {}; }
    let line;
    try {
        line = render(input);
    } catch (e) {
        line = render({}, { dayCost: null });
    }
    process.stdout.write(`${line}\n`);
    process.exitCode = 0;
}

if (require.main === module) main();

module.exports = { render };
