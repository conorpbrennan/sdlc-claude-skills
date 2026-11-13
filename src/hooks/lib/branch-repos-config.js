// Reads the branch-review repos config (~/.claude/branch-review-repos.json) and
// answers the questions the branch-review gate asks of it: which mode and base a
// repo has, and which listed repo holds or equals a directory. Logic is copied from
// pre-pr-verify.js, which runs on load and cannot be imported.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENV_CONFIG = 'BRANCH_REVIEW_REPOS_CONFIG';
const CONFIG_DIR = '.claude';
const CONFIG_FILE = 'branch-review-repos.json';
const MODE_ADVISORY = 'advisory';
const MODE_ENFORCE = 'enforce';
const ENOENT = 'ENOENT';
const BASE_FLAG_PREFIX = '-';

// Returns:
//   string: the env override when set, else ~/.claude/branch-review-repos.json.
function configPath() {
    return process.env[ENV_CONFIG] || path.join(os.homedir(), CONFIG_DIR, CONFIG_FILE);
}

// Args:
//   p: string, a path.
// Returns:
//   string: forward slashes, no trailing slash (except the root).
function normalize(p) {
    const s = String(p).replace(/\\/g, '/');
    return s.length > 1 ? s.replace(/\/+$/, '') : s;
}

// Args:
//   p: string, a path.
// Returns:
//   string: the normalized real path, or the normalized path when it does not exist.
function realNormalized(p) {
    try {
        return normalize(fs.realpathSync(p));
    } catch (e) {
        return normalize(p);
    }
}

// Args:
//   entry: the config entry for one repo.
// Returns:
//   boolean: true when the entry is a plain object.
function isObject(entry) {
    return entry !== null && typeof entry === 'object' && !Array.isArray(entry);
}

// Args:
//   entry: the config entry for one repo.
// Returns:
//   string | null: the mode, MODE_ADVISORY when absent, null when invalid.
function modeOf(entry) {
    if (!isObject(entry)) return null;
    if (entry.mode === undefined) return MODE_ADVISORY;
    return entry.mode === MODE_ADVISORY || entry.mode === MODE_ENFORCE ? entry.mode : null;
}

// Args:
//   entry: the config entry for one repo.
// Returns:
//   { ok: true, base: null } when base is absent (resolve it from git),
//   { ok: true, base: string } for a non-empty string with no leading dash,
//   { ok: false } for anything else.
function baseOf(entry) {
    if (!isObject(entry) || entry.base === undefined) return { ok: true, base: null };
    const base = entry.base;
    if (typeof base !== 'string' || base === '' || base.startsWith(BASE_FLAG_PREFIX)) return { ok: false };
    return { ok: true, base };
}

// Args:
//   file: string, the config file.
// Returns:
//   { missing: true } | { error: string } | { repos: object }
function readReposConfig(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf-8');
    } catch (e) {
        if (e && e.code === ENOENT) return { missing: true };
        return { error: 'Could not read ' + file + ': ' + String((e && e.message) || e).split('\n')[0] };
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { error: 'Could not parse ' + file + ' as JSON.' };
    }
    const repos = parsed && parsed.repos;
    if (!isObject(repos)) {
        return { error: file + ' has no "repos" object.' };
    }
    return { repos };
}

// Args:
//   repos: object, the config's repos map (key -> entry).
// Returns:
//   Array<{ key: string, entry: object, keys: string[] }>: each key with its two spellings.
function listed(repos) {
    if (!isObject(repos)) return [];
    return Object.keys(repos).map(key => ({
        key,
        entry: repos[key],
        keys: [normalize(key), realNormalized(key)],
    }));
}

// Args:
//   repos: object, the config's repos map.
//   dir: string, a directory, already realNormalized (the cwd).
// Returns:
//   { key: string, entry: object } | null: the longest listed key that holds dir.
function entryFor(repos, dir) {
    const d = normalize(dir);
    const holds = k => d === k || d.startsWith(k === '/' ? k : k + '/');
    let best = null;
    let bestLen = -1;
    for (const e of listed(repos)) {
        const len = Math.max(-1, ...e.keys.filter(holds).map(k => k.length));
        if (len > bestLen) {
            best = e;
            bestLen = len;
        }
    }
    return best ? { key: best.key, entry: best.entry } : null;
}

// Args:
//   repos: object, the config's repos map.
//   toplevel: string, a repository's git toplevel.
// Returns:
//   { key: string, entry: object } | null: the listed repo that IS this toplevel.
function ownEntry(repos, toplevel) {
    const wanted = [normalize(toplevel), realNormalized(toplevel)];
    const e = listed(repos).find(x => x.keys.some(k => wanted.includes(k)));
    return e ? { key: e.key, entry: e.entry } : null;
}

module.exports = {
    ENV_CONFIG,
    MODE_ADVISORY,
    MODE_ENFORCE,
    configPath,
    normalize,
    realNormalized,
    modeOf,
    baseOf,
    readReposConfig,
    entryFor,
    ownEntry,
};
