// Pure trimming logic for the read-trim hook (PostToolUse on Read, sub-agents only).
'use strict';

// Whole-file text reads longer than this many chars are cut to it.
const MAX_CHARS = 12000;

const TYPE_TEXT = 'text';

// Trims an oversized text Read response. Never mutates its input.
//
// Args:
//   response: the Read tool_response object ({ type, file: { content, ... } }).
// Returns:
//   a deep copy with file.content cut to whole lines plus one note line and
//   file.numLines updated, or null when the response is not an oversized text read.
function trimRead(response) {
    if (!response || typeof response !== 'object' || response.type !== TYPE_TEXT) return null;
    const file = response.file;
    if (!file || typeof file !== 'object' || typeof file.content !== 'string') return null;
    const content = file.content;
    if (content.length <= MAX_CHARS) return null;

    const lastNewline = content.lastIndexOf('\n', MAX_CHARS);
    const cut = lastNewline > 0 ? lastNewline : MAX_CHARS;
    const kept = content.slice(0, cut);
    const keptLines = kept.split('\n').length;
    const totalLines = typeof file.totalLines === 'number' ? file.totalLines : content.split('\n').length;
    const note = `[sdlc read-trim: showing lines 1-${keptLines} of ${totalLines} (${kept.length} of ${content.length} chars). Grep for what you need, or Read again with offset/limit — ranged reads are not trimmed.]`;

    const copy = JSON.parse(JSON.stringify(response));
    copy.file.content = `${kept}\n${note}`;
    copy.file.numLines = keptLines + 1;
    return copy;
}

module.exports = { MAX_CHARS, trimRead };
