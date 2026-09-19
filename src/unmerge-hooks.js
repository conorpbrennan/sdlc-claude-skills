// Remove this project's hooks from a Claude Code settings.json file.
// Usage: node unmerge-hooks.js <settings-path> <hooks-config-path>
//
// The inverse of merge-hooks.js, but deliberately narrower: merge-hooks.js
// replaces the whole `hooks` key, whereas this removes only the entries
// whose command names a hook script listed in <hooks-config-path>. Hooks the
// user added from elsewhere survive an uninstall. Matcher groups and event
// keys left empty are dropped, and an empty `hooks` object is removed
// entirely.
const fs = require('fs');

const [, , settingsPath, hooksConfigPath] = process.argv;
if (!settingsPath || !hooksConfigPath) {
    console.error('Usage: node unmerge-hooks.js <settings-path> <hooks-config-path>');
    process.exit(1);
}

if (!fs.existsSync(settingsPath)) {
    console.log('  No settings.json at ' + settingsPath + ' - nothing to remove');
    process.exit(0);
}

// Both parses are guarded and both fail before anything is written: an
// uninstall that dies mid-way here would leave settings.json still wiring
// commands to hook files uninstall.sh is about to delete, and a PreToolUse
// command that cannot run is a non-blocking error -- the commit gates would
// stop gating silently.
function readJson(path, what) {
    try {
        return JSON.parse(fs.readFileSync(path, 'utf-8'));
    } catch (e) {
        console.error('  ' + what + ' is not valid JSON (' + path + '): ' + e.message);
        console.error('  Fix it and re-run; nothing has been changed.');
        process.exit(1);
    }
}

const hooksConfig = readJson(hooksConfigPath, 'hooks-config.json');

// Collect the basenames this project owns, e.g. "pre-commit-review.js".
const owned = new Set();
for (const groups of Object.values(hooksConfig)) {
    for (const group of groups || []) {
        for (const hook of group.hooks || []) {
            const m = String(hook.command || '').match(/([\w.-]+\.js)/g);
            for (const name of m || []) owned.add(name);
        }
    }
}

if (owned.size === 0) {
    console.error('  hooks-config.json named no .js hooks - refusing to guess');
    process.exit(1);
}

const settings = readJson(settingsPath, 'settings.json');
if (!settings.hooks) {
    console.log('  settings.json has no hooks section - nothing to remove');
    process.exit(0);
}

const isOurs = (hook) => {
    const cmd = String(hook.command || '');
    return [...owned].some((name) => cmd.includes(name));
};

let removed = 0;
for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) continue;
    const keptGroups = [];
    for (const group of groups) {
        const kept = (group.hooks || []).filter((h) => {
            if (isOurs(h)) { removed++; return false; }
            return true;
        });
        if (kept.length > 0) keptGroups.push({ ...group, hooks: kept });
    }
    if (keptGroups.length > 0) settings.hooks[event] = keptGroups;
    else delete settings.hooks[event];
}

if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

if (removed === 0) {
    console.log('  No hooks from this project found in settings.json');
    process.exit(0);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const backupPath = settingsPath + '.backup.' + timestamp;
fs.copyFileSync(settingsPath, backupPath);
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log('  Removed ' + removed + ' hook entr' + (removed === 1 ? 'y' : 'ies') + ' from ' + settingsPath);
console.log('  Backup saved to ' + backupPath);
