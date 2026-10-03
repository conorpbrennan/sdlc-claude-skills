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
//   - Fixed order. The only environment input is the home directory, read for
//     the legacy-install check: the same tree and settings give the same output.
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
    const parts = SECTIONS.map(readSection);
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
