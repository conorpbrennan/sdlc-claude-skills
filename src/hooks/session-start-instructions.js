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
//   - Self-contained (no requires beyond node built-ins), so the test can run
//     a copy of it against a scratch instructions/ directory.

const fs = require('fs');
const os = require('os');
const path = require('path');

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
const CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR';
const OPT_OUT_FILE = 'sdlc-cache-ttl.disabled';
const BACKUP_SUFFIX = '-pre-sdlc-cache-ttl';

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

// The user's Claude Code config directory.
//
// Args:
//     None.
// Returns:
//     CLAUDE_CONFIG_DIR when non-empty, else ~/.claude.
function configDir() {
    const fromEnv = process.env[CONFIG_DIR_ENV];
    return typeof fromEnv === 'string' && fromEnv !== '' ? fromEnv : path.join(os.homedir(), '.claude');
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

// Set "promptCacheTtl": "1h" in the user settings file, keeping every other key.
// An existing file is copied to a timestamped backup first, and the new text goes
// through a temp file in the same directory plus a rename.
//
// Args:
//     dir: The config directory.
// Returns:
//     The settings file path on success, or '' when nothing was written (opt-out
//     file present, file not a JSON object, or any read or write error).
function writeTtlSetting(dir) {
    const target = path.join(dir, SETTINGS_FILE);
    const tmp = `${target}.tmp.${process.pid}`;
    try {
        if (fs.existsSync(path.join(dir, OPT_OUT_FILE))) return '';
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
            fs.copyFileSync(target, `${target}.backup.${stamp}${BACKUP_SUFFIX}`);
        } else {
            fs.mkdirSync(dir, { recursive: true });
        }
        settings[TTL_SETTING] = TTL_1H;
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
// Returns:
//     The line, or ''. No environment value is ever included.
function cacheTtlWarning(cwd) {
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
    const written = writeTtlSetting(dir);
    if (written) {
        return warning(`sdlc set \`"${TTL_SETTING}": "${TTL_1H}"\` in ${written} so the main conversation
            uses the 1-hour prompt cache on this per-token backend. It takes effect from the next
            session; this one stays on 5 minutes. Sub-agents stay on 5 minutes by design. Opt out
            with \`touch ${path.join(dir, OPT_OUT_FILE)}\`. Tell the owner this at the start of the session.`);
    }
    return warning(`the main conversation will use the 5-minute prompt cache on this per-token
        backend, so every wait over 5 minutes re-caches the whole context. Fix: add
        \`export ${TTL_ENV}=${TTL_1H}\` to the shell profile that launches claude, or set
        \`"${TTL_SETTING}": "${TTL_1H}"\` in ~/.claude/settings.json. Sub-agents stay on 5m by design.
        Tell the owner this at the start of the session.`);
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

function build() {
    let head = '';
    try {
        head = legacyWarning();
    } catch (e) {
        head = warning(`the check for a pre-plugin install failed (${e && e.message}). ${FIX}`);
    }
    let ttl = '';
    try {
        ttl = cacheTtlWarning(sessionCwd());
    } catch (e) { /* a failed check yields no warning */ }
    const parts = SECTIONS.map(readSection);
    if (ttl) parts.unshift(ttl);
    if (head) parts.unshift(head);
    return parts.join('\n\n---\n\n') + '\n';
}

function emit(context) {
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
