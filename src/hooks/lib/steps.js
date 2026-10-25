// Answers "is step X on, and why" for every sdlc workflow step.
//
// Source: the `steps` block of the user file (~/.claude/sdlc-review.json) and
// the repo file (<repo>/.claude/sdlc-review.json), plus the older opt-out
// files (aliases). Shape: "steps": { "<area>": <bool> | { "enabled": <bool>,
// "<step id>": <bool> } }.
//
// Rules, per step:
//   R1 in one file, steps.<area>.<step> beats steps.<area>.enabled beats
//      steps.<area> as a boolean.
//   R2 a guard area (tdd, review, commit-conventions) reads the user file
//      only; a repo `false` is ignored with a warning.
//   R3 other areas: the repo file beats the user file.
//   R4 default on.
//   R5 an alias that says off wins over the block.
//   R6 a malformed block or value is skipped with a warning naming file and key.
//
// Never throws: any failure leaves the step on, with a warning. Reads files
// only through review-config.js; starts no process and writes nothing.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const reviewConfig = require('./review-config.js');
const { mandateInForce, MANDATE_OPT_OUT } = require('./tdd-order.js');

const SOURCE_DEFAULT = 'default';
const SOURCE_USER = 'user';
const SOURCE_REPO = 'repo';
const SOURCE_ALIAS = 'alias';

const CACHE_TTL_OPT_OUT = 'sdlc-cache-ttl.disabled';
const AUTO_UPDATE_OPT_OUT = 'sdlc-autoupdate.disabled';
const FEATURE_OPT_OUT = path.join('.claude', 'feature-tracking.disabled');
const ENABLED_KEY = 'enabled';
const STEPS_KEY = 'steps';
const MAIN_MODEL_KEY = 'mainModel';
const TREATED_ON = '; treated as on';
const ALIAS_WINS = 'block says on; the alias wins';

const AREAS = Object.freeze({
    'orchestration': Object.freeze({ guard: false, steps: Object.freeze(['orchestrator-mode', 'enforce-review-implementer', 'agent-tier-gate', 'agent-default-model', 'context-budget', 'read-trim']) }),
    'features': Object.freeze({ guard: false, steps: Object.freeze(['session-start-feature', 'pre-commit-feature', 'post-commit-feature']) }),
    'tdd': Object.freeze({ guard: true, steps: Object.freeze(['tdd-mandate']) }),
    'review': Object.freeze({ guard: true, steps: Object.freeze(['review-gate', 'pending-review-gate', 'plan-review']) }),
    'hygiene': Object.freeze({ guard: false, steps: Object.freeze(['pre-commit-hygiene']) }),
    'verification': Object.freeze({ guard: false, steps: Object.freeze(['pre-pr-verify']) }),
    'commit-conventions': Object.freeze({ guard: true, steps: Object.freeze(['enforce-co-author', 'claude-attribution-note', 'post-commit-notify']) }),
    'standalone': Object.freeze({ guard: false, steps: Object.freeze(['main-model', 'cache-ttl', 'session-instructions', 'marketplace-autoupdate']) }),
});

// Opt-in steps: their own hook reads this file; the resolver does not.
const OPT_IN_DETAIL = Object.freeze({
    'pre-commit-hygiene': 'runs only in repos listed in ~/.claude/hygiene-repos.json',
    'pre-pr-verify': 'runs only in repos listed in ~/.claude/verify-repos.json',
});

const FEATURE_STEPS = Object.freeze(['session-start-feature', 'pre-commit-feature', 'post-commit-feature']);

function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

// Returns: the step id -> area id map, built once from AREAS.
function buildAreaOf() {
    const m = {};
    for (const [area, def] of Object.entries(AREAS)) for (const s of def.steps) m[s] = area;
    return m;
}
const AREA_OF = Object.freeze(buildAreaOf());

// Returns: the config directory, CLAUDE_CONFIG_DIR when non-empty, else ~/.claude.
function configDir() {
    const env = process.env.CLAUDE_CONFIG_DIR;
    if (env) return env;
    return path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.claude');
}

// Args:
//   start: directory to walk up from.
// Returns: the nearest ancestor (or start) holding `.git` (directory or file), else null.
function findRepoRoot(start) {
    let dir = path.resolve(start);
    for (;;) {
        if (fs.existsSync(path.join(dir, '.git'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

// Args:
//   file: a loadFile result (or null for no layer).
//   isRepo: whether this is the repo file (guard areas ignore it).
//   warnings: array to append to.
// Returns: { area: { bool?, enabled?, steps: { id: bool } } } of the valid
//   values in the file's `steps` block; every invalid value warns and is skipped.
function readBlock(file, isRepo, warnings) {
    const out = {};
    if (!file || !file.data || file.data[STEPS_KEY] === undefined) return out;
    const block = file.data[STEPS_KEY];
    const where = file.path;
    if (!isObject(block)) {
        warnings.push(`${where}: ${STEPS_KEY} must be an object; ignored`);
        return out;
    }
    const noteGuard = (key, v) => {
        if (v === false) warnings.push(`${where}: ${key} is read from the user file only; ignored`);
    };
    for (const [area, val] of Object.entries(block)) {
        const key = `${STEPS_KEY}.${area}`;
        const def = AREAS[area];
        if (!def) { warnings.push(`${where}: ${key} is not a known area; skipped`); continue; }
        const entry = { bool: undefined, enabled: undefined, steps: {} };
        if (typeof val === 'boolean') {
            entry.bool = val;
            if (isRepo && def.guard) noteGuard(key, val);
        } else if (isObject(val)) {
            for (const [k, v] of Object.entries(val)) {
                const sub = `${key}.${k}`;
                if (k !== ENABLED_KEY && !def.steps.includes(k)) { warnings.push(`${where}: ${sub} is not a known step; skipped`); continue; }
                if (typeof v !== 'boolean') { warnings.push(`${where}: ${sub} must be true or false; skipped`); continue; }
                if (k === ENABLED_KEY) entry.enabled = v; else entry.steps[k] = v;
                if (isRepo && def.guard) noteGuard(sub, v);
            }
        } else {
            warnings.push(`${where}: ${key} must be true, false or an object; skipped`);
            continue;
        }
        out[area] = entry;
    }
    return out;
}

// Args:
//   parsed: a readBlock result.
//   area, id: the step.
// Returns: { value, key } for the most specific key set (R1), else null.
function lookup(parsed, area, id) {
    const e = parsed[area];
    if (!e) return null;
    if (e.steps[id] !== undefined) return { value: e.steps[id], key: `${STEPS_KEY}.${area}.${id}` };
    if (e.enabled !== undefined) return { value: e.enabled, key: `${STEPS_KEY}.${area}.${ENABLED_KEY}` };
    if (e.bool !== undefined) return { value: e.bool, key: `${STEPS_KEY}.${area}` };
    return null;
}

// Args:
//   id: step id.
//   ctx: { repoRoot, userData, dir }.
// Returns: { key, detail } when an opt-out alias turns the step off, else null.
function aliasOff(id, ctx) {
    if (FEATURE_STEPS.includes(id)) {
        if (ctx.repoRoot && fs.existsSync(path.join(ctx.repoRoot, FEATURE_OPT_OUT))) {
            return { key: FEATURE_OPT_OUT, detail: '' };
        }
    } else if (id === 'tdd-mandate') {
        const m = mandateInForce(ctx.repoRoot);
        if (!m.inForce) return { key: MANDATE_OPT_OUT, detail: m.reason };
    } else if (id === 'main-model') {
        const d = ctx.userData;
        if (d && d[MAIN_MODEL_KEY] === reviewConfig.MAIN_MODEL_OFF) return { key: MAIN_MODEL_KEY, detail: '' };
    } else if (id === 'cache-ttl') {
        if (fs.existsSync(path.join(ctx.dir, CACHE_TTL_OPT_OUT))) return { key: CACHE_TTL_OPT_OUT, detail: 'writes nothing; still warns' };
    } else if (id === 'marketplace-autoupdate') {
        if (fs.existsSync(path.join(ctx.dir, AUTO_UPDATE_OPT_OUT))) return { key: AUTO_UPDATE_OPT_OUT, detail: '' };
    }
    return null;
}

// Args:
//   id: step id.
//   area: its area id.
// Returns: a default-on state.
function defaultState(id, area) {
    const def = area ? AREAS[area] : null;
    return { id, area: area || null, guard: def ? def.guard : false, on: true, source: SOURCE_DEFAULT, key: '', detail: OPT_IN_DETAIL[id] || '' };
}

// Args:
//   ids: step ids.
//   opts: { cwd, repoRoot }.
// Returns: { states: { [id]: state }, warnings: [string] }. One config read per
//   call. Never throws; a failure or unknown id gives on: true, source default.
function stepStates(ids, opts) {
    const warnings = [];
    const states = {};
    const list = Array.isArray(ids) ? ids : [];
    try {
        const o = opts || {};
        const repoRoot = o.repoRoot || findRepoRoot(o.cwd || process.cwd());
        const userFile = reviewConfig.loadFile('user config', reviewConfig.userConfigPath());
        const repoFile = repoRoot ? reviewConfig.loadFile('repo config', reviewConfig.repoConfigPath(repoRoot)) : null;
        warnings.push(...userFile.warnings, ...(repoFile ? repoFile.warnings : []));
        const user = readBlock(userFile, false, warnings);
        const repo = readBlock(repoFile, true, warnings);
        const ctx = { repoRoot, userData: userFile.data, dir: configDir() };
        for (const id of list) {
            try {
                const area = AREA_OF[id];
                if (!area) {
                    warnings.push(`unknown step '${id}'${TREATED_ON}`);
                    states[id] = defaultState(id, null);
                    continue;
                }
                const st = defaultState(id, area);
                const fromRepo = AREAS[area].guard ? null : lookup(repo, area, id);
                const fromUser = fromRepo ? null : lookup(user, area, id);
                const hit = fromRepo || fromUser;
                if (hit) {
                    st.on = hit.value;
                    st.source = fromRepo ? SOURCE_REPO : SOURCE_USER;
                    st.key = hit.key;
                    if (!hit.value) st.detail = '';
                }
                const alias = aliasOff(id, ctx);
                if (alias) {
                    const blockOn = hit && hit.value === true;
                    st.on = false;
                    st.source = SOURCE_ALIAS;
                    st.key = alias.key;
                    st.detail = [alias.detail, blockOn ? ALIAS_WINS : ''].filter(Boolean).join('; ');
                }
                states[id] = st;
            } catch (e) {
                warnings.push(`step '${id}': ${e && e.message}${TREATED_ON}`);
                states[id] = defaultState(id, AREA_OF[id] || null);
            }
        }
    } catch (e) {
        warnings.push(`steps: ${e && e.message}${TREATED_ON}`);
        for (const id of list) if (!states[id]) states[id] = defaultState(id, AREA_OF[id] || null);
    }
    return { states, warnings };
}

// Args:
//   id: step id.
//   opts: { cwd, repoRoot }.
// Returns: the step's state plus `warnings`.
function stepState(id, opts) {
    const r = stepStates([id], opts);
    return Object.assign({}, r.states[id], { warnings: r.warnings });
}

// Args:
//   id: step id.
//   opts: { cwd, repoRoot }.
// Returns: true when the step is on (also on any failure).
function isStepOn(id, opts) {
    return stepState(id, opts).on;
}

// Args:
//   opts: { cwd, repoRoot }.
// Returns: { states: [state] in AREAS order, warnings }.
function listSteps(opts) {
    const ids = [].concat(...Object.values(AREAS).map(a => a.steps));
    const r = stepStates(ids, opts);
    return { states: ids.map(id => r.states[id]), warnings: r.warnings };
}

module.exports = {
    AREAS, stepStates, stepState, isStepOn, listSteps, configDir, findRepoRoot,
    SOURCE_DEFAULT, SOURCE_USER, SOURCE_REPO, SOURCE_ALIAS,
    CACHE_TTL_OPT_OUT, AUTO_UPDATE_OPT_OUT,
};
