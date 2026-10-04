// Tests for protect-user-dir.js PreToolUse hook
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./lib/isolate-git-env.js').isolateGitEnv();

const { spawnSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.join(__dirname, 'protect-user-dir.js');
const HOME = process.env.USERPROFILE || process.env.HOME;

// The hook reads Claude's tool-use payload from stdin (fs.readFileSync(0)).
// Tests must pipe JSON to stdin, not set an env var.
function runHook(toolInput) {
    const result = spawnSync('node', [HOOK_PATH], {
        input: JSON.stringify({ tool_input: toolInput }),
        encoding: 'utf-8',
    });
    return JSON.parse(result.stdout.trim());
}

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    if (actual === expected) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name} -- expected "${expected}", got "${actual}"`);
        failed++;
    }
}

console.log('protect-user-dir hook tests');
console.log('===========================');

// Should block edits to ~/.claude/ files
console.log('\nBlocking edits to ~/.claude/:');

let result = runHook({ file_path: HOME + '\\.claude\\settings.json', old_string: 'a', new_string: 'b' });
assert('blocks edit to ~/.claude/settings.json', result.decision, 'block');

result = runHook({ file_path: HOME + '/.claude/hooks/some-hook.js', old_string: 'a', new_string: 'b' });
assert('blocks edit to ~/.claude/hooks/ (forward slashes)', result.decision, 'block');

result = runHook({ file_path: HOME + '\\.claude\\skills\\my-skill\\SKILL.md', old_string: 'a', new_string: 'b' });
assert('blocks edit to ~/.claude/skills/', result.decision, 'block');

// Should block writes to ~/.claude/ files
console.log('\nBlocking writes to ~/.claude/:');

result = runHook({ file_path: HOME + '\\.claude\\hooks\\new-hook.js', content: 'test' });
assert('blocks write to ~/.claude/hooks/', result.decision, 'block');

// Should approve edits to project files
console.log('\nApproving project directory edits:');

result = runHook({ file_path: 'C:\\Users\\dev\\Workspace\\sdlc-claude-skills\\.claude\\hooks\\test.js', old_string: 'a', new_string: 'b' });
assert('approves project .claude/hooks edit', result.decision, 'approve');

result = runHook({ file_path: 'C:\\Users\\dev\\Workspace\\sdlc-claude-skills\\src\\app.py', old_string: 'a', new_string: 'b' });
assert('approves project source edit', result.decision, 'approve');

// Should approve writes to the auto-memory allowlist (~/.claude/projects/*/memory/)
console.log('\nAllowlist: auto-memory directory:');

result = runHook({ file_path: HOME + '\\.claude\\projects\\my-project\\memory\\user.md', content: 'x' });
assert('approves write to ~/.claude/projects/*/memory/', result.decision, 'approve');

// Should approve writes to the plan-mode allowlist (~/.claude/plans/)
console.log('\nAllowlist: plan-mode directory:');

result = runHook({ file_path: HOME + '\\.claude\\plans\\my-plan.md', content: 'x' });
assert('approves write to ~/.claude/plans/ (backslash path)', result.decision, 'approve');

result = runHook({ file_path: HOME + '/.claude/plans/nested/deep-plan.md', content: 'x' });
assert('approves nested write under ~/.claude/plans/ (forward slashes)', result.decision, 'approve');

// Sibling path that only *looks* like plans must still be blocked
result = runHook({ file_path: HOME + '\\.claude\\plans-archive\\old.md', content: 'x' });
assert('blocks ~/.claude/plans-archive/ (not the plans allowlist)', result.decision, 'block');

// Should approve edits to other files
console.log('\nApproving other file edits:');

result = runHook({ file_path: 'C:\\Users\\dev\\Workspace\\other-project\\file.py', old_string: 'a', new_string: 'b' });
assert('approves other project edit', result.decision, 'approve');

// Should approve when no file_path (non-file tool input)
console.log('\nEdge cases:');

result = runHook({ command: 'git status' });
assert('approves input without file_path', result.decision, 'approve');

// Should block CLAUDE.md in user dir
result = runHook({ file_path: HOME + '\\.claude\\CLAUDE.md', old_string: 'a', new_string: 'b' });
assert('blocks edit to ~/.claude/CLAUDE.md', result.decision, 'block');

console.log(`\n===========================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
