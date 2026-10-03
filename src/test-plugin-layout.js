// Tests for the plugin and marketplace layout: the manifests, and hook wiring
// in hooks/hooks.json that matches install.sh's .claude/hooks-config.json.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLUGIN_JSON = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const PLUGIN_HOOKS = path.join(ROOT, 'hooks', 'hooks.json');
const LEGACY_HOOKS = path.join(ROOT, '.claude', 'hooks-config.json');

const PLUGIN_PREFIX = 'node "${CLAUDE_PLUGIN_ROOT}/src/hooks/';
const LEGACY_PREFIX = 'node "$HOME/.claude/hooks/';
const PLUGIN_COMMAND = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/src\/hooks\/([A-Za-z0-9._-]+\.js)"$/;

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr === expectedStr) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        console.log(`    expected: ${expectedStr}`);
        console.log(`    actual:   ${actualStr}`);
        failed++;
    }
}

// Parse a JSON file, recording a failure (not throwing) when it is missing
// or malformed, so one absent file does not hide the other results.
function readJson(name, file) {
    try {
        const value = JSON.parse(fs.readFileSync(file, 'utf-8'));
        assert(`${name} parses`, true, true);
        return value;
    } catch (e) {
        assert(`${name} parses`, e.message, 'valid JSON');
        return null;
    }
}

// Reduce a hooks map to event -> [{matcher, hooks: [[type, script, timeout]]}],
// keeping block and hook order, since order decides which block wins. A
// missing matcher is kept distinct from "" so the translation stays literal.
function wiring(hooksByEvent, prefix) {
    const out = {};
    for (const [event, blocks] of Object.entries(hooksByEvent)) {
        out[event] = blocks.map(block => ({
            matcher: 'matcher' in block ? block.matcher : null,
            hooks: block.hooks.map(h => [
                h.type,
                h.command.startsWith(prefix)
                    ? h.command.slice(prefix.length).replace(/"$/, '')
                    : `UNPREFIXED: ${h.command}`,
                h.timeout,
            ]),
        }));
    }
    return out;
}

console.log('plugin layout tests');
console.log('===================');

console.log('\nManifests:');
const plugin = readJson('plugin.json', PLUGIN_JSON);
assert('plugin name is sdlc', plugin && plugin.name, 'sdlc');
assert('plugin has no version field', plugin && 'version' in plugin, false);

const marketplace = readJson('marketplace.json', MARKETPLACE_JSON);
assert('marketplace name is sdlc-claude-skills', marketplace && marketplace.name, 'sdlc-claude-skills');
assert('marketplace lists sdlc from the repo root',
    marketplace && marketplace.plugins, [{ name: 'sdlc', source: './' }]);

console.log('\nHook commands:');
const pluginHooks = readJson('hooks/hooks.json', PLUGIN_HOOKS);
const hooksByEvent = pluginHooks && pluginHooks.hooks;
assert('hooks.json has a top-level hooks object',
    hooksByEvent !== null && typeof hooksByEvent === 'object', true);
let commandCount = 0;
for (const blocks of Object.values(hooksByEvent || {})) {
    for (const block of blocks) {
        for (const h of block.hooks) {
            commandCount++;
            const m = PLUGIN_COMMAND.exec(h.command);
            assert(`command form: ${h.command}`, m !== null, true);
            if (m) {
                assert(`script exists: src/hooks/${m[1]}`,
                    fs.existsSync(path.join(ROOT, 'src', 'hooks', m[1])), true);
            }
        }
    }
}
assert('hooks.json declares at least one command', commandCount > 0, true);

console.log('\nParity with .claude/hooks-config.json:');
const legacy = readJson('.claude/hooks-config.json', LEGACY_HOOKS);
if (legacy && hooksByEvent) {
    const expected = wiring(legacy, LEGACY_PREFIX);
    const actual = wiring(hooksByEvent, PLUGIN_PREFIX);
    assert('same events in the same order', Object.keys(actual), Object.keys(expected));
    for (const event of Object.keys(expected)) {
        assert(`${event}: matchers, scripts, order and timeouts`, actual[event], expected[event]);
    }
} else {
    assert('parity comparable (both files parsed)', false, true);
}

console.log(`\n===================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
