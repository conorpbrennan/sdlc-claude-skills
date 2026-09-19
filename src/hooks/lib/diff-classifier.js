// Trivial-diff classifier for the pre-commit review hook.
//
// Decides whether a staged diff of code files carries any semantic change: a
// keyword, a call, or an assignment whose right-hand side is not a literal.
// Zero semantic lines is the "trivial-diff" fast path (comments, blank lines,
// literal constants); the review policy may also allow a few semantic lines
// in "presentational" paths. Pure functions, plus one shell-out to Python
// for ast.literal_eval on list/dict/tuple/set literals.
'use strict';

const { spawnSync } = require('child_process');

const SEMANTIC_KEYWORDS = [
    'def', 'class', 'async', 'import', 'from', 'if', 'elif', 'else',
    'for', 'while', 'try', 'except', 'finally', 'with', 'raise',
    'return', 'yield', 'break', 'continue', 'lambda', 'await',
];
const KEYWORD_RE = new RegExp('\\b(' + SEMANTIC_KEYWORDS.join('|') + ')\\b');

function stripStringsAndComment(line) {
    // Remove Python/JS string literals and trailing comment so the remaining
    // tokens can be inspected for semantic markers. Conservative: unterminated
    // quotes collapse the rest of the line to empty (still safe: downstream
    // rules treat empty as trivial).
    let out = '';
    let i = 0;
    while (i < line.length) {
        const c = line[i];
        if (c === '#') break;
        if (c === '/' && line[i + 1] === '/') break;
        if (c === '"' || c === "'") {
            const quote = c;
            const triple = line.slice(i, i + 3) === quote.repeat(3) ? quote.repeat(3) : null;
            i += triple ? 3 : 1;
            while (i < line.length) {
                if (triple && line.slice(i, i + 3) === triple) { i += 3; break; }
                if (!triple && line[i] === quote) { i += 1; break; }
                if (line[i] === '\\') { i += 2; continue; }
                i += 1;
            }
            continue;
        }
        out += c;
        i += 1;
    }
    return out;
}

// Python interpreter for ast.literal_eval: PYTHON_CMD if set, else the first
// of python3 / python that runs. Resolved once per process. A host with only
// python3 used to fail the call and score every literal list/dict as
// semantic (safe, but two unit tests stayed red on such hosts).
let resolvedPythonCmd;
function resolvePythonCmd() {
    if (resolvedPythonCmd !== undefined) return resolvedPythonCmd;
    const candidates = process.env.PYTHON_CMD ? [process.env.PYTHON_CMD] : ['python3', 'python'];
    resolvedPythonCmd = null;
    for (const cmd of candidates) {
        try {
            const r = spawnSync(cmd, ['-c', 'print(1)'], { encoding: 'utf-8', timeout: 2000 });
            if (r.status === 0) { resolvedPythonCmd = cmd; break; }
        } catch (e) { /* try the next one */ }
    }
    return resolvedPythonCmd;
}

function isPureLiteralRHS(rhs) {
    const trimmed = rhs.trim().replace(/[,;]\s*$/, '');
    if (!trimmed) return false;
    // Quick regex literals (string, number, None/True/False, simple list/dict)
    if (/^"([^"\\]|\\.)*"$/.test(trimmed)) return true;
    if (/^'([^'\\]|\\.)*'$/.test(trimmed)) return true;
    if (/^f"([^"\\]|\\.)*"$/.test(trimmed) && !/[\{][^}]*[(]/.test(trimmed)) return true;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return true;
    if (/^(None|True|False)$/.test(trimmed)) return true;
    // Attempt ast.literal_eval for list/tuple/dict/set of literals.
    const pythonCmd = resolvePythonCmd();
    if (!pythonCmd) return false;
    try {
        const r = spawnSync(pythonCmd, ['-c',
            'import ast, sys\ntry:\n  ast.literal_eval(sys.argv[1])\n  print("OK")\nexcept Exception:\n  print("NO")',
            trimmed,
        ], { encoding: 'utf-8', timeout: 2000 });
        if (r.status === 0 && (r.stdout || '').trim() === 'OK') return true;
    } catch (e) { /* python unavailable; fall through */ }
    return false;
}

function findAssignEq(line) {
    // Scan line for the first `=` that is an assignment (not ==, !=, <=, >=, =>)
    // and not inside a string or past a comment marker. Returns index in the
    // ORIGINAL line, or -1.
    let i = 0;
    while (i < line.length) {
        const c = line[i];
        if (c === '#') return -1;
        if (c === '/' && line[i + 1] === '/') return -1;
        if (c === '"' || c === "'") {
            const quote = c;
            const triple = line.slice(i, i + 3) === quote.repeat(3) ? quote.repeat(3) : null;
            i += triple ? 3 : 1;
            while (i < line.length) {
                if (triple && line.slice(i, i + 3) === triple) { i += 3; break; }
                if (!triple && line[i] === quote) { i += 1; break; }
                if (line[i] === '\\') { i += 2; continue; }
                i += 1;
            }
            continue;
        }
        if (c === '=') {
            const prev = line[i - 1];
            const next = line[i + 1];
            if (next === '=') { i += 2; continue; }              // ==
            if (prev === '!' || prev === '<' || prev === '>') { i += 1; continue; }  // != <= >=
            if (prev === '=') { i += 1; continue; }              // already consumed ==
            if (next === '>') { i += 2; continue; }              // => (JS arrow)
            return i;
        }
        i += 1;
    }
    return -1;
}

function isLineSemantic(rawLine) {
    const stripped = rawLine.replace(/^[+-]/, '');
    const trimmed = stripped.trim();
    if (trimmed === '') return false;
    if (trimmed.startsWith('#')) return false;
    if (trimmed.startsWith('//')) return false;
    if (KEYWORD_RE.test(trimmed)) return true;
    const eqIdx = findAssignEq(stripped);
    if (eqIdx >= 0) {
        const rhs = stripped.slice(eqIdx + 1).replace(/\s*#.*$/, '').replace(/\s*\/\/.*$/, '');
        if (isPureLiteralRHS(rhs)) return false;
        return true;
    }
    // Bare call detection: identifier followed by paren, on stripped (strings-removed) form.
    const cleaned = stripStringsAndComment(stripped);
    if (/\w+\s*\([^)]*\)/.test(cleaned)) return true;
    return false;
}

function classifyDiff(diffText) {
    const lines = (diffText || '').split('\n');
    let semanticAdded = 0;
    let semanticRemoved = 0;
    const perFileAdded = {};
    const perFileRemoved = {};
    let currentFile = null;
    for (const line of lines) {
        if (line.startsWith('+++ b/')) { currentFile = line.slice(6); continue; }
        if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;
        if (line.startsWith('diff --git') || line.startsWith('index ') ||
            line.startsWith('@@') || line.startsWith('new file mode') ||
            line.startsWith('deleted file mode')) continue;
        if (line.startsWith('+')) {
            if (isLineSemantic(line)) {
                semanticAdded += 1;
                if (currentFile) perFileAdded[currentFile] = (perFileAdded[currentFile] || 0) + 1;
            }
        } else if (line.startsWith('-')) {
            if (isLineSemantic(line)) {
                semanticRemoved += 1;
                if (currentFile) perFileRemoved[currentFile] = (perFileRemoved[currentFile] || 0) + 1;
            }
        }
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
    stripStringsAndComment,
    resolvePythonCmd,
    isPureLiteralRHS,
    findAssignEq,
    isLineSemantic,
    classifyDiff,
    globToRegex,
    matchesAnyGlob,
};
