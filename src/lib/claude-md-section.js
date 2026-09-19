// Locating the sections this project manages inside the user's CLAUDE.md.
//
// There is no markdown parsing here, on purpose. An earlier version found our
// sections by matching their `## ` heading, and then had to decide what counted
// as a heading: not a mid-sentence mention, not a longer heading that starts with
// ours, not one quoted inside a fenced code block -- which meant implementing a
// slice of CommonMark, and every divergence from the spec either deleted text the
// user wrote around our section or failed to find our section at all. Six such
// defects were found in a row (unanchored heading, missing end anchor, fences
// ignored, fence length, CRLF, tab indentation, prose lines holding two fence
// runs, `##` followed by a tab). The approach was the defect, not the patches.
//
// So: install WRAPS each section in sentinels, and every later search is literal.
//
//   <!-- sdlc-claude-skills:begin Feature Tracking -->
//   ## Feature Tracking
//   ...
//   <!-- sdlc-claude-skills:end Feature Tracking -->
//
// Sentinels are HTML comments, so they do not render, and they are specific
// enough that nobody writes one by accident. For a CLAUDE.md written before the
// sentinels existed there is one fallback, and it is also not parsing: search for
// the snippet's exact text, which we can do because we wrote it. If the user
// edited our section by hand, neither search matches and the caller says so
// rather than guessing where the section ends.

const MARK = 'sdlc-claude-skills';

// `## Feature Tracking` -> `Feature Tracking`. The label only has to be stable
// and readable; it is never parsed back out.
function headingLabel(heading) {
    return heading.replace(/^#+\s*/, '').trim();
}

function beginMark(heading) {
    return '<!-- ' + MARK + ':begin ' + headingLabel(heading) + ' -->';
}

function endMark(heading) {
    return '<!-- ' + MARK + ':end ' + headingLabel(heading) + ' -->';
}

// The line terminator the file already uses, so what we insert matches its
// surroundings instead of leaving one LF line in a CRLF file.
function detectNewline(text) {
    const crlf = (text.match(/\r\n/g) || []).length;
    const lf = (text.match(/(?<!\r)\n/g) || []).length;
    return crlf > lf ? '\r\n' : '\n';
}

function toNewline(text, nl) {
    return nl === '\n' ? text.replace(/\r\n/g, '\n') : text.replace(/\r?\n/g, nl);
}

// The sentinel-wrapped section, in the target file's line ending.
function blockFor(heading, snippet, nl) {
    return [beginMark(heading), toNewline(snippet.trim(), nl), endMark(heading)].join(nl);
}

// Every sentinel-delimited block for this heading, as {index, length}. A begin
// with no matching end is reported rather than guessed at, so the caller can
// refuse instead of choosing a boundary.
function findBlocks(target, heading) {
    const begin = beginMark(heading);
    const end = endMark(heading);
    const spans = [];
    let at = 0;
    for (;;) {
        const b = target.indexOf(begin, at);
        if (b === -1) return { spans, ambiguous: null };
        const e = target.indexOf(end, b + begin.length);
        if (e === -1) return { spans, ambiguous: 'no matching end marker' };
        // A second begin before that end means the markers do not nest the way we
        // wrote them: one of them is not ours -- quoted in prose, pasted from this
        // project's own README, or left by a half-finished hand edit. Pairing the
        // first begin with the last end would swallow everything between them,
        // which is the exact class of silent text loss the sentinels exist to
        // prevent. Refuse instead.
        const next = target.indexOf(begin, b + begin.length);
        if (next !== -1 && next < e) {
            return { spans, ambiguous: 'a second begin marker before the matching end marker' };
        }
        spans.push({ index: b, length: e + end.length - b });
        at = e + end.length;
    }
}

// A CLAUDE.md that predates the sentinels holds our section as plain text. We
// wrote it, so we can find it verbatim -- in either line ending -- without
// deciding what a heading is.
function findLegacy(target, snippet) {
    const trimmed = snippet.trim();
    for (const form of [toNewline(trimmed, '\n'), toNewline(trimmed, '\r\n')]) {
        const spans = [];
        let at = 0;
        for (;;) {
            const i = target.indexOf(form, at);
            if (i === -1) break;
            spans.push({ index: i, length: form.length });
            at = i + form.length;
        }
        if (spans.length) return spans;
    }
    return [];
}

// Grow a span backwards over the `---` separator that merge inserts ahead of an
// appended section, so removing the section does not leave a rule stranded
// between two unrelated ones.
//
// This and withAdjacentBlankRun below are why no caller normalises the whole
// file: every edit stays inside a span, so text the user wrote outside one is
// returned byte for byte.
function withLeadingSeparator(target, span) {
    // Blank lines on BOTH sides, because that is the separator merge writes
    // (`\n\n---\n\n`). A `---` with no blank line around it is the user's own --
    // a YAML frontmatter fence, most often -- and must survive.
    const m = target.slice(0, span.index).match(/(?:\r?\n){2,}---[ \t]*(?:\r?\n){2,}$/);
    if (!m) return span;
    return { index: span.index - m[0].length, length: span.length + m[0].length };
}

// Replace each span in `target`, right to left so earlier offsets stay valid.
// `replacer` receives the span's position in the list, so a caller can keep the
// first and drop the rest.
function spliceSpans(target, spans, replacer) {
    let out = target;
    for (let i = spans.length - 1; i >= 0; i--) {
        const { index, length } = spans[i];
        out = out.slice(0, index) + replacer(i) + out.slice(index + length);
    }
    return out;
}

// Collapse runs of three or more newlines to one blank line, in the file's own
// line ending. A plain /\n{3,}/ does nothing on a CRLF file, where the newlines
// are separated by carriage returns.
function collapseBlankRuns(text, nl) {
    return text.replace(/(?:\r?\n){3,}/g, nl + nl);
}

// Grow a span forwards over the blank line left behind when it is removed from
// between two blocks of text, so removal does not leave a double blank line.
// Local to the span on purpose: an earlier version collapsed every 3+ newline run
// in the file, which silently rewrote blank lines inside the user's own fenced
// code and, on a mixed-ending file, their line endings with it.
function withAdjacentBlankRun(target, span) {
    const before = target.slice(0, span.index);
    const after = target.slice(span.index + span.length);
    if (!/(?:\r?\n){2,}$/.test(before)) return span;
    const m = after.match(/^(?:\r?\n){2,}/);
    if (!m) return span;
    // Absorb the whole trailing run: the leading run already ends the preceding
    // text and supplies the blank line, so anything kept here is a second one.
    return { index: span.index, length: span.length + m[0].length };
}

// True when the text is valid UTF-8. A CLAUDE.md that is not gets refused rather
// than rewritten: reading it as utf-8 and writing it back replaces every
// offending byte with U+FFFD, silently and unrecoverably.
function isValidUtf8(buffer) {
    return Buffer.compare(Buffer.from(buffer.toString('utf-8'), 'utf-8'), buffer) === 0;
}

module.exports = {
    beginMark,
    withAdjacentBlankRun,
    isValidUtf8,
    endMark,
    detectNewline,
    toNewline,
    blockFor,
    findBlocks,
    findLegacy,
    withLeadingSeparator,
    spliceSpans,
    collapseBlankRuns,
};
