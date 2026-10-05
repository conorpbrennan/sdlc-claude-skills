#!/usr/bin/env node
// The plugin's version, raised on every commit. With a version in
// plugin.json, `/plugin update` ignores any commit that leaves it unchanged,
// so a forgotten bump silently keeps every user on the old copy.
//
//   node tools/plugin-version.js check   exit 1 unless the staged version is
//                                        semver and above HEAD's
//   node tools/plugin-version.js bump    raise the patch number in the working
//                                        tree; stage it in its own command
//
// `check` runs from this repo's entry in ~/.claude/hygiene-repos.json.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MANIFEST = '.claude-plugin/plugin.json';
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const BUMP_CMD = 'node tools/plugin-version.js bump';

// Args:
//   a, b: semver strings, `major.minor.patch`.
// Returns:
//   a positive number when a is higher, negative when lower, 0 when equal.
function compareSemver(a, b) {
    const pa = SEMVER_RE.exec(a).slice(1).map(Number);
    const pb = SEMVER_RE.exec(b).slice(1).map(Number);
    for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
}

// Args:
//   cwd: the repository to read.
//   spec: a `git show` object name, e.g. `:path` (the index) or `HEAD:path`.
// Returns:
//   the manifest's version string, or null when the object or the field is
//   absent. Throws when git fails for any other reason or the JSON is bad.
function versionAt(cwd, spec) {
    const r = spawnSync('git', ['show', spec], { cwd, encoding: 'utf-8' });
    if (r.status !== 0) {
        if (/does not exist|exists on disk, but not in|invalid object name|bad revision|unknown revision/i.test(r.stderr)) {
            return null;
        }
        throw new Error('git show ' + spec + ' failed: ' + (r.stderr || '').trim());
    }
    const v = JSON.parse(r.stdout).version;
    return typeof v === 'string' ? v : null;
}

// Args:
//   cwd: the repository whose staged commit is checked.
// Returns:
//   { ok, reason }: ok when the staged manifest's version is semver and above
//   HEAD's (any semver passes over no previous version); reason says why not.
function checkStaged(cwd) {
    const staged = versionAt(cwd, ':' + MANIFEST);
    if (staged === null || !SEMVER_RE.test(staged)) {
        return { ok: false, reason: 'The staged ' + MANIFEST + ' has no semver version (got ' +
            JSON.stringify(staged) + '). Set "version": "major.minor.patch".' };
    }
    const head = versionAt(cwd, 'HEAD:' + MANIFEST);
    if (head === null || !SEMVER_RE.test(head)) return { ok: true, reason: null };
    if (compareSemver(staged, head) > 0) return { ok: true, reason: null };
    return { ok: false, reason: 'The staged plugin version ' + staged + ' is not above HEAD\'s ' + head +
        ', so /plugin update would ignore this commit. Run `' + BUMP_CMD + '`, then `git add ' + MANIFEST +
        '` in its own command, and retry.' };
}

// Args:
//   file: the plugin.json to update.
// Returns:
//   the new version. Throws when the file has no semver version.
function bumpPatch(file) {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const m = SEMVER_RE.exec(manifest.version || '');
    if (!m) throw new Error(file + ' has no semver version to bump');
    manifest.version = m[1] + '.' + m[2] + '.' + (Number(m[3]) + 1);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
    return manifest.version;
}

if (require.main === module) {
    const mode = process.argv[2];
    if (mode === 'check') {
        const r = checkStaged(process.cwd());
        if (!r.ok) { console.error(r.reason); process.exit(1); }
    } else if (mode === 'bump') {
        console.log(bumpPatch(path.join(process.cwd(), MANIFEST)));
    } else {
        console.error('usage: node tools/plugin-version.js check|bump');
        process.exit(2);
    }
}

module.exports = { compareSemver, checkStaged, bumpPatch };
