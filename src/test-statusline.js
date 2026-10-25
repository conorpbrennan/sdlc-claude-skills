// Tests for statusline.js: the status line text, its colours, token formatting,
// the git branch segment and the never-fail script behaviour.
// Drop git's repository-locating variables (src/test-suite-isolation.js).
require('./hooks/lib/isolate-git-env.js').isolateGitEnv();

let failed = 0;

// Runs one case, printing PASS/FAIL; any failure makes the script exit non-zero.
function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (e) {
        console.log(`  FAIL: ${name}\n    ${e.message}`);
        failed++;
    }
}

const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { render } = require('./statusline.js');

const SCRIPT = path.join(__dirname, 'statusline.js');
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const ANSI = /\x1b\[[0-9;]*m/g;

const strip = (s) => s.replace(ANSI, '');

// Builds a status line input. `remaining` and `used` may be omitted with null.
function makeInput({ remaining = 73, used = 54000, size = 200000, dir = os.tmpdir() } = {}) {
    const ctx = { context_window_size: size };
    if (remaining !== null) ctx.remaining_percentage = remaining;
    if (used !== null) ctx.current_usage = { input_tokens: used };
    return {
        model: { display_name: 'Sonnet' },
        cost: { total_cost_usd: 1.2 },
        workspace: { current_dir: dir },
        context_window: ctx,
    };
}

const NO_DAY = { dayCost: null };

test('context percentage and token segment', () => {
    const cases = [
        [{ remaining: 73 }, 'ctx 27% used (54k/200k)'],
        [{ remaining: 100, used: null }, 'ctx 0% used (0k/200k)'],
        [{ remaining: 5, used: null }, 'ctx 95% used (190k/200k)'],
        // No remaining percentage: derived from used tokens and the window size.
        [{ remaining: null, used: 50000 }, 'ctx 25% used (50k/200k)'],
        [{ remaining: 73, used: 1000, size: 1000000 }, 'ctx 27% used (1k/1M)'],
        [{ remaining: 73, used: 1000, size: 1500000 }, 'ctx 27% used (1k/1.5M)'],
    ];
    for (const [args, expected] of cases) {
        const line = strip(render(makeInput(args), NO_DAY));
        assert.ok(line.startsWith(expected + ' | '), `${JSON.stringify(args)} -> ${line}`);
    }
});

test('non-finite window size or used count prints no NaN or Infinity', () => {
    const cases = [
        [{ size: Infinity }, 'ctx 27% used | '],
        [{ size: NaN }, 'ctx 27% used | '],
        [{ size: 'big' }, 'ctx 27% used | '],
        [{ used: Infinity }, 'ctx 27% used (54k/200k) | '],
        [{ used: Infinity, remaining: null }, 'ctx 0% used (0k/200k) | '],
    ];
    for (const [args, expected] of cases) {
        const line = strip(render(makeInput(args), NO_DAY));
        assert.ok(!/NaN|Infinity/.test(line), line);
        assert.ok(line.startsWith(expected), `${JSON.stringify(args)} -> ${line}`);
    }
});

test('remaining 100 without a window prints no token segment', () => {
    const line = strip(render({ context_window: { remaining_percentage: 100 } }, NO_DAY));
    assert.ok(line.startsWith('ctx 0% used | '), line);
});

test('colour follows the remaining percentage', () => {
    const cases = [[73, GREEN], [51, GREEN], [50, YELLOW], [21, YELLOW], [20, RED], [5, RED]];
    for (const [remaining, colour] of cases) {
        const line = render(makeInput({ remaining }), NO_DAY);
        assert.ok(line.startsWith(`${colour}ctx ${100 - remaining}% used`), `${remaining} -> ${JSON.stringify(line)}`);
    }
});

test('model and session cost segments, with fallbacks', () => {
    assert.ok(strip(render(makeInput(), NO_DAY)).includes(' | Sonnet | $1.20 | '));
    const bare = strip(render({}, NO_DAY));
    assert.strictEqual(bare, 'ctx 0% used | ? | $0.00 | no git');
});

test('day segment appears only for a numeric day cost', () => {
    assert.ok(strip(render(makeInput(), { dayCost: 3.5 })).includes('$1.20 day $3.50 | '));
    assert.ok(!render(makeInput(), NO_DAY).includes('day $'));
});

test('branch segment: no git outside a repo, branch name inside one', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-plain-'));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-repo-'));
    try {
        assert.ok(strip(render(makeInput({ dir: plain }), NO_DAY)).endsWith(' | no git'));
        execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'feature-x']);
        // Unborn branch: symbolic-ref still names it.
        assert.ok(strip(render(makeInput({ dir: repo }), NO_DAY)).endsWith(' | feature-x'));
        // Detached HEAD: the short commit.
        const g = ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t'];
        execFileSync('git', [...g, 'commit', '-q', '--allow-empty', '-m', 'c']);
        const sha = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
        execFileSync('git', ['-C', repo, 'checkout', '-q', '--detach']);
        assert.ok(strip(render(makeInput({ dir: repo }), NO_DAY)).endsWith(` | ${sha}`));
    } finally {
        fs.rmSync(plain, { recursive: true, force: true });
        fs.rmSync(repo, { recursive: true, force: true });
    }
});

test('as a script: bad or empty stdin exits 0 and prints a line', () => {
    for (const input of ['{not json', '']) {
        const r = spawnSync('node', [SCRIPT], { input, encoding: 'utf8' });
        assert.strictEqual(r.status, 0);
        assert.ok(strip(r.stdout).startsWith('ctx 0% used | '), r.stdout);
        assert.ok(r.stdout.endsWith('\n'));
    }
});

if (failed) process.exit(1);
