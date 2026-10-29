// Opt-in installer for the sdlc status line. A plugin cannot set the main
// `statusLine` itself, so this merges ONLY that key into the user's settings.json and
// copies the scripts to the plugin data dir (which survives plugin updates).
//
// Usage: node statusline-install.js [--dry-run] [--force] [--remove]
//            [--settings <path>] [--data-dir <path>]
// Exit codes: 0 done, 2 refused (nothing written), 1 unexpected failure.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_REFUSED = 2;

const STATUSLINE_KEY = 'statusLine';
const SETTINGS_FILE = 'settings.json';
const CLAUDE_DIR = '.claude';
const DEFAULT_DATA_SUBPATH = path.join('plugins', 'data', 'sdlc-sdlc-claude-skills');
const SCRIPT_DIR = 'statusline';
const SCRIPT_NAME = 'statusline.js';
// Every file src/statusline.js requires, relative to src/. The lib/ layout is kept.
const COPY_FILES = [SCRIPT_NAME, path.join('lib', 'day-cost.js')];
const BACKUP_INFIX = '.backup.';
const BACKUP_SUFFIX = '-pre-sdlc-statusline';
const JSON_INDENT = 2;
const DEFAULT_MODE = 0o644;
const NEXT_SESSION_NOTE = 'The status line appears from the next session or refresh.';

const PLATFORM_WINDOWS = 'win32';
const UNSAFE_PATH_CHARS = ['"', '$', '`', '\\'];

const FLAG_DRY_RUN = '--dry-run';
const FLAG_FORCE = '--force';
const FLAG_REMOVE = '--remove';
const FLAG_SETTINGS = '--settings';
const FLAG_DATA_DIR = '--data-dir';

// Thrown for a refusal: nothing has been written when it is raised.
class Refusal extends Error {}

// Parses the command line.
//
// Args:
//   argv: arguments after the script name.
// Returns:
//   { dryRun, force, remove, settings, dataDir } where the paths are '' when not given.
// Raises:
//   Refusal: on an unknown flag or a missing value.
function parseArgs(argv) {
    const opts = { dryRun: false, force: false, remove: false, settings: '', dataDir: '' };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === FLAG_DRY_RUN) opts.dryRun = true;
        else if (a === FLAG_FORCE) opts.force = true;
        else if (a === FLAG_REMOVE) opts.remove = true;
        else if (a === FLAG_SETTINGS || a === FLAG_DATA_DIR) {
            const value = argv[++i];
            if (!value) throw new Refusal(`${a} needs a path.`);
            if (a === FLAG_SETTINGS) opts.settings = path.resolve(value);
            else opts.dataDir = path.resolve(value);
        } else throw new Refusal(`Unknown argument: ${a}`);
    }
    return opts;
}

// Resolves the settings file and the data dir from flags, then the environment.
//
// On Windows the backslash is a path separator, not an unsafe character: the command
// string uses the data dir with backslashes turned into forward slashes (node accepts
// them), and the unsafe-character check runs on that form. File operations keep the
// native dataDir and scriptPath.
//
// Args:
//   opts: parsed options.
//   env: environment variables.
//   platform: the Node platform name; defaults to the running one. Tests pass 'win32'.
// Returns:
//   { settings, dataDir, scriptDir, scriptPath, command } (native absolute paths; command
//   is the statusLine command string).
// Raises:
//   Refusal: when the data dir has a double quote, $ or backtick, or (off Windows) a backslash.
function resolvePaths(opts, env, platform = process.platform) {
    const configDir = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), CLAUDE_DIR);
    const settings = opts.settings || path.join(configDir, SETTINGS_FILE);
    const dataDir = opts.dataDir || env.CLAUDE_PLUGIN_DATA || path.join(configDir, DEFAULT_DATA_SUBPATH);
    const scriptDir = path.join(dataDir, SCRIPT_DIR);
    const scriptPath = path.join(scriptDir, SCRIPT_NAME);
    const isWindows = platform === PLATFORM_WINDOWS;
    const commandDir = isWindows ? dataDir.replace(/\\/g, '/') : dataDir;
    for (const ch of UNSAFE_PATH_CHARS) {
        if (commandDir.includes(ch)) {
            throw new Refusal(`The data dir ${dataDir} contains ${ch} which would break or expand in the shell command. Pick another --data-dir.`);
        }
    }
    const commandPath = isWindows ? `${commandDir.replace(/\/+$/, '')}/${SCRIPT_DIR}/${SCRIPT_NAME}` : scriptPath;
    return { settings, dataDir, scriptDir, scriptPath, command: `node "${commandPath}"` };
}

// Reads the settings file for a merge, refusing anything that is not a plain JSON object file.
//
// Args:
//   file: settings path.
// Returns:
//   { exists, doc, mode, raw }: doc is {} when the file does not exist; mode and raw are
//   null then.
// Raises:
//   Refusal: when the path is a symlink, not a regular file, invalid JSON or not an object.
function readSettings(file) {
    let st;
    try {
        st = fs.lstatSync(file);
    } catch (e) {
        if (e.code === 'ENOENT') return { exists: false, doc: {}, mode: null, raw: null };
        throw e;
    }
    if (st.isSymbolicLink()) throw new Refusal(`${file} is a symlink. Not touching it.`);
    if (!st.isFile()) throw new Refusal(`${file} is not a regular file.`);
    const raw = fs.readFileSync(file);
    if (raw.length === 0) throw new Refusal(`${SETTINGS_FILE} is empty. Put {} in it, or delete it, then re-run.`);
    if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
        throw new Refusal(`${SETTINGS_FILE} starts with a byte order mark (BOM). Save it as UTF-8 without BOM, then re-run.`);
    }
    let doc;
    try {
        doc = JSON.parse(raw.toString('utf8'));
    } catch (e) {
        throw new Refusal(`${file} is not valid JSON (${e.message}). Fix it first.`);
    }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
        throw new Refusal(`${file} is not a JSON object. Not touching it.`);
    }
    return { exists: true, doc, mode: st.mode & 0o777, raw };
}

// Tells whether a statusLine value is one of ours (its command is ours).
//
// Args:
//   value: the existing statusLine value.
//   command: our command string.
// Returns:
//   true when value is an object whose command equals ours.
function isOurs(value, command) {
    return !!value && typeof value === 'object' && value.command === command;
}

// Names a backup file for the settings file, unique even within one millisecond.
//
// Args:
//   file: settings path.
//   attempt: 0 for the first try, higher after a name clash.
// Returns:
//   the backup path next to the settings file.
function backupPath(file, attempt) {
    const stamp = new Date().toISOString().replace(/[-:.]/g, '');
    const tag = attempt ? `${stamp}-${attempt}` : stamp;
    return `${file}${BACKUP_INFIX}${tag}${BACKUP_SUFFIX}`;
}

// Copies the settings file to a new backup file next to it, never overwriting one.
//
// Args:
//   file: settings path (must exist).
// Returns:
//   the backup path.
function writeBackup(file) {
    for (let attempt = 0; ; attempt++) {
        const target = backupPath(file, attempt);
        try {
            fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
            return target;
        } catch (e) {
            if (e.code !== 'EEXIST' || attempt > 1000) throw e;
        }
    }
}

// Writes a file through a temp file plus rename.
//
// Args:
//   file: destination path.
//   data: string or Buffer to write.
//   mode: file mode to give the result.
// Returns:
//   nothing.
function atomicWrite(file, data, mode) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    try {
        fs.writeFileSync(tmp, data, { mode });
        fs.chmodSync(tmp, mode);
        fs.renameSync(tmp, file);
    } catch (e) {
        fs.rmSync(tmp, { force: true });
        throw e;
    }
}

// Copies the status line scripts into the data dir, keeping the lib/ layout.
//
// Args:
//   scriptDir: destination directory.
// Returns:
//   nothing.
function copyScripts(scriptDir) {
    for (const rel of COPY_FILES) {
        atomicWrite(path.join(scriptDir, rel), fs.readFileSync(path.join(__dirname, rel)), DEFAULT_MODE);
    }
}

// Writes the settings document: backup first when the file exists, then temp plus rename.
//
// Args:
//   file: settings path.
//   current: the result of readSettings for it.
//   doc: the new document.
//   log: collects output lines.
// Returns:
//   nothing.
function writeSettings(file, current, doc, log) {
    if (current.exists) log.push(`backup: ${writeBackup(file)}`);
    atomicWrite(file, JSON.stringify(doc, null, JSON_INDENT) + '\n', current.mode === null ? DEFAULT_MODE : current.mode);
}

// Plans and runs an install.
//
// Args:
//   opts: parsed options.
//   p: resolved paths.
//   log: collects output lines.
// Returns:
//   the exit code.
function doInstall(opts, p, log) {
    const current = readSettings(p.settings);
    const existing = current.doc[STATUSLINE_KEY];
    // A null statusLine is the same as none.
    const has = Object.prototype.hasOwnProperty.call(current.doc, STATUSLINE_KEY) && existing !== null;
    const ours = has && isOurs(existing, p.command);
    if (has && !ours && !opts.force) {
        log.push(`${p.settings} already has a statusLine: ${JSON.stringify(existing)}`);
        if (existing && typeof existing === 'object' && typeof existing.command === 'string') {
            log.push(`Existing command: ${existing.command}`);
        }
        log.push('Re-run with --force to replace it (a backup is written first).');
        return EXIT_REFUSED;
    }
    const verb = opts.dryRun ? 'would ' : '';
    if (ours) {
        log.push(`already installed in ${p.settings}`);
    } else {
        // Merge only this key; every other key keeps its place and value.
        const merged = { ...current.doc, [STATUSLINE_KEY]: { type: 'command', command: p.command, padding: 0 } };
        if (!opts.dryRun) {
            // Settings are validated and the merge is built; copy first so a copy
            // failure leaves settings untouched.
            copyScripts(p.scriptDir);
            log.push(`copied scripts to ${p.scriptDir}`);
            writeSettings(p.settings, current, merged, log);
            log.push(`merged statusLine into ${p.settings}`);
        } else {
            log.push(`would copy ${COPY_FILES.join(', ')} to ${p.scriptDir}`);
            if (current.exists) log.push(`would backup ${p.settings} to ${backupPath(p.settings, 0)}`);
            log.push(`would merge statusLine into ${p.settings}`);
        }
        log.push(NEXT_SESSION_NOTE);
        return EXIT_OK;
    }
    if (opts.dryRun) log.push(`${verb}copy (refresh) ${COPY_FILES.join(', ')} to ${p.scriptDir}`);
    else {
        copyScripts(p.scriptDir);
        log.push(`refreshed scripts in ${p.scriptDir}`);
    }
    return EXIT_OK;
}

// Plans and runs a removal.
//
// Args:
//   opts: parsed options.
//   p: resolved paths.
//   log: collects output lines.
// Returns:
//   the exit code.
function doRemove(opts, p, log) {
    const current = readSettings(p.settings);
    const has = Object.prototype.hasOwnProperty.call(current.doc, STATUSLINE_KEY);
    if (!has) {
        log.push(`nothing to remove: no statusLine in ${p.settings}`);
        return EXIT_OK;
    }
    if (!isOurs(current.doc[STATUSLINE_KEY], p.command)) {
        log.push(`The statusLine in ${p.settings} is not the sdlc one; leaving it alone.`);
        return EXIT_REFUSED;
    }
    const verb = opts.dryRun ? 'would ' : '';
    if (opts.dryRun) {
        log.push(`${verb}backup ${p.settings} to ${backupPath(p.settings, 0)}`);
    } else {
        const rest = { ...current.doc };
        delete rest[STATUSLINE_KEY];
        writeSettings(p.settings, current, rest, log);
    }
    log.push(`${verb}remove statusLine from ${p.settings}`);
    if (!opts.dryRun) fs.rmSync(p.scriptDir, { recursive: true, force: true });
    log.push(`${opts.dryRun ? 'would remove' : 'removed'} ${p.scriptDir}`);
    return EXIT_OK;
}

// Script entry: runs the install or removal and prints one line per action.
//
// Args:
//   argv: arguments after the script name.
//   env: environment variables.
// Returns:
//   the exit code.
function main(argv, env) {
    const log = [];
    let code;
    try {
        const opts = parseArgs(argv);
        const p = resolvePaths(opts, env);
        code = opts.remove ? doRemove(opts, p, log) : doInstall(opts, p, log);
    } catch (e) {
        if (e instanceof Refusal) {
            log.push(e.message);
            code = EXIT_REFUSED;
        } else {
            log.push(`statusline install failed: ${e && e.message ? e.message : e}`);
            code = EXIT_FAIL;
        }
    }
    process.stdout.write(`${log.join('\n')}\n`);
    return code;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2), process.env);

module.exports = { main, parseArgs, resolvePaths, Refusal };
