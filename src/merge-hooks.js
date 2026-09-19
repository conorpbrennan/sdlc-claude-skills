// Merges hooks configuration into a Claude Code settings.json file
// Usage: node merge-hooks.js <settings-path> <hooks-config-path>
//
// - Replaces the "hooks" section with the provided config
// - Preserves all other settings (apiKeyHelper, env, model, etc.)
// - Creates a timestamped backup before writing
const fs = require('fs');
const path = require('path');

const settingsPath = process.argv[2];
const hooksConfigPath = process.argv[3];

if (!settingsPath || !hooksConfigPath) {
    console.error('Usage: node merge-hooks.js <settings-path> <hooks-config-path>');
    process.exit(1);
}

const hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf-8'));

let settings = {};
if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const backupPath = settingsPath + '.backup.' + timestamp;
fs.writeFileSync(backupPath, JSON.stringify(settings, null, 2));

settings.hooks = hooksConfig;

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log('Hooks merged into ' + settingsPath);
console.log('Backup saved to ' + backupPath);
