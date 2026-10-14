// Shared helpers for the feature-tracking hooks (session-start-feature.js,
// pre-commit-feature.js, post-commit-feature.js).
//
// These three hooks all need the same notions of "what is a feature branch",
// "what is a source file", and "how is features/<slug>.md shaped". Keeping
// them here stops the three copies from drifting apart.

const path = require('path');

// Branches that never get a feature file. Work on these is not feature work.
const BLOCKLIST_BRANCHES = new Set([
    'main', 'master', 'develop', 'trunk', 'HEAD',
]);

// One shared definition, in lib/source-files.js. This file used to carry its own
// copy, which -- like the other three -- did not list `.sh`, so a shell-only commit
// read as docs-only and could go onto `main` with no branch and no feature file.
// It is gated now because the shared list adds shell.
const sourceFiles = require('./source-files');
const { SOURCE_EXTENSIONS, EXCLUDE_PATTERNS } = sourceFiles;

const PLACEHOLDER = '<!-- populated on commit -->';

const ACCEPTANCE_HEADING = '## Acceptance';
const VERIFICATION_HEADING = '## Verification';
const CRITERION_LINE = /^\d+\.\s+(.+)$/;

// Offsets of the section whose heading line starts with `heading`: `start` is the
// heading's first character, `end` the first character of the next line that starts
// with `## ` (a `### ` line does not), or the end of the content. Null when absent.
function sectionBounds(content, heading) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const open = new RegExp('^' + escaped, 'm').exec(content);
    if (!open) return null;
    const afterHeading = content.indexOf('\n', open.index);
    if (afterHeading === -1) return { start: open.index, end: content.length };
    const next = /^## /m.exec(content.slice(afterHeading + 1));
    return {
        start: open.index,
        end: next ? afterHeading + 1 + next.index : content.length,
    };
}

// A branch is "feature work" if it is not a trunk branch, not a release
// branch, and not one of Claude Code's generated worktree branches. Worktree
// branches are exempt because they are machine-named and short-lived — gating
// them would break subagent worktrees.
function isFeatureBranch(branch) {
    if (!branch) return false;
    if (BLOCKLIST_BRANCHES.has(branch)) return false;
    if (branch.startsWith('release/')) return false;
    if (branch.startsWith('worktree-')) return false;
    if (branch.includes(' ')) return false;
    return true;
}

// Branches the commit gate refuses source commits on. Narrower than
// !isFeatureBranch: release/ and worktree- branches are exempt from the gate
// (hotfixes and subagent worktrees must stay committable) but still get no
// feature file.
function isGatedBranch(branch) {
    return !!branch && BLOCKLIST_BRANCHES.has(branch);
}

function isSourceFile(file) {
    return sourceFiles.isSourcePath(file);
}

function hasSourceFile(files) {
    return files.some(isSourceFile);
}

function isFeatureFile(file) {
    return file.startsWith('features/') && file.endsWith('.md');
}

// True when every path in a non-empty list is a features/*.md file. Used as a
// loop guard: a commit that only carries feature files is bookkeeping, not
// feature work.
function onlyFeatureFiles(files) {
    if (files.length === 0) return false;
    return files.every(isFeatureFile);
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function titleCase(slug) {
    return slug.split('-').map(w =>
        w.length ? w[0].toUpperCase() + w.slice(1) : w
    ).join(' ');
}

function stubContent(slug, branch) {
    return [
        '# ' + titleCase(slug),
        '',
        '**Requirement**: _TBD — Claude should capture this from the user at session start_',
        '',
        '**Started**: ' + today(),
        '**Last updated**: ' + today(),
        '**Branch**: ' + branch,
        '',
        '## Files involved',
        '',
        PLACEHOLDER,
        '',
        '## History',
        '',
        PLACEHOLDER,
        '',
    ].join('\n');
}

function hasTbdRequirement(content) {
    return /\*\*Requirement\*\*:\s*_TBD/.test(content);
}

// Extract the bullet list under "## Files involved". Stops at the next heading.
function parseFilesInvolved(content) {
    const m = content.match(/## Files involved\s*\n([\s\S]*?)(?=\n## |$)/);
    if (!m) return [];
    return m[1]
        .split('\n')
        .map(l => l.replace(/^\s*-\s*/, '').trim())
        .filter(l => l && !l.startsWith('<!--'));
}

function renderFilesInvolved(paths) {
    const uniq = Array.from(new Set(paths)).sort();
    if (!uniq.length) return PLACEHOLDER;
    return uniq.map(p => '- ' + p).join('\n');
}

function setLastUpdated(content) {
    return content.replace(/^\*\*Last updated\*\*:.*$/m, '**Last updated**: ' + today());
}

// Merge `files` into the existing "Files involved" list, deduped and sorted.
// The heading is re-emitted rather than reused: `\s*\n` swallows the blank
// line after it, so echoing the match back used to leave a double blank line.
function mergeFilesInvolved(content, files) {
    const merged = renderFilesInvolved(parseFilesInvolved(content).concat(files));
    return content.replace(
        /## Files involved\s*\n([\s\S]*?)(?=\n## |$)/,
        () => '## Files involved\n\n' + merged + '\n',
    );
}

// Prepend a history entry (newest first) under "## History".
function prependHistory(content, entry) {
    if (new RegExp('## History\\s*\\n\\s*' + PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*').test(content)) {
        return content.replace(
            new RegExp('## History\\s*\\n\\s*' + PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'),
            '## History\n\n' + entry + '\n',
        );
    }
    if (/## History\s*\n/.test(content)) {
        return content.replace(/(## History\s*\n\s*)/, '$1' + entry + '\n\n');
    }
    return content.replace(/\s*$/, '\n\n## History\n\n' + entry + '\n');
}

// The acceptance criteria: each `N. text` line under "## Acceptance", up to the next
// `## ` heading, trimmed, in file order. Not renumbered, because the text order is
// what the verification hash covers. [] when the heading or any numbered line is absent.
function parseAcceptance(content) {
    const bounds = sectionBounds(content, ACCEPTANCE_HEADING);
    if (!bounds) return [];
    const body = content.slice(bounds.start, bounds.end).split('\n').slice(1);
    const criteria = [];
    for (const line of body) {
        const m = CRITERION_LINE.exec(line.trim());
        if (m) criteria.push(m[1].trim());
    }
    return criteria;
}

// Replace the "## Verification" block (heading line to the next `## ` heading or end
// of file) with `section`, which starts "## Verification" and ends with a newline.
// With no such block, append it after one blank line. Every other section stays
// byte-identical, "## History" included.
function replaceVerification(content, section) {
    const bounds = sectionBounds(content, VERIFICATION_HEADING);
    if (!bounds) return content.replace(/\s*$/, '') + '\n\n' + section;
    const tail = content.slice(bounds.end);
    return content.slice(0, bounds.start) + section + (tail ? '\n' + tail : '');
}

module.exports = {
    ACCEPTANCE_HEADING,
    BLOCKLIST_BRANCHES,
    SOURCE_EXTENSIONS,
    EXCLUDE_PATTERNS,
    PLACEHOLDER,
    isFeatureBranch,
    isGatedBranch,
    isSourceFile,
    hasSourceFile,
    isFeatureFile,
    onlyFeatureFiles,
    today,
    titleCase,
    stubContent,
    hasTbdRequirement,
    parseFilesInvolved,
    renderFilesInvolved,
    setLastUpdated,
    mergeFilesInvolved,
    prependHistory,
    parseAcceptance,
    replaceVerification,
};
