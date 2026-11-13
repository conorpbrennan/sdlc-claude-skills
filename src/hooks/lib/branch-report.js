// Parses a branch-review report and settles its verdict. The reviewer writes
// the report; this parser, not the reviewer's trailer, decides PASS. Modelled
// on parseReport in lib/verification.js, which it does not import.
//
// Report shape: seven sections `## Q1` to `## Q7`, each holding either a
// file:line token or a "None found, checked: a, b" line; findings as
// `### F<n> CONFIRMED|PLAUSIBLE CRITICAL|IMPORTANT|ADVISORY`; and a last line
// `BRANCH_GATE: PASS` or `BRANCH_GATE: FAIL`.

const PASS = 'PASS';
const FAIL = 'FAIL';
const KIND_EVIDENCE = 'evidence';
const KIND_NONE_FOUND = 'none-found';
const KIND_BAD = 'bad';
const CONFIRMED = 'CONFIRMED';
const PLAUSIBLE = 'PLAUSIBLE';
const CRITICAL = 'CRITICAL';
const SECTION_COUNT = 7;
const MIN_CHECKED_ITEMS = 2;
const MIN_ITEM_LENGTH = 3;

const TRAILER = /^BRANCH_GATE: (PASS|FAIL)$/;
const SECTION_HEADING = /^##\s+Q([1-7])\b/;
const SECTION_END = /^(## |### F)/;
const FINDING_ANY = /^###\s+F\d+/;
const FINDING_HEADING = /^###\s+F\d+\s+(CONFIRMED|PLAUSIBLE)\s+(CRITICAL|IMPORTANT|ADVISORY)\b/;
const FILE_LINE = /[\w./\\-]+\.\w+:\d+/;
// A URL such as http://example.com:8080/x has the host.tld:digits shape; cut it out before FILE_LINE is tried.
const URL_TOKEN = /\b[a-z][a-z0-9+.-]*:\/\/\S*/gi;
const NONE_FOUND = /^\s*(?:[-*+]\s+)?none found, checked:(.*)$/i;
const ITEM_SPLIT = /[,;]/;

// Args:
//   body: string[], the lines of one section, heading excluded.
// Returns:
//   string: KIND_EVIDENCE, KIND_NONE_FOUND or KIND_BAD.
function sectionKind(body) {
    if (body.some(l => FILE_LINE.test(l.replace(URL_TOKEN, ' ')))) return KIND_EVIDENCE;
    for (const line of body) {
        const m = NONE_FOUND.exec(line);
        if (!m) continue;
        const items = m[1].split(ITEM_SPLIT).map(s => s.trim()).filter(s => s.length >= MIN_ITEM_LENGTH);
        if (items.length >= MIN_CHECKED_ITEMS) return KIND_NONE_FOUND;
    }
    return KIND_BAD;
}

// Args:
//   text: any; a non-string is read as empty.
// Returns:
//   { verdict: string, sections: Array<{ n: number, ok: boolean, kind: string }>,
//     confirmed: number, plausible: number, blocking: number, problems: string[] }
//   Never throws. `sections` always has seven entries, n 1 to 7.
function parseReport(text) {
    const lines = (typeof text === 'string' ? text : '').split(/\r?\n/);
    const problems = [];

    const nonBlank = lines.filter(l => l.trim() !== '');
    const trailerMatch = nonBlank.length ? TRAILER.exec(nonBlank[nonBlank.length - 1].trim()) : null;
    if (!trailerMatch) {
        problems.push('The report has no valid trailer: the last non-blank line is not BRANCH_GATE: PASS or BRANCH_GATE: FAIL.');
    } else if (trailerMatch[1] === FAIL) {
        problems.push('The reviewer ended the report with BRANCH_GATE: FAIL.');
    }

    const bodies = {};
    const seen = {};
    let current = null;
    let confirmed = 0;
    let plausible = 0;
    let blocking = 0;
    for (const line of lines) {
        const q = SECTION_HEADING.exec(line);
        if (q) {
            const n = Number(q[1]);
            seen[n] = (seen[n] || 0) + 1;
            current = seen[n] === 1 ? n : null;
            if (current !== null) bodies[n] = [];
            continue;
        }
        if (SECTION_END.test(line)) current = null;
        if (FINDING_ANY.test(line)) {
            const f = FINDING_HEADING.exec(line);
            if (!f) {
                problems.push('Finding heading is malformed, read as FAIL: "' + line.trim() + '".');
            } else if (f[1] === CONFIRMED) {
                confirmed++;
                if (f[2] === CRITICAL) blocking++;
            } else if (f[1] === PLAUSIBLE) {
                plausible++;
            }
            continue;
        }
        if (current !== null) bodies[current].push(line);
    }

    const sections = [];
    for (let n = 1; n <= SECTION_COUNT; n++) {
        if (!seen[n]) {
            sections.push({ n, ok: false, kind: KIND_BAD });
            problems.push('Q' + n + ' is missing.');
        } else if (seen[n] > 1) {
            sections.push({ n, ok: false, kind: KIND_BAD });
            problems.push('Q' + n + ' appears ' + seen[n] + ' times; it must appear once.');
        } else {
            const kind = sectionKind(bodies[n]);
            sections.push({ n, ok: kind !== KIND_BAD, kind });
            if (kind === KIND_BAD) {
                problems.push('Q' + n + ' has no file:line evidence and no "None found, checked:" line with two or more items.');
            }
        }
    }

    if (blocking > 0) {
        problems.push(blocking + ' CONFIRMED CRITICAL finding(s) block the branch.');
    }

    return { verdict: problems.length === 0 ? PASS : FAIL, sections, confirmed, plausible, blocking, problems };
}

module.exports = { parseReport };
