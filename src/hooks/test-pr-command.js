// Unit tests for lib/pr-command.js: recognises `gh pr create` in a Bash command.
// Run: node src/hooks/test-pr-command.js
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const path = require('path');
const { isPrCreate } = require(path.join(__dirname, 'lib', 'pr-command.js'));

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
    if (cond) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name}${detail !== undefined ? ' -- got ' + JSON.stringify(detail) : ''}`); failed++; }
}
function yes(name, cmd) { const r = isPrCreate(cmd); ok(name, r === true, r); }
function no(name, cmd) { const r = isPrCreate(cmd); ok(name, r === false, r); }

console.log('pr-command tests');
console.log('================');

console.log('\n[UNIT] recognised');
yes('bare', 'gh pr create');
yes('with --fill', 'gh pr create --fill');
yes('env assignment', 'GH_TOKEN=x gh pr create');
yes('after cd &&', 'cd sub && gh pr create');
yes('after ;', 'echo hi; gh pr create');
yes('after a newline', 'echo hi\ngh pr create --fill');
yes('sudo wrapper', 'sudo gh pr create');
yes('wrapper with a duration argument', 'timeout 5 gh pr create');
yes('wrapper chain', 'nohup env GH_TOKEN=x gh pr create');
yes('absolute path', '/usr/bin/gh pr create -t x');
yes('relative path', './bin/gh pr create');
yes('reserved word', 'if true; then gh pr create; fi');
yes('piped output', 'gh pr create --fill 2>&1 | tee out.txt');
yes('quoted argument after the words', 'gh pr create -t "my title"');
yes('heredoc as the body argument', 'gh pr create --body-file - <<EOF\nbody\nEOF');

console.log('\n[UNIT] not recognised');
no('pr list', 'gh pr list');
no('pr view', 'gh pr view 3');
no('echo of the phrase', 'echo "gh pr create"');
no('commit message mentioning it', 'git commit -m "gh pr create"');
no('issue create', 'gh issue create');
no('ghx prefix', 'ghx pr create');
no('gh suffix', 'xgh pr create');
no('path to ghx', '/usr/bin/ghx pr create');
no('words out of order', 'gh create pr');
no('flag between gh and pr', 'gh --repo x pr create');
no('phrase as a later argument', 'echo gh pr create');
no('single-quoted phrase', "echo 'gh pr create'");
no('quoted gh word', '"gh" pr create');
no('heredoc body holds the phrase', 'cat <<EOF\ngh pr create\nEOF');
no('heredoc body line starts with the phrase', 'cat > notes.md <<\'EOF\'\nrun:\ngh pr create --fill\nEOF');
no('command substitution holds the phrase', 'echo $(gh pr create)');
no('empty string', '');
no('undefined', undefined);

console.log('\n[UNIT] named gaps (bounded threat model, ADVISORY)');
no('bash -c is a named gap', 'bash -c "gh pr create"');
no('sudo -u user is a named gap', 'sudo -u root gh pr create');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
