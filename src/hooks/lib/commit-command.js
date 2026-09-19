// Detects `git commit` invocations whose contents cannot be known from the
// index at PreToolUse time.
//
// The pre-commit hooks run BEFORE the Bash command starts and decide by
// reading `git diff --cached`. A command that changes the index (or the
// branch) before the commit runs, or a commit that takes its contents from
// somewhere other than the index, makes that read meaningless: the hook sees
// "nothing staged" and approves. Sept 2026 incident: `git add ... && git
// commit ...` in one command sailed past all three gates.
//
// Policy is fail closed. Anything the parser cannot see through (subshells,
// quoted strings, heredocs feeding a shell, command names or git
// subcommands computed at run time) counts as unreadable and blocks.
// The cost is that staging and committing must be two separate commands.
//
// Known limits, accepted deliberately. The classifier sees one Bash
// command's text and nothing else:
//   - A command name built entirely from data the command never spells out
//     (`G=$(cat f); $G add x; $G commit`). Each Bash tool call starts with
//     a fresh environment, so that takes deliberate evasion rather than an
//     ordinary command shape; the hooks guard the latter.
//   - A `cd` that ends outside the hook's repository is refused even when a
//     later `cd` would come back, if the final directory is elsewhere; a
//     `cd` after the commit is ignored. Both follow from comparing the
//     repository of the FINAL directory before the commit.
//   - Script and build-tool indirection (`bash deploy.sh`, `source x.sh`,
//     `. ./x.sh`, `make commit`, `npm run commit`). The file or target may
//     commit internally and the hook cannot read it. Blocking every script
//     run would gate every test run and install in every repo, so these
//     are left to the review of the script itself. Claude must not use
//     them to commit: a commit is `git commit` typed in its own command.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const gitRead = require('./git-read');

// Words that run what follows them in the same segment (`sudo git add`,
// `builtin cd x`, `command cd x`). Scanned past when looking for git or cd.
const WRAPPER_WORDS = new Set([
    'command', 'builtin', 'exec', 'env', 'nohup', 'sudo', 'doas', 'nice',
    'time', 'timeout', 'xargs', 'chronic', 'unbuffer', 'stdbuf',
]);

const INDEX_WRITING_SUBCOMMANDS = new Set([
    'add', 'rm', 'mv', 'stash', 'reset', 'restore', 'checkout', 'switch',
    'apply', 'cherry-pick', 'revert', 'merge', 'rebase', 'pull', 'am',
    'read-tree', 'update-index',
]);
// `git stash` only rewrites the index for these verbs; `git stash` / `push`
// / `list` / `show` do not stage anything for the following commit.
const STASH_INDEX_VERBS = new Set(['pop', 'apply']);

// `git commit` long options that take a value in the NEXT word when not
// written as --opt=value.
const COMMIT_VALUE_OPTS = new Set([
    '--message', '--file', '--reuse-message', '--reedit-message', '--fixup',
    '--squash', '--author', '--date', '--cleanup', '--template', '--trailer',
]);
// Short flags that take a value: either the rest of the cluster or the next word.
const COMMIT_VALUE_SHORT = 'mFCct';
// Short flags whose value, if any, is attached to the flag (never the next word).
const COMMIT_ATTACHED_SHORT = 'Su';

// Global git options that take a value in the next word.
const GIT_GLOBAL_VALUE_OPTS = new Set([
    '-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path',
    '--super-prefix', '--config-env', '--list-cmds', '--attr-source',
]);
const GIT_OTHER_REPO_OPTS = new Set(['-C', '--git-dir', '--work-tree']);
// The git executable: bare, with .exe, or behind any path.
const GIT_EXE_RE = /^(.*[\\/])?git(\.exe)?$/i;
// Environment variables that retarget git at another repository or index.
const GIT_OTHER_REPO_ENV_RE = /^(GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_COMMON_DIR)=/;

// Shell reserved words that can precede a simple command inside one segment
// (`if git add x; then`, `do git add $f; done`, `! git commit`).
const SHELL_RESERVED_WORDS = new Set([
    'if', 'then', 'elif', 'else', 'fi', 'for', 'while', 'until', 'do', 'done',
    'case', 'esac', 'in', 'select', 'function', 'time', '!', 'coproc',
]);

// Commands that only print, copy, or inspect their arguments. A quoted
// string handed to one of these is data, not a command, so a mention of
// `git commit` inside it is not a hidden commit. Anything not listed here
// (bash, sh, eval, xargs, python, node, make, git itself...) is assumed
// able to execute its argument. Fail closed.
const INERT_COMMANDS = new Set([
    'echo', 'printf', 'cat', 'tee', 'grep', 'egrep', 'fgrep', 'rg', 'sed',
    'awk', 'jq', 'head', 'tail', 'sort', 'uniq', 'wc', 'tr', 'cut', 'diff',
    'test', '[', '[[', 'true', 'false', 'ls', 'mkdir', 'touch', 'cp', 'mv',
    'rm', 'cd', 'pwd', 'read', 'export', 'local', 'declare', 'basename',
    'dirname', 'realpath', 'stat', 'file', 'less', 'more', 'column',
]);

// ---------------------------------------------------------------------------
// Tokenizer. Splits a shell command into segments (one per simple command)
// of words, tracking which words came from quotes / substitutions / heredocs
// so that "opaque" text can be inspected separately.
// ---------------------------------------------------------------------------

function newSegment() { return { words: [], opaque: [], heredocs: [] }; }

function isBlank(c) { return c === ' ' || c === '\t' || c === '\r'; }

// Scan from s[i] (just after an opener) to the matching closer, honouring
// nested quotes, $( ), backticks and heredocs. Returns { end, text } where
// end indexes the char AFTER the closer and text is the raw inner content.
function scanUntil(s, i, closer, ctx) {
    const start = i;
    let pending = [];       // heredoc delimiters awaiting the next newline
    while (i < s.length) {
        const c = s[i];
        if (c === '\\' && closer !== "'") { i += 2; continue; }
        if (c === closer) {
            return { end: i + 1, text: s.slice(start, i) };
        }
        if (closer === "'") { i += 1; continue; }
        if (c === "'" && closer !== '"') { i = scanUntil(s, i + 1, "'", ctx).end; continue; }
        if (c === '"') { i = scanUntil(s, i + 1, '"', ctx).end; continue; }
        if (c === '`') { i = scanUntil(s, i + 1, '`', ctx).end; continue; }
        if (c === '$' && s[i + 1] === '(') { i = scanUntil(s, i + 2, ')', ctx).end; continue; }
        if (c === '<' && s[i + 1] === '<' && s[i + 2] !== '<' && closer !== '"') {
            const h = readHeredocDelim(s, i + 2);
            pending.push(h.delim);
            i = h.end;
            continue;
        }
        if (c === '\n' && pending.length) {
            i = skipHeredocBodies(s, i + 1, pending, ctx);
            pending = [];
            continue;
        }
        i += 1;
    }
    return { end: s.length, text: s.slice(start) };
}

function readHeredocDelim(s, i) {
    if (s[i] === '-') i += 1;
    while (i < s.length && isBlank(s[i])) i += 1;
    let delim = '';
    while (i < s.length && !isBlank(s[i]) && s[i] !== '\n' && s[i] !== ';' &&
           s[i] !== '&' && s[i] !== '|' && s[i] !== ')') {
        const c = s[i];
        if (c === "'" || c === '"') {
            const r = scanUntil(s, i + 1, c, null);
            delim += r.text;
            i = r.end;
            continue;
        }
        if (c === '\\') { delim += s[i + 1] || ''; i += 2; continue; }
        delim += c;
        i += 1;
    }
    return { delim, end: i };
}

// i is at the first char of the line after the command line that declared
// the heredocs. Consumes one body per delimiter, in order. Bodies are
// recorded on ctx (when given) as opaque text.
function skipHeredocBodies(s, i, delims, ctx) {
    for (const delim of delims) {
        let body = '';
        while (i < s.length) {
            let nl = s.indexOf('\n', i);
            if (nl === -1) nl = s.length;
            const line = s.slice(i, nl);
            i = nl + 1;
            if (line.replace(/^\t+/, '') === delim) break;
            body += line + '\n';
        }
        if (ctx) ctx.heredocs.push(body);
    }
    return Math.min(i, s.length);
}

// Advance past one shell word starting at s[i], honouring quotes and
// substitutions. Returns the index after the word.
function skipWord(s, i) {
    while (i < s.length) {
        const c = s[i];
        if (isBlank(c) || c === '\n' || c === ';' || c === '&' || c === '|' ||
            c === '(' || c === ')' || c === '<' || c === '>') break;
        if (c === '\\') { i += 2; continue; }
        if (c === "'" || c === '"' || c === '`') { i = scanUntil(s, i + 1, c, null).end; continue; }
        if (c === '$' && s[i + 1] === '(') { i = scanUntil(s, i + 2, ')', null).end; continue; }
        i += 1;
    }
    return i;
}

function splitSegments(cmd) {
    return tokenize(cmd).map(seg => seg.words);
}

function tokenize(cmd) {
    const s = String(cmd || '');
    const segments = [];
    let seg = newSegment();
    let word = '';
    let inWord = false;
    let wordOpaque = false;
    let pending = [];
    let i = 0;

    function endWord() {
        if (inWord) {
            seg.words.push(word);
            if (wordOpaque) seg.opaque.push(word);
        }
        word = ''; inWord = false; wordOpaque = false;
    }
    function endSegment() {
        endWord();
        if (seg.words.length || seg.opaque.length || seg.heredocs.length) segments.push(seg);
        seg = newSegment();
    }

    while (i < s.length) {
        const c = s[i];
        const next = s[i + 1];
        if (c === '\\') {
            if (next === '\n') { i += 2; continue; }   // line continuation
            word += next || ''; inWord = true; i += 2; continue;
        }
        if (c === "'" || c === '"') {
            // ctx null: the word's raw text already carries any nested
            // heredoc body, so it is inspected (or exempted) as one unit.
            const r = scanUntil(s, i + 1, c, null);
            word += r.text; inWord = true; wordOpaque = true; i = r.end;
            continue;
        }
        // Substitutions keep their delimiters so the word reads as dynamic
        // and as executed text.
        if (c === '`') {
            const r = scanUntil(s, i + 1, '`', null);
            word += '`' + r.text + '`'; inWord = true; wordOpaque = true; i = r.end;
            continue;
        }
        if (c === '$' && next === '(') {
            const r = scanUntil(s, i + 2, ')', null);
            word += '$(' + r.text + ')'; inWord = true; wordOpaque = true; i = r.end;
            continue;
        }
        if (c === '$' && next === '{') {
            const r = scanUntil(s, i + 2, '}', null);
            word += '${' + r.text + '}'; inWord = true; wordOpaque = true; i = r.end;
            continue;
        }
        if (c === '<' && next === '<' && s[i + 2] !== '<') {
            endWord();
            const h = readHeredocDelim(s, i + 2);
            pending.push(h.delim);
            i = h.end;
            continue;
        }
        if (c === '>' || c === '<' || (c === '&' && next === '>')) {
            // Redirection: [n]>target, [n]>>target, [n]>&m, [n]<target,
            // &>target, <<<word. Not an argument; drop it and its target.
            // A bare fd number immediately before the operator ("2>&1")
            // belongs to the redirection, not the command.
            if (inWord && !/^\d+$/.test(word)) endWord();
            word = ''; inWord = false; wordOpaque = false;
            while (i < s.length && (s[i] === '>' || s[i] === '<' || s[i] === '&')) i += 1;
            while (i < s.length && isBlank(s[i])) i += 1;
            i = skipWord(s, i);
            continue;
        }
        if (c === '\n') {
            if (pending.length) {
                endWord();
                i = skipHeredocBodies(s, i + 1, pending, seg);
                pending = [];
            } else {
                i += 1;
            }
            endSegment();
            continue;
        }
        if (c === ';' || c === '(' || c === ')' || c === '{' || c === '}') {
            endSegment(); i += 1; continue;
        }
        if (c === '&' || c === '|') {
            endSegment(); i += (next === c) ? 2 : 1; continue;
        }
        if (isBlank(c)) { endWord(); i += 1; continue; }
        word += c; inWord = true; i += 1;
    }
    if (pending.length) {
        // Heredoc declared on the last line with no body: nothing to skip.
        pending = [];
    }
    endSegment();
    return segments;
}

// ---------------------------------------------------------------------------
// git command shape
// ---------------------------------------------------------------------------

// Returns null unless the segment is a top-level git invocation, else
// { sub, args, otherRepo }.
function parseGitSegment(words) {
    let i = 0;
    let otherRepo = false;
    let definesAlias = false;
    // Skip reserved words and env assignments (noting ones that retarget
    // git) that may precede the command name inside one segment.
    while (i < words.length && (SHELL_RESERVED_WORDS.has(words[i]) ||
           /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) {
        if (GIT_OTHER_REPO_ENV_RE.test(words[i])) otherRepo = true;
        i += 1;
    }
    if (i >= words.length) return null;
    // A command that only prints or inspects its arguments never runs git,
    // however its arguments read.
    if (INERT_COMMANDS.has(words[i])) return null;
    // Otherwise git may sit behind a wrapper (`sudo`, `xargs -0`, `env`,
    // `timeout 30`, `command`): take the first word that names it. Fail
    // closed: an unknown wrapper is assumed to run what follows.
    while (i < words.length && !GIT_EXE_RE.test(words[i])) i += 1;
    if (i >= words.length) return null;
    i += 1;
    while (i < words.length && words[i].startsWith('-')) {
        const w = words[i];
        const eq = w.indexOf('=');
        const name = eq === -1 ? w : w.slice(0, eq);
        if (GIT_OTHER_REPO_OPTS.has(name)) otherRepo = true;
        if (GIT_GLOBAL_VALUE_OPTS.has(name) && eq === -1) {
            if (name === '-c' && /^alias\./.test(words[i + 1] || '')) definesAlias = true;
            i += 2;
        } else {
            if (name === '-c' && /^alias\./.test(w.slice(eq + 1))) definesAlias = true;
            i += 1;
        }
    }
    const sub = words[i];
    if (!sub) return null;
    return { sub, args: words.slice(i + 1), otherRepo, definesAlias };
}

// Inspects the arguments of a top-level `git commit`. Returns
// { reason, optionValues, readsMessageFromStdin }.
function inspectCommitArgs(args) {
    const optionValues = [];
    let readsMessageFromStdin = false;
    let amend = false;
    let reason = null;
    const note = r => { if (!reason) reason = r; };
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (a === '--') {
            if (args.length > i + 1) note('`git commit <pathspec>` commits working-tree contents of those paths, not the index');
            break;
        }
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            const name = eq === -1 ? a : a.slice(0, eq);
            const attached = eq === -1 ? null : a.slice(eq + 1);
            if (name === '--amend') amend = true;
            if (name === '--all') note('`git commit -a`/`--all` stages every tracked change at commit time');
            else if (name === '--include') note('`git commit -i`/`--include` stages the listed paths at commit time');
            else if (name === '--interactive' || name === '--patch') note('`git commit --interactive`/`--patch` picks hunks at commit time');
            else if (name === '--pathspec-from-file') note('`git commit --pathspec-from-file` commits paths the hook cannot see');
            if (COMMIT_VALUE_OPTS.has(name)) {
                const v = attached !== null ? attached : args[++i];
                if (v !== undefined) optionValues.push(v);
                if (name === '--file' && v === '-') readsMessageFromStdin = true;
            }
            continue;
        }
        if (a.startsWith('-') && a.length > 1) {
            const cluster = a.slice(1);
            for (let k = 0; k < cluster.length; k += 1) {
                const f = cluster[k];
                if (f === 'a') note('`git commit -a`/`--all` stages every tracked change at commit time');
                else if (f === 'i') note('`git commit -i`/`--include` stages the listed paths at commit time');
                else if (f === 'p') note('`git commit --interactive`/`--patch` picks hunks at commit time');
                else if (COMMIT_VALUE_SHORT.includes(f)) {
                    const rest = cluster.slice(k + 1);
                    const v = rest.length ? rest : args[++i];
                    if (v !== undefined) optionValues.push(v);
                    if (f === 'F' && v === '-') readsMessageFromStdin = true;
                    break;
                } else if (COMMIT_ATTACHED_SHORT.includes(f)) {
                    break;
                }
            }
            continue;
        }
        note('`git commit <pathspec>` commits working-tree contents of those paths, not the index');
    }
    return { reason, optionValues, readsMessageFromStdin, amend };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

// Text that looks like a git invocation reaching `commit` on one simple
// command: `git commit`, `git -C dir commit`, `git -c k=v commit`. Applied
// ONLY to opaque text the tokenizer cannot see through (quoted strings,
// substitutions, heredoc bodies), never to the raw command: bash splices
// `git com''mit` into one word, so any raw-text shortcut is a bypass.
const COMMIT_SHAPE_RE = /\bgit(\.exe)?\b[^\n;&|]*\bcommit\b/i;

// A word whose value is only known when the shell runs it.
const DYNAMIC_WORD_RE = /[$`]/;
// Any word or opaque text that names git at all.
const GIT_WORD_RE = /\bgit(\.exe)?\b/i;

// Opaque text is a shell fragment. Drop the quoting it may carry so that
// `bash -c "git com''mit"` still reads as a commit.
function looksLikeCommitText(text) {
    return COMMIT_SHAPE_RE.test(text) || COMMIT_SHAPE_RE.test(text.replace(/['"\\]/g, ''));
}

// Classifies a Bash command for the pre-commit hooks. Returns
//   { kind: 'not-a-commit' }                  hook should stay silent
//   { kind: 'commit' }                        gate on the index as usual
//   { kind: 'unreliable', reason }            block: the index is not what
//                                             will be committed
// Every result also carries `hasCommit` (a top-level `git commit` segment
// exists) and `amend` (one of them is `--amend`). Post-commit hooks use
// those two, not `kind`: by the time they run, an "unreliable" shape such
// as `git commit -a` has already committed, and its record is still due.
function classifyCommitCommand(command) {
    // No raw-text shortcut here, deliberately: only tokenized words decide.
    const segments = tokenize(String(command || ''));
    const commits = [];
    let stagingReason = null;
    let otherRepoReason = null;

    let aliasReason = null;
    let dynamicReason = null;
    let mentionsGit = false;
    const cds = [];
    let firstCommitSeg = -1;
    for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
        const seg = segments[segIndex];
        // `export GIT_DIR=...` or `GIT_INDEX_FILE=... git commit` anywhere in
        // the command retargets every later git call.
        if (seg.words.some(w => GIT_OTHER_REPO_ENV_RE.test(w)) && !otherRepoReason) {
            otherRepoReason = 'GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE points git at another repository or index than the one the hook inspected';
        }
        if (seg.words.some(w => GIT_WORD_RE.test(w)) ||
            [...seg.opaque, ...seg.heredocs].some(t => GIT_WORD_RE.test(t.replace(/['"\\]/g, '')))) {
            mentionsGit = true;
        }
        // `$G add x`, `git $c -m y`, `git $(echo commit)`: the parser cannot
        // know what runs. Decided below, once we know git is involved.
        const cw = commandWord(seg.words);
        const cd = findDirectoryChange(seg.words);
        if (cd) {
            // Recorded for directoryChangeReason(): the hook resolves the
            // target against its own cwd and repository once it knows them.
            cds.push({ ...cd, seg: segIndex });
        }
        if (DYNAMIC_WORD_RE.test(cw) && !dynamicReason) {
            dynamicReason = 'a command name is computed at run time (variable or substitution), so the hook cannot tell whether it stages or commits';
        }
        const g = parseGitSegment(seg.words);
        if (!g) continue;
        if (DYNAMIC_WORD_RE.test(g.sub) && !dynamicReason) {
            dynamicReason = 'the git subcommand is computed at run time (variable or substitution), so the hook cannot tell whether it stages or commits';
        }
        if (g.definesAlias && !aliasReason) {
            aliasReason = '`git -c alias.*=...` defines an alias in the same command, which may stage or commit under another name';
        }
        if (g.sub === 'commit') {
            if (firstCommitSeg === -1) firstCommitSeg = segIndex;
            commits.push({ seg, ...inspectCommitArgs(g.args) });
            if (g.otherRepo && !otherRepoReason) {
                otherRepoReason = '`git -C`/`--git-dir`/`--work-tree` points the commit at another repository than the one the hook inspected';
            }
            continue;
        }
        if (INDEX_WRITING_SUBCOMMANDS.has(g.sub) && !stagingReason) {
            if (g.sub === 'stash' && !STASH_INDEX_VERBS.has(g.args[0])) continue;
            stagingReason = '`git ' + g.sub + '` runs in the same command as `git commit`, so the index the hook inspected is not what will be committed';
        }
    }

    // Text the parser cannot see through -- a subshell, a quoted argument to
    // bash/sh/eval, a heredoc feeding a shell -- that itself looks like a
    // commit is a commit the hook cannot inspect. Two exemptions: message
    // text of a top-level commit (prose may mention git commit), and quoted
    // text handed to a command that only prints or inspects it.
    const exempt = new Set();
    for (const c of commits) {
        for (const v of c.optionValues) exempt.add(v);
        if (c.readsMessageFromStdin) for (const h of c.seg.heredocs) exempt.add(h);
    }
    const facts = { hasCommit: commits.length > 0, amend: commits.some(c => c.amend) };
    let wrapped = false;
    for (const seg of segments) {
        const inert = INERT_COMMANDS.has(commandWord(seg.words));
        for (const text of [...seg.opaque, ...seg.heredocs]) {
            if (exempt.has(text) || !looksLikeCommitText(text)) continue;
            // $( ) and backticks execute regardless of the surrounding command.
            if (inert && !/\$\(|`/.test(text)) continue;
            wrapped = true;
        }
    }

    // Reasons in priority order. An alias or a run-time computed word can
    // hide any of the later shapes, so they come first; staging in the same
    // command is the incident this module exists for and outranks a
    // commit's own flags; the other-repo and wrapped cases are last because
    // they are the least specific. A command with no commit and nothing
    // wrapped is not ours at all.
    if (aliasReason) return { kind: 'unreliable', reason: aliasReason, ...facts };
    if (dynamicReason && mentionsGit) return { kind: 'unreliable', reason: dynamicReason, ...facts };
    if (commits.length === 0 && !wrapped) return { kind: 'not-a-commit', ...facts };
    if (stagingReason) return { kind: 'unreliable', reason: stagingReason, ...facts };
    for (const c of commits) if (c.reason) return { kind: 'unreliable', reason: c.reason, ...facts };
    if (otherRepoReason) return { kind: 'unreliable', reason: otherRepoReason, ...facts };
    if (wrapped) {
        return { kind: 'unreliable', reason: '`git commit` is wrapped in a subshell, quoted string, or heredoc the hook cannot inspect', ...facts };
    }
    // Only directory changes that run BEFORE the commit decide where it
    // lands; a `cd` after it is harmless.
    const cdsBefore = cds.filter(c => c.seg < firstCommitSeg).map(({ seg, ...c }) => c);
    return { kind: 'commit', cds: cdsBefore, ...facts };
}

// Finds a `cd`/`pushd`/`popd` in one segment, looking past reserved words, env
// assignments and wrapper words the way parseGitSegment looks for git.
// Returns null when the segment does not change directory, else
// { target, dynamic }. Fail closed: a cd behind an unrecognised, non-inert
// command word is recorded as dynamic, since the parser cannot tell what
// that word does with it.
function findDirectoryChange(words) {
    let i = 0;
    while (i < words.length && (SHELL_RESERVED_WORDS.has(words[i]) ||
           /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i += 1;
    if (i >= words.length) return null;
    // `cd` is listed as inert for the wrapped-text scan (its argument is a
    // path, not a command); here it is the command we are looking for.
    const isCd = w => w === 'cd' || w === 'pushd' || w === 'popd';
    if (!isCd(words[i]) && INERT_COMMANDS.has(words[i])) return null;
    // git never changes the caller's directory; `git log --grep cd` is not a cd.
    if (!isCd(words[i]) && GIT_EXE_RE.test(words[i])) return null;
    let behindUnknown = false;
    while (i < words.length && !isCd(words[i])) {
        if (!WRAPPER_WORDS.has(words[i]) && !words[i].startsWith('-') && !/^\d+[smhd]?$/.test(words[i])) {
            behindUnknown = true;
        }
        i += 1;
    }
    if (i >= words.length) return null;
    // `popd` returns to a directory only the shell remembers: unknowable here,
    // exactly like `cd -`.
    if (words[i] === 'popd') return { target: null, dynamic: true };
    const target = words.slice(i + 1).find(w => !(w.startsWith('-') && w.length > 1)) ?? null;
    const dynamic = behindUnknown || target === null || target === '-' ||
        DYNAMIC_WORD_RE.test(target) ||
        (target.startsWith('~') && target !== '~' && !target.startsWith('~/'));
    return { target, dynamic };
}

// Given the `cd`/`pushd` segments a commit command runs before the commit,
// the hook's own cwd, and the toplevel of the repository it located from
// that cwd (null when there is none), returns a reason when the commit may
// land in a repository the hook did not inspect, else null.
//
// The targets are resolved in order to a final directory, and it is that
// directory's REPOSITORY that is compared, not its path: a nested
// repository (submodule, vendored checkout, fixture repo) sits inside the
// toplevel's path but has its own index. Fail closed: a target that does
// not exist, or whose repository git cannot report, is a reason. Note that
// locating the repository runs git with cwd set to the named directory, so
// git reads that directory's config; every failure there (including
// dubious ownership) is a reason, never an approve.
function directoryChangeReason(cds, cwd, toplevel) {
    if (!cds || cds.length === 0) return null;
    if (!toplevel) {
        return '`cd` runs before the commit and the hook is not inside a repository, so it cannot inspect the one being committed to';
    }
    const real = p => { try { return fs.realpathSync(p); } catch (e) { return path.resolve(p); } };
    const norm = p => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
    let cur = real(typeof cwd === 'string' && cwd ? cwd : process.cwd());
    let last = null;
    for (const cd of cds) {
        if (cd.dynamic) {
            return '`cd` to a run-time computed path runs before the commit, so the hook cannot tell which repository is committed to';
        }
        let t = cd.target;
        if (t === '~' || t.startsWith('~/')) t = os.homedir() + t.slice(1);
        cur = real(path.resolve(cur, t));
        last = cd.target;
    }
    const there = gitRead.locateRepo(cur);
    if (!there.toplevel) {
        return '`cd ' + last + '` leaves the repository the hook inspected (' + norm(toplevel) + ')' +
            (there.notARepo ? '' : ': ' + there.error);
    }
    if (norm(real(there.toplevel)) !== norm(real(toplevel))) {
        return '`cd ' + last + '` lands in a different repository (' + norm(there.toplevel) +
            ') than the one the hook inspected (' + norm(toplevel) + ')';
    }
    return null;
}

// The word that names the command in a segment, after reserved words and
// env assignments. '' when there is none.
function commandWord(words) {
    let i = 0;
    while (i < words.length && (SHELL_RESERVED_WORDS.has(words[i]) ||
           /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i += 1;
    return words[i] || '';
}

// Convenience: the reason when the command is a commit the hook cannot
// trust, else null (for both plain commits and non-commits).
function indexUnreliableReason(command) {
    const c = classifyCommitCommand(command);
    return c.kind === 'unreliable' ? c.reason : null;
}

function blockMessage(reason) {
    return 'PRE_COMMIT_GATE: ' + reason + '. Stage in one command, then run `git commit` ' +
        'on its own in a separate command so the pre-commit gates can inspect exactly ' +
        'what will be committed. If this command only writes text that quotes such a ' +
        'command (documentation, a fixture, a heredoc), the classifier cannot tell ' +
        'prose from a command: write that file with a file tool instead of the shell.';
}

module.exports = { classifyCommitCommand, indexUnreliableReason, directoryChangeReason, blockMessage, splitSegments, tokenize, parseGitSegment, inspectCommitArgs };
