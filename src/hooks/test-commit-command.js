// Unit tests for lib/commit-command.js: detects `git commit` invocations
// whose commit contents cannot be known from the index at PreToolUse time.
// Run: node src/hooks/test-commit-command.js
const path = require('path');

const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const { indexUnreliableReason, classifyCommitCommand, directoryChangeReason, splitSegments } = require(path.join(__dirname, 'lib', 'commit-command.js'));

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
    if (cond) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name}${detail !== undefined ? ' -- got ' + JSON.stringify(detail) : ''}`); failed++; }
}
function blocks(name, cmd, needle) {
    const r = indexUnreliableReason(cmd);
    ok(name, typeof r === 'string' && (!needle || r.includes(needle)), r);
}
function allows(name, cmd) {
    const r = indexUnreliableReason(cmd);
    ok(name, r === null, r);
}

console.log('commit-command tests');
console.log('====================');

console.log('\n[UNIT] plain commits are allowed');
allows('bare commit', 'git commit');
allows('commit with -m', 'git commit -m "fix the thing"');
allows('commit with -m and -q', 'git commit -q -m msg');
allows('commit with --message=', 'git commit --message="fix"');
allows('commit with -F file', 'git commit -F /tmp/msg.txt');
allows('commit with --author', 'git commit --author="A <a@b.c>" -m x');
allows('commit with -S (attached key)', 'git commit -Sabc123 -m x');
allows('commit with --no-verify', 'git commit --no-verify -m x');
allows('commit preceded by cd', 'cd /repo && git commit -m x');
allows('commit with env assignment', 'GIT_EDITOR=true git commit -m x');
allows('commit followed by log', 'git commit -m x && git log -1');
allows('commit followed by push', 'git commit -m x; git push');
allows('short cluster without a or i', 'git commit -qnm x');

console.log('\n[UNIT] redirections are not pathspecs');
allows('2>&1 | head', 'git commit -m x 2>&1 | head -20');
allows('> /dev/null 2>&1', 'git commit -m x > /dev/null 2>&1');
allows('>log', 'git commit -m x >log.txt');
allows('>> log', 'git commit -m x >> log.txt');
allows('&> out', 'git commit -m x &> out.txt');
allows('< /dev/null', 'git commit -m x < /dev/null');
allows('quoted redirect target', 'git commit -m x > "my log.txt"');
allows('heredoc message then redirect', 'git commit -m "$(cat <<\'EOF\'\nmsg\nEOF\n)" 2>&1 | head -5');
blocks('pathspec after redirect still blocks', 'git commit -m x 2>&1 foo.py', 'pathspec');
blocks('redirect does not hide git add', 'git add x >/dev/null && git commit -m y', 'git add');

console.log('\n[UNIT] staging words inside the message are not staging');
allows('message mentions git add', 'git commit -m "Handle git add correctly"');
allows('single-quoted message mentions -a', "git commit -m 'do not use -a'");
allows('message mentions git commit -a', 'git commit -m "Block git commit -a bypass"');
allows('heredoc message via command substitution', [
    'git commit -m "$(cat <<\'EOF\'',
    'Fix git add && git commit chaining',
    '',
    'It shouldn\'t bypass. Uses "quotes" and -a in prose.',
    'EOF',
    ')"',
].join('\n'));
allows('heredoc via -F -', 'git commit -F - <<EOF\ngit add foo.py\nEOF');
allows('escaped quote in message', 'git commit -m "say \\"git add\\" here"');

console.log('\n[UNIT] staging in the same command blocks');
blocks('git add && git commit', 'git add foo.py && git commit -m x', 'git add');
blocks('git add ; git commit', 'git add . ; git commit -m x', 'git add');
blocks('git add on a new line', 'git add -A\ngit commit -m x', 'git add');
blocks('git rm && git commit', 'git rm old.py && git commit -m x', 'git rm');
blocks('git mv && git commit', 'git mv a.py b.py && git commit -m x', 'git mv');
blocks('git stash pop && git commit', 'git stash pop && git commit -m x', 'git stash');
blocks('git stash apply && git commit', 'git stash apply && git commit -m x', 'git stash');
blocks('git commit then git add (order irrelevant)', 'git commit -m x && git add y', 'git add');
blocks('git add after cd', 'cd repo && git add x && git commit -m y', 'git add');
blocks('git -C add', 'git -C /repo add x && git commit -m y', 'git add');

console.log('\n[UNIT] commit flags that stage at commit time block');
blocks('-a', 'git commit -a -m x', '-a');
blocks('--all', 'git commit --all -m x', '-a');
blocks('-am', 'git commit -am "x"', '-a');
blocks('-qam', 'git commit -qam x', '-a');
blocks('-i', 'git commit -i foo.py -m x', '-i');
blocks('--include', 'git commit --include foo.py -m x', '-i');
blocks('--interactive', 'git commit --interactive', 'interactive');
blocks('--patch', 'git commit -p -m x', 'interactive');

console.log('\n[UNIT] pathspecs on the commit block');
blocks('trailing pathspec', 'git commit -m x foo.py', 'pathspec');
blocks('pathspec via --', 'git commit -m x -- foo.py', 'pathspec');
blocks('pathspec before -m', 'git commit foo.py -m x', 'pathspec');
blocks('--only pathspec', 'git commit --only foo.py -m x', 'pathspec');
blocks('--pathspec-from-file', 'git commit --pathspec-from-file=list -m x', 'pathspec');

console.log('\n[UNIT] commits the hook cannot see block');
blocks('git -C other commit', 'git -C /other/repo commit -m x', 'another');
blocks('--git-dir commit', 'git --git-dir=/x/.git commit -m x', 'another');
blocks('--work-tree commit', 'git --work-tree=/x commit -m x', 'another');
blocks('commit wrapped in bash -c', 'bash -c "git add x && git commit -m y"', 'wrapped');
blocks('commit wrapped in sh -c', "sh -c 'git commit -m y'", 'wrapped');
blocks('commit inside command substitution', 'echo "$(git commit -m x)"', 'wrapped');
blocks('commit via eval', 'eval "git commit -m x"', 'wrapped');

console.log('\n[UNIT] staging nested after shell keywords blocks');
blocks('for/do loop', 'for f in a.py b.py; do git add $f; done; git commit -m y', 'git add');
blocks('for/do with newlines', 'for f in *.py\ndo\n  git add "$f"\ndone\ngit commit -m y', 'git add');
blocks('if/then', 'if true; then git add x; fi; git commit -m y', 'git add');
blocks('if git add', 'if git add x; then echo ok; fi; git commit -m y', 'git add');
blocks('while/do', 'while read f; do git add "$f"; done < list; git commit -m y', 'git add');
blocks('negated', '! git add x; git commit -m y', 'git add');
blocks('brace group', '{ git add x; git commit -m y; }', 'git add');
blocks('command builtin', 'command git add x && git commit -m y', 'git add');
blocks('env builtin', 'env git add x && git commit -m y', 'git add');
blocks('|| true between', 'git add x || true && git commit -m y', 'git add');
blocks('no space after &&', 'git add x &&git commit -m y', 'git add');
blocks('tab separated', 'git\tadd\tx\t&&\tgit\tcommit\t-m\ty', 'git add');
blocks('backslash-newline continuation', 'git add x && \\\ngit commit -m y', 'git add');
blocks('xargs git add', 'xargs git add < list; git commit -m y', 'git add');
blocks('commit then -a later', 'git commit -m y --all', '-a');
blocks('--message then -a', 'git commit --message x -a', '-a');

console.log('\n[UNIT] git.exe and paths');
blocks('bare git.exe add && commit', 'git.exe add x && git.exe commit -m y', 'git add');
blocks('bare git.exe commit -a', 'git.exe commit -a -m y', '-a');
blocks('GIT.EXE upper case', 'GIT.EXE commit -a -m y', '-a');
blocks('quoted windows path git.exe', '"C:\\\\Program Files\\\\Git\\\\bin\\\\git.exe" commit -a -m y', '-a');
blocks('forward-slash windows path git.exe', 'C:/Program\\ Files/Git/bin/git.exe commit -a -m y', '-a');
blocks('xargs -0 git add', 'xargs -0 git add < list; git commit -m y', 'git add');
blocks('sudo -u git add', 'sudo -u me git add x && git commit -m y', 'git add');
blocks('timeout git add', 'timeout 30 git add x && git commit -m y', 'git add');
allows('echo git add is data', 'echo git add x && git commit -m y');
blocks('/usr/bin/git add', '/usr/bin/git add x && /usr/bin/git commit -m y', 'git add');
ok('bare git.exe commit is commit', classifyCommitCommand('git.exe commit -m y').kind === 'commit');

console.log('\n[UNIT] environment retargeting and aliases');
blocks('GIT_DIR prefix', 'GIT_DIR=/other/.git git commit -m y', 'GIT_DIR');
blocks('GIT_INDEX_FILE prefix', 'GIT_INDEX_FILE=/tmp/idx git commit -m y', 'GIT_DIR');
blocks('export GIT_DIR earlier', 'export GIT_DIR=/other/.git; git commit -m y', 'GIT_DIR');
blocks('GIT_WORK_TREE prefix', 'GIT_WORK_TREE=/elsewhere git commit -m y', 'GIT_DIR');
allows('unrelated env prefix', 'GIT_AUTHOR_NAME=x git commit -m y');
blocks('-c alias.ci=commit ci', 'git -c alias.ci=commit ci -m y', 'alias');
blocks('-c alias with shell', "git -c alias.x='!git add . && git commit -m y' x", 'alias');
blocks('-c alias separate value', 'git -c alias.ci=commit commit -m y', 'alias');
allows('-c non-alias config', 'git -c commit.gpgsign=false commit -m y');

console.log('\n[UNIT] quoted mentions handed to inert commands are data');
allows('echo of a commit string', 'echo "git add x && git commit -m y" > doc.md');
allows('printf of a commit string', "printf '%s\\n' 'git commit -am y' >> notes.txt");
allows('cat heredoc to a file', 'cat > fixture.json <<EOF\n{"cmd": "git add x && git commit -m y"}\nEOF');
allows('grep for a commit string', 'grep -n "git commit" src/hooks/*.js');
blocks('echo with command substitution still blocks', 'echo "$(git add x && git commit -m y)"', 'wrapped');
blocks('python heredoc still blocks', 'python3 - <<EOF\nimport os; os.system("git add x && git commit -m y")\nEOF', 'wrapped');
blocks('node -e still blocks', 'node -e "require(\'child_process\').execSync(\'git commit -a -m y\')"', 'wrapped');
blocks('xargs -I with commit still blocks', 'echo x | xargs -I{} sh -c "git add {} && git commit -m y"', 'wrapped');
blocks('make-style unknown wrapper still blocks', 'mytool "git add x && git commit -m y"', 'wrapped');

console.log('\n[UNIT] quote-splicing does not hide words');
blocks("git com''mit", "git add x && git com''mit -m y", 'git add');
blocks("g''it commit", "g''it add x && g''it commit -m y", 'git add');
blocks('git com""mit', 'git add x && git com""mit -m y', 'git add');
blocks('git com\\mit', 'git add x && git com\\mit -m y', 'git add');
blocks("spliced -a", "git com''mit -a -m y", '-a');
blocks("a''dd", "git a''dd x && git commit -m y", 'git add');
blocks("spliced inside bash -c", "bash -c \"git add x && git com''mit -m y\"", 'wrapped');
blocks("spliced inside sh -c single quotes", "sh -c 'git add x && git com\"\"mit -m y'", 'wrapped');
ok("spliced plain commit is commit", classifyCommitCommand("git com''mit -m y").kind === 'commit');
ok('spliced echo is inert', classifyCommitCommand("ec''ho 'git add x && git commit -m y'").kind === 'not-a-commit');

console.log('\n[UNIT] run-time computed command names and subcommands');
blocks('subcommand from variable', 'c=commit; git $c -m y', 'run time');
blocks('stage then subcommand from variable', 'git add x; c=commit; git $c -m y', 'run time');
blocks('subcommand from backticks', 'git `echo commit` -m y', 'run time');
blocks('add via variable then commit', 's=add; git $s x; git commit -m y', 'run time');
blocks('subcommand from substitution', 'git $(echo commit) -m y', 'run time');
blocks('subcommand from ${}', 'git ${X:-commit} -m y', 'run time');
blocks("subcommand from $'...'", "git $'commit' -m y", 'run time');
blocks('command name from variable with git assigned', 'G=git; $G add x && git commit -m y', 'run time');
blocks('both via variable with git assigned', 'G=git; $G add x && $G commit -m y', 'run time');
blocks('exe from variable path', '$HOME/bin/git commit -a -m y', 'run time');
allows('dynamic command with no git anywhere', '$EDITOR notes.txt');
allows('dynamic argument to git commit', 'git commit -m "$msg"');
allows('dynamic cd before commit', 'cd "$DIR" && git commit -m y');
ok('dynamic command without git is not-a-commit', classifyCommitCommand('for f in *; do $CMD "$f"; done').kind === 'not-a-commit');

console.log('\n[UNIT] robustness');
ok('empty command', classifyCommitCommand('').kind === 'not-a-commit');
ok('null command', classifyCommitCommand(null).kind === 'not-a-commit');
ok('undefined command', classifyCommitCommand(undefined).kind === 'not-a-commit');
ok('very long message', classifyCommitCommand('git commit -m ' + 'x'.repeat(200000)).kind === 'commit');
blocks('unbalanced quote still sees git add', 'git add x && git commit -m "unterminated', 'git add');
ok('unbalanced quote alone is commit', classifyCommitCommand('git commit -m "unterminated').kind === 'commit');
ok('CRLF line endings', classifyCommitCommand('git add x\r\ngit commit -m y').kind === 'unreliable');

console.log('\n[UNIT] non-commit commands are ignored');
allows('git status', 'git status');
allows('git add alone', 'git add foo.py');
allows('no git at all', 'ls -la');
allows('prose handed to echo', 'echo "remember to git commit later"');
blocks('prose handed to an unknown command', 'notify "remember to git commit later"', 'wrapped');

console.log('\n[UNIT] classifyCommitCommand kinds');
ok('git status is not-a-commit', classifyCommitCommand('git status').kind === 'not-a-commit');
ok('git log --grep commit is not-a-commit', classifyCommitCommand('git log --grep commit').kind === 'not-a-commit');
ok('git log | grep commit is not-a-commit', classifyCommitCommand('git log | grep commit').kind === 'not-a-commit');
ok('git add alone is not-a-commit', classifyCommitCommand('git add x').kind === 'not-a-commit');
ok('plain commit is commit', classifyCommitCommand('git commit -m x').kind === 'commit');
ok('git -c k=v commit is commit', classifyCommitCommand('git -c core.editor=true commit -m x').kind === 'commit');
ok('git add && commit is unreliable', classifyCommitCommand('git add x && git commit -m y').kind === 'unreliable');
ok('bash -c git -C commit is unreliable', classifyCommitCommand('bash -c "git -C /r commit -m y"').kind === 'unreliable');
ok('heredoc piped to bash is unreliable', classifyCommitCommand('bash <<EOF\ngit commit -m x\nEOF').kind === 'unreliable');
ok('git switch && commit is unreliable', classifyCommitCommand('git switch main && git commit -m x').kind === 'unreliable');
ok('git reset --soft && commit is unreliable', classifyCommitCommand('git reset --soft HEAD~1 && git commit -m x').kind === 'unreliable');
ok('git stash list && commit is commit', classifyCommitCommand('git stash list && git commit -m x').kind === 'commit');

console.log('\n[UNIT] directory changes before the commit');
{
    const c = classifyCommitCommand('cd /x && git commit -m y');
    ok('cd is recorded', c.kind === 'commit' && c.cds.length === 1 && c.cds[0].target === '/x', c);
    ok('cd -P flag is skipped', classifyCommitCommand('cd -P /x && git commit -m y').cds[0].target === '/x');
    ok('dynamic cd is marked', classifyCommitCommand('cd "$DIR" && git commit -m y').cds[0].dynamic === true);
    ok('bare cd is marked dynamic', classifyCommitCommand('cd && git commit -m y').cds[0].dynamic === true);
    ok('cd - is marked dynamic', classifyCommitCommand('cd - && git commit -m y').cds[0].dynamic === true);
    ok('pushd is recorded', classifyCommitCommand('pushd sub; git commit -m y').cds.length === 1);
    ok('no cd means no cds', classifyCommitCommand('git commit -m y').cds.length === 0);
    ok('cd after the commit is not counted', classifyCommitCommand('git commit -m y && cd /tmp').cds.length === 0);
    ok('builtin cd is recorded', classifyCommitCommand('builtin cd /x && git commit -m y').cds.length === 1);
    ok('command cd is recorded', classifyCommitCommand('command cd /x && git commit -m y').cds.length === 1);
    ok('cd behind an unknown wrapper is dynamic', classifyCommitCommand('mytool cd /x && git commit -m y').cds[0].dynamic === true);
    ok('echo cd is not a cd', classifyCommitCommand('echo cd /x && git commit -m y').cds.length === 0);
    ok('~user is dynamic', classifyCommitCommand('cd ~someone && git commit -m y').cds[0].dynamic === true);
    ok('~user/sub is dynamic', classifyCommitCommand('cd ~someone/dev && git commit -m y').cds[0].dynamic === true);
    ok('~/sub is static', classifyCommitCommand('cd ~/dev && git commit -m y').cds[0].dynamic === false);
    ok('cd -- dir is recorded', classifyCommitCommand('cd -- /x && git commit -m y').cds[0].target === '/x');
    ok('popd is dynamic', classifyCommitCommand('popd; git commit -m y').cds[0].dynamic === true);
    ok('popd behind a wrapper is dynamic', classifyCommitCommand('builtin popd && git commit -m y').cds[0].dynamic === true);
    ok('git log --grep cd is not a cd', classifyCommitCommand('git log --grep cd && git commit -m y').cds.length === 0);
    ok('git.exe with cd argument is not a cd', classifyCommitCommand('git.exe log cd && git commit -m y').cds.length === 0);

    // Real repositories: the comparison is by repository, not by path.
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-top-'));
    execFileSync('git', ['init', '-q', top]);
    const sub = path.join(top, 'sub');
    fs.mkdirSync(sub);
    const nested = path.join(top, 'vendor');
    fs.mkdirSync(nested);
    execFileSync('git', ['init', '-q', nested]);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-other-'));
    const otherRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-otherrepo-'));
    execFileSync('git', ['init', '-q', otherRepo]);
    const r = (cmd, cwd) => directoryChangeReason(classifyCommitCommand(cmd).cds, cwd, top);
    ok('no cd -> null', r('git commit -m y', top) === null);
    ok('cd into a subdir stays inside', r('cd sub && git commit -m y', top) === null);
    ok('cd .. from subdir back to top stays inside', r('cd .. && git commit -m y', sub) === null);
    ok('cd sub && cd .. ends inside', r('cd sub && cd .. && git commit -m y', top) === null);
    ok('cd .. && cd back ends inside', r('cd .. && cd ' + path.basename(top) + ' && git commit -m y', top) === null);
    ok('cd to the toplevel itself stays inside', r('cd ' + top + ' && git commit -m y', other) === null);
    ok('cd to a non-repo dir leaves', typeof r('cd ' + other + ' && git commit -m y', top) === 'string');
    ok('cd to another repo is a different repository', /different repository/.test(r('cd ' + otherRepo + ' && git commit -m y', top) || ''));
    ok('cd into a nested repo is a different repository', /different repository/.test(r('cd vendor && git commit -m y', top) || ''));
    ok('cd .. from top leaves', typeof r('cd .. && git commit -m y', top) === 'string');
    ok('cd / leaves', typeof r('cd / && git commit -m y', top) === 'string');
    ok('cd to a missing dir is a reason', typeof r('cd does-not-exist && git commit -m y', top) === 'string');
    ok('dynamic cd is a reason', typeof r('cd "$DIR" && git commit -m y', top) === 'string');
    ok('builtin cd out is a reason', typeof r('builtin cd ' + other + ' && git commit -m y', top) === 'string');
    ok('~user is a reason', typeof r('cd ~' + (os.userInfo().username) + ' && git commit -m y', top) === 'string');
    ok('cd with no repository is a reason',
        typeof directoryChangeReason(classifyCommitCommand('cd sub && git commit -m y').cds, top, null) === 'string');
    ok('no cd with no repository is null',
        directoryChangeReason(classifyCommitCommand('git commit -m y').cds, top, null) === null);
    ok('undefined cwd does not throw', (() => { try { directoryChangeReason([{ target: 'sub', dynamic: false }], undefined, top); return true; } catch (e) { return false; } })());
    for (const d of [top, other, otherRepo]) fs.rmSync(d, { recursive: true, force: true });
}

console.log('\n[UNIT] amend flag');
ok('--amend is flagged', classifyCommitCommand('git commit --amend --no-edit').amend === true);
ok('plain commit is not flagged', classifyCommitCommand('git commit -m y').amend === false);
ok('a message mentioning --amend is not an amend', classifyCommitCommand('git commit -m "gate --amend too"').amend === false);
ok('unreliable shapes still report hasCommit', classifyCommitCommand('git commit -a -m y').hasCommit === true);
ok('add && commit reports hasCommit', classifyCommitCommand('git add x && git commit -m y').hasCommit === true);
ok('non-commit reports no commit', classifyCommitCommand('git status').hasCommit === false);
ok('wrapped commit reports no top-level commit', classifyCommitCommand('bash -c "git commit -m y"').hasCommit === false);

console.log('\n[UNIT] splitSegments');
const segs = splitSegments('cd x && git add a b; git commit -m "a && b"');
ok('three segments', segs.length === 3, segs);
ok('quoted operator stays inside the word', segs[2].join(' ') === 'git commit -m a && b', segs[2]);
ok('subshell parens are segment boundaries', splitSegments('(git commit -m x)').length === 1);

console.log(`\n====================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
