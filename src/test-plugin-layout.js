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

// The `name:` value from a markdown file's leading frontmatter block, or null
// when the file has no frontmatter or the block has no name.
function frontmatterName(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf-8');
    } catch (e) {
        return null;
    }
    const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    if (!block) return null;
    const m = /^name:[ \t]*(.+?)[ \t]*$/m.exec(block[1]);
    return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

// A directory's entries. A missing directory is empty; any other read error
// comes back as one sentinel entry naming the error, so the assertion that
// reads it fails visibly instead of seeing an empty directory.
function listDir(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        return [{ name: `UNREADABLE (${e.code})`, isDirectory: () => false, isFile: () => false }];
    }
}

// Every file under dir, recursively, as paths relative to ROOT.
function walk(dir) {
    const out = [];
    for (const entry of listDir(dir)) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else out.push(path.relative(ROOT, full));
    }
    return out;
}

const SKILLS_DIR = path.join(ROOT, 'skills');
const AGENTS_DIR = path.join(ROOT, 'agents');

console.log('\nSkills at the plugin layout paths:');
const skillDirs = listDir(SKILLS_DIR).filter(e => e.isDirectory()).map(e => e.name).sort();
assert('skills/ holds the three shipped skills', skillDirs,
    ['code-review-implementer', 'code-review-pre-commit', 'plan-spec']);
for (const dir of skillDirs) {
    assert(`skills/${dir}/SKILL.md name matches its directory`,
        frontmatterName(path.join(SKILLS_DIR, dir, 'SKILL.md')), dir);
}

console.log('\nAgents at the plugin layout paths:');
const agentFiles = listDir(AGENTS_DIR)
    .filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name).sort();
assert('agents/ holds the two review agents', agentFiles,
    ['code-reviewer-deep.md', 'code-reviewer.md']);
for (const file of agentFiles) {
    const name = frontmatterName(path.join(AGENTS_DIR, file));
    assert(`agents/${file} has a name`, typeof name === 'string' && name.length > 0, true);
}

console.log('\nNothing left at the old paths:');
// Only a missing directory reads as empty; any other read error (here
// ENOTDIR, from a regular file) must surface, or an unreadable old path
// would pass the emptiness checks below.
assert('listDir of a missing path is empty',
    listDir(path.join(ROOT, 'no-such-dir-for-test-plugin-layout')), []);
assert('listDir does not report an unreadable path as empty',
    walk(PLUGIN_JSON).length > 0, true);
assert('nothing remains under .claude/skills/', walk(path.join(ROOT, '.claude', 'skills')), []);
assert('nothing remains under .claude/agents/', walk(path.join(ROOT, '.claude', 'agents')), []);
// A concrete path, not the `.claude/skills/*` glob that check_citations.py and
// its shapes fixture quote as an example of a non-citation. Bytecode caches
// are gitignored build output, not text anyone reads.
const OLD_SKILL_PATH = /\.claude\/skills\/[A-Za-z0-9_.-]/;
const staleRefs = walk(SKILLS_DIR).filter(rel => {
    if (rel.split(path.sep).includes('__pycache__')) return false;
    try {
        return OLD_SKILL_PATH.test(fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
    } catch (e) {
        return true;
    }
});
assert('no text under skills/ names a .claude/skills/ path', staleRefs, []);

console.log(`\n===================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
