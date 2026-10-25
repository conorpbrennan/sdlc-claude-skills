// Tests for steps-cli.js `list`: one line per step with state and source,
// warnings, the guard footer, and --json.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const steps = require('./lib/steps.js');

const CLI = path.join(__dirname, 'steps-cli.js');
const FOOTER = 'Guard areas (tdd, review, commit-conventions) switch from the user file only.';
const ALL_IDS = [].concat(...Object.values(steps.AREAS).map(a => a.steps));

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        console.log(`    expected: ${e}`);
        console.log(`    actual:   ${a}`);
        failed++;
    }
}

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'steps-cli-test-'));
let seq = 0;

// Args: user, repo: object (JSON) or null; files: paths to touch relative to
//   the repo. Returns: { repoRoot, env } for a fresh scratch repo.
function scratch(user, repo, files) {
    const dir = path.join(sb, `case${seq++}`);
    const repoRoot = path.join(dir, 'acme-repo');
    const cfgDir = path.join(dir, 'cfg');
    fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, '.claude'), { recursive: true });
    fs.mkdirSync(cfgDir, { recursive: true });
    if (user) fs.writeFileSync(path.join(dir, 'user.json'), JSON.stringify(user));
    if (repo) fs.writeFileSync(path.join(repoRoot, '.claude', 'sdlc-review.json'), JSON.stringify(repo));
    for (const f of files || []) {
        const p = path.join(repoRoot, f);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, '');
    }
    const env = Object.assign({}, process.env, {
        SDLC_REVIEW_CONFIG_USER: path.join(dir, 'user.json'),
        CLAUDE_CONFIG_DIR: cfgDir,
        TDD_MANDATE_CONFIG: path.join(dir, 'no-tdd-mandate.json'),
    });
    return { repoRoot, env };
}

// Args: list of CLI args after `list`. Returns: { status, lines } with runs
//   of spaces collapsed to one so column padding does not matter.
function run(s, args) {
    const r = spawnSync(process.execPath, [CLI, 'list', '--repo', s.repoRoot, ...args], { env: s.env, encoding: 'utf8' });
    return { status: r.status, out: r.stdout, lines: r.stdout.split('\n').filter(Boolean).map(l => l.replace(/ +/g, ' ').trim()) };
}

const DEFAULT_LINES = ALL_IDS.map(id => {
    const area = Object.keys(steps.AREAS).find(a => steps.AREAS[a].steps.includes(id));
    return `${area} ${id} on default`;
});

// stdout: text each expected line must contain (spaces collapsed).
const LIST_CASES = [
    { name: 'no config: every line default', user: null, repo: null, files: [], args: [],
        stdout: DEFAULT_LINES, exit: 0 },
    { name: 'user area off', user: { steps: { orchestration: false } }, repo: null, files: [], args: [],
        stdout: ['orchestration read-trim off user file (steps.orchestration)', 'features pre-commit-feature on default'], exit: 0 },
    { name: 'repo off non-guard', user: null, repo: { steps: { hygiene: false } }, files: [], args: [],
        stdout: ['hygiene pre-commit-hygiene off repo file (steps.hygiene)'], exit: 0 },
    { name: 'repo off guard: stays on, warning names file and key', user: null, repo: { steps: { review: { 'review-gate': false } } }, files: [], args: [],
        stdout: ['review review-gate on default', 'warning: ', 'steps.review.review-gate is read from the user file only; ignored'], exit: 0 },
    { name: 'alias file', user: null, repo: null, files: ['.claude/feature-tracking.disabled'], args: [],
        stdout: ['features pre-commit-feature off alias (.claude/feature-tracking.disabled)'], exit: 0 },
];

for (const c of LIST_CASES) {
    console.log(`\n== ${c.name}`);
    const s = scratch(c.user, c.repo, c.files);
    const r = run(s, c.args);
    assert(`${c.name}: exit`, r.status, c.exit);
    for (const want of c.stdout) {
        assert(`${c.name}: has '${want}'`, r.lines.some(l => l.includes(want)), true);
    }
    assert(`${c.name}: footer is last line`, r.lines[r.lines.length - 1], FOOTER);
    const stepLines = r.lines.slice(0, ALL_IDS.length);
    assert(`${c.name}: step order`, stepLines.map(l => l.split(' ')[1]), ALL_IDS);
}

console.log('\n== --json');
{
    const s = scratch({ steps: { orchestration: false } }, { steps: { review: { 'plan-review': false } } }, []);
    const r = run(s, ['--json']);
    const j = JSON.parse(r.out);
    assert('json: exit', r.status, 0);
    assert('json: ids in order', j.steps.map(x => x.id), ALL_IDS);
    assert('json: read-trim off', j.steps.find(x => x.id === 'read-trim').on, false);
    assert('json: warnings array', Array.isArray(j.warnings) && j.warnings.length === 1, true);
}

console.log('\n== bad config still exits 0');
{
    const s = scratch(null, null, []);
    fs.writeFileSync(path.join(s.repoRoot, '.claude', 'sdlc-review.json'), '{ nope');
    const r = run(s, []);
    assert('bad json: exit', r.status, 0);
    assert('bad json: warning printed', r.lines.some(l => l.startsWith('warning: ')), true);
}

fs.rmSync(sb, { recursive: true, force: true });
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
