// SessionStart hook (plugin only): inject the four instruction sections that
// the retired installer used to merge into ~/.claude/CLAUDE.md, read from the
// plugin's instructions/ directory, as additionalContext. Ahead of them, warn
// when a pre-plugin install is still wired in ~/.claude/settings.json, since
// then every hook runs twice.
//
// Contract:
//   - stdout carries exactly one JSON object, and nothing else.
//   - Always exits 0. A missing or unreadable section is replaced by a
//     one-line notice; any other failure yields a minimal object with a notice.
//   - Fixed order. The environment inputs are the home directory (legacy-install
//     check) and, for the prompt-cache TTL check, the cwd from stdin, the
//     process environment and the settings files; the same inputs give the same
//     output. The TTL check never prints an environment value.
//   - One side effect: when a per-token backend is set and the main-conversation
//     prompt-cache TTL resolves to the 5m default, it writes the single key
//     "promptCacheTtl": "1h" into <config dir>/settings.json (CLAUDE_CONFIG_DIR,
//     else ~/.claude), keeping every other key, after a timestamped backup and
//     via a temp file plus rename. It writes nothing when the file
//     <config dir>/sdlc-cache-ttl.disabled exists, when settings.json is not a
//     JSON object, or on any write error; it warns instead. The setting applies
//     from the next session, not the one that wrote it.
//   - Second side effect, same writer: when the user's sdlc-review.json (env
//     SDLC_REVIEW_CONFIG_USER, else ~/.claude/sdlc-review.json) sets "mainModel"
//     to haiku, sonnet or opus and it differs from "model" in settings.json, it
//     writes "model" there, with the timestamped backup "-pre-sdlc-model". A
//     repo file's mainModel is ignored with a warning, since settings.json is
//     global. An invalid value does nothing. When the user file has no
//     "mainModel" key, or there is no user file, the plugin's own
//     defaults/sdlc-review.json supplies it (sonnet), and it overwrites an
//     existing "model". "off" is the owner's opt-out; a malformed user file
//     gets no default. With ANTHROPIC_MODEL set it warns
//     that the variable overrides settings (the name only, never the value).
//   - Third side effect, same writer: when Claude Code's own record
//     (<config dir>/plugins/known_marketplaces.json) shows the "sdlc-claude-skills"
//     marketplace was added from github conorpbrennan/sdlc-claude-skills, it sets
//     "autoUpdate": true on that entry of "extraKnownMarketplaces" in settings.json
//     (backup suffix "-pre-sdlc-autoupdate"), so version bumps pushed to git reach
//     installed copies. A plugin cannot set this itself. An autoUpdate the owner
//     already set (true or false) is kept; <config dir>/sdlc-autoupdate.disabled
//     opts out; a fork or local-path marketplace of the same name is left alone.
//   - Requires lib/steps.js (the step lookup, the config dir and the two opt-out
//     file names), so the test copies lib/ beside the hook it runs against a
//     scratch instructions/ directory. mainModel is still read here directly with
//     minimal validation.
//   - Four steps (lib/steps.js) gate the parts, resolved once in build() before any
//     effect: session-instructions (the four sections), main-model (the model
//     line and the settings "model" write), cache-ttl (the promptCacheTtl write;
//     off by the opt-out file alias it still warns, off by the config block it is
//     silent) and marketplace-autoupdate (the autoUpdate write). An off step
//     writes nothing and makes no backup. The legacy-install warning is not a
//     step. With every part off and no legacy install, nothing is printed.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { stepStates, configDir, CACHE_TTL_OPT_OUT, AUTO_UPDATE_OPT_OUT, SOURCE_ALIAS } = require('./lib/steps');

const INSTRUCTIONS_DIR = path.join(__dirname, '..', '..', 'instructions');

// Review triggers, feature tracking, hygiene, TDD mandate.
const SECTIONS = [
    'claude-md-snippet.md',
    'feature-workflow-snippet.md',
    'hygiene-snippet.md',
    'tdd-mandate-snippet.md',
];

// The retired installer's merge wrapped each section in these; the sources
// carry none today, so this is defensive.
const SENTINEL = /^[ \t]*<!--\s*sdlc-claude-skills:[^>]*-->[ \t]*\r?\n?/gm;

// Exactly the hook scripts the legacy wiring (legacy/hooks-config.json) put
// into settings.json, frozen here: the plugin's own copies live elsewhere, so
// a match is the legacy deployment. No more than that, since uninstall.sh
// strips only what that file names, and a warning its fix cannot clear would
// never go away. The test checks the two lists are equal.
const LEGACY_SCRIPTS = [
    'claude-attribution-note.js',
    'enforce-co-author.js',
    'enforce-review-implementer.js',
    'pending-review-gate.js',
    'post-commit-feature.js',
    'post-commit-notify.js',
    'pre-commit-feature.js',
    'pre-commit-hygiene.js',
    'pre-commit-review.js',
    'session-start-feature.js',
];

// Per-token backends: Claude Code gives these the 5-minute prompt cache unless told otherwise.
const BACKEND_VARS = [
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
];
const TTL_ENV = 'CLAUDE_CODE_PROMPT_CACHE_TTL';
const TTL_SETTING = 'promptCacheTtl';
const FORCE_5M_ENV = 'FORCE_PROMPT_CACHING_5M';
const ENABLE_1H_ENV = 'ENABLE_PROMPT_CACHING_1H';
const TTL_1H = '1h';
const TTL_5M = '5m';
const SETTINGS_FILE = 'settings.json';
const BACKUP_SUFFIX_TTL = '-pre-sdlc-cache-ttl';
const BACKUP_SUFFIX_MODEL = '-pre-sdlc-model';
const MODEL_SETTING = 'model';
const MAIN_MODEL_KEY = 'mainModel';
const MAIN_MODELS = ['haiku', 'sonnet', 'opus'];   // as MODELS in lib/review-config.js
const MAIN_MODEL_OFF = 'off';   // as MAIN_MODEL_OFF in lib/review-config.js
const PLUGIN_NAME = 'sdlc';   // canonical spelling: lib/plugin-names.js
const MAIN_MODEL_COMMAND = '/' + PLUGIN_NAME + ':main-model';
const REVIEW_CONFIG_NAME = 'sdlc-review.json';
const REVIEW_CONFIG_USER_ENV = 'SDLC_REVIEW_CONFIG_USER';
const MODEL_ENV = 'ANTHROPIC_MODEL';
const MARKETPLACES_SETTING = 'extraKnownMarketplaces';
const AUTO_UPDATE_KEY = 'autoUpdate';
const MARKETPLACE_NAME = 'sdlc-claude-skills';   // name in .claude-plugin/marketplace.json
const MARKETPLACE_REPO = 'conorpbrennan/sdlc-claude-skills';
const KNOWN_MARKETPLACES_FILE = path.join('plugins', 'known_marketplaces.json');
const BACKUP_SUFFIX_AUTO_UPDATE = '-pre-sdlc-autoupdate';
const DEFAULTS_FILE = path.join(__dirname, '..', '..', 'defaults', REVIEW_CONFIG_NAME);

const STEP_IDS = ['session-instructions', 'main-model', 'cache-ttl', 'marketplace-autoupdate'];
const STDERR_PREFIX = 'session-start-instructions: ';

const FIX = 'Fix: run `./uninstall.sh` from a checkout of the pre-plugin toolchain or of ' +
    'this repo, then restart Claude Code.';

function notice(text) {
    return `> sdlc plugin: ${text.replace(/\s+/g, ' ').trim()}`;
}

function warning(text) {
    return `> sdlc plugin WARNING: ${text.replace(/\s+/g, ' ').trim()}`;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A hook command naming <home>/.claude/hooks/<script>, where <home> is the
// literal $HOME or ${HOME} the legacy wiring uses, ~, or the expanded home
// path. The script name must be a whole path component, so a user's
// my-pre-commit-review.js does not match.
function legacyPattern(home) {
    const homes = ['\\$HOME', '\\$\\{HOME\\}', '~'];
    if (home) {
        homes.push(escapeRegex(home));
        const forward = home.replace(/\\/g, '/');
        if (forward !== home) homes.push(escapeRegex(forward));
    }
    const scripts = LEGACY_SCRIPTS.map(escapeRegex).join('|');
    return new RegExp(`(?:${homes.join('|')})[\\\\/]\\.claude[\\\\/]hooks[\\\\/](${scripts})(?![\\w.-])`);
}

// Every string anywhere under a parsed JSON value.
function strings(value, out) {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') {
        for (const v of Object.values(value)) strings(v, out);
    }
    return out;
}

// The warning for a legacy install still wired in settings.json, or '' when
// there is none. A missing settings.json is a clean machine; one that cannot
// be read or parsed is reported, since the check could not be made.
function legacyWarning() {
    const home = os.homedir();
    const settingsPath = path.join(home, '.claude', 'settings.json');
    let settings;
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (e) {
        if (e && e.code === 'ENOENT') return '';
        return warning(`~/.claude/settings.json could not be checked for a pre-plugin install of
            this toolchain (${(e && (e.code || e.message)) || 'unknown error'}). If one is still wired
            there, every hook runs twice: once from that install and once from this plugin. ${FIX}`);
    }
    const pattern = legacyPattern(home);
    const hooks = settings && typeof settings === 'object' ? settings.hooks : undefined;
    const found = [...new Set(strings(hooks, [])
        .map(s => (pattern.exec(s) || [])[1]).filter(Boolean))];
    if (found.length === 0) return '';
    return warning(`a pre-plugin install of this toolchain is still wired in
        ~/.claude/settings.json (${found.join(', ')}). Every hook runs twice, once from that
        install and once from this plugin, so each commit is gated twice and blocks can repeat.
        ${FIX}`);
}

// A flag env value: set, and not an explicit off.
function truthy(value) {
    return typeof value === 'string' && value.trim() !== '' && !/^(0|false|no|off)$/i.test(value.trim());
}

// Parsed settings objects from the user, project and local settings files,
// skipping any that is missing, unreadable or not a JSON object.
//
// Args:
//     cwd: The session's working directory.
// Returns:
//     An array of plain objects.
function settingsFiles(cwd) {
    const paths = [
        path.join(configDir(), SETTINGS_FILE),
        path.join(cwd, '.claude', 'settings.json'),
        path.join(cwd, '.claude', 'settings.local.json'),
    ];
    const out = [];
    for (const p of paths) {
        try {
            const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) out.push(parsed);
        } catch (e) { /* missing or malformed: this file adds nothing */ }
    }
    return out;
}

// Set one key in the user settings file, keeping every other key.
// An existing file is copied to a timestamped backup first, and the new text goes
// through a temp file in the same directory plus a rename.
//
// Args:
//     dir: The config directory.
//     key: The settings key to set.
//     value: Its new value.
//     backupSuffix: Ends the backup file name, after the timestamp.
// Returns:
//     The settings file path on success, or '' when nothing was written (file a
//     symlink or not a JSON object, or any read or write error).
function writeSetting(dir, key, value, backupSuffix) {
    const target = path.join(dir, SETTINGS_FILE);
    const tmp = `${target}.tmp.${process.pid}`;
    try {
        let settings = {};
        let mode = 0o600;
        let existed = true;
        try {
            // A symlinked settings.json (dotfiles) would be replaced by a regular file on
            // rename. Fail closed: never write through or over a link.
            if (fs.lstatSync(target).isSymbolicLink()) return '';
            const raw = fs.readFileSync(target, 'utf-8');
            settings = JSON.parse(raw);
            if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return '';
            mode = fs.statSync(target).mode & 0o777;
        } catch (e) {
            if (!(e && e.code === 'ENOENT')) return '';
            existed = false;
        }
        if (existed) {
            const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '');
            fs.copyFileSync(target, `${target}.backup.${stamp}${backupSuffix}`);
        } else {
            fs.mkdirSync(dir, { recursive: true });
        }
        settings[key] = value;
        fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', { mode });
        fs.renameSync(tmp, target);
        return target;
    } catch (e) {
        try {
            fs.rmSync(tmp, { force: true });
        } catch (e2) { /* nothing to clean */ }
        return '';
    }
}

// The line for a per-token backend that will get the 5-minute prompt cache, or ''
// when the TTL is 1h, was chosen explicitly, or no such backend is set. When the
// plugin can set the 1h TTL in the user settings it does, and the line says so;
// otherwise the line is a warning with the manual fix.
// Mirrors the CLI's order: FORCE_PROMPT_CACHING_5M, the TTL env var, the
// promptCacheTtl setting, ENABLE_PROMPT_CACHING_1H, then the route default.
//
// Args:
//     cwd: The session's working directory.
//     optedOut: True when the opt-out file alias turned the step off: the TTL is
//         then never written, and the warning is still given.
// Returns:
//     The line, or ''. No environment value is ever included.
function cacheTtlWarning(cwd, optedOut) {
    const files = settingsFiles(cwd);
    const blocks = files.map(f => (f.env && typeof f.env === 'object' ? f.env : {}));
    const lookup = name => {
        if (typeof process.env[name] === 'string' && process.env[name] !== '') return process.env[name];
        for (const b of blocks) if (typeof b[name] === 'string' && b[name] !== '') return b[name];
        return '';
    };
    if (!BACKEND_VARS.some(name => lookup(name) !== '')) return '';
    if (truthy(lookup(FORCE_5M_ENV))) return '';
    const explicit = [lookup(TTL_ENV), ...files.map(f => f[TTL_SETTING])]
        .filter(v => v === TTL_1H || v === TTL_5M);
    if (explicit.length > 0) return '';
    if (truthy(lookup(ENABLE_1H_ENV))) return '';
    const dir = configDir();
    const written = optedOut
        ? '' : writeSetting(dir, TTL_SETTING, TTL_1H, BACKUP_SUFFIX_TTL);
    if (written) {
        return warning(`sdlc set \`"${TTL_SETTING}": "${TTL_1H}"\` in ${written} so the main conversation
            uses the 1-hour prompt cache on this per-token backend. It takes effect from the next
            session; this one stays on 5 minutes. Sub-agents stay on 5 minutes by design. Opt out
            with \`touch ${path.join(dir, CACHE_TTL_OPT_OUT)}\`. Tell the owner this at the start of the session.`);
    }
    return warning(`the main conversation will use the 5-minute prompt cache on this per-token
        backend, so every wait over 5 minutes re-caches the whole context. Fix: add
        \`export ${TTL_ENV}=${TTL_1H}\` to the shell profile that launches claude, or set
        \`"${TTL_SETTING}": "${TTL_1H}"\` in ~/.claude/settings.json. Sub-agents stay on 5m by design.
        Tell the owner this at the start of the session.`);
}

// A JSON object parsed from a file, or null when missing, unreadable or not an object.
function readObject(file) {
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (e) {
        return null;
    }
}

// The lines for the main-session model: set "model" in the user settings from
// mainModel in the user sdlc-review.json, warn about a repo-level mainModel,
// and warn when ANTHROPIC_MODEL overrides settings.
//
// Args:
//     cwd: The session's working directory.
// Returns:
//     An array of lines, empty when mainModel is unset or invalid in the user
//     file and no repo file sets it. No environment value is ever included.
function mainModelLines(cwd) {
    const lines = [];
    const repo = readObject(path.join(cwd, '.claude', REVIEW_CONFIG_NAME));
    if (repo && repo[MAIN_MODEL_KEY] !== undefined) {
        lines.push(warning(`${path.join(cwd, '.claude', REVIEW_CONFIG_NAME)} sets ${MAIN_MODEL_KEY}; it is
            ignored, because it is read from the user file only (settings.json is global).`));
    }
    const override = process.env[REVIEW_CONFIG_USER_ENV];
    const userFile = override || path.join(os.homedir(), '.claude', REVIEW_CONFIG_NAME);
    const user = readObject(userFile);
    let wanted = user ? user[MAIN_MODEL_KEY] : undefined;
    if (wanted === MAIN_MODEL_OFF) return lines;
    // The shipped default applies only when the owner has not spoken: no key, in
    // a readable file or no file at all. A malformed file gets nothing.
    let shipped = false;
    if (wanted === undefined && (user || !fs.existsSync(userFile))) {
        const defaults = readObject(DEFAULTS_FILE);
        wanted = defaults ? defaults[MAIN_MODEL_KEY] : undefined;
        shipped = true;
    }
    if (!MAIN_MODELS.includes(wanted)) return lines;
    const dir = configDir();
    const current = readObject(path.join(dir, SETTINGS_FILE));
    if (!current || current[MODEL_SETTING] !== wanted) {
        const written = writeSetting(dir, MODEL_SETTING, wanted, BACKUP_SUFFIX_MODEL);
        if (written) {
            const from = shipped ? `the plugin's shipped default (${DEFAULTS_FILE})` : `${MAIN_MODEL_KEY} in ${userFile}`;
            lines.push(warning(`main-session model set to \`${wanted}\` in ${written} from ${from}. It applies from the next session. Change it with the main-model command of this plugin (${MAIN_MODEL_COMMAND}); \`/model\`
                changes only the current session. Tell the owner this at the start of the session.`));
        } else {
            lines.push(warning(`${MAIN_MODEL_KEY} is ${wanted} (${shipped ? 'the shipped default' : userFile}), but ${path.join(dir, SETTINGS_FILE)}
                could not be updated (a symlink, not a JSON object, or not writable). Set \`"${MODEL_SETTING}":
                "${wanted}"\` there by hand. Tell the owner this at the start of the session.`));
        }
    }
    if (typeof process.env[MODEL_ENV] === 'string' && process.env[MODEL_ENV] !== '') {
        lines.push(warning(`the ${MODEL_ENV} environment variable overrides the settings \`${MODEL_SETTING}\`, so
            ${MAIN_MODEL_KEY} has no effect until ${MODEL_ENV} is removed from the shell profile that launches
            claude. Tell the owner this at the start of the session.`));
    }
    return lines;
}

// Turns on auto-update for this plugin's marketplace in the user settings, so
// new versions pushed to git reach installed copies with no manual step. A
// plugin cannot do this itself: its settings.json honours only `agent` and
// `subagentStatusLine`. Writes only the extraKnownMarketplaces key, through the
// same safe single-key writer, and only when Claude Code's own record shows the
// marketplace was added from this repo (a fork or a local path of the same name
// is left alone). An autoUpdate value the owner already set, true or false, is
// kept, as is any other key of the entry.
//
// Args:
//     None.
// Returns:
//     An array of lines, empty when nothing was done or nothing was needed.
function autoUpdateLines() {
    const dir = configDir();
    const known = readObject(path.join(dir, KNOWN_MARKETPLACES_FILE));
    const registered = known && known[MARKETPLACE_NAME] && known[MARKETPLACE_NAME].source;
    if (!registered || registered.source !== 'github' || registered.repo !== MARKETPLACE_REPO) return [];
    const settingsPath = path.join(dir, SETTINGS_FILE);
    const settings = readObject(settingsPath);
    if (!settings && fs.existsSync(settingsPath)) return [];
    const marketplaces = settings ? settings[MARKETPLACES_SETTING] : undefined;
    if (marketplaces !== undefined && (!marketplaces || typeof marketplaces !== 'object' || Array.isArray(marketplaces))) return [];
    const entry = marketplaces ? marketplaces[MARKETPLACE_NAME] : undefined;
    if (entry !== undefined && (!entry || typeof entry !== 'object' || Array.isArray(entry))) return [];
    if (entry && entry[AUTO_UPDATE_KEY] !== undefined) return [];
    const merged = {
        ...(marketplaces || {}),
        [MARKETPLACE_NAME]: {
            source: { source: 'github', repo: MARKETPLACE_REPO },
            ...(entry || {}),
            [AUTO_UPDATE_KEY]: true,
        },
    };
    const optOut = path.join(dir, AUTO_UPDATE_OPT_OUT);
    if (writeSetting(dir, MARKETPLACES_SETTING, merged, BACKUP_SUFFIX_AUTO_UPDATE)) {
        return [warning(`sdlc turned on auto-update for its marketplace (\`${MARKETPLACE_NAME}\`) in ${settingsPath}, so new
            versions pushed to git reach this install on their own. Claude Code checks after the first message of a
            session and asks for /reload-plugins. Opt out by setting \`"${AUTO_UPDATE_KEY}": false\` in that
            \`${MARKETPLACES_SETTING}\` entry, or with \`touch ${optOut}\`. Tell the owner this at the start of the session.`)];
    }
    return [];
}

// The cwd from the hook's stdin JSON, else process.cwd().
function sessionCwd() {
    try {
        const input = JSON.parse(fs.readFileSync(0, 'utf-8'));
        if (input && typeof input.cwd === 'string' && input.cwd) return input.cwd;
    } catch (e) { /* no usable stdin */ }
    return process.cwd();
}

// CRLF is normalised to LF first, before the sentinel strip and the join: a
// Windows checkout (core.autocrlf=true) must give the same context as Linux.
function readSection(name) {
    try {
        return fs.readFileSync(path.join(INSTRUCTIONS_DIR, name), 'utf-8')
            .replace(/\r\n/g, '\n')
            .replace(SENTINEL, '')
            .trim();
    } catch (e) {
        return notice(`instructions/${name} could not be read (${e.code || e.message}); that section is missing this session.`);
    }
}

// The four step states, in one resolver call. Warnings go to stderr, one line
// each (stdout is the hook's JSON).
//
// Args:
//     cwd: The session's working directory.
// Returns:
//     An object keyed by step id, each value a state from lib/steps.js.
function resolveSteps(cwd) {
    try {
        const { states, warnings } = stepStates(STEP_IDS, { cwd });
        for (const w of warnings) process.stderr.write(`${STDERR_PREFIX}${String(w).replace(/\s*\n\s*/g, ' ')}\n`);
        return states;
    } catch (e) {
        process.stderr.write(`${STDERR_PREFIX}step lookup failed (${e && e.message}); every step stays on\n`);
        const on = {};
        for (const id of STEP_IDS) on[id] = { id, on: true, source: 'default' };
        return on;
    }
}

function build() {
    let head = '';
    try {
        head = legacyWarning();
    } catch (e) {
        head = warning(`the check for a pre-plugin install failed (${e && e.message}). ${FIX}`);
    }
    const cwd = sessionCwd();
    // The one resolver read, before any effect. A failed lookup leaves every
    // step on, as before the steps existed.
    const states = resolveSteps(cwd);
    let ttl = '';
    if (states['cache-ttl'].on || states['cache-ttl'].source === SOURCE_ALIAS) {
        try {
            ttl = cacheTtlWarning(cwd, !states['cache-ttl'].on);
        } catch (e) { /* a failed check yields no warning */ }
    }
    let model = [];
    if (states['main-model'].on) {
        try {
            model = mainModelLines(cwd);
        } catch (e) { /* a failed check yields no lines */ }
    }
    let autoUpdate = [];
    if (states['marketplace-autoupdate'].on) {
        try {
            autoUpdate = autoUpdateLines();
        } catch (e) { /* a failed check yields no lines */ }
    }
    const parts = states['session-instructions'].on ? SECTIONS.map(readSection) : [];
    parts.unshift(...autoUpdate);
    parts.unshift(...model);
    if (ttl) parts.unshift(ttl);
    if (head) parts.unshift(head);
    return parts.length > 0 ? parts.join('\n\n---\n\n') + '\n' : '';
}

function emit(context) {
    if (context === '') return;   // nothing to say: print nothing
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
    }));
}

try {
    emit(build());
} catch (e) {
    try {
        emit(notice(`the instruction sections could not be loaded (${e && e.message}).`) + '\n');
    } catch (e2) { /* nothing more can be safely written */ }
}
process.exitCode = 0;
