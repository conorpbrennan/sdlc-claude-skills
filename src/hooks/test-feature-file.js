// Tests for lib/feature-file.js: the parsed `## Acceptance` section and the
// replaceable `## Verification` section of a feature record.
//
// Written before the implementation. The example in commands/feature-new.md is
// read from that file at test time, so the command and the parser cannot drift.
require('./lib/isolate-git-env.js').isolateGitEnv();

const fs = require('fs');
const path = require('path');

const featureFile = require('./lib/feature-file.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

let passed = 0;
let failed = 0;

function check(name, cond, detail) {
    if (cond) {
        passed++;
        console.log('  ok   ' + name);
    } else {
        failed++;
        console.log('  FAIL ' + name + (detail ? '\n       ' + detail : ''));
    }
}

function eq(name, actual, expected) {
    check(name, JSON.stringify(actual) === JSON.stringify(expected),
        'expected ' + JSON.stringify(expected) + '\n       got      ' + JSON.stringify(actual));
}

function callOrNull(fn, ...args) {
    if (typeof fn !== 'function') return null;
    return fn(...args);
}

const parseAcceptance = featureFile.parseAcceptance;
const replaceVerification = featureFile.replaceVerification;

// ---- (a) the example in commands/feature-new.md, read at test time ----------
console.log('(a) example block in commands/feature-new.md');
{
    check('ACCEPTANCE_HEADING is exported',
        featureFile.ACCEPTANCE_HEADING === '## Acceptance');

    const doc = fs.readFileSync(path.join(REPO_ROOT, 'commands', 'feature-new.md'), 'utf8');
    // Column-0 fenced blocks whose first line is the Acceptance heading. The
    // step 5 stub template is indented and starts with a title, so it is not one.
    const blocks = [];
    const fence = /^```[a-z]*\n([\s\S]*?)^```$/gm;
    let m;
    while ((m = fence.exec(doc)) !== null) {
        if (m[1].startsWith('## Acceptance\n')) blocks.push(m[1]);
    }
    check('exactly one fenced example starts with ## Acceptance', blocks.length === 1,
        'found ' + blocks.length);
    if (blocks.length === 1) {
        const listed = blocks[0].split('\n')
            .filter(l => /^\d+\.\s+/.test(l))
            .map(l => l.replace(/^\d+\.\s+/, '').trim());
        check('example lists at least 2 criteria', listed.length >= 2, 'listed ' + listed.length);
        eq('example parses to the criteria it lists, in order',
            callOrNull(parseAcceptance, blocks[0]), listed);
    }

    const rec = fs.readFileSync(path.join(REPO_ROOT, 'features', 'verification-stage.md'), 'utf8');
    const five = callOrNull(parseAcceptance, rec);
    check('features/verification-stage.md parses to five strings',
        Array.isArray(five) && five.length === 5 && five.every(s => typeof s === 'string' && s.length > 0),
        JSON.stringify(five));
}

// ---- (b) boundaries of parseAcceptance --------------------------------------
console.log('(b) parseAcceptance boundaries');
{
    const placeholder = '# T\n\n## Acceptance\n\n<!-- 2-5 checkable criteria; /sdlc:verify reads these -->\n\n## Files involved\n\n- a.js\n';
    eq('placeholder-only section gives []', callOrNull(parseAcceptance, placeholder), []);

    const absent = '# T\n\n## Files involved\n\n1. not a criterion\n\n## History\n\n1. nor this\n';
    eq('absent heading gives []', callOrNull(parseAcceptance, absent), []);

    const direct = '# T\n\n## Acceptance\n\n1. first thing\n3.   third thing  \n2. second thing\n## Files involved\n\n9. leaked\n';
    eq('section ending at ## Files involved gives its own items, in file order, unrenumbered',
        callOrNull(parseAcceptance, direct), ['first thing', 'third thing', 'second thing']);

    const leak = '# T\n\n## Acceptance\n\n1. only this\n\n## History\n\n1. history item\n2. another\n';
    eq('a numbered line in ## History does not leak in', callOrNull(parseAcceptance, leak), ['only this']);

    const atEnd = '# T\n\n## Acceptance\n\n1. last section\n2. at the end';
    eq('section at end of file with no trailing newline',
        callOrNull(parseAcceptance, atEnd), ['last section', 'at the end']);

    const sub = '## Acceptance\n\n1. a\n\n### Notes\n\n2. b\n\n## History\n';
    eq('a ### subheading does not end the section', callOrNull(parseAcceptance, sub), ['a', 'b']);
}

// ---- (c) replaceVerification ------------------------------------------------
console.log('(c) replaceVerification');
const SECTION = '## Verification\n\nVerdict: PASS\n\nDetail line\n';
{
    const none = '# T\n\n## Files involved\n\n- a.js\n\n## History\n\n<!-- populated on commit -->\n';
    const appended = callOrNull(replaceVerification, none, SECTION);
    eq('no section: appended after one blank line at the end',
        appended, none.replace(/\n*$/, '\n') + '\n' + SECTION);

    const noNewline = '# T\n\n## History\n\n- x';
    eq('no section, no trailing newline: still one blank line',
        callOrNull(replaceVerification, noNewline, SECTION), '# T\n\n## History\n\n- x\n\n' + SECTION);

    const old = '## Verification\n\nVerdict: FAIL\n\n### Rows\n\n| 1 | FAIL |\n';
    const middle = '# T\n\n## Files involved\n\n- a.js\n\n' + old + '\n## History\n\n- entry\n';
    const replaced = callOrNull(replaceVerification, middle, SECTION);
    eq('existing block replaced; ### inside it does not stop the replace; neighbours byte-identical',
        replaced, '# T\n\n## Files involved\n\n- a.js\n\n' + SECTION + '\n## History\n\n- entry\n');

    const last = '# T\n\n## History\n\n- entry\n\n' + old;
    eq('existing block at end of file is replaced',
        callOrNull(replaceVerification, last, SECTION), '# T\n\n## History\n\n- entry\n\n' + SECTION);

    const twice = callOrNull(replaceVerification, replaced, SECTION);
    check('replacing with the same section is idempotent',
        typeof twice === 'string' && twice === replaced);
}

// ---- (d) prependHistory still works on the output ---------------------------
console.log('(d) prependHistory after replaceVerification');
{
    const rec = '# T\n\n## Files involved\n\n- a.js\n\n## Verification\n\nold\n\n## History\n\n<!-- populated on commit -->\n';
    const out = callOrNull(replaceVerification, rec, SECTION);
    const hist = out === null ? null : featureFile.prependHistory(out, '- entry one');
    check('history entry lands under ## History',
        hist !== null && /## History\n\n- entry one\n$/.test(hist), JSON.stringify(hist));
    check('verification section survives prependHistory',
        hist !== null && hist.includes(SECTION));
    const hist2 = hist === null ? null : featureFile.prependHistory(hist, '- entry two');
    check('second entry goes above the first',
        hist2 !== null && /## History\n\n- entry two\n\n- entry one\n$/.test(hist2), JSON.stringify(hist2));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
