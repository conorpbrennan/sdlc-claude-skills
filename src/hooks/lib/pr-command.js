// Recognises `gh pr create` in a Bash command, for the pre-PR gate.
//
// Shell parsing, the wrapper words and the reserved words belong to
// commit-command.js; this module imports them and adds only the `gh pr
// create` shape. Only tokenized command words decide: text inside quotes,
// substitutions or a heredoc body is opaque and never counts.
//
// Known gaps, accepted deliberately (bounded threat model: the gate guards
// honest mistakes in ordinary commands, not adversarial shell. Each is
// ADVISORY, named here and not chased):
//   - `bash -c "gh pr create"`, `eval`, `sh -c`: the command is quoted text.
//   - A wrapper that takes an argument other than a flag or a duration
//     (`sudo -u root gh pr create`, `env -u X gh ...`): commit-command.js does
//     not skip such an argument either, so the segment's command word is not gh.
//   - A `gh` named by a variable or substitution (`$GH pr create`).
//   - A word equal to an opaque (quoted) word is treated as opaque, so
//     `"gh" pr create` is not recognised.
//   - `gh` global flags before the subcommand (`gh --repo x pr create`).
'use strict';

const { tokenize, WRAPPER_WORDS, SHELL_RESERVED_WORDS } = require('./commit-command');

const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
// A wrapper's duration argument (`timeout 5`, `timeout 30s`), the same shape
// commit-command.js's directory-change scan lets through after a wrapper.
const DURATION_RE = /^\d+[smhd]?$/;
// The gh executable: bare, with .exe, or behind any path (compared by basename).
const GH_EXE_RE = /^(.*[\\/])?gh(\.exe)?$/i;

const PR_WORDS = ['pr', 'create'];

// Args:
//   words: one segment's words, from tokenize().
//   opaque: the segment's quoted or substituted words.
// Returns:
//   the index of the segment's first command word, past reserved words,
//   assignments, wrapper words and the flags or durations that follow a
//   wrapper; words.length when there is none.
function firstCommandIndex(words, opaque) {
    let i = 0;
    let wrapped = false;
    while (i < words.length) {
        const w = words[i];
        if (opaque.includes(w)) break;
        if (SHELL_RESERVED_WORDS.has(w) || ASSIGNMENT_RE.test(w)) { i += 1; continue; }
        if (WRAPPER_WORDS.has(w)) { wrapped = true; i += 1; continue; }
        if (wrapped && (w.startsWith('-') || DURATION_RE.test(w))) { i += 1; continue; }
        break;
    }
    return i;
}

// Args:
//   command: the Bash command text.
// Returns:
//   true when some segment's first three command words are `gh pr create`.
//
// Examples:
//   isPrCreate('cd sub && gh pr create --fill')  // true
//   isPrCreate('echo "gh pr create"')            // false
function isPrCreate(command) {
    for (const seg of tokenize(command)) {
        const i = firstCommandIndex(seg.words, seg.opaque);
        const rest = seg.words.slice(i, i + 3);
        if (rest.length < 3 || !GH_EXE_RE.test(rest[0])) continue;
        if (rest.some(w => seg.opaque.includes(w))) continue;
        if (rest[1] === PR_WORDS[0] && rest[2] === PR_WORDS[1]) return true;
    }
    return false;
}

module.exports = { isPrCreate };
