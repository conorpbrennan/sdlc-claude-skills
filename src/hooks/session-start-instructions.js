// SessionStart hook (plugin only): inject the four instruction sections that
// install.sh used to merge into ~/.claude/CLAUDE.md, read from the plugin's
// instructions/ directory, as additionalContext.
//
// Contract:
//   - stdout carries exactly one JSON object, and nothing else.
//   - Always exits 0. A missing or unreadable section is replaced by a
//     one-line notice; any other failure yields a minimal object with a notice.
//   - Fixed order, no environment input: the same tree gives the same output.
//   - Self-contained (no requires beyond node built-ins), so the test can run
//     a copy of it against a scratch instructions/ directory.

const fs = require('fs');
const path = require('path');

const INSTRUCTIONS_DIR = path.join(__dirname, '..', '..', 'instructions');

// Review triggers, feature tracking, hygiene, TDD mandate.
const SECTIONS = [
    'claude-md-snippet.md',
    'feature-workflow-snippet.md',
    'hygiene-snippet.md',
    'tdd-mandate-snippet.md',
];

// install.sh's merge wraps each section in these; the sources carry none
// today, so this is defensive.
const SENTINEL = /^[ \t]*<!--\s*sdlc-claude-skills:[^>]*-->[ \t]*\r?\n?/gm;

function notice(text) {
    return `> sdlc plugin: ${text.replace(/\s+/g, ' ').trim()}`;
}

function readSection(name) {
    try {
        return fs.readFileSync(path.join(INSTRUCTIONS_DIR, name), 'utf-8')
            .replace(SENTINEL, '')
            .trim();
    } catch (e) {
        return notice(`instructions/${name} could not be read (${e.code || e.message}); that section is missing this session.`);
    }
}

function build() {
    return SECTIONS.map(readSection).join('\n\n---\n\n') + '\n';
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
