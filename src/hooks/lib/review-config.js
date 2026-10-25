// Resolves which model reviews which round, and the plan-review and
// orchestrator settings, from layered config.
//
// Layers, least to most specific: built-in defaults, the user file
// (~/.claude/sdlc-review.json), the repo file (<repo>/.claude/sdlc-review.json),
// path rules, then a one-off override from the caller. The `rules` arrays of
// both files apply. Among matching rules the strongest model wins
// (opus > sonnet > haiku), whatever layer the rule came from; a rule still
// overrides the layer value when it is weaker, which is how a docs repo gets a
// Sonnet round 2.
//
// Only the model is configurable. The agent per round is fixed: round 1 is
// code-reviewer, later rounds are code-reviewer-deep.
//
// Never throws on bad config: an unreadable or invalid file is ignored, an
// invalid value falls back to the next layer, and each records a warning.
'use strict';

const fs = require('fs');
const path = require('path');
const { matchesAnyGlob } = require('./diff-classifier.js');

const CONFIG_NAME = 'sdlc-review.json';
const USER_CONFIG_ENV = 'SDLC_REVIEW_CONFIG_USER';
const MODELS = ['haiku', 'sonnet', 'opus'];   // weakest to strongest
const AGENT_ROUND_1 = 'code-reviewer';
const AGENT_LATER_ROUNDS = 'code-reviewer-deep';

const DEFAULTS = {
    round1: 'sonnet',
    round2: 'opus',
    maxRounds: 2,
    planReview: { source: 'opus', consistency: 'sonnet', cap: 2 },
    orchestrator: { bashNudge: 8 },
};

function isModel(v) { return typeof v === 'string' && MODELS.includes(v); }
function isPosInt(v) { return Number.isInteger(v) && v >= 1; }
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function userConfigPath() {
    const override = process.env[USER_CONFIG_ENV];
    if (override) return override;
    const home = process.env.USERPROFILE || process.env.HOME || '';
    return path.join(home, '.claude', CONFIG_NAME);
}

function repoConfigPath(repoRoot) {
    return path.join(repoRoot || '.', '.claude', CONFIG_NAME);
}

// Reads one config file. Returns { name, path, data, warnings }. A missing
// file is normal: data is null with no warning. Unreadable, invalid JSON or a
// non-object top level gives data null and a warning naming the path.
function loadFile(name, file) {
    const out = { name, path: file, data: null, warnings: [] };
    let text;
    try {
        text = fs.readFileSync(file, 'utf-8');
    } catch (e) {
        if (e && e.code !== 'ENOENT') out.warnings.push(`${file}: cannot read (${e.code || e.message}); ignored`);
        return out;
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        out.warnings.push(`${file}: invalid JSON (${e.message}); ignored`);
        return out;
    }
    if (!isObject(parsed)) {
        out.warnings.push(`${file}: top level must be a JSON object; ignored`);
        return out;
    }
    out.data = parsed;
    return out;
}

// Most specific first: repo, then user.
function loadLayers(repoRoot) {
    return [
        loadFile('repo config', repoConfigPath(repoRoot)),
        loadFile('user config', userConfigPath()),
    ];
}

function layerWarnings(layers) {
    return layers.reduce((acc, l) => acc.concat(l.warnings), []);
}

// First layer (most specific first) whose `pick(data)` passes `valid`. An
// invalid value records a warning and the search moves on to the next layer.
// Returns { value, source }; source is 'default' when no file supplied one.
function pickFromLayers(layers, pick, valid, label, fallback, warnings) {
    for (const l of layers) {
        if (!l.data) continue;
        const v = pick(l.data);
        if (v === undefined) continue;
        if (valid(v)) return { value: v, source: l.name };
        warnings.push(`${l.path}: ${label} ${JSON.stringify(v)} is not valid; ignored`);
    }
    return { value: fallback, source: 'default' };
}

// Strongest matching rule for `roundKey`, across both files (user rules, then
// repo rules; the first of equally strong rules wins). Returns
// { model, source } or null.
function bestRule(layers, roundKey, stagedPaths, warnings) {
    let best = null;
    for (const l of [...layers].reverse()) {
        if (!l.data || l.data.rules === undefined) continue;
        if (!Array.isArray(l.data.rules)) {
            warnings.push(`${l.path}: rules must be an array; ignored`);
            continue;
        }
        l.data.rules.forEach((rule, i) => {
            if (!isObject(rule) || !Array.isArray(rule.paths) || !rule.paths.every(g => typeof g === 'string')) {
                warnings.push(`${l.path}: rules[${i}] needs a paths array of strings; ignored`);
                return;
            }
            if (rule[roundKey] === undefined) return;
            if (!isModel(rule[roundKey])) {
                warnings.push(`${l.path}: rules[${i}].${roundKey} ${JSON.stringify(rule[roundKey])} is not valid; ignored`);
                return;
            }
            const hit = (stagedPaths || []).find(p => matchesAnyGlob(p, rule.paths));
            if (hit === undefined) return;
            if (best && MODELS.indexOf(rule[roundKey]) <= MODELS.indexOf(best.model)) return;
            const glob = rule.paths.find(g => matchesAnyGlob(hit, [g]));
            best = { model: rule[roundKey], source: `rule ${glob} (${l.name})` };
        });
    }
    return best;
}

// Args:
//   repoRoot: Repository root holding .claude/sdlc-review.json.
//   stagedPaths: Repo-relative staged paths, matched against rule globs.
//   round: 1-based review round.
//   override: Optional { model } from the caller; applies to this round only.
// Returns:
//   { round, agent, model, maxRounds, source, warnings } plus overCap: true
//   when round > maxRounds.
function resolveReview({ repoRoot, stagedPaths, round, override } = {}) {
    const r = Number.isInteger(round) && round >= 1 ? round : 1;
    const layers = loadLayers(repoRoot);
    const warnings = layerWarnings(layers);
    const roundKey = r === 1 ? 'round1' : 'round2';

    let { value: model, source } = pickFromLayers(
        layers, d => d[roundKey], isModel, roundKey, DEFAULTS[roundKey], warnings);
    const rule = bestRule(layers, roundKey, stagedPaths, warnings);
    if (rule) ({ model, source } = rule);
    if (override && override.model !== undefined) {
        if (isModel(override.model)) {
            model = override.model;
            source = 'override';
        } else {
            warnings.push(`override model ${JSON.stringify(override.model)} is not valid; ignored`);
        }
    }

    const maxRounds = pickFromLayers(
        layers, d => d.maxRounds, isPosInt, 'maxRounds', DEFAULTS.maxRounds, warnings).value;

    const result = {
        round: r,
        agent: r === 1 ? AGENT_ROUND_1 : AGENT_LATER_ROUNDS,
        model,
        maxRounds,
        source,
        warnings,
    };
    if (r > maxRounds) result.overCap = true;
    return result;
}

// Picks `section.key` per key across layers, so a repo file that sets only
// `cap` still takes `source` from the user file.
function resolveSection(repoRoot, section, spec) {
    const layers = loadLayers(repoRoot);
    const warnings = layerWarnings(layers);
    const out = {};
    for (const key of Object.keys(spec)) {
        out[key] = pickFromLayers(
            layers,
            d => (isObject(d[section]) ? d[section][key] : undefined),
            spec[key],
            `${section}.${key}`,
            DEFAULTS[section][key],
            warnings).value;
    }
    out.warnings = warnings;
    return out;
}

// Args:
//   repoRoot: Repository root.
// Returns:
//   { source, consistency, cap, warnings }: models for the plan source review
//   and the consistency review, and the review-round cap.
function resolvePlanReview({ repoRoot } = {}) {
    return resolveSection(repoRoot, 'planReview', { source: isModel, consistency: isModel, cap: isPosInt });
}

// Args:
//   repoRoot: Repository root.
// Returns:
//   { bashNudge, warnings }.
function resolveOrchestrator({ repoRoot } = {}) {
    return resolveSection(repoRoot, 'orchestrator', { bashNudge: isPosInt });
}

const MAIN_MODEL_KEY = 'mainModel';
// Stored in place of a model name: the owner opted out of the shipped default.
const MAIN_MODEL_OFF = 'off';
const SHIPPED_DEFAULTS = path.join(__dirname, '..', '..', '..', 'defaults', CONFIG_NAME);

// The main-session model. Read from the user file only: settings.json `model`
// is global, so a per-repo value would flip it on every session start in a
// different repo.
//
// Args:
//   repoRoot: Repository root; its file is read only to warn that its
//     mainModel is ignored.
// Returns:
//   { mainModel, effective, source, path, warnings }: mainModel is the model
//   name the user file holds, or null (unset, opted out with "off", or invalid).
//   effective is the model the session-start hook will apply: mainModel, else
//   the plugin's shipped default when the user file has no mainModel key (or no
//   file), else null. source says which: "user", "default", "off" or "none".
//   path is the user file.
function resolveMainModel({ repoRoot } = {}) {
    const layers = loadLayers(repoRoot);
    const [repo, user] = layers;
    const warnings = layerWarnings(layers);
    if (repo.data && repo.data[MAIN_MODEL_KEY] !== undefined) {
        warnings.push(`${repo.path}: ${MAIN_MODEL_KEY} is read from the user file only; ignored`);
    }
    let mainModel = null;
    const v = user.data ? user.data[MAIN_MODEL_KEY] : undefined;
    if (v !== undefined && v !== MAIN_MODEL_OFF) {
        if (isModel(v)) mainModel = v;
        else warnings.push(`${user.path}: ${MAIN_MODEL_KEY} ${JSON.stringify(v)} is not valid; ignored`);
    }
    // As the hook: a malformed or unreadable file (data null with a warning) gets
    // no default, and so does an invalid value.
    let effective = mainModel;
    let source = mainModel ? 'user' : (v === MAIN_MODEL_OFF ? 'off' : 'none');
    const noFile = user.data === null && user.warnings.length === 0;
    if (v === undefined && (user.data !== null || noFile)) {
        const shipped = shippedMainModel();
        if (shipped) {
            effective = shipped;
            source = 'default';
        }
    }
    return { mainModel, effective, source, path: user.path, warnings };
}

// Returns: the mainModel in the plugin's defaults/sdlc-review.json, or null when
// the file is missing, malformed or holds no valid model.
function shippedMainModel() {
    try {
        const d = JSON.parse(fs.readFileSync(SHIPPED_DEFAULTS, 'utf-8'));
        return isObject(d) && isModel(d[MAIN_MODEL_KEY]) ? d[MAIN_MODEL_KEY] : null;
    } catch (e) {
        return null;
    }
}

// Sets mainModel in the user file, keeping every other key. Creates the file
// when missing. "off" is stored as the owner's opt-out from the plugin's shipped
// default, so removing the key would bring the default back. Refuses a
// symlink, unreadable or malformed file, or a non-object top level, writing
// nothing. The write is a temp file plus rename.
//
// Args:
//   model: A model name, or MAIN_MODEL_OFF.
// Returns:
//   { ok, path, error }: error is set only when ok is false.
function setMainModel(model) {
    const target = userConfigPath();
    const tmp = `${target}.tmp.${process.pid}`;
    if (model !== MAIN_MODEL_OFF && !isModel(model)) return { ok: false, path: target, error: `${JSON.stringify(model)} is not one of ${MODELS.join(', ')}` };
    try {
        let data = {};
        let mode = 0o600;
        try {
            if (fs.lstatSync(target).isSymbolicLink()) return { ok: false, path: target, error: 'is a symlink; edit its target by hand' };
            data = JSON.parse(fs.readFileSync(target, 'utf-8'));
            if (!isObject(data)) return { ok: false, path: target, error: 'top level must be a JSON object' };
            mode = fs.statSync(target).mode & 0o777;
        } catch (e) {
            if (!(e && e.code === 'ENOENT')) return { ok: false, path: target, error: `cannot be read as JSON (${e.code || e.message})` };
            fs.mkdirSync(path.dirname(target), { recursive: true });
        }
        data[MAIN_MODEL_KEY] = model;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode });
        fs.renameSync(tmp, target);
        return { ok: true, path: target };
    } catch (e) {
        try {
            fs.rmSync(tmp, { force: true });
        } catch (e2) { /* nothing to clean */ }
        return { ok: false, path: target, error: `write failed (${e.code || e.message})` };
    }
}

module.exports = { resolveReview, resolvePlanReview, resolveOrchestrator, resolveMainModel, setMainModel, MAIN_MODEL_OFF, MODELS, DEFAULTS, CONFIG_NAME, USER_CONFIG_ENV, loadFile, userConfigPath, repoConfigPath };
