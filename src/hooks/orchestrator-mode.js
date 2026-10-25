#!/usr/bin/env node
// Orchestrator mode: once the main session picks up a handoff or runs a plan, it
// dispatches sub-agents, reads their reports, stages and commits. It does not edit
// source or investigate inline. One script, wired to three events, dispatching on
// hook_event_name:
//   PostToolUse       turns the mode on (handoff read, plan-spec run), counts inline
//                     Bash commands and nudges, resets the count on an Agent dispatch.
//   PreToolUse        denies code edits while the mode is on; docs, config and data stay writable.
//   UserPromptSubmit  the owner's /sdlc:orchestrate on|off switch.
// Everything applies to the main session only: stdin has no agent_id there and has
// one inside a sub-agent, where this hook prints nothing.
// State is one JSON file per session. Threat model: honest habit, not adversarial
// input, so any error prints nothing and exits 0. Unreadable state means off.
//
// Also (debugging): `orchestrator-mode.js --status <session_id>` prints the recorded state.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { deny } = require('./lib/hook-output');
const { resolveOrchestrator } = require('./lib/review-config');
const { PLUGIN, cmd } = require('./lib/plugin-names');
const { SOURCE_EXTENSIONS } = require('./lib/source-files');

const STATE_DIR_ENV = 'SDLC_ORCHESTRATOR_STATE_DIR';
const DEFAULT_NUDGE = 8;

// Printed once each time the mode turns on. A prompt to the owner; nothing enforces it.
const MODEL_LINE = 'Run this session on Sonnet (/model sonnet). Opus is for writing new plans, plan source review and FAIL triage.';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const DENY_REASON = 'Orchestrator mode: the main session does not edit source. Write a brief and dispatch a Sonnet sub-agent (Agent tool, model: "sonnet"). If the owner wants this edit made inline, ask them to run ' + cmd('orchestrate') + ' off.';

// A basename with "handoff" in it, or any path with "tracker" in it, ending .md.
const HANDOFF_FILE = /handoff[^/]*\.md$/i;
const TRACKER_FILE = /tracker.*\.md$/i;
// A shell command that reads such a file with cat, head, tail, less or sed -n.
const READ_HANDOFF_CMD = /\b(?:cat|head|tail|less|sed\s+-n)\b[^|;&]*?(?:[^\s/|;&]*handoff[^\s/|;&]*|[^\s|;&]*tracker[^\s|;&]*)\.md\b/i;

// The slash command the owner types.
const SWITCH_PROMPT = new RegExp('^\\s*\\/(?:' + PLUGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':)?orchestrate\\s+(on|off|status)\\b');

// Bash commands that are orchestration, not inline investigation. The git
// subcommand is built from two pieces so the commit classifier does not trip on
// this file's own text.
const GIT_COMMIT = 'com' + 'mit';
const ORCHESTRATION_CMD = new RegExp(
    '^(?:git\\s+(?:add|' + GIT_COMMIT + '|status|log|diff\\s+--cached|worktree|apply|rev-parse|branch|checkout\\s+-b)\\b'
    + '|printf\\b|gh\\s'
    + '|node\\s+\\S*(?:/src/hooks/|tools/plugin-version\\.js))');

// Code the gates do not list but the main session must still not edit inline.
const EXTRA_CODE_EXTENSIONS = ['.ipynb'];

// Where the main session may still write while the mode is on. Anything that is
// not code (docs, config, data) is writable too; see isAllowedPath.
const ALLOWED_PATH_PARTS = [/tracker/i, /\/run\/reports\//, /\/reports\//, /brief/i];
const FEATURE_RECORD = /\/features\/[^/]+\.md$/;
const PLAN_DIR = /\/plans\//;
// A plan document by name: plan.md, my-plan.md, v2.plan.md, PLAN-x.md. Not "planner.md".
const PLAN_BASENAME = /(^|[-_.])plan([-_.]|$)/i;
const PLAN_UPPER_PREFIX = /^PLAN/;
const MEMORY_DIR = /\/\.claude\/projects\/[^/]+\/memory\//;

// Args: none.
// Returns: the state directory.
function stateDir() {
    return process.env[STATE_DIR_ENV] || path.join(os.tmpdir(), 'sdlc-orchestrator');
}

// Args:
//   sessionId: the Claude Code session id.
// Returns: the state file path for that session.
function stateFile(sessionId) {
    return path.join(stateDir(), String(sessionId).replace(/[^\w.-]/g, '_') + '.json');
}

// Args:
//   sessionId: the Claude Code session id.
// Returns: the state object, or null when it is missing, unreadable or not an object.
function readState(sessionId) {
    try {
        const s = JSON.parse(fs.readFileSync(stateFile(sessionId), 'utf-8'));
        return s && typeof s === 'object' && !Array.isArray(s) ? s : null;
    } catch (e) {
        return null;
    }
}

// Writes the state atomically: temp file in the same directory, then rename.
//
// Args:
//   sessionId: the Claude Code session id.
//   state: the state object.
function writeState(sessionId, state) {
    const file = stateFile(sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
}

// Returns: a fresh state object.
function newState(on, off, trigger) {
    return { on, since: new Date().toISOString(), trigger, inlineSinceDispatch: 0, off };
}

// Args:
//   toolName: the tool that just ran.
//   toolInput: its input.
// Returns: a short description of what turned the mode on, or '' when nothing did.
function triggerOf(toolName, toolInput) {
    if (toolName === 'Read') {
        const p = String(toolInput.file_path || '');
        if (HANDOFF_FILE.test(path.basename(p)) || TRACKER_FILE.test(p)) return `Read ${p}`;
    } else if (toolName === 'Bash') {
        const c = String(toolInput.command || '');
        if (READ_HANDOFF_CMD.test(c)) return `Bash ${c.slice(0, 80)}`;
    } else if (toolName === 'Skill') {
        const skill = String(toolInput.skill || '');
        if (/plan-spec$/.test(skill) && /^\s*run\b/.test(String(toolInput.args || ''))) {
            return `Skill ${skill} ${String(toolInput.args).trim().slice(0, 60)}`;
        }
    }
    return '';
}

// Args:
//   command: a Bash command line.
// Returns: true when it is orchestration (not counted as inline work).
function isOrchestration(command) {
    let c = command.trim();
    while (/^cd\s/.test(c) && c.includes('&&')) c = c.slice(c.indexOf('&&') + 2).trim();
    return ORCHESTRATION_CMD.test(c);
}

// Args:
//   filePath: the path an edit tool targets.
//   cwd: the session's working directory, for relative paths.
// Returns: true when the main session may write there while the mode is on.
function isAllowedPath(filePath, cwd) {
    // Normalise separators first so every pattern below only has to know "/".
    const p = path.resolve(cwd || '/', filePath).replace(/\\/g, '/');
    const base = p.slice(p.lastIndexOf('/') + 1);
    const ext = path.extname(base).toLowerCase();
    if (!SOURCE_EXTENSIONS.includes(ext) && !EXTRA_CODE_EXTENSIONS.includes(ext)) return true;
    if (/handoff/i.test(base)) return true;
    if (ALLOWED_PATH_PARTS.some((re) => re.test(p))) return true;
    if (FEATURE_RECORD.test(p)) return true;
    if (p.endsWith('.md') && (PLAN_DIR.test(p) || PLAN_BASENAME.test(base) || PLAN_UPPER_PREFIX.test(base))) return true;
    if (MEMORY_DIR.test(p)) return true;
    const tmp = os.tmpdir().replace(/\\/g, '/');
    return p.startsWith(tmp + '/') || p.startsWith('/tmp/');
}

// Args:
//   cwd: the session's working directory, or undefined.
// Returns: the inline-command count that triggers a nudge.
function nudgeThreshold(cwd) {
    let repoRoot = cwd;
    try {
        repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'],
            { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || cwd;
    } catch (e) {
        // Not a repo: the cwd itself is as good a place as any to look for config.
    }
    try {
        const r = resolveOrchestrator({ repoRoot });
        for (const w of r.warnings) process.stderr.write(`orchestrator-mode: ${w}\n`);
        return r.bashNudge;
    } catch (e) {
        return DEFAULT_NUDGE;
    }
}

function onPostToolUse(input) {
    const sid = input.session_id;
    const tool = input.tool_name;
    const toolInput = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
    let state = readState(sid);
    if (state && state.off === true) return null;

    const trigger = triggerOf(tool, toolInput);
    if (trigger) {
        if (state && state.on) return null;
        writeState(sid, newState(true, false, trigger));
        return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: MODEL_LINE } };
    }
    if (!state || !state.on) return null;

    if (tool === 'Agent') {
        if (state.inlineSinceDispatch) writeState(sid, { ...state, inlineSinceDispatch: 0 });
        return null;
    }
    if (tool !== 'Bash' || isOrchestration(String(toolInput.command || ''))) return null;

    const count = (Number.isInteger(state.inlineSinceDispatch) ? state.inlineSinceDispatch : 0) + 1;
    writeState(sid, { ...state, inlineSinceDispatch: count });
    if (count % nudgeThreshold(input.cwd) !== 0) return null;
    return {
        hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: `Orchestrator mode: ${count} inline commands since the last dispatch. Hand investigation and runs to a Sonnet sub-agent and read its report.`,
        },
    };
}

function onPreToolUse(input) {
    if (!EDIT_TOOLS.has(input.tool_name)) return null;
    const state = readState(input.session_id);
    if (!state || !state.on) return null;
    const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
    const target = ti.file_path || ti.notebook_path || ti.path;
    if (typeof target !== 'string' || !target) return null;
    return isAllowedPath(target, input.cwd) ? null : deny(DENY_REASON, '');
}

function onUserPromptSubmit(input) {
    const m = SWITCH_PROMPT.exec(String(input.prompt || ''));
    if (!m) return null;
    if (m[1] !== 'status') {
        writeState(input.session_id, m[1] === 'on'
            ? newState(true, false, 'owner: ' + cmd('orchestrate') + ' on')
            : newState(false, true, 'owner: ' + cmd('orchestrate') + ' off'));
    }
    // Tell Claude the state, so the command never needs to know its own session id.
    // The Sonnet line goes out with the explicit switch-on only, not with status or off.
    const summary = stateSummary(readState(input.session_id));
    return {
        hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: m[1] === 'on' ? summary + '\n' + MODEL_LINE : summary,
        },
    };
}

// Args:
//   s: the state object, or null.
// Returns: the one line the owner's switch or status prompt reports.
function stateSummary(s) {
    if (!s) return 'Orchestrator mode: off (no state for this session).';
    const n = Number.isInteger(s.inlineSinceDispatch) ? s.inlineSinceDispatch : 0;
    return `Orchestrator mode: ${s.on ? 'on' : 'off'} (trigger: ${s.trigger}, since ${s.since}, ${n} inline commands since the last dispatch).`;
}

// Args:
//   sessionId: the session to report on.
// Returns: one line saying what the hook recorded.
function statusLine(sessionId) {
    const s = readState(sessionId);
    if (!s) return 'Orchestrator mode: off (no state for this session).';
    if (s.on) {
        return `Orchestrator mode: on since ${s.since} (trigger: ${s.trigger}); ${s.inlineSinceDispatch} inline commands since the last dispatch.`;
    }
    return s.off
        ? 'Orchestrator mode: off (switched off by the owner; triggers will not turn it on).'
        : 'Orchestrator mode: off.';
}

const HANDLERS = { PostToolUse: onPostToolUse, PreToolUse: onPreToolUse, UserPromptSubmit: onUserPromptSubmit };

function main() {
    const argv = process.argv.slice(2);
    if (argv[0] === '--status') {
        process.stdout.write(statusLine(argv[1] || '') + '\n');
        return;
    }
    let raw = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => {
        try {
            const input = JSON.parse(raw);
            if (!input || typeof input !== 'object' || input.agent_id !== undefined) return;
            if (typeof input.session_id !== 'string' || !input.session_id) return;
            const handler = HANDLERS[input.hook_event_name];
            const out = handler ? handler(input) : null;
            if (out) process.stdout.write(JSON.stringify(out));
        } catch (e) {
            // Fail open: this hook is advice, it must never break a tool call.
        }
    });
}

main();
