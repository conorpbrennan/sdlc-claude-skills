// Which settings.json hook entries belong to this project.
//
// Shared by merge-hooks.js and unmerge-hooks.js so install and uninstall
// agree on ownership. An entry is ours when its command names one of the
// scripts hooks-config.json wires, as a whole path component: a user's
// my-pre-commit-review.js is theirs, not a match for pre-commit-review.js.

// The name must end the token: `pre-commit-review.js.bak` and
// `pre-commit-review.json` are not ours.
const SCRIPT_RE = /[\w.-]+\.js(?![\w.-])/g;

// The script basenames the config wires, e.g. "pre-commit-review.js".
function ownedScripts(hooksConfig) {
    const owned = new Set();
    for (const groups of Object.values(hooksConfig)) {
        for (const group of groups || []) {
            for (const hook of group.hooks || []) {
                for (const name of String(hook.command || '').match(SCRIPT_RE) || []) owned.add(name);
            }
        }
    }
    return owned;
}

function isOwned(hook, owned) {
    // Every .js token in the command, matched whole: the token regex stops at
    // `/`, `"` and whitespace, so "my-pre-commit-review.js" stays one token.
    const names = String(hook.command || '').match(SCRIPT_RE) || [];
    return names.some((name) => owned.has(name));
}

// A copy of `hooks` with this project's entries removed. Matcher groups and
// events left empty are dropped; returns undefined if nothing remains.
function stripOwned(hooks, owned) {
    const kept = {};
    let removed = 0;
    for (const [event, groups] of Object.entries(hooks || {})) {
        if (!Array.isArray(groups)) { kept[event] = groups; continue; }
        const keptGroups = [];
        for (const group of groups) {
            const survivors = (group.hooks || []).filter((h) => {
                if (isOwned(h, owned)) { removed++; return false; }
                return true;
            });
            if (survivors.length > 0) keptGroups.push({ ...group, hooks: survivors });
        }
        if (keptGroups.length > 0) kept[event] = keptGroups;
    }
    return { hooks: Object.keys(kept).length > 0 ? kept : undefined, removed };
}

module.exports = { ownedScripts, isOwned, stripOwned };
