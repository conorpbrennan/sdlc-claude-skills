// PreToolUse hook: block a `git commit` whose message lacks a Co-Authored-By
// trailer, so every Claude-generated commit is attributed.
//
// The message is read where git reads it: -m/--message text, the -F/--file
// file, a heredoc on `-F -`, and --trailer values. Matching the raw command
// text instead read neither a message file nor a commit's real shape: `-F
// msg.txt` was passed unread whenever its path held no "-m", and `echo 'git
// commit -m x'` was blocked.
'use strict';

// A hook that throws prints nothing, and PreToolUse reads no decision as
// "proceed", so a crash here -- a broken lib file included -- must block.
// Registered before any require for that reason.
process.on('uncaughtException', (e) => {
    const reason = 'Pre-commit hook enforce-co-author failed: ' +
        String((e && e.message) || e).split('\n')[0].slice(0, 200);
    try { console.log(JSON.stringify({ decision: 'block', reason })); } catch (_) { /* nothing more */ }
    process.exit(0);
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const { tokenize, parseGitSegment, inspectCommitArgs, findDirectoryChange } = require('./lib/commit-command');

// A trailer is a line of its own, starting at the margin: a mention inside a
// sentence is not one, and git reads an indented line as a continuation.
const TRAILER_LINE_RE = /^co-authored-by:/im;
// --trailer takes `key: value` or `key=value`.
const TRAILER_OPTION_RE = /^[ \t]*co-authored-by[ \t]*[:=]/i;
// A value the shell computes when it runs, so this hook cannot know it.
const DYNAMIC_RE = /[$`]/;
// `<(cmd)` / `>(cmd)`: a file only bash creates, when it runs.
const PROCESS_SUBSTITUTION_RE = /[<>]\(/;
const MISSING = 'Git commits must include a Co-Authored-By trailer for Claude attribution';

function approve() {
    console.log(JSON.stringify({ decision: 'approve' }));
    process.exit(0);
}

function block(reason) {
    console.log(JSON.stringify({ decision: 'block', reason }));
    process.exit(0);
}

let hookData = {};
try { hookData = JSON.parse(fs.readFileSync(0, 'utf-8')); } catch (e) { /* no input: nothing to check */ }
const command = (hookData.tool_input && hookData.tool_input.command) || '';

function messagePath(p) {
    if (p === '~' || p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
    return path.resolve(process.cwd(), p);
}

// Args:
//   name: a file name.
// Returns:
//   how many times `name` appears in the command as a whole path component:
//   after a `/` counts, and so does attached to a -F (`-Fname`, `-sFname`);
//   inside a longer word does not.
function countNameInCommand(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const start = '(?:(?<![\\w.-])|(?<=(?:^|[\\s"\'])-[A-Za-z]*F))';
    return (command.match(new RegExp(start + escaped + '(?![\\w./-])', 'g')) || []).length;
}

// Why a message file cannot be read reliably when this hook runs, or null.
// The hook reads it before the command does anything, so a file the same
// command writes is read stale or not at all, and a relative path behind a
// `cd` or `git -C` is read from the wrong directory. Each is refused with the
// remedy rather than guessed at, as staging and committing are kept apart.
// A write may reach the file by another path (`cd d && printf x > m` for
// `-F d/m`), so the check counts its base name, not the path as typed.
//
// Args:
//   file: the -F value as typed.
//   changesDirectory: whether git runs somewhere other than this hook's cwd.
// Returns:
//   the reason to block, or null when the file can be read now.
function messageFileProblem(file, changesDirectory) {
    if (DYNAMIC_RE.test(file) || PROCESS_SUBSTITUTION_RE.test(file)) {
        return 'The commit message file ' + file + ' is only known when the shell runs. ' +
            'Name the file literally';
    }
    if (countNameInCommand(path.basename(file)) > 1) {
        return 'The commit message file ' + file + ' is also named elsewhere in this command, ' +
            'so it may be written after this hook reads it. Write the message file in its own ' +
            'command, then commit';
    }
    if (changesDirectory && !path.isAbsolute(file) && !file.startsWith('~')) {
        return 'This command runs git from another directory (cd, git -C), so the relative message file ' +
            file + ' cannot be found from here. Use an absolute path';
    }
    return null;
}

// Args:
//   seg: one simple command from tokenize(): { words, heredocs, stdinSources }.
//   changesDirectory: whether any segment of the command runs cd/pushd/popd.
// Returns:
//   null when the segment is not a commit, or its message carries the
//   trailer, or it writes no new message (editor, -C/--fixup reuse, an
//   --amend that keeps its message); otherwise the reason to block.
function checkCommit(seg, changesDirectory) {
    const git = parseGitSegment(seg.words);
    if (!git || git.sub !== 'commit') return null;
    const args = inspectCommitArgs(git.args);
    if (args.trailers.some(t => TRAILER_OPTION_RE.test(t))) return null;
    if (args.messages.length === 0 && args.files.length === 0) return null;

    const texts = [...args.messages];
    const unreadable = args.messages.some(m => DYNAMIC_RE.test(m));
    for (const file of args.files) {
        if (file === '-' || file === '/dev/stdin') {
            // A heredoc is the message only when it is the one stdin source:
            // bash feeds git the last, and a pipe or `<file` is not readable here.
            if (seg.heredocs.length !== 1 || seg.stdinSources !== 1) {
                return 'The commit message on stdin can only be checked when one heredoc on the ' +
                    'commit itself supplies it. Write the message to a file in its own command, then commit -F <file>';
            }
            texts.push(seg.heredocs[0]);
            continue;
        }
        const problem = messageFileProblem(file, changesDirectory || git.otherRepo);
        if (problem) return problem;
        try {
            texts.push(fs.readFileSync(messagePath(file), 'utf-8'));
        } catch (e) {
            return 'The commit message file ' + file + ' could not be read (' + ((e && e.code) || 'error') +
                '), so its Co-Authored-By trailer cannot be checked';
        }
    }
    if (texts.some(t => TRAILER_LINE_RE.test(t))) return null;
    // A -m value is only known when the shell runs: fall back to the command
    // text, which carries it for `-m "$(cat <<EOF ...)"`.
    if (unreadable && TRAILER_LINE_RE.test(command)) return null;
    return MISSING;
}

const segments = tokenize(command);
const changesDirectory = segments.some(seg => findDirectoryChange(seg.words) !== null);
for (const seg of segments) {
    const reason = checkCommit(seg, changesDirectory);
    if (reason) block(reason);
}
approve();
