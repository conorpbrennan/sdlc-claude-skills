// Branch-review library: resolves the base ref, hashes the branch diff and judges
// a branch-review marker.
//
// The branch diff is `<base>...HEAD` (the changes since the merge base), with the
// feature records left out as the commit gate's hash does. A marker records that
// diff's hash; the marker is fresh while the hash still matches. The marker's own
// HEAD is for the detail line only: a commit that touches only `features/*.md`
// moves HEAD but not the hash, and must stay fresh.
//
// Every git read goes through git-read.js. A failed read yields null or the ERROR
// state, never an empty hash and never FRESH.
const crypto = require('crypto');
const fs = require('fs');
const { gitRead, splitNul, HASH_EXCLUDE_PATHSPECS } = require('./git-read');

const STATE = {
    FRESH: 'fresh',
    MISSING: 'missing',
    STALE: 'stale',
    EMPTY: 'empty',
    ERROR: 'error',
};

// The tag the recipe writes as the marker's fourth line. `<n>` is the round.
const RECIPE_TAG = 'code-reviewer-deep:round<n>';

const SOURCE_CONFIG = 'config';
const SOURCE_ORIGIN_HEAD = 'origin-head';
const MARKER_PASS = 'PASS';
const DETACHED_HEAD = 'HEAD';
const ORIGIN_HEAD_REF = 'refs/remotes/origin/HEAD';
const REMOTES_PREFIX = 'refs/remotes/';
const RANGE_SEPARATOR = '...HEAD';
const BASE_HINT = 'set `base` in the config entry, or run `git remote set-head origin -a`';
const HASH_DIFF_ARGS = ['diff', '--no-ext-diff', '--no-textconv', '--text'];
const SHORT_LEN = 12;

// Quotes one shell word in single quotes, the same escaping as `shellQuote` in
// pre-commit-review.js (which this module does not import).
// Args: s - any value. Returns: the single-quoted string.
function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

// Args: cwd - a directory in the repository. Returns: { name, detached, error }.
// `name` is the branch, or `HEAD` when detached; null on a read error.
function readBranch(cwd) {
    const r = gitRead(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    if (r.out === null) return { name: null, detached: false, error: r.error };
    const name = r.out.trim();
    if (!name) return { name: null, detached: false, error: 'git printed no branch name' };
    return { name, detached: name === DETACHED_HEAD, error: null };
}

// Args: cwd - a directory in the repository; configBase - the configured base ref
// (a string) or anything else for "not configured".
// Returns: { ref, source, error }. `ref` is null with a one-line `error` when the
// base cannot be resolved to a commit.
function resolveBase(cwd, configBase) {
    let ref;
    let source;
    if (typeof configBase === 'string') {
        ref = configBase.trim();
        source = SOURCE_CONFIG;
    } else {
        const r = gitRead(['symbolic-ref', '--quiet', ORIGIN_HEAD_REF], { cwd });
        if (r.out === null || !r.out.trim().startsWith(REMOTES_PREFIX)) {
            return { ref: null, source: null, error: 'origin/HEAD is not set: ' + BASE_HINT };
        }
        ref = r.out.trim().slice(REMOTES_PREFIX.length);
        source = SOURCE_ORIGIN_HEAD;
    }
    if (!ref || ref.startsWith('-')) {
        return { ref: null, source, error: 'base ref is empty or starts with "-": ' + BASE_HINT };
    }
    const v = gitRead(['rev-parse', '--verify', '--quiet', ref + '^{commit}'], { cwd });
    if (v.out === null || !v.out.trim()) {
        return { ref: null, source, error: 'base ref "' + ref + '" is not a commit: ' + BASE_HINT };
    }
    return { ref, source, error: null };
}

// Args: cwd; base - a resolved base ref.
// Returns: [{ path, added, removed }] for the branch diff, or null on a read
// error. A binary row (`-`) counts 0 lines.
function numstat(cwd, base) {
    const r = gitRead(
        ['diff', '--numstat', '-z', '--no-renames', base + RANGE_SEPARATOR, '--', ...HASH_EXCLUDE_PATHSPECS],
        { cwd });
    if (r.out === null) return null;
    const entries = [];
    for (const rec of splitNul(r.out)) {
        const m = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(rec);
        if (!m) return null;
        entries.push({
            path: m[3],
            added: m[1] === '-' ? 0 : Number(m[1]),
            removed: m[2] === '-' ? 0 : Number(m[2]),
        });
    }
    return entries;
}

// Args: entries - numstat rows. Returns: [{ dir, files, lines }] by first path
// component (a root file is its own group, named by the file); `files` is the
// array of paths, `lines` is added plus removed.
function groupByTopDir(entries) {
    const groups = new Map();
    for (const e of entries) {
        const i = e.path.indexOf('/');
        const dir = i < 0 ? e.path : e.path.slice(0, i);
        if (!groups.has(dir)) groups.set(dir, { dir, files: [], lines: 0 });
        const g = groups.get(dir);
        g.files.push(e.path);
        g.lines += e.added + e.removed;
    }
    return [...groups.values()];
}

// Args: cwd; base - a resolved base ref.
// Returns: the SHA-1 of the branch diff as a git blob hash, or null on a read
// error. Equal to the shell pipeline in markerRecipe in a SHA-1 repository; in a
// SHA-256 repository the two differ and no marker matches (fails closed).
function diffHash(cwd, base) {
    const r = gitRead(
        [...HASH_DIFF_ARGS, base + RANGE_SEPARATOR, '--', ...HASH_EXCLUDE_PATHSPECS],
        { cwd, raw: true });
    if (r.out === null) return null;
    const buf = Buffer.isBuffer(r.out) ? r.out : Buffer.from(r.out);
    return crypto.createHash('sha1')
        .update('blob ' + buf.length + '\0')
        .update(buf)
        .digest('hex');
}

// Args: { toplevel, markerPath, base, tag } - all strings.
// Returns: one shell line that recomputes HEAD and the diff hash at write time and
// writes `PASS\n<head>\n<hash>\n<tag>` to markerPath. Every value is single-quoted.
function markerRecipe({ toplevel, markerPath, base, tag }) {
    const top = shellQuote(toplevel);
    const excludes = HASH_EXCLUDE_PATHSPECS.map(shellQuote).join(' ');
    const head = '"$(git -C ' + top + ' rev-parse HEAD)"';
    const hash = '"$(git -C ' + top + ' ' + HASH_DIFF_ARGS.join(' ') + ' ' +
        shellQuote(base + RANGE_SEPARATOR) + ' -- ' + excludes +
        ' | git -C ' + top + ' hash-object --stdin)"';
    return "printf 'PASS\\n%s\\n%s\\n%s' " + head + ' ' + hash + ' ' + shellQuote(tag) +
        ' > ' + shellQuote(markerPath);
}

// Args: file - the marker path. Returns: { head, diff, tag }, or null when the
// file is missing, unreadable, its first line is not PASS, or line 2 or 3 is empty.
// The tag may be empty.
function readMarker(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf-8');
    } catch (e) {
        return null;
    }
    const lines = text.split('\n');
    if (lines[0] !== MARKER_PASS || !lines[1] || !lines[2]) return null;
    return { head: lines[1], diff: lines[2], tag: lines[3] || '' };
}

// Args: { cwd, base, markerFile }. Returns: { state, detail } with state one of
// STATE. Order: numstat unreadable is ERROR; no rows is EMPTY; no marker is
// MISSING; hash unreadable is ERROR; a differing hash is STALE; else FRESH.
function checkFresh({ cwd, base, markerFile }) {
    const rows = numstat(cwd, base);
    if (rows === null) return { state: STATE.ERROR, detail: 'could not read the diff against ' + base };
    if (rows.length === 0) return { state: STATE.EMPTY, detail: 'no changes ahead of ' + base };
    const marker = markerFile ? readMarker(markerFile) : null;
    if (!marker) return { state: STATE.MISSING, detail: 'no branch review marker' };
    const hash = diffHash(cwd, base);
    if (hash === null) return { state: STATE.ERROR, detail: 'could not hash the diff against ' + base };
    const at = ' (reviewed at ' + marker.head.slice(0, SHORT_LEN) + ')';
    if (hash !== marker.diff) return { state: STATE.STALE, detail: 'the branch diff changed since the review' + at };
    return { state: STATE.FRESH, detail: 'the branch diff matches the review' + at };
}

module.exports = {
    STATE,
    RECIPE_TAG,
    readBranch,
    resolveBase,
    numstat,
    groupByTopDir,
    diffHash,
    markerRecipe,
    readMarker,
    checkFresh,
};
