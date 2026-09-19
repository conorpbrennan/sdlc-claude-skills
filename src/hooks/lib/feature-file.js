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

module.exports = {
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
};
