// Fail-closed git reads shared by the pre-commit hooks.
//
// Every hook starts by locating the repository and ends up reading the
// index. Both reads used to return null/empty on ANY error, and the callers
// treated that as "not a repo" or "nothing staged" and approved. A bad
// GIT_DIR, an index.lock, or a git that is not on PATH therefore approved
// the commit unread. This module keeps the one legitimate approve (the cwd
// is genuinely not inside a repository) and reports every other failure as
// an error the caller must block on.
'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');

const DEFAULT_MAX_BUFFER = 256 * 1024 * 1024;

function errorText(e, maxBuffer) {
    if (e && e.code === 'ENOBUFS') return 'output exceeded ' + maxBuffer + ' bytes';
    const stderr = (e && e.stderr ? String(e.stderr) : '').trim();
    return (stderr || String((e && e.message) || e)).split('\n')[0].slice(0, 200);
}

// Runs `git <args>` with argv (never a shell string). Returns
//   { out, error: null, notARepo: false }        on success (out is a string,
//                                                or a Buffer with raw: true)
//   { out: null, error, notARepo }               on failure
// notARepo is true only when git itself says the cwd is not inside a
// repository AND nothing in the environment redirects git elsewhere. With
// GIT_DIR or GIT_WORK_TREE set, "not a git repository" means the redirect
// is broken, which is a failure, not an absence.
function gitRead(args, opts) {
    const o = opts || {};
    const maxBuffer = o.maxBuffer || DEFAULT_MAX_BUFFER;
    try {
        const out = execFileSync('git', args, {
            encoding: o.raw ? 'buffer' : 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: o.cwd,
            maxBuffer,
        });
        return { out, error: null, notARepo: false };
    } catch (e) {
        const stderr = String((e && e.stderr) || '');
        const redirected = !!(process.env.GIT_DIR || process.env.GIT_WORK_TREE);
        const notARepo = /not a git repository/i.test(stderr) && !redirected;
        return { out: null, error: errorText(e, maxBuffer), notARepo };
    }
}

// Locates the repository around cwd. Returns
//   { gitDir, toplevel, notARepo: false, error: null }   inside a repo
//   { gitDir: null, toplevel: null, notARepo: true }     genuinely not a repo
//   { gitDir: null, toplevel: null, notARepo: false, error }  could not tell
function locateRepo(cwd) {
    const d = gitRead(['rev-parse', '--git-dir'], { cwd });
    if (d.out === null) return { gitDir: null, toplevel: null, notARepo: d.notARepo, error: d.error };
    const t = gitRead(['rev-parse', '--show-toplevel'], { cwd });
    if (t.out === null) return { gitDir: null, toplevel: null, notARepo: t.notARepo, error: t.error };
    return {
        gitDir: d.out.trim(),
        toplevel: t.out.trim().replace(/\\/g, '/'),
        notARepo: false,
        error: null,
    };
}

// Pathspecs left out of the staged-diff hash. The feature hook stages the
// feature record (its touched-file list) DURING the pre-commit phase, in
// parallel with the review and hygiene hooks; a hash that included it
// would move between the block and the marker write, and the marker would
// never match. Feature records are docs, never reviewed, so leaving them
// out loses nothing. `:(top,...)` anchors at the repository root whatever
// the cwd; a pathspec of only excludes matches everything else.
const HASH_EXCLUDE_PATHSPECS = [':(top,exclude)features/*.md'];
// --no-ext-diff, --no-textconv, --text: a configured diff driver, textconv
// filter or binary attribute could print the same bytes for different
// content and keep the hash stable while the commit changes. No
// --literal-pathspecs here: it would disable the `:(top,exclude)` magic.
const HASH_DIFF_ARGS = ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--text'];
// The same read as a shell pipeline, for the marker recipe the hook emits.
const HASH_PIPELINE = 'git ' + HASH_DIFF_ARGS.join(' ') + ' -- ' +
    HASH_EXCLUDE_PATHSPECS.map(p => "'" + p + "'").join(' ') + ' | git hash-object --stdin';

// SHA-1 of the staged diff (feature records excluded), byte-identical to
// HASH_PIPELINE's output (a git blob hash) in a
// SHA-1 repository, so it matches markers written by that pipeline
// elsewhere. In a SHA-256 repository (`--object-format=sha256`) the two
// differ; the hook still fails closed there (no marker ever matches), it
// just never fast-paths. Unlike the pipeline,
// a failed `git diff` yields null rather than the hash of empty input: a
// shell pipeline without pipefail reports success when only the last
// command succeeds.
function stagedDiffHash(cwd) {
    const r = gitRead([...HASH_DIFF_ARGS, '--', ...HASH_EXCLUDE_PATHSPECS], { cwd, raw: true });
    if (r.out === null) return null;
    const buf = Buffer.isBuffer(r.out) ? r.out : Buffer.from(r.out);
    return crypto.createHash('sha1')
        .update('blob ' + buf.length + '\0')
        .update(buf)
        .digest('hex');
}

// Splits `--name-only -z` output. NUL-terminated paths are never C-quoted
// (core.quotePath would turn `café.py` into `"caf\303\251.py"`, whose
// extension reads as `.py"`), and a newline in a name cannot split it.
function splitNul(out) {
    return String(out).split('\0').filter(f => f.length > 0);
}

module.exports = { gitRead, locateRepo, stagedDiffHash, splitNul, errorText, HASH_EXCLUDE_PATHSPECS, HASH_PIPELINE };
