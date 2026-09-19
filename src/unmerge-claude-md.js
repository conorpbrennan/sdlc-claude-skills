// Remove a markdown section from a target CLAUDE.md file.
// Usage: node unmerge-claude-md.js <target-path> <snippet-path>
//
// The inverse of merge-claude-md.js: finds the sentinel-wrapped block by literal
// string search and deletes it, along with the `---` separator merge inserted
// ahead of it. A CLAUDE.md written before the sentinels existed is handled by
// searching for the snippet's exact text instead. Text the user wrote around the
// section is preserved; a section that is not present is not an error, so
// uninstall is idempotent.
const fs = require('fs');
const section = require('./lib/claude-md-section');

const [, , targetPath, snippetPath] = process.argv;
if (!targetPath || !snippetPath) {
    console.error('Usage: unmerge-claude-md.js <target-path> <snippet-path>');
    process.exit(1);
}

let snippet;
try {
    snippet = fs.readFileSync(snippetPath, 'utf-8').trim();
} catch (e) {
    console.error('  Snippet not readable: ' + snippetPath);
    process.exit(1);
}

const snippetHeading = snippet.split('\n')[0];
if (!snippetHeading.startsWith('## ')) {
    console.error('Snippet must start with an ## heading');
    process.exit(1);
}

let target;
try {
    const raw = fs.readFileSync(targetPath);
    // Refuse a file we cannot round-trip: writing it back as utf-8 would replace
    // every offending byte with U+FFFD, silently and unrecoverably.
    if (!section.isValidUtf8(raw)) {
        console.error('  ' + targetPath + ' is not valid UTF-8, so it cannot be edited');
        console.error('  without corrupting it. Fix the encoding and re-run; nothing has');
        console.error('  been changed.');
        process.exit(1);
    }
    target = raw.toString('utf-8');
} catch (e) {
    // Absent is fine -- uninstall is idempotent. Unreadable is not: reporting
    // success would tell uninstall.sh the section was removed when it was not.
    if (e.code !== 'ENOENT') {
        console.error('  Could not read ' + targetPath + ': ' + e.message);
        process.exit(1);
    }
    console.log('  No CLAUDE.md at ' + targetPath + ' - nothing to remove');
    process.exit(0);
}

const nl = section.detectNewline(target);
const { spans, ambiguous } = section.findBlocks(target, snippetHeading);

// A begin sentinel with no end: refuse rather than guess where the block stops.
if (ambiguous) {
    console.error('  ' + targetPath + ' has an opening ' + section.beginMark(snippetHeading));
    console.error('  and ' + ambiguous + '. Repair or delete that block by hand;');
    console.error('  nothing has been changed.');
    process.exit(1);
}

// Sentinel blocks first; otherwise our snippet's exact text, for a CLAUDE.md
// that predates the sentinels.
let found = spans;
let how = 'Removed section';
if (found.length === 0) {
    const legacy = section.findLegacy(target, snippet);
    // Several verbatim copies: we cannot tell the installed one from the user
    // quoting us, and deleting the wrong one is unrecoverable. Refuse, as with an
    // ambiguous marker pair.
    if (legacy.length > 1) {
        console.error('  ' + targetPath + ' contains ' + legacy.length + ' verbatim copies of');
        console.error('  "' + snippetHeading + '". Cannot tell which is the installed one, so');
        console.error('  none were removed. Leave one copy and re-run.');
        process.exit(1);
    }
    found = legacy;
    how = 'Removed section (pre-sentinel copy)';
}

if (found.length === 0) {
    console.log('  Section not present: ' + snippetHeading);
    // The heading may still be there inside text the user edited, in which case
    // neither search matches and we must not guess at a boundary.
    if (target.includes(snippetHeading)) {
        console.log('  NOTE: the heading appears in ' + targetPath + ' but not as a block');
        console.log('  this project wrote. Left alone - remove it by hand if you want it gone.');
    }
    process.exit(0);
}

// Each span grows over the separator merge put ahead of it, then over the blank
// line it would otherwise leave behind. Both are local to the span: nothing
// outside one is rewritten, so the user's text -- blank lines inside their fenced
// code, minority line endings -- comes back byte for byte.
let result = section.spliceSpans(
    target,
    found.map((span) => section.withAdjacentBlankRun(target, section.withLeadingSeparator(target, span))),
    () => ''
);
// Our block at the head of the file has its separator AFTER it, which
// withLeadingSeparator cannot reach, so it is stranded at the top.
result = result.replace(/^[\r\n]*---[ \t]*(?:\r?\n){2}/, '');
result = result.replace(/[\r\n]+$/, '') + nl;
// A file that held only this section collapses to a lone separator, or nothing.
if (result.trim() === '---' || result.trim() === '') result = '';

// This overwrites the user's global CLAUDE.md, so keep the previous copy.
// Seconds and milliseconds stay in the name: install and uninstall inside the
// same minute must not land on the same backup path.
const timestamp = new Date().toISOString().replace(/[:.]/g, '');
const backupPath = targetPath + '.backup.' + timestamp;
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, result, 'utf-8');
console.log('  ' + how + ': ' + snippetHeading + (found.length > 1 ? ' (' + found.length + ' copies)' : ''));
console.log('  Backup saved to ' + backupPath);
