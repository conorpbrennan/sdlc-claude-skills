// PostToolUse hook: notify after a git commit completes.
//
// The notifier itself is site-specific and optional: point
// CLAUDE_COMMIT_NOTIFY at an executable, or drop one at
// ~/claude-commit-notify.ps1 (Windows) or ~/claude-commit-notify.sh. When no
// notifier is present the hook does nothing and says nothing -- a machine
// without one is the normal case, not an error, so it must not spew on every
// commit.
const fs = require('fs');
const os = require('os');
const path = require('path');

const input = process.env.CLAUDE_TOOL_INPUT || '';

if (input.includes('git commit') && !input.includes('--amend')) {
    const configured = process.env.CLAUDE_COMMIT_NOTIFY;
    const candidates = configured
        ? [configured]
        : [
            path.join(os.homedir(), 'claude-commit-notify.ps1'),
            path.join(os.homedir(), 'claude-commit-notify.sh'),
        ];

    const script = candidates.find((p) => {
        try {
            return fs.statSync(p).isFile();
        } catch (e) {
            return false;
        }
    });

    if (script) {
        const { execFileSync } = require('child_process');
        // execFileSync, not execSync: the working directory name is attacker-
        // chosen (git clone takes it from the URL), and a string handed to
        // execSync goes through `sh -c`, where `$(...)` and backticks expand
        // even inside double quotes. Passing argv means no shell at all.
        // A .ps1 is not executable on its own; anything else is run directly.
        const [file, args] = script.endsWith('.ps1')
            ? ['powershell', ['-ExecutionPolicy', 'Bypass', '-File', script, '-workdir', process.cwd()]]
            : [script, [process.cwd()]];
        try {
            execFileSync(file, args, { stdio: 'inherit' });
        } catch (e) {
            // A configured notifier that fails is worth reporting: the user
            // asked for it. An absent one never reaches here.
            console.error('post-commit-notify: notifier failed:', e.message);
        }
    }
}
