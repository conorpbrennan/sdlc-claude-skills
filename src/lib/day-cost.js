// Today's (UTC) estimated Claude Code cost across all sessions of a project.
// Estimates today's cost from the transcripts. Sums the cost of every transcript message
// dated today under the project's transcript dir and its worktree dirs
// (`<project>--claude-worktrees-*`), sub-agent files included. Results are cached
// for a short ttl, and parsed per file by (size, mtime). Returns null on any failure.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_TTL_MS = 45 * 1000;
const DEADLINE_MS = 1500;
const CACHE_SUBDIR = 'claude-day-cost';
const WORKTREE_MARK = '/.claude/worktrees/';
const WORKTREE_DIR_INFIX = '--claude-worktrees-';
const TRANSCRIPT_EXT = '.jsonl';
const SYNTHETIC = '<synthetic>';
const HAIKU_4_5_PREFIX = 'claude-haiku-4-5-';
const HAIKU_4_5 = 'claude-haiku-4-5';
const DATE_LEN = 10;  // YYYY-MM-DD

// [input, output] USD per million tokens. These are rates probed from one API
// gateway on 24 Oct 2026, not published list prices, and they have not been
// re-verified. The day figure is an estimate; change the table if your rates differ.
const RATES = {
    'claude-opus-5-5': [4.0, 20.0],
    'claude-sonnet-5-5': [2.0, 10.0],
    'claude-haiku-5-5': [0.1, 0.5],
    'claude-opus-5': [5.5, 27.5],
    'claude-sonnet-5': [2.2, 11.0],
    'claude-haiku-4-5': [0.1, 0.5],
    'claude-fable-5-1': [5.5, 27.5],
};
const CACHE_WRITE_5M_MULT = 1.25;
const CACHE_WRITE_1H_MULT = 2.0;
// UNCONFIRMED: cache read = 0.1 x the input rate. Totals may be off.
const CACHE_READ_MULT = 0.1;
const PER_M = 1e6;

// Finds the transcript dirs for the project containing cwd, plus its worktree dirs.
//
// Args:
//   cwd: working directory from the status line JSON.
//   projectsRoot: directory holding one transcript dir per project.
// Returns:
//   array of transcript directory paths that exist (the project's own dir first).
function projectDirs(cwd, projectsRoot) {
    const root = cwd.split(WORKTREE_MARK)[0].replace(/\/+$/, '');
    const base = path.join(projectsRoot, root.replace(/[/.]/g, '-'));
    const baseName = path.basename(base);
    const dirs = [base];
    for (const name of fs.readdirSync(projectsRoot).sort()) {
        if (name.startsWith(baseName + WORKTREE_DIR_INFIX)) dirs.push(path.join(projectsRoot, name));
    }
    return dirs.filter((d) => {
        try { return fs.statSync(d).isDirectory(); } catch (e) { return false; }
    });
}

// Lists every .jsonl file under a directory, recursively.
//
// Args:
//   dir: directory to walk.
// Returns:
//   array of file paths.
function listTranscripts(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listTranscripts(full));
        else if (entry.name.endsWith(TRANSCRIPT_EXT)) out.push(full);
    }
    return out;
}

// Estimates the USD cost of one message.
//
// Args:
//   model: model id string.
//   usage: the message `usage` object.
//   out: output token count.
// Returns:
//   cost in USD, or 0 when the model has no known rate.
function messageCost(model, usage, out) {
    const name = model.startsWith(HAIKU_4_5_PREFIX) ? HAIKU_4_5 : model;
    if (!Object.prototype.hasOwnProperty.call(RATES, name)) return 0;
    const [pi, po] = RATES[name];
    const cc = usage.cache_creation || {};
    const write = usage.cache_creation_input_tokens || 0;
    const w1h = cc.ephemeral_1h_input_tokens || 0;
    return ((usage.input_tokens || 0) * pi
        + (write - w1h) * pi * CACHE_WRITE_5M_MULT
        + w1h * pi * CACHE_WRITE_1H_MULT
        + (usage.cache_read_input_tokens || 0) * pi * CACHE_READ_MULT
        + out * po) / PER_M;
}

// Collects today's messages of one transcript, deduped by (message id, requestId).
//
// Args:
//   file: transcript .jsonl path.
//   today: UTC date string YYYY-MM-DD.
// Returns:
//   object of "id|requestId" -> [output_tokens, cost_usd], keeping the max output_tokens.
function parseFile(file, today) {
    const best = {};
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.includes(today)) continue;
        let o;
        try { o = JSON.parse(line); } catch (e) { continue; }
        if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
        const m = o.message;
        if (String(o.timestamp || '').slice(0, DATE_LEN) !== today || !m || typeof m !== 'object') continue;
        const usage = m.usage;
        if (!usage || typeof usage !== 'object' || m.model == null || m.model === SYNTHETIC) continue;
        const key = m.id ? `${m.id}|${o.requestId}` : `n|${file}|${o.uuid}`;
        const out = usage.output_tokens || 0;
        if (!(key in best) || out > best[key][0]) best[key] = [out, messageCost(String(m.model), usage, out)];
    }
    return best;
}

// Sums today's cost over all transcripts, reusing per-file results.
//
// Args:
//   dirs: transcript directories.
//   today: UTC date string.
//   filesCache: object path -> { sig, best }; updated in place.
//   deadline: epoch ms after which the computation gives up by throwing.
// Returns:
//   total USD for today.
function compute(dirs, today, filesCache, deadline) {
    const dayStart = Date.parse(`${today}T00:00:00Z`);
    const merged = {};
    const live = {};
    for (const dir of dirs) {
        for (const file of listTranscripts(dir)) {
            if (Date.now() > deadline) throw new Error('day-cost deadline');
            const st = fs.statSync(file);
            if (st.mtimeMs < dayStart) continue;
            const sig = [st.size, st.mtimeMs];
            let ent = filesCache[file];
            if (!ent || ent.sig[0] !== sig[0] || ent.sig[1] !== sig[1]) ent = { sig, best: parseFile(file, today) };
            live[file] = ent;
            for (const [k, v] of Object.entries(ent.best)) {
                if (!(k in merged) || v[0] > merged[k][0]) merged[k] = v;
            }
        }
    }
    for (const k of Object.keys(filesCache)) delete filesCache[k];
    Object.assign(filesCache, live);
    return Object.values(merged).reduce((sum, v) => sum + v[1], 0);
}

// Reads the result cache file.
//
// Args:
//   cachePath: cache file path.
// Returns:
//   the parsed cache object, or {} when it is missing or unreadable.
function readCache(cachePath) {
    try {
        const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        return c && typeof c === 'object' ? c : {};
    } catch (e) {
        return {};
    }
}

// Computes today's (UTC) cost across the status line's project and its worktrees.
//
// Args:
//   input: the status line JSON object (uses workspace.current_dir, else cwd).
//   options: { projectsRoot, cacheDir, now (epoch ms), ttlMs, deadlineMs }, all optional.
// Returns:
//   the cost in USD as a number, or null on any failure.
function dayCost(input, options = {}) {
    try {
        const projectsRoot = options.projectsRoot || path.join(os.homedir(), '.claude', 'projects');
        const cacheDir = options.cacheDir
            || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), CACHE_SUBDIR);
        const now = options.now == null ? Date.now() : options.now;
        const ttlMs = options.ttlMs == null ? CACHE_TTL_MS : options.ttlMs;
        const deadline = Date.now() + (options.deadlineMs == null ? DEADLINE_MS : options.deadlineMs);

        const data = input || {};
        const cwd = (data.workspace && data.workspace.current_dir) || data.cwd || '';
        if (!cwd) return null;
        const dirs = projectDirs(cwd, projectsRoot);
        if (!dirs.length) return null;

        const today = new Date(now).toISOString().slice(0, DATE_LEN);
        const cachePath = path.join(cacheDir, `${path.basename(dirs[0])}.json`);
        const cache = readCache(cachePath);
        if (cache.date === today && typeof cache.total === 'number' && now - (cache.at || 0) < ttlMs) {
            return cache.total;
        }
        const files = cache.date === today && cache.files && typeof cache.files === 'object' ? cache.files : {};
        const total = compute(dirs, today, files, deadline);
        fs.mkdirSync(cacheDir, { recursive: true });
        const tmp = `${cachePath}.${process.pid}`;
        fs.writeFileSync(tmp, JSON.stringify({ date: today, at: now, total, files }));
        fs.renameSync(tmp, cachePath);
        return total;
    } catch (e) {
        return null;
    }
}

module.exports = { RATES, dayCost };
