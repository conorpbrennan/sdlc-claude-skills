// Merges hooks configuration into a Claude Code settings.json file
// Usage: node merge-hooks.js <settings-path> <hooks-config-path>
//
// - Removes this project's existing entries (lib/hook-ownership.js), then
//   appends the config's matcher groups to each event. Hooks the user added
//   themselves or took from another project are kept, and a re-run replaces
//   our entries rather than duplicating them.
// - Preserves all other settings (apiKeyHelper, env, model, etc.)
// - Creates a timestamped byte-for-byte backup before writing
// - Refuses to touch a settings.json that will not parse
const fs = require('fs');
const { ownedScripts, stripOwned } = require('./lib/hook-ownership');

const settingsPath = process.argv[2];
const hooksConfigPath = process.argv[3];

if (!settingsPath || !hooksConfigPath) {
    console.error('Usage: node merge-hooks.js <settings-path> <hooks-config-path>');
    process.exit(1);
}

// Guarded like unmerge-hooks.js: overwriting an unparseable settings.json
// with `{}` plus our hooks would throw away everything the user had.
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

const exists = fs.existsSync(settingsPath);
const settings = exists ? readJson(settingsPath, 'settings.json') : {};

const hooks = stripOwned(settings.hooks, owned).hooks || {};
for (const [event, groups] of Object.entries(hooksConfig)) {
    hooks[event] = [...(hooks[event] || []), ...groups];
}
settings.hooks = hooks;

const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const backupPath = settingsPath + '.backup.' + timestamp;
if (exists) fs.copyFileSync(settingsPath, backupPath);
else fs.writeFileSync(backupPath, '{}\n');

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log('Hooks merged into ' + settingsPath);
console.log('Backup saved to ' + backupPath);
