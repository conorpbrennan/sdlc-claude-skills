// Tests for the plugin and marketplace layout: the manifests, the hook wiring
// in hooks/hooks.json against a frozen copy of the expected wiring, the
// retired installer's absence, and the instruction sections under instructions/.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLUGIN_JSON = path.join(ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_JSON = path.join(ROOT, '.claude-plugin', 'marketplace.json');
const PLUGIN_HOOKS = path.join(ROOT, 'hooks', 'hooks.json');
const LEGACY_HOOKS = path.join(ROOT, 'legacy', 'hooks-config.json');

const PLUGIN_PREFIX = 'node "${CLAUDE_PLUGIN_ROOT}/src/hooks/';
const INSTRUCTIONS_TIMEOUT = 5;  // seconds

// The wiring hooks/hooks.json must carry, frozen here so the check needs no
// other file: event -> blocks of { matcher, hooks: [[type, script, timeout]] },
// in order, since order decides which block wins. A null matcher means the
// block has no matcher key. It is the legacy install's wiring plus the
// instructions hook in its own SessionStart block ahead of the feature hook.
// The other timeouts are copied verbatim from the legacy wiring.
const EXPECTED_WIRING = {
    SessionStart: [
        { matcher: null, hooks: [['command', 'session-start-instructions.js', INSTRUCTIONS_TIMEOUT]] },
        { matcher: null, hooks: [['command', 'session-start-feature.js', 2000]] },
    ],
    UserPromptSubmit: [
        { matcher: '', hooks: [['command', 'enforce-review-implementer.js', 1000]] },
    ],
    PreToolUse: [
        {
            matcher: 'Bash', hooks: [
                ['command', 'pre-commit-feature.js', 3000],
                ['command', 'pre-commit-review.js', 2000],
                ['command', 'pending-review-gate.js', 2000],
                ['command', 'enforce-co-author.js', 1000],
                ['command', 'pre-commit-hygiene.js', 200000],
            ],
        },
    ],
    PostToolUse: [
        {
            matcher: 'Bash', hooks: [
                ['command', 'post-commit-notify.js', 10000],
                ['command', 'claude-attribution-note.js', 5000],
                ['command', 'post-commit-feature.js', 3000],
            ],
        },
    ],
};
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

console.log('\nThe wiring matches its frozen copy:');
if (hooksByEvent) {
    const actual = wiring(hooksByEvent, PLUGIN_PREFIX);
    assert('same events in the same order', Object.keys(actual), Object.keys(EXPECTED_WIRING));
    for (const event of Object.keys(EXPECTED_WIRING)) {
        assert(`${event}: matchers, scripts, order and timeouts`, actual[event], EXPECTED_WIRING[event]);
    }
} else {
    assert('wiring comparable (hooks.json parsed)', false, true);
}

console.log('\nThe retired installer is gone; its wiring is kept for uninstall.sh:');
for (const rel of ['src/merge-hooks.js', 'src/merge-claude-md.js', 'src/test-merge-hooks.js',
    'src/test-merge-claude-md.js', '.claude/hooks-config.json']) {
    assert(`${rel} is gone`, fs.existsSync(path.join(ROOT, rel)), false);
}
const shellScripts = dir => listDir(path.join(ROOT, dir))
    .filter(e => e.isFile() && e.name.endsWith('.sh')).map(e => e.name).sort();
assert('the only shell script at the root is uninstall.sh', shellScripts('.'), ['uninstall.sh']);
// No installer logic left in src/: a shell script there is a test, never a tool.
assert('the only shell scripts in src/ are test-*.sh files',
    shellScripts('src').filter(n => !n.startsWith('test-')), []);
// The docs name the live wiring, hooks/hooks.json; the old file is mentioned
// only at its legacy/ path.
for (const doc of ['README.md', 'CLAUDE.md']) {
    let text = '';
    try {
        text = fs.readFileSync(path.join(ROOT, doc), 'utf-8');
    } catch (e) { /* text stays empty; the assertion below still runs */ }
    const stale = text.split('\n').map((line, i) => [i + 1, line])
        .filter(([, line]) => line.replace(/legacy\/hooks-config\.json/g, '').includes('hooks-config.json'))
        .map(([n]) => `${doc}:${n}`);
    assert(`${doc} names hooks-config.json only as legacy/hooks-config.json`, stale, []);
}
// README's Update section gives both steps, in order, then the restart.
{
    let readme = '';
    try {
        readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
    } catch (e) { /* readme stays empty; the assertions below report it */ }
    const update = (/^### Update\n([\s\S]*?)^### /m.exec(readme) || [])[1] || '';
    for (const [form, market, plugin] of [
        ['slash', '/plugin marketplace update sdlc-claude-skills', '/plugin update sdlc@sdlc-claude-skills'],
        ['shell', 'claude plugin marketplace update sdlc-claude-skills', 'claude plugin update sdlc@sdlc-claude-skills'],
    ]) {
        const m = update.indexOf(market);
        const p = update.indexOf(plugin);
        assert(`Update (${form}): marketplace update, then plugin update`, m >= 0 && p > m, true);
    }
    assert('Update: says to restart Claude Code', /restart Claude Code/i.test(update), true);
}
const legacy = readJson('legacy/hooks-config.json', LEGACY_HOOKS);
// Every script the legacy wiring names is one the plugin wires too, so the
// session-start legacy check and uninstall.sh look for the right names.
const LEGACY_COMMAND = /^node "\$HOME\/\.claude\/hooks\/([A-Za-z0-9._-]+\.js)"$/;
const legacyScripts = Object.values(legacy || {})
    .flatMap(blocks => blocks.flatMap(b => b.hooks.map(h => (LEGACY_COMMAND.exec(h.command) || [])[1] || h.command)));
const pluginScripts = Object.values(EXPECTED_WIRING).flatMap(blocks => blocks.flatMap(b => b.hooks.map(h => h[1])));
assert('the legacy wiring names scripts', legacyScripts.length > 0, true);
assert('the plugin wires every legacy script', legacyScripts.filter(s => !pluginScripts.includes(s)), []);

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

// The string literals in JavaScript source, as { line, value } with simple
// escapes decoded. Comments and regex literals are skipped; a template's
// ${...} code is lexed in turn, so a literal inside it is found too. `ok` is
// false when the source ends inside a literal or comment, which means the
// lexer misread the file and its result cannot be trusted.
function jsStringLiterals(src) {
    const out = [];
    let i = 0;
    let line = 1;
    let prev = '';  // last significant code character, for regex detection
    const decode = s => s.replace(/\\(.)/g, (m, c) =>
        ({ n: '\n', t: '\t', r: '\r' }[c] !== undefined ? { n: '\n', t: '\t', r: '\r' }[c] : c));
    const REGEX_AFTER = '(,=:[!&|?{};+-*%<>~^';

    // Lex code until an unmatched `}` (inside a template) or the end.
    function code(inTemplate) {
        let depth = 0;
        while (i < src.length) {
            const c = src[i];
            const n = src[i + 1];
            if (c === '\n') { line++; i++; continue; }
            if (/\s/.test(c)) { i++; continue; }
            if (c === '/' && n === '/') {
                while (i < src.length && src[i] !== '\n') i++;
                continue;
            }
            if (c === '/' && n === '*') {
                const end = src.indexOf('*/', i + 2);
                if (end === -1) return false;
                line += (src.slice(i, end).match(/\n/g) || []).length;
                i = end + 2;
                continue;
            }
            if (c === '\'' || c === '"') {
                const start = line;
                let j = i + 1;
                while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
                if (src[j] !== c) return false;
                out.push({ line: start, value: decode(src.slice(i + 1, j)) });
                i = j + 1;
                prev = c;
                continue;
            }
            if (c === '`') {
                if (!template()) return false;
                prev = '`';
                continue;
            }
            if (c === '/' && (prev === '' || REGEX_AFTER.includes(prev) ||
                /\b(return|typeof|case)$/.test(src.slice(Math.max(0, i - 12), i).trimEnd()))) {
                let j = i + 1;
                let inClass = false;
                while (j < src.length && src[j] !== '\n') {
                    if (src[j] === '\\') { j += 2; continue; }
                    if (src[j] === '[') inClass = true;
                    else if (src[j] === ']') inClass = false;
                    else if (src[j] === '/' && !inClass) break;
                    j++;
                }
                if (src[j] !== '/') return false;
                i = j + 1;
                prev = 'r';
                continue;
            }
            if (inTemplate && c === '{') depth++;
            if (inTemplate && c === '}') {
                if (depth === 0) { i++; return true; }
                depth--;
            }
            prev = c;
            i++;
        }
        return !inTemplate;
    }

    // Lex a template literal starting at its backtick.
    function template() {
        const start = line;
        let value = '';
        i++;
        while (i < src.length) {
            const c = src[i];
            if (c === '\\') { value += src.slice(i, i + 2); i += 2; continue; }
            if (c === '`') { i++; out.push({ line: start, value: decode(value) }); return true; }
            if (c === '$' && src[i + 1] === '{') {
                i += 2;
                if (!code(true)) return false;
                value += '${}';
                continue;
            }
            if (c === '\n') line++;
            value += c;
            i++;
        }
        return false;
    }

    const ok = code(false);
    return { ok, literals: out };
}

console.log('\nThe literal scanner itself:');
{
    const sample = [
        "// a comment's quote: '/feature'",
        "const re = /['\"]/g; const half = a / 2; const b = c / d;",
        "/* block 'x' */ const s = 'one' + \"two\\n\" + `t ${f('inner')} end`;",
    ].join('\n');
    const r = jsStringLiterals(sample);
    assert('scanner lexes the sample to the end', r.ok, true);
    assert('scanner finds literals, not comments or regexes',
        r.literals.map(l => l.value), ['one', 'two\n', 'inner', 't ${} end']);
    assert('scanner reports an unterminated literal', jsStringLiterals("x = 'open").ok, false);
}

console.log('\nOne owner for the plugin name:');
let names = null;
try {
    names = require('./hooks/lib/plugin-names.js');
    assert('src/hooks/lib/plugin-names.js loads', true, true);
} catch (e) {
    assert('src/hooks/lib/plugin-names.js loads', e.message, 'module present');
}
assert('PLUGIN matches plugin.json', names && names.PLUGIN, plugin && plugin.name);
assert('cmd() builds a namespaced slash command', names && names.cmd('feature-new'), '/sdlc:feature-new');
assert('agent() builds a namespaced agent name', names && names.agent('code-reviewer'), 'sdlc:code-reviewer');
assert('skill() builds a namespaced skill name', names && names.skill && names.skill('code-review-implementer'),
    'sdlc:code-review-implementer');

// Hook source: every non-test script, and the libraries it loads.
const HOOKS_DIR = path.join(ROOT, 'src', 'hooks');
const hookSources = [
    ...listDir(HOOKS_DIR).filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('test-'))
        .map(e => path.join('src', 'hooks', e.name)),
    ...listDir(path.join(HOOKS_DIR, 'lib')).filter(e => e.isFile() && e.name.endsWith('.js'))
        .map(e => path.join('src', 'hooks', 'lib', e.name)),
].sort();
const hookLiterals = {};
for (const rel of hookSources) {
    const r = jsStringLiterals(fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
    assert(`scanner lexes ${rel} to the end`, r.ok, true);
    hookLiterals[rel] = r.literals;
}
assert('scanner sees the review block message',
    (hookLiterals[path.join('src', 'hooks', 'pre-commit-review.js')] || [])
        .some(l => l.value.includes('PRE_COMMIT_REVIEW')), true);

const spellsPlugin = hookSources
    .filter(rel => rel !== path.join('src', 'hooks', 'lib', 'plugin-names.js'))
    .flatMap(rel => hookLiterals[rel].filter(l => l.value.includes('sdlc:')).map(l => `${rel}:${l.line}`));
assert('no hook literal outside plugin-names.js spells sdlc:', spellsPlugin, []);

console.log('\nEvery name Claude is told to invoke is namespaced:');
// A slash command or skill named bare: `/feature-new`, but not
// `/sdlc:feature-new` or a path such as `skills/plan-spec/`.
const BARE_INVOCATION = /(^|[^:a-z])\/(feature|feature-new|code-review-pre-commit|code-review-implementer|commit-prep|review-timing|plan-spec)\b/m;
const SUBAGENT_VALUE = /subagent_type:\s*"([^"]+)"/g;
const SKILL_VALUE = /skill:\s*"([^"]+)"/g;
const BUILT_IN_AGENTS = ['general-purpose'];
// Fixtures quote bare names as input data, tests assert on hook output, and
// check_citations.py names one as an example of a non-citation.
const ALLOWLISTED_PREFIXES = ['skills/plan-spec/fixtures/', 'src/hooks/test-'];
const ALLOWLISTED_LINES = [['skills/plan-spec/check_citations.py', 'slash commands (`/feature-new`)']];

assert('BARE_INVOCATION catches a bare command', BARE_INVOCATION.test('run `/feature-new x`'), true);
assert('BARE_INVOCATION passes a namespaced command', BARE_INVOCATION.test('run `/sdlc:feature-new x`'), false);
assert('BARE_INVOCATION passes a path', BARE_INVOCATION.test('see skills/plan-spec/SKILL.md'), false);

const invocable = new Set([
    ...listDir(AGENTS_DIR).filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name.slice(0, -3)),
    ...listDir(SKILLS_DIR).filter(e => e.isDirectory()).map(e => e.name),
    ...listDir(path.join(ROOT, 'commands')).filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => e.name.slice(0, -3)),
]);
const PLUGIN_NAME = (plugin && plugin.name) || 'sdlc';
function dispatchOk(value) {
    if (BUILT_IN_AGENTS.includes(value)) return true;
    const prefix = PLUGIN_NAME + ':';
    return value.startsWith(prefix) && invocable.has(value.slice(prefix.length));
}
const allowlisted = (rel, text) => ALLOWLISTED_PREFIXES.some(p => rel.startsWith(p)) ||
    ALLOWLISTED_LINES.some(([file, needle]) => rel === file && text.includes(needle));

const bareHits = [];
const badDispatch = [];
// One unit of scanned text: a hook literal, or a whole markdown/script file.
function scanText(rel, firstLine, text) {
    text.split('\n').forEach((lineText, k) => {
        if (BARE_INVOCATION.test(lineText) && !allowlisted(rel, lineText)) {
            bareHits.push(`${rel}:${firstLine + k}: ${lineText.trim().slice(0, 100)}`);
        }
    });
    for (const re of [SUBAGENT_VALUE, SKILL_VALUE]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
            const at = firstLine + (text.slice(0, m.index).match(/\n/g) || []).length;
            if (!dispatchOk(m[1]) && !allowlisted(rel, m[0])) badDispatch.push(`${rel}:${at}: ${m[0]}`);
        }
    }
}
for (const rel of hookSources) {
    for (const l of hookLiterals[rel]) scanText(rel, l.line, l.value);
}
const SNIPPETS = listDir(path.join(ROOT, 'instructions'))
    .filter(e => e.isFile() && e.name.endsWith('.md')).map(e => path.join('instructions', e.name));
assert('the snippets are found', SNIPPETS.length > 0, true);
const textFiles = [
    ...walk(SKILLS_DIR), ...walk(path.join(ROOT, 'commands')), ...walk(AGENTS_DIR), ...SNIPPETS,
].filter(rel => !rel.split(path.sep).includes('__pycache__')).sort();
for (const rel of textFiles) {
    scanText(rel.split(path.sep).join('/'), 1, fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
}
assert('no bare slash command or skill name outside the allowlist', bareHits, []);

console.log('\nNothing the plugin runs assumes the toolchain lives in ~/.claude/:');
// The toolchain ships in the plugin, wherever Claude Code put it. User data
// (the timing log, tdd-mandate.json, review-policy.json, hygiene-repos.json)
// stays in ~/.claude/ and is not matched: only hooks/ and tools/ are.
const TOOLCHAIN_HOME = /(\$HOME|~)\/\.claude\/(hooks|tools)\b/;
assert('TOOLCHAIN_HOME catches a deployed hook path',
    TOOLCHAIN_HOME.test('node "$HOME/.claude/hooks/timing-log.js"'), true);
assert('TOOLCHAIN_HOME catches a deployed tool path',
    TOOLCHAIN_HOME.test('`~/.claude/tools/analyze-review-timing.py`'), true);
assert('TOOLCHAIN_HOME passes user data in ~/.claude/',
    TOOLCHAIN_HOME.test('`~/.claude/code-review-timing.jsonl` and ~/.claude/tdd-mandate.json'), false);
const toolchainHits = [];
for (const rel of [...textFiles, ...hookSources]) {
    fs.readFileSync(path.join(ROOT, rel), 'utf-8').split('\n').forEach((lineText, k) => {
        if (TOOLCHAIN_HOME.test(lineText)) {
            toolchainHits.push(`${rel.split(path.sep).join('/')}:${k + 1}: ${lineText.trim().slice(0, 100)}`);
        }
    });
}
assert('no ~/.claude/hooks or ~/.claude/tools path under skills, commands, agents, instructions or hooks',
    toolchainHits, []);
assert('every subagent_type and skill value is namespaced or built in', badDispatch, []);

console.log('\nThe instruction sections ship in instructions/:');
assert('instructions/ holds the four snippets',
    SNIPPETS.map(rel => path.basename(rel)).sort(),
    ['claude-md-snippet.md', 'feature-workflow-snippet.md', 'hygiene-snippet.md', 'tdd-mandate-snippet.md']);
assert('no snippet remains under .claude/',
    listDir(path.join(ROOT, '.claude')).filter(e => e.name.endsWith('snippet.md')).map(e => e.name), []);

console.log(`\n===================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
