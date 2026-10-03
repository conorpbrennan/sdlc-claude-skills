// Trivial-diff classifier for the pre-commit review hook.
//
// Inverted: a line is TRIVIAL only when it provably cannot change behaviour --
// blank, wholly a line comment for its file's language, or wholly one block
// comment. Every other line counts, literals and docstrings included, so a line
// the classifier does not understand is reviewed rather than waved through.
//
// The previous classifier went the other way: a line counted only when it showed
// a keyword, a call or a non-literal assignment. That scored `assert
// user.is_admin`, `is_admin = True`, `ALLOWED = ["*"]`, `counter++;`, `throw
// err;` and the deletion of `'.sh', '.ps1',` from source-files.js as trivial, and
// each of those earned a `trivial-diff` PASS marker with no review. It also
// spawned Python once per assignment line for ast.literal_eval; that is gone.
//
// Zero non-trivial lines is the "trivial-diff" fast path; the review policy may
// also allow a few non-trivial lines in configured "presentational" paths. Pure
// functions.
'use strict';

const path = require('path');

// Line-comment markers, per extension. A marker not listed for a language is
// never a comment in it: `#` is a preprocessor directive in C-family files and an
// attribute in Rust; `--` is a decrement in JS and C; `//` is floor division in
// Python and an empty regex in Ruby. Extensions absent from this table (shell,
// PowerShell, anything unknown) have no trivial lines but blank ones -- and
// lib/source-files.js keeps them off the fast paths entirely.
const C_STYLE = ['.java', '.js', '.ts', '.tsx', '.jsx', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.go', '.rs', '.swift', '.kt', '.scala'];
const LINE_MARKERS = Object.freeze({
    ...Object.fromEntries(C_STYLE.map(e => [e, ['//']])),
    '.py': ['#'],
    '.rb': ['#'],
    '.php': ['//', '#'],
    '.sql': ['--'],
});

// Languages with `/* ... */` comments.
const BLOCK_LANGS = new Set([...C_STYLE, '.php', '.sql']);

// A line that is wholly one block comment. The body may not contain `*/` (the
// comment would end early) or `/*` (Rust, Swift, Kotlin and Scala nest block
// comments, so `/* a /* b */` leaves one level open and comments out the code
// after it). A continuation line (` * x`) is NOT trivial: a hunk shows too little
// context to tell it from a pointer dereference such as `*flag = 1;`.
const BLOCK_COMMENT_RE = /^\/\*((?:[^*]|\*(?!\/))*)\*\/$/;

// Comment-shaped lines that change what runs. Checked against every comment,
// whatever its language: a directive that binds nowhere in a given language costs
// only a review there, and that is the fail-closed direction.
const DIRECTIVE_RES = [
    /\\$/,                    // C/C++ splices the next line into a `//` comment
    /\\u/,                    // Java decodes \u000a to a newline before lexing
    /\?\?\//,                 // the trigraph for a backslash
    /^#!/,                    // shebang
    /^#.*coding[:=]/,         // PEP 263 / Ruby source encoding
    /^#\s*(?:frozen_string_literal|shareable_constant_value|warn_indent|warn_past_scope)\s*:/,
    /^#\[/,                   // a PHP 8 attribute, not a comment
    /\?>/,                    // PHP leaves code mode at ?> even inside a comment
    /^\/\/go:/,               // Go compiler directives (build, linkname, embed, ...)
    /^\/\/line /,             // Go line directive
    /^\/\/export /,           // cgo export
    /^\/\/\s*\+build/,        // legacy Go build constraint
    /^\/\/\/\s*</,            // TypeScript triple-slash directive
    /^\/\*[!+]/,              // MySQL executable comment, optimizer hint
];
// `// #include ...` is cgo preamble C in Go; elsewhere `// #123` is an issue
// reference, so this one is scoped.
const LANG_DIRECTIVE_RES = Object.freeze({
    '.go': [/^\/\/\s*#/],
});

// Line terminators some language honours but git does not split on: CR (JS, TS,
// Python, Java, C, PHP, Kotlin, C#), NEL (C#) and the Unicode line and paragraph
// separators (JS, C#). After a line comment, one ends the comment and the code
// that follows it runs, while the diff shows a single comment line.
const HIDDEN_TERMINATOR_RE = /[\r\u0085\u2028\u2029]/;

function isLineTrivial(line, ext) {
    // One trailing CR is a CRLF line ending, with nothing after it to hide; any
    // other terminator makes the line non-trivial. Only space and tab are
    // trimmed: String.trim() also strips NBSP, a BOM and the Unicode spaces,
    // which are not blank in every language.
    const raw = String(line == null ? '' : line).replace(/\r$/, '');
    if (HIDDEN_TERMINATOR_RE.test(raw)) return false;
    const t = raw.replace(/^[ \t]+|[ \t]+$/g, '');
    if (t === '') return true;
    const e = String(ext || '').toLowerCase();
    if (DIRECTIVE_RES.some(re => re.test(t))) return false;
    if ((LANG_DIRECTIVE_RES[e] || []).some(re => re.test(t))) return false;
    for (const marker of LINE_MARKERS[e] || []) {
        if (!t.startsWith(marker)) continue;
        // SQL: `--` opens a comment only before whitespace (MySQL's rule, the
        // strictest of the dialects).
        if (marker === '--' && !/^--(?:\s|$)/.test(t)) return false;
        // A line comment holding a block delimiter can open or close a block
        // comment around code it does not show.
        const body = t.slice(marker.length);
        return !body.includes('/*') && !body.includes('*/');
    }
    if (BLOCK_LANGS.has(e)) {
        const m = BLOCK_COMMENT_RE.exec(t);
        if (m && !m[1].includes('/*')) return true;
    }
    return false;
}

// The repo-relative path in a `--- a/x` / `+++ b/x` header, or null. A quoted
// path (git quotes unusual bytes) or a non-default prefix yields null, which
// leaves the file with no known language: only its blank lines are trivial.
function headerPath(line) {
    const m = /^(?:--- a\/|\+\+\+ b\/)(.*)$/.exec(line);
    return m ? m[1].replace(/\t$/, '') : null;
}

// Section headers that make a section opaque. Read only before a section's first
// hunk. A whole-file add or delete; or a symlink (120000) or gitlink (160000) mode
// on a mode line or as the `index <a>..<b> <mode>` field.
const OPAQUE_HEADER_RES = [
    /^(?:new|deleted) file mode /,
    /^(?:old|new) mode (?:120000|160000)$/,
    /^index \S+ (?:120000|160000)$/,
];

// Every line git writes between `diff --git` and a section's first `@@`. Anything
// else there is a format this classifier does not know, and is opaque.
const HEADER_RES = [
    /^index [0-9a-f]+(?:,[0-9a-f]+)*\.\.[0-9a-f]+(?: [0-7]{6})?$/,
    /^(?:old|new) mode [0-7]{6}$/,
    /^(?:new|deleted) file mode [0-7]{6}$/,
    /^(?:dis)?similarity index \d{1,3}%$/,
    /^(?:rename|copy) (?:from|to) ./,
    /^(?:---|\+\+\+) ./,
];

// A hunk header: old and new line counts default to 1 when omitted.
const HUNK_RE = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

// Counts NON-TRIVIAL added and removed lines (`semanticAdded`/`semanticRemoved`
// keep their names; the policy reads them as "lines that need review").
//
// Header lines are read only between `diff --git` and a file's first `@@`:
// inside a hunk a removed SQL comment `-- x` reads `--- x`, and that is content.
// Context lines (the hook reads -U1) give each changed line its predecessor in
// its own version of the file: a line following one that ends in a backslash is
// part of that line, so it never counts as trivial on its own -- in C a comment
// or blank line there ends or rewrites a macro body.
//
// Fails closed on what it cannot see into. A `diff --git` section with no hunk
// (binary, mode-only, a pure rename, an empty file) or a `Binary files ...
// differ` line counts one non-trivial line on BOTH sides: its content is
// unknown, so neither the trivial-diff path nor the presentational path (which
// requires zero removed) may take it. The hook reads with --text so that a NUL
// byte or a `-diff` attribute cannot turn code into such a section silently.
// The same opaque count applies to a section that:
//   - adds or deletes a whole file (`new file mode`, `deleted file mode`): a new
//     comment-only `auth.js` shadows `auth/index.js`, and deleting a required
//     file breaks the require, whatever the lines say;
//   - names a symlink (120000) or gitlink (160000) mode in any header: the hunk
//     is a link target or a commit id, not source, so `//tmp/evil.js` is no
//     comment.
// A whole-line block comment that is REMOVED counts: it may have been what ended
// an enclosing `/* ...` comment, and without it the code below is commented out.
// Text this function cannot read as a plain diff counts one line on both sides,
// once: an ESC byte (a colour code; the hook reads with --no-color), a non-empty
// text with no `diff --git` line, and any structure it does not recognise -- a
// non-empty line before the first section, a line in a header window that is
// not a git extended header, a hunk line not starting with ' ', '+', '-' or
// '\' (an empty line is context: diff.suppressBlankEmpty), and a hunk with more
// or fewer lines than its `@@` header promises (`  > msg` from
// diff.submodule=log looks like context, but falls past the hunk's end). This closes
// format-changing config generally rather than knob by knob: `diff.submodule=log`
// prints a gitlink bump as a bare `Submodule ...` line, outside any section or
// inside the previous file's hunk (the hook also reads with --submodule=short).
// A `GIT binary patch` section is already opaque, so its data lines are skipped.
function classifyDiff(diffText) {
    let semanticAdded = 0;
    let semanticRemoved = 0;
    const perFileAdded = {};
    const perFileRemoved = {};
    let currentFile = null;
    let inHunk = false;
    let inSection = false;
    let sectionOpaque = false;
    let inBinaryPatch = false;
    let structureOpaque = false;
    let prevOld = null;
    let prevNew = null;
    const closeSection = () => {
        if (inSection && (sectionOpaque || !inHunk)) {
            semanticAdded += 1;
            semanticRemoved += 1;
            if (currentFile) {
                perFileAdded[currentFile] = (perFileAdded[currentFile] || 0) + 1;
                perFileRemoved[currentFile] = (perFileRemoved[currentFile] || 0) + 1;
            }
        }
    };
    // Lines the current hunk's header still promises, per side.
    let oldLeft = 0;
    let newLeft = 0;
    const hunkCut = () => inHunk && (oldLeft > 0 || newLeft > 0);
    const text = diffText || '';
    if (text !== '' && (text.includes('\x1b') || !/^diff --git /m.test(text))) structureOpaque = true;
    // git ends its output with a newline; that one is not an empty hunk line.
    for (const line of text.replace(/\n$/, '').split('\n')) {
        if (line.startsWith('diff --git ')) {
            if (hunkCut()) structureOpaque = true;
            closeSection();
            currentFile = null; inHunk = false; inSection = true; sectionOpaque = false;
            inBinaryPatch = false;
            continue;
        }
        if (!inSection) {
            if (line !== '') structureOpaque = true;
            continue;
        }
        if (inBinaryPatch) continue;
        // Never hunk content: every hunk line starts with ' ', '+', '-' or '\\'.
        if (/^Binary files .* differ$/.test(line) || line === 'GIT binary patch') {
            sectionOpaque = true;
            inBinaryPatch = line === 'GIT binary patch';
            continue;
        }
        if (line.startsWith('@@')) {
            const m = HUNK_RE.exec(line);
            if (!m || hunkCut()) structureOpaque = true;
            oldLeft = m ? (m[1] === undefined ? 1 : Number(m[1])) : 0;
            newLeft = m ? (m[2] === undefined ? 1 : Number(m[2])) : 0;
            inHunk = true; prevOld = null; prevNew = null;
            continue;
        }
        if (!inHunk) {
            if (line !== '' && !HEADER_RES.some(re => re.test(line))) structureOpaque = true;
            if (OPAQUE_HEADER_RES.some(re => re.test(line))) sectionOpaque = true;
            if (line.startsWith('--- ') || line.startsWith('+++ ')) {
                const p = headerPath(line);
                // `+++ /dev/null` (a deletion) keeps the `--- a/` path.
                if (p !== null) currentFile = p;
                else if (line.startsWith('--- ')) currentFile = null;
            }
            continue;
        }
        // A hunk line is ' ' (or '' under diff.suppressBlankEmpty), '+', '-' or
        // `\ No newline at end of file`, and no more of them than the header
        // promised: a ` `-led line past the hunk's end (`  > msg` from
        // diff.submodule=log) is not context.
        const tag = line === '' ? ' ' : line[0];
        const body = line.slice(1);
        if (tag === '\\') continue;
        if (tag !== ' ' && tag !== '+' && tag !== '-') { structureOpaque = true; continue; }
        if ((tag !== '+' && oldLeft <= 0) || (tag !== '-' && newLeft <= 0)) structureOpaque = true;
        if (tag !== '+') oldLeft -= 1;
        if (tag !== '-') newLeft -= 1;
        if (tag === ' ') { prevOld = body; prevNew = body; continue; }
        const prev = tag === '+' ? prevNew : prevOld;
        if (tag === '+') prevNew = body; else prevOld = body;
        const ext = currentFile ? path.extname(currentFile) : '';
        const continued = prev !== null && /\\\s*$/.test(prev);
        const removedBlock = tag === '-' && /^[ \t]*\/\*/.test(body);
        if (!continued && !removedBlock && isLineTrivial(body, ext)) continue;
        if (tag === '+') {
            semanticAdded += 1;
            if (currentFile) perFileAdded[currentFile] = (perFileAdded[currentFile] || 0) + 1;
        } else {
            semanticRemoved += 1;
            if (currentFile) perFileRemoved[currentFile] = (perFileRemoved[currentFile] || 0) + 1;
        }
    }
    if (hunkCut()) structureOpaque = true;
    closeSection();
    if (structureOpaque) {
        semanticAdded += 1;
        semanticRemoved += 1;
    }
    return { semanticAdded, semanticRemoved, perFileAdded, perFileRemoved };
}

function globToRegex(glob) {
    let re = '^';
    let i = 0;
    while (i < glob.length) {
        const c = glob[i];
        if (c === '*' && glob[i + 1] === '*') { re += '.*'; i += 2; continue; }
        if (c === '*') { re += '[^/]*'; i += 1; continue; }
        if (c === '?') { re += '[^/]'; i += 1; continue; }
        if (/[.+^${}()|[\]\\]/.test(c)) { re += '\\' + c; i += 1; continue; }
        re += c; i += 1;
    }
    return new RegExp(re + '$');
}

function matchesAnyGlob(filePath, globs) {
    if (!globs || !globs.length) return false;
    return globs.some(g => globToRegex(g).test(filePath));
}

module.exports = {
    isLineTrivial,
    classifyDiff,
    globToRegex,
    matchesAnyGlob,
};
