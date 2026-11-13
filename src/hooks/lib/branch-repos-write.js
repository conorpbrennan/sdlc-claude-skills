// The one safe writer of the branch-review repos config. enableRepo lists a repo
// with a mode; disableRepo unlists it. Each changes one key of "repos" in the
// parsed document and writes it by temp file and rename, so a failure leaves the
// config as it was. Pure over a config path: no git, no home directory.
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');

const { readReposConfig, ownEntry, realNormalized, modeOf, MODE_ADVISORY, MODE_ENFORCE } = require('./branch-repos-config.js');

const ENCODING = 'utf-8';
const FLAG_EXCLUSIVE = 'wx';
const DEFAULT_FILE_MODE = 0o644;
const DEFAULT_VERSION = 1;
const TMP_SUFFIX = '.tmp';
const JSON_INDENT = 2;
const ACTION_CREATED = 'created';
const ACTION_ADDED = 'added';
const ACTION_UPDATED = 'updated';
const ACTION_UNCHANGED = 'unchanged';
const ERR_MODE = 'mode must be "' + MODE_ADVISORY + '" or "' + MODE_ENFORCE + '".';
const ERR_ENTRY = 'The entry for this repo is not an object; fix it by hand.';

// Args:
//   e: unknown, a caught value.
// Returns:
//   string: its first message line.
function firstLine(e) {
    return String((e && e.message) || e).split('\n')[0];
}

// Args:
//   value: unknown, a config entry.
// Returns:
//   boolean: true for a plain object.
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Args:
//   configPath: string, the config file.
//   create: boolean, true when a missing file starts a new document.
// Returns:
//   { missing: true, doc: object } | { doc: object, existed: true } | { error: string }
//   doc is the whole parsed document, so unknown top-level keys survive.
function loadDocument(configPath, create) {
    const read = readReposConfig(configPath);
    if (read.error) return { error: read.error };
    if (read.missing) return { missing: true, doc: create ? { version: DEFAULT_VERSION, repos: {} } : null };
    try {
        return { existed: true, doc: JSON.parse(fs.readFileSync(configPath, ENCODING)) };
    } catch (e) {
        return { error: 'Could not read ' + configPath + ': ' + firstLine(e) };
    }
}

// Writes doc to a temp file in the config's directory, then renames it over the
// config. The temp file is removed on every failure.
// Args:
//   configPath: string, the config file.
//   doc: object, the whole document.
// Returns:
//   { ok: true } | { ok: false, error: string }
function writeDocument(configPath, doc) {
    const dir = path.dirname(configPath);
    const tmp = path.join(dir, path.basename(configPath) + '.' + process.pid + TMP_SUFFIX);
    try {
        let mode = DEFAULT_FILE_MODE;
        try {
            mode = fs.statSync(configPath).mode & 0o777;
        } catch (e) {
            // No file yet: the default mode stands.
        }
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(tmp, JSON.stringify(doc, null, JSON_INDENT) + '\n', { encoding: ENCODING, flag: FLAG_EXCLUSIVE, mode });
        fs.chmodSync(tmp, mode);
        fs.renameSync(tmp, configPath);
        return { ok: true };
    } catch (e) {
        try {
            fs.rmSync(tmp, { force: true });
        } catch (e2) {
            // Nothing more to do; the config itself was never written.
        }
        return { ok: false, error: 'Could not write ' + configPath + ': ' + firstLine(e) };
    }
}

// Args:
//   configPath: string, the config file.
//   toplevel: string, the repo's git toplevel.
//   mode: string | undefined, MODE_ADVISORY or MODE_ENFORCE; omitted keeps a valid existing mode.
// Returns:
//   { ok: true, action: string, key: string, mode: string } | { ok: false, error: string }
function enableRepo({ configPath, toplevel, mode }) {
    if (mode !== undefined && mode !== MODE_ADVISORY && mode !== MODE_ENFORCE) return { ok: false, error: ERR_MODE };
    const loaded = loadDocument(configPath, true);
    if (loaded.error) return { ok: false, error: loaded.error };
    const repos = loaded.doc.repos;
    const own = ownEntry(repos, toplevel);
    if (own && !isObject(own.entry)) return { ok: false, error: ERR_ENTRY };
    const key = own ? own.key : realNormalized(toplevel);
    const old = own ? own.entry : null;
    const kept = old && old.mode !== undefined ? modeOf(old) : null;
    const newMode = mode || kept || MODE_ADVISORY;
    const entry = Object.assign({}, old, { mode: newMode });
    if (old && isDeepStrictEqual(old, entry)) return { ok: true, action: ACTION_UNCHANGED, key, mode: newMode };
    repos[key] = entry;
    const written = writeDocument(configPath, loaded.doc);
    if (!written.ok) return written;
    const action = loaded.missing ? ACTION_CREATED : old ? ACTION_UPDATED : ACTION_ADDED;
    return { ok: true, action, key, mode: newMode };
}

// Args:
//   configPath: string, the config file.
//   toplevel: string, the repo's git toplevel.
// Returns:
//   { ok: true, removed: boolean, key: string | null } | { ok: false, error: string }
function disableRepo({ configPath, toplevel }) {
    const loaded = loadDocument(configPath, false);
    if (loaded.error) return { ok: false, error: loaded.error };
    if (loaded.missing) return { ok: true, removed: false, key: null };
    const repos = loaded.doc.repos;
    let first = null;
    for (let own = ownEntry(repos, toplevel); own; own = ownEntry(repos, toplevel)) {
        if (!isObject(own.entry)) return { ok: false, error: ERR_ENTRY };
        first = first || own.key;
        delete repos[own.key];
    }
    if (first === null) return { ok: true, removed: false, key: null };
    const written = writeDocument(configPath, loaded.doc);
    if (!written.ok) return written;
    return { ok: true, removed: true, key: first };
}

module.exports = { enableRepo, disableRepo };
