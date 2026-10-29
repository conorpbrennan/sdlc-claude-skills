// Tests for lib/review-config.js and review-config-cli.js: which model reviews
// which round, resolved from built-in defaults, a user file, a repo file and
// path rules.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const cfg = require('./lib/review-config.js');

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

const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'review-config-'));
const userFile = path.join(sb, 'user-sdlc-review.json');
process.env.SDLC_REVIEW_CONFIG_USER = userFile;
process.env.CLAUDE_CONFIG_DIR = path.join(sb, 'claude-config');
process.env.TDD_MANDATE_CONFIG = path.join(sb, 'no-tdd-mandate.json');

function newRepo(name) {
    const r = path.join(sb, name);
    fs.mkdirSync(path.join(r, '.claude'), { recursive: true });
    return r;
}
function writeRepoCfg(repo, body) {
    fs.writeFileSync(path.join(repo, '.claude', 'sdlc-review.json'),
        typeof body === 'string' ? body : JSON.stringify(body));
}
function writeUserCfg(body) {
    fs.writeFileSync(userFile, typeof body === 'string' ? body : JSON.stringify(body));
}
function clearUserCfg() { fs.rmSync(userFile, { force: true }); }

function resolve(repo, extra) {
    return cfg.resolveReview({ repoRoot: repo, stagedPaths: [], round: 1, ...extra });
}

console.log('\nDefaults with no files:');
const bare = newRepo('bare');
let r = resolve(bare);
assert('round 1 model is sonnet', r.model, 'sonnet');
assert('round 1 agent is code-reviewer', r.agent, 'code-reviewer');
assert('source is default', r.source, 'default');
assert('maxRounds 2', r.maxRounds, 2);
assert('no warnings', r.warnings, []);
assert('not over cap', r.overCap, undefined);
r = resolve(bare, { round: 2 });
assert('round 2 model is opus', r.model, 'opus');
assert('round 2 agent is code-reviewer-deep', r.agent, 'code-reviewer-deep');
assert('result carries the round', r.round, 2);

console.log('\nUser file:');
writeUserCfg({ round1: 'haiku', round2: 'sonnet', maxRounds: 3 });
r = resolve(bare);
assert('user round1', r.model, 'haiku');
assert('user source', r.source, 'user config');
assert('user maxRounds', r.maxRounds, 3);
assert('user round2', resolve(bare, { round: 2 }).model, 'sonnet');

console.log('\nRepo file beats user file:');
const repoA = newRepo('repoA');
writeRepoCfg(repoA, { round1: 'opus', maxRounds: 4 });
r = resolve(repoA);
assert('repo round1 wins', r.model, 'opus');
assert('repo source', r.source, 'repo config');
assert('repo maxRounds wins', r.maxRounds, 4);
assert('user round2 still applies where repo is silent', resolve(repoA, { round: 2 }).model, 'sonnet');
clearUserCfg();

console.log('\nRule beats layer:');
const repoB = newRepo('repoB');
writeRepoCfg(repoB, {
    round2: 'sonnet',
    rules: [{ paths: ['src/hooks/**'], round2: 'opus' }],
});
r = resolve(repoB, { round: 2, stagedPaths: ['src/hooks/a.js'] });
assert('matching rule overrides layer', r.model, 'opus');
assert('source names the rule and layer', r.source, 'rule src/hooks/** (repo config)');
r = resolve(repoB, { round: 2, stagedPaths: ['lib/a.js'] });
assert('non-matching rule leaves the layer', r.model, 'sonnet');
assert('layer source', r.source, 'repo config');
r = resolve(repoB, { round: 1, stagedPaths: ['src/hooks/a.js'] });
assert('rule for round2 does not touch round 1', r.model, 'sonnet');
assert('round 1 falls to default', r.source, 'default');

console.log('\nStrongest of several matching rules wins:');
const repoC = newRepo('repoC');
writeRepoCfg(repoC, {
    rules: [
        { paths: ['docs/**'], round2: 'sonnet' },
        { paths: ['**/*.md'], round2: 'haiku' },
        { paths: ['src/**'], round2: 'opus' },
    ],
});
r = resolve(repoC, { round: 2, stagedPaths: ['docs/x.md', 'src/y.js'] });
assert('opus beats sonnet and haiku', r.model, 'opus');
assert('source names the winning rule', r.source, 'rule src/** (repo config)');
r = resolve(repoC, { round: 2, stagedPaths: ['docs/x.md'] });
assert('sonnet beats haiku', r.model, 'sonnet');

console.log('\nWeaker rule still overrides the layer when it is the only match:');
const repoD = newRepo('repoD');
writeRepoCfg(repoD, { rules: [{ paths: ['docs/**', '**/*.md'], round1: 'sonnet', round2: 'sonnet' }] });
r = resolve(repoD, { round: 2, stagedPaths: ['docs/a.md'] });
assert('docs round 2 is sonnet, not the opus default', r.model, 'sonnet');

console.log('\nRules from both files apply, user then repo:');
writeUserCfg({ rules: [{ paths: ['src/**'], round2: 'haiku' }] });
const repoE = newRepo('repoE');
writeRepoCfg(repoE, { rules: [{ paths: ['src/**'], round2: 'sonnet' }] });
r = resolve(repoE, { round: 2, stagedPaths: ['src/a.js'] });
assert('strongest across files', r.model, 'sonnet');
assert('source names the repo rule', r.source, 'rule src/** (repo config)');
r = resolve(bare, { round: 2, stagedPaths: ['src/a.js'] });
assert('user rule alone, weaker than the default, still overrides', r.model, 'haiku');
assert('user rule source', r.source, 'rule src/** (user config)');
clearUserCfg();

console.log('\nOverride wins:');
r = resolve(repoB, { round: 2, stagedPaths: ['src/hooks/a.js'], override: { model: 'haiku' } });
assert('override beats rule', r.model, 'haiku');
assert('override source', r.source, 'override');
r = resolve(repoB, { round: 1, override: { model: 'opus' } });
assert('override applies to the requested round', r.model, 'opus');
r = resolve(repoB, { round: 1, override: { model: 'gpt-5' } });
assert('invalid override is ignored', r.model, 'sonnet');
assert('and warned about', r.warnings.length, 1);

console.log('\nInvalid model value falls back with a warning:');
const repoF = newRepo('repoF');
writeRepoCfg(repoF, { round1: 'gpt-5', round2: 'sonnet' });
r = resolve(repoF);
assert('falls back to default', r.model, 'sonnet');
assert('source is default', r.source, 'default');
assert('one warning', r.warnings.length, 1);
assert('warning names the key', /round1/.test(r.warnings[0]), true);
writeUserCfg({ round1: 'haiku' });
r = resolve(repoF);
assert('falls back to the next layer, the user file', r.model, 'haiku');
clearUserCfg();
const repoG = newRepo('repoG');
writeRepoCfg(repoG, { rules: [{ paths: ['a/**'], round2: 'turbo' }, { paths: ['a/**'], round2: 'sonnet' }] });
r = resolve(repoG, { round: 2, stagedPaths: ['a/x'] });
assert('invalid rule value skipped, valid rule used', r.model, 'sonnet');
assert('rule warning recorded', r.warnings.length, 1);

console.log('\nBad JSON is ignored with a warning:');
const repoH = newRepo('repoH');
writeRepoCfg(repoH, '{ not json');
r = resolve(repoH);
assert('defaults apply', r.model, 'sonnet');
assert('one warning', r.warnings.length, 1);
assert('warning names the path', r.warnings[0].includes(path.join(repoH, '.claude', 'sdlc-review.json')), true);
writeRepoCfg(repoH, '[1,2]');
assert('a non-object file is also ignored with a warning', resolve(repoH).warnings.length, 1);
writeUserCfg('nope');
assert('bad user file warns too', resolve(bare).warnings.length, 1);
clearUserCfg();

console.log('\nmaxRounds and overCap:');
const repoI = newRepo('repoI');
writeRepoCfg(repoI, { maxRounds: 1 });
r = resolve(repoI, { round: 2 });
assert('round beyond cap still resolves', r.model, 'opus');
assert('overCap set', r.overCap, true);
assert('maxRounds reported', r.maxRounds, 1);
assert('round at the cap is not over', resolve(repoI, { round: 1 }).overCap, undefined);
writeRepoCfg(repoI, { maxRounds: 0 });
r = resolve(repoI);
assert('maxRounds < 1 falls back to 2', r.maxRounds, 2);
assert('and warns', r.warnings.length, 1);
writeRepoCfg(repoI, { maxRounds: 1.5 });
assert('non-integer maxRounds falls back', resolve(repoI).maxRounds, 2);
r = resolve(bare, { round: 3 });
assert('default cap of 2 flags round 3', r.overCap, true);
assert('round 3 uses the deep agent', r.agent, 'code-reviewer-deep');

console.log('\nPlan review and orchestrator:');
let p = cfg.resolvePlanReview({ repoRoot: bare });
assert('plan review defaults', p, { source: 'opus', consistency: 'sonnet', cap: 2, warnings: [] });
let o = cfg.resolveOrchestrator({ repoRoot: bare });
assert('orchestrator defaults', o, { bashNudge: 8, warnings: [] });
const repoK = newRepo('repoK');
writeRepoCfg(repoK, { planReview: { cap: 4 } });
assert('repo override raises the plan cap', cfg.resolvePlanReview({ repoRoot: repoK }).cap, 4);
writeRepoCfg(repoK, { planReview: { cap: 0 } });
assert('invalid cap with no user config falls back to 2', cfg.resolvePlanReview({ repoRoot: repoK }).cap, 2);
writeUserCfg({ planReview: { source: 'sonnet', cap: 5 }, orchestrator: { bashNudge: 12 } });
p = cfg.resolvePlanReview({ repoRoot: bare });
assert('user plan review, per key', [p.source, p.consistency, p.cap], ['sonnet', 'sonnet', 5]);
assert('user orchestrator', cfg.resolveOrchestrator({ repoRoot: bare }).bashNudge, 12);
const repoJ = newRepo('repoJ');
writeRepoCfg(repoJ, { planReview: { cap: 2, consistency: 'haiku' }, orchestrator: { bashNudge: 3 } });
p = cfg.resolvePlanReview({ repoRoot: repoJ });
assert('repo beats user, user fills the gap', [p.source, p.consistency, p.cap], ['sonnet', 'haiku', 2]);
assert('repo orchestrator', cfg.resolveOrchestrator({ repoRoot: repoJ }).bashNudge, 3);
writeRepoCfg(repoJ, { planReview: { source: 'gpt-5', cap: 0 }, orchestrator: { bashNudge: 'x' } });
p = cfg.resolvePlanReview({ repoRoot: repoJ });
assert('invalid plan review values fall back', [p.source, p.cap], ['sonnet', 5]);
assert('plan review warns twice', p.warnings.length, 2);
o = cfg.resolveOrchestrator({ repoRoot: repoJ });
assert('invalid bashNudge falls back', o.bashNudge, 12);
assert('orchestrator warns', o.warnings.length, 1);
clearUserCfg();

console.log('\nCLI:');
const cli = path.join(__dirname, 'review-config-cli.js');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf-8' });
const gitRepo = path.join(sb, 'gitrepo');
fs.mkdirSync(path.join(gitRepo, '.claude'), { recursive: true });
git(gitRepo, 'init', '-q');
writeRepoCfg(gitRepo, { rules: [{ paths: ['src/hooks/**'], round2: 'opus' }, { paths: ['docs/**'], round2: 'haiku' }] });
fs.mkdirSync(path.join(gitRepo, 'docs'), { recursive: true });
fs.writeFileSync(path.join(gitRepo, 'docs', 'a.md'), 'x\n');
git(gitRepo, 'add', 'docs/a.md');
const runCli = (args, cwd) => execFileSync('node', [cli, ...args], { cwd, encoding: 'utf-8', env: process.env });
let out = runCli(['review', '--round', '2'], gitRepo);
assert('output is one line', out.trim().split('\n').length, 1);
let j = JSON.parse(out);
assert('staged path feeds the rules', [j.model, j.agent, j.source], ['haiku', 'code-reviewer-deep', 'rule docs/** (repo config)']);
j = JSON.parse(runCli(['review', '--round', '2', '--model', 'sonnet'], gitRepo));
assert('--model overrides', [j.model, j.source], ['sonnet', 'override']);
j = JSON.parse(runCli(['review', '--round', '1', '--repo', gitRepo], sb));
assert('--repo works from another cwd', [j.round, j.agent, j.model], [1, 'code-reviewer', 'sonnet']);
j = JSON.parse(runCli(['plan-review', '--repo', gitRepo], sb));
assert('plan-review prints the plan result', [j.source, j.consistency, j.cap], ['opus', 'sonnet', 2]);
assert('plan-review enabled by default', [j.enabled, j.enabledSource], [true, 'default']);
writeUserCfg({ steps: { review: { 'plan-review': false } } });
j = JSON.parse(runCli(['plan-review', '--repo', gitRepo], sb));
assert('plan-review enabled false from the user file', [j.enabled, j.enabledSource], [false, 'user']);
assert('plan-review keeps its other keys when off', [j.source, j.consistency, j.cap], ['opus', 'sonnet', 2]);
clearUserCfg();
{
    const savedRepoCfg = fs.readFileSync(path.join(gitRepo, '.claude', 'sdlc-review.json'), 'utf-8');
    writeRepoCfg(gitRepo, { steps: { review: { 'plan-review': false } } });
    j = JSON.parse(runCli(['plan-review', '--repo', gitRepo], sb));
    assert('plan-review stays enabled when only the repo file says false', j.enabled, true);
    assert('plan-review warns about the ignored repo file', j.warnings.length > 0, true);
    writeRepoCfg(gitRepo, savedRepoCfg);
}

// A flag with no value, or a bad round, is a usage error.
const runCliRaw = (args, cwd) => spawnSync('node', [cli, ...args], { cwd, encoding: 'utf-8', env: process.env });
assert('missing --round exits non-zero', runCliRaw(['review'], gitRepo).status, 2);
assert('--round with nothing after it exits 2', runCliRaw(['review', '--round'], gitRepo).status, 2);
assert('--model at the end exits 2', runCliRaw(['review', '--round', '1', '--model'], gitRepo).status, 2);
assert('--round 0 exits 2', runCliRaw(['review', '--round', '0'], gitRepo).status, 2);
assert('--round 1abc exits 2', runCliRaw(['review', '--round', '1abc'], gitRepo).status, 2);
assert('--round -1 exits 2', runCliRaw(['review', '--round', '-1'], gitRepo).status, 2);

// Outside any git repository the answer is still printed, with a warning.
const noRepo = fs.mkdtempSync(path.join(sb, 'norepo-'));
const nr = runCliRaw(['review', '--round', '1'], noRepo);
assert('outside a repo still exits 0', nr.status, 0);
j = JSON.parse(nr.stdout);
assert('outside a repo falls back to defaults', [j.model, j.agent], ['sonnet', 'code-reviewer']);
assert('outside a repo warns', j.warnings.length > 0, true);

// setMainModel keeps the mode of an existing user file.
{
    const modeFile = path.join(sb, 'mode-sdlc-review.json');
    fs.writeFileSync(modeFile, '{}');
    fs.chmodSync(modeFile, 0o640);
    const saved = process.env.SDLC_REVIEW_CONFIG_USER;
    process.env.SDLC_REVIEW_CONFIG_USER = modeFile;
    const res = cfg.setMainModel('opus');
    process.env.SDLC_REVIEW_CONFIG_USER = saved;
    assert('setMainModel keeps file mode 0640', [res.ok, (fs.statSync(modeFile).mode & 0o777).toString(8)], [true, '640']);
}

// main-model: show, set and off, against the user file only.
{
    const mmDir = fs.mkdtempSync(path.join(sb, 'mm-'));
    const mmFile = path.join(mmDir, 'sub', 'sdlc-review.json');
    const mmEnv = { ...process.env, SDLC_REVIEW_CONFIG_USER: mmFile };
    const mm = args => spawnSync('node', [cli, 'main-model', ...args], { cwd: mmDir, encoding: 'utf-8', env: mmEnv });
    const read = () => JSON.parse(fs.readFileSync(mmFile, 'utf-8'));
    let r = mm(['show']);
    assert('main-model show, no file: exit 0, null', [r.status, JSON.parse(r.stdout).mainModel], [0, null]);
    assert('main-model show, no file: no shipped default, so no effective model',
        [JSON.parse(r.stdout).effective, JSON.parse(r.stdout).source], [null, 'none']);
    r = mm(['set', 'opus']);
    assert('main-model set creates the file', [r.status, read()], [0, { mainModel: 'opus' }]);
    fs.writeFileSync(mmFile, JSON.stringify({ round1: 'haiku', rules: [{ paths: ['a'] }], mainModel: 'opus' }));
    r = mm(['set', 'sonnet']);
    assert('main-model set merges and keeps other keys', [r.status, read()],
        [0, { round1: 'haiku', rules: [{ paths: ['a'] }], mainModel: 'sonnet' }]);
    assert('main-model show prints the value', JSON.parse(mm(['show']).stdout).mainModel, 'sonnet');
    fs.writeFileSync(mmFile, JSON.stringify({ mainModel: 'opus' }));
    r = JSON.parse(mm(['show']).stdout);
    assert('main-model show, user value: effective is it, source user', [r.effective, r.source], ['opus', 'user']);
    fs.writeFileSync(mmFile, JSON.stringify({ round1: 'haiku', rules: [{ paths: ['a'] }], mainModel: 'sonnet' }));
    assert('main-model leaves no temp file', fs.readdirSync(path.dirname(mmFile)).filter(f => f.includes('.tmp.')), []);
    r = mm(['off']);
    assert('main-model off writes an explicit opt-out and keeps other keys', [r.status, read()],
        [0, { round1: 'haiku', rules: [{ paths: ['a'] }], mainModel: 'off' }]);
    r = mm(['show']);
    assert('main-model show after off: null and no warning', [r.status, JSON.parse(r.stdout).mainModel, JSON.parse(r.stdout).warnings], [0, null, []]);
    assert('main-model show after off: no effective model, source off', [JSON.parse(r.stdout).effective, JSON.parse(r.stdout).source], [null, 'off']);
    fs.writeFileSync(mmFile, JSON.stringify({ round1: 'haiku' }));
    r = JSON.parse(mm(['show']).stdout);
    assert('main-model show, file without the key: no default, none', [r.mainModel, r.effective, r.source], [null, null, 'none']);
    fs.writeFileSync(mmFile, JSON.stringify({ round1: 'haiku', rules: [{ paths: ['a'] }], mainModel: 'off' }));
    fs.rmSync(mmFile);
    r = mm(['off']);
    assert('main-model off creates the file when missing', [r.status, read()], [0, { mainModel: 'off' }]);
    fs.writeFileSync(mmFile, JSON.stringify({ round1: 'haiku', rules: [{ paths: ['a'] }] }));
    r = mm(['set', 'gpt']);
    assert('main-model set with a bad model exits 2, file unchanged', [r.status, read().mainModel], [2, undefined]);
    r = mm(['set']);
    assert('main-model set with no model exits 2', r.status, 2);
    fs.writeFileSync(mmFile, '{nope');
    r = mm(['set', 'opus']);
    assert('malformed file: refused, untouched', [r.status, fs.readFileSync(mmFile, 'utf-8')], [1, '{nope']);
    r = mm(['off']);
    assert('malformed file: off refused too', [r.status, fs.readFileSync(mmFile, 'utf-8')], [1, '{nope']);
    fs.writeFileSync(mmFile, JSON.stringify({ mainModel: 'opus' }));
    const real = path.join(mmDir, 'real.json');
    fs.renameSync(mmFile, real);
    fs.symlinkSync(real, mmFile);
    r = mm(['set', 'haiku']);
    assert('symlinked file: refused, still a link to the same bytes',
        [r.status, fs.lstatSync(mmFile).isSymbolicLink(), JSON.parse(fs.readFileSync(real, 'utf-8')).mainModel], [1, true, 'opus']);
    // An invalid stored value is reported, not echoed as a model.
    fs.rmSync(mmFile);
    fs.writeFileSync(mmFile, JSON.stringify({ mainModel: 'gpt' }));
    r = JSON.parse(mm(['show']).stdout);
    assert('show: invalid stored value is null with a warning', [r.mainModel, r.warnings.length > 0], [null, true]);
    assert('show: invalid stored value gets no effective model', [r.effective, r.source], [null, 'none']);
    fs.writeFileSync(mmFile, '{nope');
    r = JSON.parse(mm(['show']).stdout);
    assert('show: malformed file gets no default', [r.mainModel, r.effective, r.source], [null, null, 'none']);
    // A repo file's mainModel is ignored.
    fs.writeFileSync(mmFile, JSON.stringify({ mainModel: 'haiku' }));
    fs.mkdirSync(path.join(mmDir, '.claude'));
    fs.writeFileSync(path.join(mmDir, '.claude', 'sdlc-review.json'), JSON.stringify({ mainModel: 'opus' }));
    r = JSON.parse(spawnSync('node', [cli, 'main-model', 'show', '--repo', mmDir], { encoding: 'utf-8', env: mmEnv }).stdout);
    assert('show: repo mainModel ignored with a warning', [r.mainModel, r.warnings.some(w => w.includes('mainModel'))], ['haiku', true]);
}

fs.rmSync(sb, { recursive: true, force: true });

const hookSrc = fs.readFileSync(path.join(__dirname, 'session-start-instructions.js'), 'utf8');
const hookModels = /const MAIN_MODELS = (\[[^\]]*\])/.exec(hookSrc);
assert('hook MAIN_MODELS matches lib MODELS', hookModels && JSON.parse(hookModels[1].replace(/'/g, '"')), cfg.MODELS);
const hookOff = /const MAIN_MODEL_OFF = '([^']*)'/.exec(hookSrc);
assert('hook MAIN_MODEL_OFF matches lib MAIN_MODEL_OFF', hookOff && hookOff[1], cfg.MAIN_MODEL_OFF);
const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'defaults', 'sdlc-review.json'), 'utf8'));
assert('the plugin ships no mainModel: the main model is opt-in', shipped.mainModel, undefined);

console.log('\n====================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
