// Tests for lib/review-config.js and review-config-cli.js: which model reviews
// which round, resolved from built-in defaults, a user file, a repo file and
// path rules.
//
// Written before the implementation.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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
assert('plan review defaults', p, { source: 'opus', consistency: 'sonnet', cap: 3, warnings: [] });
let o = cfg.resolveOrchestrator({ repoRoot: bare });
assert('orchestrator defaults', o, { bashNudge: 8, warnings: [] });
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
assert('plan-review prints the plan result', [j.source, j.consistency, j.cap], ['opus', 'sonnet', 3]);

fs.rmSync(sb, { recursive: true, force: true });

console.log('\n====================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
