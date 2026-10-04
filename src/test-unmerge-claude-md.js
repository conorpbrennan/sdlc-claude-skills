// Tests for unmerge-claude-md.js (the uninstall side).
//
// Rewritten for the sentinel design, like the merge suite. The property that
// matters is unchanged and is the first test below: install then uninstall must
// leave the user's file byte-identical. What changed is that we no longer have to
// prove a heading-matching rule correct against markdown edge cases, because the
// lookup is a literal string search -- so the old fence, prefix-heading and CRLF
// cases appear here only as "this was never ours, do not touch it".
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./hooks/lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const section = require('./lib/claude-md-section');

const UNMERGE_SCRIPT = path.join(__dirname, 'unmerge-claude-md.js');
const MERGE_SCRIPT = path.join(__dirname, '..', 'legacy', 'merge-claude-md.js');
const TMP_DIR = path.join(__dirname, '..', 'tmp');
const TMP_MD = path.join(TMP_DIR, 'test-unmerge-CLAUDE.md');
const TMP_SNIPPET = path.join(TMP_DIR, 'test-unmerge-snippet.md');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  PASS: ${name}`);
        passed++;
    } else {
        console.log(`  FAIL: ${name}`);
        console.log(`    expected: ${e}`);
        console.log(`    actual:   ${a}`);
        failed++;
    }
}

const SNIPPET = '## Ours\n\nour body line\n';
const BEGIN = section.beginMark('## Ours');
const backupsOf = () => fs.readdirSync(TMP_DIR).filter((f) => f.startsWith(path.basename(TMP_MD) + '.backup.'));
const clearBackups = () => backupsOf().forEach((f) => fs.unlinkSync(path.join(TMP_DIR, f)));

function unmerge(targetText, snippetText, expectFailure) {
    fs.writeFileSync(TMP_MD, targetText);
    fs.writeFileSync(TMP_SNIPPET, snippetText || SNIPPET);
    let out = '';
    let err = '';
    let rc = 0;
    try {
        out = execSync(`node "${UNMERGE_SCRIPT}" "${TMP_MD}" "${TMP_SNIPPET}"`, { encoding: 'utf-8', stdio: 'pipe' });
    } catch (e) {
        rc = e.status;
        err = String(e.stderr || '');
        if (!expectFailure) throw e;
    }
    return { text: fs.readFileSync(TMP_MD, 'utf-8'), out, err, rc };
}

function install(targetText, snippetText) {
    fs.writeFileSync(TMP_MD, targetText);
    fs.writeFileSync(TMP_SNIPPET, snippetText || SNIPPET);
    execSync(`node "${MERGE_SCRIPT}" "${TMP_MD}" "${TMP_SNIPPET}"`, { encoding: 'utf-8' });
    // merge backs up on every path; those are not the backups this suite asserts
    // about, so clear them and let each test see only what unmerge wrote.
    clearBackups();
    return fs.readFileSync(TMP_MD, 'utf-8');
}

console.log('unmerge-claude-md tests');
console.log('=======================');

// The property the whole design serves.
console.log('\nRound trip leaves no dent:');
for (const [name, original] of [
    ['plain file', '# User instructions\n\n## My Own Section\n\nSomething I wrote.\n'],
    ['with a fenced example of our section', '# Mine\n\n```markdown\n## Ours\n\nsample\n```\n\nTail text.\n'],
    ['with a heading that starts with ours', '# Mine\n\n## Ours Extended\n\nMy notes.\n'],
    ['with frontmatter', '---\ntitle: mine\n---\n\n## Theirs\n\nTheir text.\n'],
    ['CRLF file', '# Mine\r\n\r\n## My Own Section\r\n\r\nSomething I wrote.\r\n'],
    ['file ending without a newline', '# Mine\n\n## My Own\n\nno trailing newline'],
    // Two blank lines inside a fenced block: PEP 8 between functions, and the
    // fixture that catches any whole-file blank-run normalisation. An earlier
    // version collapsed these and the round trip was not byte-identical.
    ['blank run inside the user\'s fenced code', '# Mine\n\n```python\ndef a():\n    pass\n\n\ndef b():\n    pass\n```\n\nEnd.\n'],
    // Minority line endings in a region we never touch must survive too.
    ['mixed line endings', '# Mine\n\nplain\n\nCRLF region:\r\n\r\n\r\nafter\r\n\nEnd.\n'],
    ['three blank lines between user sections', '# Mine\n\n## A\n\na\n\n\n\n## B\n\nb\n'],
]) {
    const merged = install(original);
    const after = unmerge(merged).text;
    // A file with no trailing newline gains one; compare on that basis.
    const norm = (s) => s.replace(/[\r\n]*$/, '\n');
    assert(name + ': byte-identical after uninstall', norm(after), norm(original));
    clearBackups();
}

console.log('\nRemoval basics:');
let r = unmerge(install('# t\n\n## Keep\n\nkept\n'));
assert('our block gone', r.text.includes(BEGIN), false);
assert('user section intact', r.text.includes('## Keep'), true);
assert('no stranded separator', r.text.includes('---'), false);
assert('reported', /Removed section/.test(r.out), true);
assert('backup written', backupsOf().length, 1);
clearBackups();

console.log('\nIdempotence:');
const merged = install('# t\n\n## Keep\n\nkept\n');
const once = unmerge(merged).text;
const twice = unmerge(once).text;
assert('second run changes nothing', twice, once);
clearBackups();

console.log('\nAbsent section is not an error:');
r = unmerge('## Something Else\n\ncontent\n');
assert('exit 0', r.rc, 0);
assert('file unchanged', r.text, '## Something Else\n\ncontent\n');
assert('says not present', /Section not present/.test(r.out), true);
assert('no backup written', backupsOf().length, 0);

console.log('\nMissing target is not an error:');
if (fs.existsSync(TMP_MD)) fs.unlinkSync(TMP_MD);
fs.writeFileSync(TMP_SNIPPET, SNIPPET);
let rc = 0;
try {
    execSync(`node "${UNMERGE_SCRIPT}" "${TMP_MD}" "${TMP_SNIPPET}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
    rc = e.status;
}
assert('exit 0 when there is nothing to do', rc, 0);

console.log('\nSole section empties the file:');
r = unmerge(install(''));
assert('file emptied', r.text, '');
clearBackups();

console.log('\nOur block between two user sections:');
fs.writeFileSync(TMP_MD, '## Before\n\nkeep me\n\n---\n\n## After\n\nkeep me too\n');
fs.writeFileSync(TMP_SNIPPET, SNIPPET);
execSync(`node "${MERGE_SCRIPT}" "${TMP_MD}" "${TMP_SNIPPET}"`, { encoding: 'utf-8' });
r = unmerge(fs.readFileSync(TMP_MD, 'utf-8'));
assert('preceding section kept', r.text.includes('## Before'), true);
assert('following section kept', r.text.includes('## After'), true);
assert('our body gone', r.text.includes('our body line'), false);
assert('no triple blank run', /\n{3,}/.test(r.text), false);
clearBackups();

console.log('\nPre-sentinel copy is still removed:');
r = unmerge('# t\n\n## Mine\n\nmine\n\n---\n\n' + SNIPPET.trim() + '\n');
assert('removed', r.text.includes('our body line'), false);
assert('reported as pre-sentinel', /pre-sentinel copy/.test(r.out), true);
assert('user content kept', r.text.includes('mine'), true);
assert('separator not stranded', r.text.includes('---'), false);
clearBackups();

console.log('\nText that is not ours is never removed:');
for (const [name, target, mustKeep] of [
    ['fenced example', '# t\n\n```markdown\n## Ours\n\nsample\n```\n\nTAIL.\n', ['sample', 'TAIL.', '```']],
    ['longer heading', '# t\n\n## Ours Extended\n\nMY BODY.\n', ['## Ours Extended', 'MY BODY.']],
    ['mid-sentence mention', '# t\n\nSee ## Ours for details.\n\nMORE.\n', ['See ## Ours for details.', 'MORE.']],
    ['mention ending a line', '# t\n\nNotes on ## Ours\n\nMY BODY.\n', ['Notes on ## Ours', 'MY BODY.']],
    ['deeper heading', '# t\n\n### Ours\n\nMY BODY.\n', ['### Ours', 'MY BODY.']],
    ['tab after the hashes', '# t\n\n##\tOurs\n\nMY BODY.\n', ['MY BODY.']],
    ['nested fences', '# t\n\n````md\n```\n## Ours\n```\n````\n\nTAIL.\n', ['TAIL.', '````']],
    ['unterminated fence', '# t\n\n```md\nnever closed\n\n## Ours\n\nbody\n', ['never closed', 'body']],
    ['edited copy of ours', '# t\n\n## Ours\n\nI EDITED THIS.\n', ['I EDITED THIS.']],
]) {
    r = unmerge(target);
    assert(name + ': file untouched', r.text, target);
    assert(name + ': content kept', mustKeep.every((m) => r.text.includes(m)), true);
    assert(name + ': no backup written', backupsOf().length, 0);
}

console.log('\nA heading present but not as our block is flagged, not removed:');
r = unmerge('# t\n\n## Ours\n\nI EDITED THIS.\n');
assert('says not present', /Section not present/.test(r.out), true);
assert('notes the heading is there', /not as a block/.test(r.out), true);
assert('tells the user it was left alone', /remove it by hand/.test(r.out), true);

console.log('\nUnterminated sentinel block is refused, not guessed at:');
const broken = '# t\n\n' + BEGIN + '\n## Ours\n\nbody, no end marker\n';
r = unmerge(broken, SNIPPET, true);
assert('exits non-zero', r.rc !== 0, true);
assert('file untouched', r.text, broken);
assert('names the marker', r.err.includes(BEGIN), true);
assert('says nothing changed', /nothing has been changed/.test(r.err), true);

console.log('\nDuplicate blocks are all removed:');
const dup = install('# t\n\n## Keep\n\nkept\n');
r = unmerge(dup + '\n' + dup.slice(dup.indexOf(BEGIN)));
assert('no block left', r.text.includes(BEGIN), false);
assert('reports the count', /2 copies/.test(r.out), true);
clearBackups();

console.log('\nBackups do not collide:');
// install() clears its own backups, so removing twice from the same installed
// text is what isolates unmerge's two writes.
const toRemove = install('# run\n\n## Keep\n\nk\n');
unmerge(toRemove);
unmerge(toRemove);
assert('two distinct backup files', backupsOf().length, 2);
clearBackups();

console.log('\nA second begin marker before the end is refused:');
const realBlock = install('# Mine\n\n## Keep This\n\nSomething I wrote.\n');
const forged = 'The marker looks like ' + BEGIN + '\n\n' + realBlock;
r = unmerge(forged, SNIPPET, true);
assert('exits non-zero', r.rc !== 0, true);
assert('file untouched', r.text, forged);
assert('says a second begin was found', /second begin marker/.test(r.err), true);
assert('user text survives', r.text.includes('Something I wrote.'), true);
assert('no backup written', backupsOf().length, 0);

console.log('\nAmbiguous verbatim copies are refused:');
const twoCopies = '# Mine\n\n```markdown\n' + SNIPPET.trim() + '\n```\n\nMY NOTE.\n\n---\n\n' + SNIPPET.trim() + '\n';
r = unmerge(twoCopies, SNIPPET, true);
assert('exits non-zero', r.rc !== 0, true);
assert('file untouched', r.text, twoCopies);
assert('says how many', /contains 2 verbatim copies/.test(r.err), true);
assert('no backup written', backupsOf().length, 0);

console.log('\nNon-UTF-8 target is refused, not mangled:');
const rawBytes = Buffer.from([0x23, 0x20, 0x4d, 0x69, 0x6e, 0x65, 0x0a, 0x0a, 0x43, 0x61, 0x66, 0xe9, 0x0a]);
fs.writeFileSync(TMP_MD, rawBytes);
fs.writeFileSync(TMP_SNIPPET, SNIPPET);
let utfRc = 0;
try {
    execSync(`node "${UNMERGE_SCRIPT}" "${TMP_MD}" "${TMP_SNIPPET}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
    utfRc = e.status;
}
assert('exits non-zero', utfRc !== 0, true);
assert('bytes untouched', Buffer.compare(fs.readFileSync(TMP_MD), rawBytes), 0);

console.log('\nStranded leading rule when our block was first:');
fs.writeFileSync(TMP_MD, '');
fs.writeFileSync(TMP_SNIPPET, SNIPPET);
execSync(`node "${MERGE_SCRIPT}" "${TMP_MD}" "${TMP_SNIPPET}"`, { encoding: 'utf-8' });
clearBackups();
const oursFirst = fs.readFileSync(TMP_MD, 'utf-8').replace(/\n*$/, '') + '\n\n---\n\n## Their\n\ntheir text\n';
r = unmerge(oursFirst);
assert('no rule left at the top', r.text, '## Their\n\ntheir text\n');
clearBackups();

console.log('\nA read error that is not ENOENT must not report success:');
const asDir = path.join(TMP_DIR, 'test-unmerge-target-is-a-dir');
if (!fs.existsSync(asDir)) fs.mkdirSync(asDir);
fs.writeFileSync(TMP_SNIPPET, SNIPPET);
let dirRc = 0;
let dirErr = '';
try {
    execSync(`node "${UNMERGE_SCRIPT}" "${asDir}" "${TMP_SNIPPET}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
    dirRc = e.status;
    dirErr = String(e.stderr || '');
}
// Reporting "nothing to remove" here would tell uninstall.sh the section was
// gone when it was never read.
assert('exits non-zero', dirRc !== 0, true);
assert('says it could not read', /Could not read/.test(dirErr), true);
fs.rmdirSync(asDir);

console.log('\nShipped snippets round-trip:');
for (const name of ['claude-md-snippet.md', 'hygiene-snippet.md', 'feature-workflow-snippet.md']) {
    const snippetPath = path.join(__dirname, '..', 'instructions', name);
    const snip = fs.readFileSync(snippetPath, 'utf-8');
    const original = '# User instructions\n\n## Mine\n\nkeep\n';
    fs.writeFileSync(TMP_MD, original);
    execSync(`node "${MERGE_SCRIPT}" "${TMP_MD}" "${snippetPath}"`, { encoding: 'utf-8' });
    const head = snip.trim().split('\n')[0];
    assert(`${name}: installed wrapped`, fs.readFileSync(TMP_MD, 'utf-8').includes(section.beginMark(head)), true);
    execSync(`node "${UNMERGE_SCRIPT}" "${TMP_MD}" "${snippetPath}"`, { encoding: 'utf-8' });
    assert(`${name}: round trip byte-identical`, fs.readFileSync(TMP_MD, 'utf-8'), original);
    clearBackups();
}

clearBackups();
[TMP_MD, TMP_SNIPPET].forEach((f) => { if (fs.existsSync(f)) fs.unlinkSync(f); });

console.log('\n=======================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
