// Tests for lib/claude-md-section.js.
//
// The whole point of the sentinel design is that nothing here has to reason
// about markdown. These tests exist to keep it that way: every lookup is a
// literal string search, so the cases that used to matter -- a heading quoted
// inside a ``` block, a heading that is a prefix of a longer one, a mid-sentence
// mention, CRLF, tabs -- are now simply irrelevant, and there are assertions
// below that say so explicitly. If a future change reintroduces pattern matching
// over user text, those are the ones that should fail.
// Drop git's repository-locating variables: inherited from a git hook, they
// would aim every git call here at the outer repository (src/test-suite-isolation.js).
require('./hooks/lib/isolate-git-env.js').isolateGitEnv();

const section = require('./lib/claude-md-section');

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

const H = '## Ours';
const SNIPPET = '## Ours\n\nour body line\n';
const BEGIN = section.beginMark(H);
const END = section.endMark(H);

console.log('claude-md-section tests');
console.log('=======================');

console.log('\nMarkers:');
assert('begin marker', BEGIN, '<!-- sdlc-claude-skills:begin Ours -->');
assert('end marker', END, '<!-- sdlc-claude-skills:end Ours -->');
assert('markers are HTML comments', /^<!--.*-->$/.test(BEGIN) && /^<!--.*-->$/.test(END), true);
assert('label strips the # run', section.beginMark('###   Deep Heading'), '<!-- sdlc-claude-skills:begin Deep Heading -->');

console.log('\nblockFor:');
const block = section.blockFor(H, SNIPPET, '\n');
assert('wraps the snippet', block, BEGIN + '\n## Ours\n\nour body line\n' + END);
assert('CRLF form uses CRLF throughout', section.blockFor(H, SNIPPET, '\r\n').split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')), true);
assert('ends with the end marker', block.endsWith(END), true);

console.log('\nAmbiguous marker pairs are refused:');
assert('second begin before the end', section.findBlocks('x ' + BEGIN + '\n' + BEGIN + '\nb\n' + END, H).ambiguous, 'a second begin marker before the matching end marker');
assert('...offers no span', section.findBlocks('x ' + BEGIN + '\n' + BEGIN + '\nb\n' + END, H).spans.length, 0);
assert('begin with no end', section.findBlocks('x\n' + BEGIN + '\nb\n', H).ambiguous, 'no matching end marker');
assert('a clean pair is not ambiguous', section.findBlocks(BEGIN + '\nb\n' + END, H).ambiguous, null);

console.log('\nwithAdjacentBlankRun:');
const gap = 'before\n\n' + BEGIN + '\nb\n' + END + '\n\nafter\n';
const gapSpan = section.withAdjacentBlankRun(gap, section.findBlocks(gap, H).spans[0]);
assert('removal leaves one blank line, not two', section.spliceSpans(gap, [gapSpan], () => ''), 'before\n\nafter\n');
// Only absorb the trailing run when a LEADING one already separates the
// preceding text. Without that condition the user's two paragraphs would be
// joined onto adjacent lines, which is a bigger change than the double blank
// line it is trying to avoid.
const noLeadBlank = 'before\n' + BEGIN + '\nb\n' + END + '\n\nafter\n';
const nlbSpan = section.withAdjacentBlankRun(noLeadBlank, section.findBlocks(noLeadBlank, H).spans[0]);
assert('no leading blank run: trailing run is kept', section.spliceSpans(noLeadBlank, [nlbSpan], () => ''), 'before\n\n\nafter\n');
assert('no leading blank run: paragraphs not glued', /before\nafter/.test(section.spliceSpans(noLeadBlank, [nlbSpan], () => '')), false);

assert('no blank run to absorb leaves the span alone', (() => {
    const t2 = 'before\n' + BEGIN + '\nb\n' + END + '\nafter\n';
    const sp = section.findBlocks(t2, H).spans[0];
    return section.withAdjacentBlankRun(t2, sp);
})(), section.findBlocks('before\n' + BEGIN + '\nb\n' + END + '\nafter\n', H).spans[0]);
assert('CRLF gap collapses to one CRLF blank line', (() => {
    const t3 = 'before\r\n\r\n' + section.blockFor(H, SNIPPET, '\r\n') + '\r\n\r\nafter\r\n';
    const sp = section.withAdjacentBlankRun(t3, section.findBlocks(t3, H).spans[0]);
    return section.spliceSpans(t3, [sp], () => '');
})(), 'before\r\n\r\nafter\r\n');

console.log('\nisValidUtf8:');
assert('plain ascii', section.isValidUtf8(Buffer.from('hello\n')), true);
assert('multibyte', section.isValidUtf8(Buffer.from('Caf\u00e9 \u2014 notes\n', 'utf-8')), true);
assert('latin-1 byte', section.isValidUtf8(Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x0a])), false);
assert('lone continuation byte', section.isValidUtf8(Buffer.from([0x80])), false);

console.log('\nfindBlocks:');
const one = '# t\n\n' + block + '\n';
assert('finds one block', section.findBlocks(one, H).spans.length, 1);
assert('span covers exactly the block', (() => {
    const [s] = section.findBlocks(one, H).spans;
    return one.slice(s.index, s.index + s.length);
})(), block);
assert('none when absent', section.findBlocks('# t\n\nnothing\n', H).spans.length, 0);
assert('finds two blocks', section.findBlocks(block + '\n\n' + block + '\n', H).spans.length, 2);
assert('a different heading does not match', section.findBlocks(one, '## Theirs').spans.length, 0);

console.log('\nUnterminated block is reported, not guessed:');
const truncated = '# t\n\n' + BEGIN + '\n## Ours\n\nbody\n';
assert('unterminated flagged', section.findBlocks(truncated, H).ambiguous, 'no matching end marker');
assert('no span offered', section.findBlocks(truncated, H).spans.length, 0);
assert('a complete block is not flagged', section.findBlocks(one, H).ambiguous, null);

console.log('\nfindLegacy (a CLAUDE.md written before the sentinels):');
assert('finds our exact text', section.findLegacy('# t\n\n' + SNIPPET.trim() + '\n', SNIPPET).length, 1);
assert('finds it with CRLF endings', section.findLegacy('# t\r\n\r\n' + SNIPPET.trim().replace(/\n/g, '\r\n') + '\r\n', SNIPPET).length, 1);
assert('finds two copies', section.findLegacy(SNIPPET.trim() + '\n\n' + SNIPPET.trim() + '\n', SNIPPET).length, 2);
assert('edited text does not match', section.findLegacy('# t\n\n## Ours\n\nEDITED body line\n', SNIPPET).length, 0);
assert('heading alone does not match', section.findLegacy('# t\n\n## Ours\n', SNIPPET).length, 0);

// This is the heart of it: the inputs that produced six consecutive defects in
// the old heading-matching design are now not matches at all, because nothing
// searches for a heading.
console.log('\nThe cases that used to destroy user text are now non-events:');
const notOurs = [
    ['heading quoted in a fenced block', '# t\n\n```markdown\n## Ours\n\nsample\n```\n\ntail\n'],
    ['longer heading starting with ours', '# t\n\n## Ours Extended\n\ntheir body\n'],
    ['mid-sentence mention', '# t\n\nSee ## Ours for details.\n\nmore\n'],
    ['mention ending a line', '# t\n\nNotes on ## Ours\n\nbody\n'],
    ['deeper heading of the same text', '# t\n\n### Ours\n\nbody\n'],
    ['CRLF heading', '# t\r\n\r\n## Ours\r\n\r\ntheir body\r\n'],
    ['tab after the hashes', '# t\n\n##\tOurs\n\ntheir body\n'],
    ['nested fences', '# t\n\n````md\n```\n## Ours\n```\n````\n\ntail\n'],
    ['unterminated fence', '# t\n\n```md\nnever closed\n\n## Ours\n\nbody\n'],
];
for (const [name, text] of notOurs) {
    assert(name + ': no block', section.findBlocks(text, H).spans.length, 0);
    assert(name + ': no legacy match', section.findLegacy(text, SNIPPET).length, 0);
}

console.log('\nwithLeadingSeparator:');
const withSep = '# t\n\ntheir text\n\n---\n\n' + block + '\n';
const [sp] = section.findBlocks(withSep, H).spans;
const grown = section.withLeadingSeparator(withSep, sp);
assert('consumes the separator', withSep.slice(grown.index, grown.index + grown.length).startsWith('\n\n---\n\n'), true);
assert('removal leaves no stranded rule', section.spliceSpans(withSep, [grown], () => '').includes('---'), false);
const noSep = '# t\n\ntheir text\n\n' + block + '\n';
const [sp2] = section.findBlocks(noSep, H).spans;
assert('no separator to consume leaves the span alone', section.withLeadingSeparator(noSep, sp2), sp2);
const crlfSep = '# t\r\n\r\ntheir text\r\n\r\n---\r\n\r\n' + section.blockFor(H, SNIPPET, '\r\n') + '\r\n';
const [sp3] = section.findBlocks(crlfSep, H).spans;
assert('consumes a CRLF separator', section.withLeadingSeparator(crlfSep, sp3).index < sp3.index, true);
// A `---` that is the user's own horizontal rule, not our separator, sits
// directly against their text with no blank line, so it is not consumed.
const fm = '---\ntitle: x\n---\n' + block + '\n';
const [fmSpan] = section.findBlocks(fm, H).spans;
assert('their frontmatter closer is not consumed', section.withLeadingSeparator(fm, fmSpan), fmSpan);
assert('frontmatter survives removal', section.spliceSpans(fm, [section.withLeadingSeparator(fm, fmSpan)], () => ''), '---\ntitle: x\n---\n\n');

console.log('\nspliceSpans:');
const two = block + '\nmiddle\n' + block + '\n';
const spans2 = section.findBlocks(two, H).spans;
assert('keeps the first, drops the rest', section.spliceSpans(two, spans2, (i) => (i === 0 ? 'KEPT' : '')), 'KEPT\nmiddle\n\n');
assert('right-to-left keeps offsets valid', section.spliceSpans(two, spans2, () => 'X'), 'X\nmiddle\nX\n');
assert('equals a left-to-right reconstruction', (() => {
    let out = '';
    let at = 0;
    spans2.forEach(({ index, length }, i) => {
        out += two.slice(at, index) + (i === 0 ? 'KEPT' : '');
        at = index + length;
    });
    return out + two.slice(at);
})(), section.spliceSpans(two, spans2, (i) => (i === 0 ? 'KEPT' : '')));

console.log('\ndetectNewline and collapseBlankRuns:');
assert('LF file', section.detectNewline('a\nb\n'), '\n');
assert('CRLF file', section.detectNewline('a\r\nb\r\n'), '\r\n');
assert('mostly CRLF wins', section.detectNewline('a\r\nb\r\nc\n'), '\r\n');
assert('empty defaults to LF', section.detectNewline(''), '\n');
assert('collapses LF runs', section.collapseBlankRuns('a\n\n\n\nb', '\n'), 'a\n\nb');
assert('collapses CRLF runs', section.collapseBlankRuns('a\r\n\r\n\r\n\r\nb', '\r\n'), 'a\r\n\r\nb');
assert('leaves one blank line alone', section.collapseBlankRuns('a\n\nb', '\n'), 'a\n\nb');

console.log('\n=======================');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
