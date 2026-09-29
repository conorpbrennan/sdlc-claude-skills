// Remove this project's hooks from a Claude Code settings.json file.
// Usage: node unmerge-hooks.js <settings-path> <hooks-config-path>
//
// The inverse of merge-hooks.js: removes only the entries whose command
// names a hook script listed in <hooks-config-path> (lib/hook-ownership.js).
// Hooks the user added from elsewhere survive an uninstall. Matcher groups
// and event keys left empty are dropped, and an empty `hooks` object is
// removed entirely.
const fs = require('fs');
const { ownedScripts, stripOwned } = require('./lib/hook-ownership');

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

const owned = ownedScripts(hooksConfig);

if (owned.size === 0) {
    console.error('  hooks-config.json named no .js hooks - refusing to guess');
    process.exit(1);
}

const settings = readJson(settingsPath, 'settings.json');
if (!settings.hooks) {
    console.log('  settings.json has no hooks section - nothing to remove');
    process.exit(0);
}

const stripped = stripOwned(settings.hooks, owned);
const removed = stripped.removed;
if (stripped.hooks) settings.hooks = stripped.hooks;
else delete settings.hooks;

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
