// Tests for lib/day-cost.js: today's (UTC) cost across a project's transcripts,
// worktree dirs and sub-agent files, with the per-file and result caches.
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

const { dayCost } = require('./lib/day-cost.js');

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const TODAY = '2026-10-25';
const YESTERDAY = '2026-10-24';
const CWD = '/work/my.proj';
const PROJECT_DIR = '-work-my-proj';

// Per-million-token rates for claude-sonnet-5-5 are 2.0 input / 10.0 output, so
// 1M input + 1M output tokens cost 12.0.
const MODEL = 'claude-sonnet-5-5';

function setup() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-root-'));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-cache-'));
    const cleanup = () => {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(cacheDir, { recursive: true, force: true });
    };
    return { root, cacheDir, cleanup };
}

function msg(id, date, input, output, model = MODEL) {
    return JSON.stringify({
        timestamp: `${date}T10:00:00Z`,
        requestId: `r-${id}`,
        message: { id, model, usage: { input_tokens: input, output_tokens: output } },
    });
}

function write(file, lines) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join('\n') + '\n');
}

function run(s, extra = {}) {
    return dayCost({ workspace: { current_dir: CWD } },
        { projectsRoot: s.root, cacheDir: s.cacheDir, now: NOW, ttlMs: 45000, ...extra });
}

test('sums only today, across worktree dirs and sub-agent files', () => {
    const s = setup();
    try {
        write(path.join(s.root, PROJECT_DIR, 'a.jsonl'), [msg('m1', TODAY, 1e6, 0), msg('old', YESTERDAY, 1e6, 0)]);
        write(path.join(s.root, PROJECT_DIR, 'sess', 'subagents', 'b.jsonl'), [msg('m2', TODAY, 0, 1e6)]);
        write(path.join(s.root, `${PROJECT_DIR}--claude-worktrees-wt1`, 'c.jsonl'), [msg('m3', TODAY, 1e6, 0)]);
        write(path.join(s.root, `${PROJECT_DIR}-other`, 'd.jsonl'), [msg('m4', TODAY, 1e6, 0)]);
        assert.ok(Math.abs(run(s) - 14.0) < 1e-9);
    } finally { s.cleanup(); }
});

test('dedupes by message id and request id, keeping the larger output', () => {
    const s = setup();
    try {
        write(path.join(s.root, PROJECT_DIR, 'a.jsonl'), [msg('m1', TODAY, 0, 100000), msg('m1', TODAY, 0, 1e6)]);
        assert.ok(Math.abs(run(s) - 10.0) < 1e-9);
    } finally { s.cleanup(); }
});

test('worktree cwd maps to the main project dir; unknown models cost nothing', () => {
    const s = setup();
    try {
        write(path.join(s.root, PROJECT_DIR, 'a.jsonl'), [msg('m1', TODAY, 1e6, 0), msg('m2', TODAY, 1e6, 0, 'mystery')]);
        const total = dayCost({ cwd: `${CWD}/.claude/worktrees/x` },
            { projectsRoot: s.root, cacheDir: s.cacheDir, now: NOW });
        assert.ok(Math.abs(total - 2.0) < 1e-9);
    } finally { s.cleanup(); }
});

test('null for a missing root, a missing project and no cwd', () => {
    const s = setup();
    try {
        assert.strictEqual(run({ ...s, root: path.join(s.root, 'nope') }), null);
        assert.strictEqual(run(s), null);
        assert.strictEqual(dayCost({}, { projectsRoot: s.root, cacheDir: s.cacheDir, now: NOW }), null);
        assert.strictEqual(dayCost(null, { projectsRoot: s.root, cacheDir: s.cacheDir, now: NOW }), null);
    } finally { s.cleanup(); }
});

test('bad JSON lines are skipped and the rest are kept', () => {
    const s = setup();
    try {
        write(path.join(s.root, PROJECT_DIR, 'a.jsonl'),
            [`{broken ${TODAY}`, msg('m1', TODAY, 1e6, 0), '[1]', 'null']);
        assert.ok(Math.abs(run(s) - 2.0) < 1e-9);
    } finally { s.cleanup(); }
});

test('result cache is used inside the ttl and ignored after it', () => {
    const s = setup();
    try {
        const file = path.join(s.root, PROJECT_DIR, 'a.jsonl');
        write(file, [msg('m1', TODAY, 1e6, 0)]);
        assert.ok(Math.abs(run(s) - 2.0) < 1e-9);
        write(file, [msg('m1', TODAY, 1e6, 0), msg('m2', TODAY, 1e6, 0)]);
        assert.ok(Math.abs(run(s, { now: NOW + 10000 }) - 2.0) < 1e-9, 'inside ttl: cached');
        assert.ok(Math.abs(run(s, { now: NOW + 46000 }) - 4.0) < 1e-9, 'after ttl: recomputed');
    } finally { s.cleanup(); }
});

test('a cache from an earlier day is ignored', () => {
    const s = setup();
    try {
        write(path.join(s.root, PROJECT_DIR, 'a.jsonl'), [msg('m1', TODAY, 1e6, 0)]);
        fs.writeFileSync(path.join(s.cacheDir, `${PROJECT_DIR}.json`),
            JSON.stringify({ date: YESTERDAY, at: NOW, total: 99, files: {} }));
        assert.ok(Math.abs(run(s) - 2.0) < 1e-9);
    } finally { s.cleanup(); }
});

test('an expired deadline over several transcript files returns null', () => {
    const s = setup();
    try {
        for (const n of ['a', 'b', 'c', 'd']) {
            write(path.join(s.root, PROJECT_DIR, `${n}.jsonl`), [msg(n, TODAY, 1e6, 0)]);
        }
        assert.strictEqual(run(s, { deadlineMs: -1 }), null);
    } finally { s.cleanup(); }
});

if (failed) process.exit(1);
