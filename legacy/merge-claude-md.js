// Merge a markdown section into a target CLAUDE.md file.
// Frozen legacy code: the retired installer's merge, kept only so
// src/test-unmerge-claude-md.js can build the CLAUDE.md a legacy install wrote.
// Usage: node merge-claude-md.js <target-path> <snippet-path>
//
// The section is written wrapped in sentinels (see lib/claude-md-section.js), so
// this and unmerge-claude-md.js find it by literal string search and never by
// parsing the user's markdown. Order of preference:
//   1. a sentinel block for this heading  -> replace it in place
//   2. our snippet's exact text, unwrapped -> adopt it, wrapping it this time
//   3. neither                             -> append after a `---` separator
const fs = require('fs');
const section = require('../src/lib/claude-md-section');

const [,, targetPath, snippetPath] = process.argv;
if (!targetPath || !snippetPath) {
    console.error('Usage: merge-claude-md.js <target-path> <snippet-path>');
    process.exit(1);
}

const snippet = fs.readFileSync(snippetPath, 'utf-8').trim();
const snippetHeading = snippet.split('\n')[0];

if (!snippetHeading.startsWith('## ')) {
    console.error('Snippet must start with an ## heading');
    process.exit(1);
}

const headingCount = (snippet.match(/^## /gm) || []).length;
if (headingCount > 1) {
    console.error('Snippet must contain exactly one ## heading (found ' + headingCount + '). Split into one file per section.');
    process.exit(1);
}

let target = '';
try {
    const raw = fs.readFileSync(targetPath);
    // Refuse a file we cannot round-trip. Reading as utf-8 and writing back
    // replaces every offending byte with U+FFFD, silently and unrecoverably.
    if (!section.isValidUtf8(raw)) {
        console.error('  ' + targetPath + ' is not valid UTF-8, so it cannot be edited');
        console.error('  without corrupting it. Fix the encoding and re-run; nothing has');
        console.error('  been changed.');
        process.exit(1);
    }
    target = raw.toString('utf-8');
} catch (e) {
    // Only "not there yet" means create it. Every other errno -- EACCES, EISDIR,
    // EIO -- must not be read as "the file is empty", or we would overwrite a
    // file we simply failed to read.
    if (e.code !== 'ENOENT') {
        console.error('  Could not read ' + targetPath + ': ' + e.message);
        process.exit(1);
    }
}

if (!target.trim()) {
    const nl = section.detectNewline(target || snippet);
    fs.writeFileSync(targetPath, section.blockFor(snippetHeading, snippet, nl) + nl, 'utf-8');
    console.log('  Created with section: ' + snippetHeading);
    process.exit(0);
}

const nl = section.detectNewline(target);
const block = section.blockFor(snippetHeading, snippet, nl);

// Spans that are being deleted rather than replaced should also take the blank
// line they would otherwise leave behind. The first span is replaced in place, so
// it keeps its surroundings exactly.
function tidy(spans) {
    return spans.map((span, i) => (i === 0 ? span : section.withAdjacentBlankRun(target, span)));
}

// Every path rewrites the user's global CLAUDE.md, so every path keeps a copy
// first -- including append. An earlier version reasoned that appending could not
// lose anything and skipped the backup there, which was true only of the appended
// text itself, not of the rewrite that carried it.
function backup() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '');
    const backupPath = targetPath + '.backup.' + stamp;
    fs.copyFileSync(targetPath, backupPath);
    console.log('  Backup saved to ' + backupPath);
}

function write(result, message) {
    backup();
    // No whole-file normalisation here. Every edit is confined to a span, so the
    // rest of the file comes back byte for byte -- including blank lines inside
    // the user's own fenced code and any minority line endings.
    fs.writeFileSync(targetPath, result.replace(/[\r\n]*$/, nl), 'utf-8');
    console.log('  ' + message + ': ' + snippetHeading);
}

const { spans, ambiguous } = section.findBlocks(target, snippetHeading);

// A begin sentinel with no end means someone truncated or hand-edited the block.
// Guessing where it ends is how the old heading-matching version destroyed text,
// so refuse: the installer ran under `set -e`, and the file is left untouched.
if (ambiguous) {
    console.error('  ' + targetPath + ' has an opening ' + section.beginMark(snippetHeading));
    console.error('  and ' + ambiguous + '. Repair or delete that block and re-run;');
    console.error('  nothing has been changed.');
    process.exit(1);
}

if (spans.length > 0) {
    write(section.spliceSpans(target, tidy(spans, spans.length), (i) => (i === 0 ? block : '')),
        spans.length > 1
            ? 'Updated section (and removed ' + (spans.length - 1) + ' duplicate copies)'
            : 'Updated section');
} else {
    // No sentinels yet. A CLAUDE.md from before they existed holds our section as
    // plain text; adopt that exact text rather than appending a second copy.
    const legacy = section.findLegacy(target, snippet);
    // More than one verbatim copy means we cannot tell which is the installed one
    // and which is the user quoting us. Deleting the wrong one is unrecoverable
    // guessing, so refuse -- the same policy as an ambiguous marker pair.
    if (legacy.length > 1) {
        console.error('  ' + targetPath + ' contains ' + legacy.length + ' verbatim copies of');
        console.error('  "' + snippetHeading + '". Cannot tell which is the installed one, so');
        console.error('  none were changed. Leave one copy and re-run.');
        process.exit(1);
    }
    if (legacy.length === 1) {
        write(section.spliceSpans(target, legacy, () => block), 'Adopted existing section');
    } else {
        // Neither a sentinel block nor our exact text. If the heading is
        // nevertheless in the file, an older copy of this section is probably
        // there with edited or outdated wording -- ours changed since it was
        // installed, say. Warn and append; never delete on the strength of a
        // heading, which is the mistake this whole design exists to avoid.
        if (target.includes(nl + snippetHeading + nl) || target.startsWith(snippetHeading + nl)) {
            console.log('  NOTE: "' + snippetHeading + '" also appears in ' + targetPath + ',');
            console.log('  but not as text this project wrote -- an edited older copy, or just an');
            console.log('  example. Appending a wrapped copy rather than guessing which; if it was');
            console.log('  an older copy of this section, delete it by hand.');
        }
        write(target.replace(/[\r\n]+$/, '') + nl + nl + '---' + nl + nl + block, 'Appended section');
    }
}
