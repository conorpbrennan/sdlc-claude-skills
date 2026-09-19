// Tests for merge-claude-md.js (the install side).
//
// Rewritten for the sentinel design. The previous suite was built around the
// heading-matching version and its assertions encoded that model -- "our section
// is the last thing in the file", "our span swallowed the text after it" -- which
// are no longer true and, in the second case, were never desirable. What matters
// now: our block goes in exactly once, an existing copy is replaced or adopted
// rather than duplicated, and nothing the user wrote is touched.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const section = require('./lib/claude-md-section');

const MERGE_SCRIPT = path.join(__dirname, 'merge-claude-md.js');
const TMP_DIR = path.join(__dirname, '..', 'tmp');
const TMP_TARGET = path.join(TMP_DIR, 'test-claude-md.md');
const TMP_SNIPPET = path.join(TMP_DIR, 'test-snippet.md');
const TMP_TWO = path.join(TMP_DIR, 'test-snippet-two.md');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        console.log(`    expected: ${JSON.stringify(expected)}`);
        console.log(`    actual:   ${JSON.stringify(actual)}`);
        failed++;
    }
}

const SECTION_A = '## Section A\n\nBody of section A.\n';
const SECTION_B = '## Section B\n\nBody of section B.\n';
const A_BEGIN = section.beginMark('## Section A');
const A_END = section.endMark('## Section A');

function merge(targetText, snippetText, expectFailure) {
    fs.writeFileSync(TMP_TARGET, targetText);
    fs.writeFileSync(TMP_SNIPPET, snippetText);
    let out = '';
    let err = '';
    let rc = 0;
    try {
        out = execSync(`node "${MERGE_SCRIPT}" "${TMP_TARGET}" "${TMP_SNIPPET}"`, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (e) {
        rc = e.status;
        err = String(e.stderr || '');
        if (!expectFailure) throw e;
    }
    return { text: fs.readFileSync(TMP_TARGET, 'utf-8'), out, err, rc };
}

const count = (text, marker) => text.split(marker).length - 1;
const backupsOf = (f) => fs.readdirSync(TMP_DIR).filter((x) => x.startsWith(path.basename(f) + '.backup.'));
const clearBackups = () => backupsOf(TMP_TARGET).forEach((f) => fs.unlinkSync(path.join(TMP_DIR, f)));

console.log('merge-claude-md tests');
console.log('=====================');

console.log('\nEmpty or missing target:');
let r = merge('', SECTION_A);
assert('creates the file with a wrapped block', count(r.text, A_BEGIN), 1);
assert('block is closed', count(r.text, A_END), 1);
assert('content is there', r.text.includes('Body of section A.'), true);
assert('ends with a newline', r.text.endsWith('\n'), true);

console.log('\nAppending to a file with the user\'s own content:');
r = merge('# User instructions\n\n## My Own Section\n\nSomething I wrote.\n', SECTION_A);
assert('user heading kept', r.text.includes('## My Own Section'), true);
assert('user body kept', r.text.includes('Something I wrote.'), true);
assert('one wrapped block added', count(r.text, A_BEGIN), 1);
assert('separated by a rule', /\n\n---\n\n<!-- sdlc-claude-skills:begin/.test(r.text), true);
assert('reported as appended', /Appended section/.test(r.out), true);
// Every path rewrites the file, so every path keeps a copy -- append included.
assert('backup taken on append too', backupsOf(TMP_TARGET).length, 1);

console.log('\nRe-install replaces in place:');
const installed = r.text;
clearBackups();
r = merge(installed, SECTION_A);
assert('still exactly one block', count(r.text, A_BEGIN), 1);
assert('content unchanged', r.text, installed);
assert('reported as updated', /Updated section/.test(r.out), true);
assert('backup taken on replace', backupsOf(TMP_TARGET).length, 1);

console.log('\nUpdated snippet text replaces the old body:');
clearBackups();
r = merge(installed, '## Section A\n\nA NEW BODY.\n');
assert('new body present', r.text.includes('A NEW BODY.'), true);
assert('old body gone', r.text.includes('Body of section A.'), false);
assert('still one block', count(r.text, A_BEGIN), 1);
assert('user content still there', r.text.includes('Something I wrote.'), true);

console.log('\nTwo different sections coexist:');
fs.writeFileSync(TMP_TWO, SECTION_B);
fs.writeFileSync(TMP_TARGET, installed);
execSync(`node "${MERGE_SCRIPT}" "${TMP_TARGET}" "${TMP_TWO}"`, { encoding: 'utf-8' });
let text = fs.readFileSync(TMP_TARGET, 'utf-8');
assert('A survives', count(text, A_BEGIN), 1);
assert('B added', count(text, section.beginMark('## Section B')), 1);

console.log('\nFour installs do not pile up:');
for (let i = 0; i < 4; i++) {
    fs.writeFileSync(TMP_SNIPPET, SECTION_A);
    execSync(`node "${MERGE_SCRIPT}" "${TMP_TARGET}" "${TMP_SNIPPET}"`, { encoding: 'utf-8' });
    fs.writeFileSync(TMP_SNIPPET, SECTION_B);
    execSync(`node "${MERGE_SCRIPT}" "${TMP_TARGET}" "${TMP_SNIPPET}"`, { encoding: 'utf-8' });
}
text = fs.readFileSync(TMP_TARGET, 'utf-8');
assert('A appears once', count(text, A_BEGIN), 1);
assert('B appears once', count(text, section.beginMark('## Section B')), 1);

console.log('\nAdopting a pre-sentinel copy (an existing install):');
clearBackups();
r = merge('# T\n\n' + SECTION_A.trim() + '\n\n---\n\n## Mine\n\nmy text\n', SECTION_A);
assert('wrapped now', count(r.text, A_BEGIN), 1);
assert('not duplicated', count(r.text, '## Section A'), 1);
assert('reported as adopted', /Adopted existing section/.test(r.out), true);
assert('user section kept', r.text.includes('## Mine'), true);
assert('backup taken', backupsOf(TMP_TARGET).length, 1);

// Several verbatim copies mean we cannot tell the installed one from a quotation
// of it, and deleting the wrong one is unrecoverable. Refuse, as with an
// ambiguous marker pair.
console.log('\nDuplicate pre-sentinel copies are refused, not collapsed:');
const dupTarget = '# T\n\n' + (SECTION_A.trim() + '\n\n').repeat(3) + '## Other\n\nkeep\n';
clearBackups();
r = merge(dupTarget, SECTION_A, true);
assert('exits non-zero', r.rc !== 0, true);
assert('file untouched', r.text, dupTarget);
assert('says how many it found', /contains 3 verbatim copies/.test(r.err), true);
assert('says nothing changed', /none were changed/.test(r.err), true);
assert('no backup written', backupsOf(TMP_TARGET).length, 0);

console.log('\nA single pre-sentinel copy is still adopted:');
clearBackups();
r = merge('# T\n\n' + SECTION_A.trim() + '\n\n## Other\n\nkeep\n', SECTION_A);
assert('wrapped', count(r.text, A_BEGIN), 1);
assert('other section kept', r.text.includes('## Other'), true);

console.log('\nAn edited copy is not replaced silently:');
r = merge('# T\n\n## Section A\n\nI EDITED THIS.\n', SECTION_A);
assert('user edit preserved', r.text.includes('I EDITED THIS.'), true);
assert('a wrapped copy is added', count(r.text, A_BEGIN), 1);
assert('says the text is not ours', /not as text this project wrote/.test(r.out), true);
assert('tells the user what to do', /delete it by hand/.test(r.out), true);

console.log('\nUser text that merely mentions or quotes the heading is untouched:');
for (const [name, target] of [
    ['fenced example', '# T\n\n```markdown\n## Section A\n\nsample\n```\n\nTAIL.\n'],
    ['longer heading', '# T\n\n## Section A Extended\n\nMY BODY.\n'],
    ['mid-sentence mention', '# T\n\nSee ## Section A for details.\n\nMORE.\n'],
    ['unterminated fence', '# T\n\n```md\nnever closed\n'],
    ['CRLF file', '# T\r\n\r\n## Section A Notes\r\n\r\nMY BODY.\r\n'],
]) {
    r = merge(target, SECTION_A);
    // The real claim, asserted byte for byte: the file still STARTS with exactly
    // what the user had. Filtering for interesting-looking lines skipped the
    // prefix headings these cases exist to protect, and would not have caught a
    // whole-file rewrite of blank lines or line endings.
    assert(name + ': original text is an exact prefix', r.text.startsWith(target.replace(/[\r\n]+$/, '')), true);
    assert(name + ': one block added', count(r.text, A_BEGIN), 1);
}

console.log('\nCRLF file keeps CRLF:');
r = merge('# T\r\n\r\n## Mine\r\n\r\nmy text\r\n', SECTION_A);
assert('no lone LF introduced', /(?<!\r)\n/.test(r.text), false);
assert('block present', count(r.text, A_BEGIN), 1);
r = merge(r.text, SECTION_A);
assert('CRLF re-install still one block', count(r.text, A_BEGIN), 1);
assert('CRLF re-install stays CRLF', /(?<!\r)\n/.test(r.text), false);

console.log('\nUnterminated sentinel block is refused, not guessed at:');
const broken = '# T\n\n' + A_BEGIN + '\n## Section A\n\nbody, no end marker\n';
r = merge(broken, SECTION_A, true);
assert('exits non-zero', r.rc !== 0, true);
assert('file untouched', r.text, broken);
assert('names the marker', r.err.includes(A_BEGIN), true);
assert('says why it is ambiguous', /no matching end marker/.test(r.err), true);
assert('says nothing changed', /nothing has been changed/.test(r.err), true);

console.log('\nA second begin marker before the end is refused:');
const realBlock = merge('# Mine\n\n## Keep This\n\nSomething I wrote.\n', SECTION_A).text;
clearBackups();
const forged = 'The marker looks like ' + A_BEGIN + '\n\n' + realBlock;
r = merge(forged, SECTION_A, true);
assert('exits non-zero', r.rc !== 0, true);
assert('file untouched', r.text, forged);
assert('says a second begin was found', /second begin marker/.test(r.err), true);
assert('user text survives', r.text.includes('Something I wrote.'), true);
assert('no backup written', backupsOf(TMP_TARGET).length, 0);

console.log('\nA read error that is not ENOENT must not look like an empty file:');
const asDir = path.join(TMP_DIR, 'test-target-is-a-dir');
if (!fs.existsSync(asDir)) fs.mkdirSync(asDir);
fs.writeFileSync(TMP_SNIPPET, SECTION_A);
let dirRc = 0;
let dirErr = '';
try {
    execSync(`node "${MERGE_SCRIPT}" "${asDir}" "${TMP_SNIPPET}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
    dirRc = e.status;
    dirErr = String(e.stderr || '');
}
assert('exits non-zero', dirRc !== 0, true);
assert('says it could not read', /Could not read/.test(dirErr), true);
assert('did not create a file in its place', fs.statSync(asDir).isDirectory(), true);
fs.rmdirSync(asDir);

console.log('\nSnippet validation:');
r = merge('# T\n', 'No heading here\n', true);
assert('rejects a snippet with no ## heading', r.rc !== 0, true);
r = merge('# T\n', '## One\n\na\n\n## Two\n\nb\n', true);
assert('rejects a snippet with two ## headings', r.rc !== 0, true);

console.log('\nShipped snippets install and are idempotent:');
for (const name of ['claude-md-snippet.md', 'hygiene-snippet.md', 'feature-workflow-snippet.md']) {
    const snippetPath = path.join(__dirname, '..', '.claude', name);
    const snip = fs.readFileSync(snippetPath, 'utf-8').trim();
    const head = snip.split('\n')[0];
    fs.writeFileSync(TMP_TARGET, '# User instructions\n\n## Mine\n\nkeep\n');
    execSync(`node "${MERGE_SCRIPT}" "${TMP_TARGET}" "${snippetPath}"`, { encoding: 'utf-8' });
    const first = fs.readFileSync(TMP_TARGET, 'utf-8');
    execSync(`node "${MERGE_SCRIPT}" "${TMP_TARGET}" "${snippetPath}"`, { encoding: 'utf-8' });
    const again = fs.readFileSync(TMP_TARGET, 'utf-8');
    assert(`${name}: wrapped once`, count(first, section.beginMark(head)), 1);
    assert(`${name}: second install changes nothing`, again, first);
    assert(`${name}: user content kept`, again.includes('## Mine'), true);
}

clearBackups();
[TMP_TARGET, TMP_SNIPPET, TMP_TWO].forEach((p) => { try { fs.unlinkSync(p); } catch {} });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
