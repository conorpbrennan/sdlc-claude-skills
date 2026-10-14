// The recorder: turns the verifier's report into the feature record's
// "## Verification" section and the verification marker.
//
// Usage (from inside the repository, on the feature branch):
//   node record-verification.js --report <path>
//
// Exit 0: the report is a PASS and the record and marker are written.
// Exit 1: the report is a FAIL; the record says so and any marker is deleted.
// Exit 2: nothing was verified (not a repo, no record, no criteria, a dirty
// tree, an unreadable report, any crash). Exit 2 before the write point leaves
// the record and the marker untouched.
//
// Every check runs before the first write. The record is written before the
// marker, so a crash between the two leaves no marker the record does not back.
// The recorder only reads git; it never stages and never commits.
'use strict';

const fs = require('fs');
const path = require('path');

const { gitRead, locateRepo } = require('./lib/git-read');
const { markerPaths } = require('./lib/review-markers');
const { isFeatureBranch, parseAcceptance, replaceVerification, today } = require(path.join(__dirname, 'lib', 'feature-file'));
const verification = require('./lib/verification');
const { logEvent } = require('./timing-log');
const { cmd } = require('./lib/plugin-names');

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_ERROR = 2;
const REPORT_FLAG = '--report';
const VERDICT_PASS = 'PASS';
const TRAILER_PREFIX = 'VERIFY_GATE: ';

// Raised for a refusal whose message is the whole explanation.
class Refusal extends Error {}

// Args:
//   argv: string[], the arguments after the script name.
// Returns:
//   string: the value after --report.
function reportPathFrom(argv) {
    const i = argv.indexOf(REPORT_FLAG);
    if (i === -1 || !argv[i + 1]) throw new Refusal('usage: node record-verification.js --report <path>');
    return argv[i + 1];
}

// Args:
//   args: string[], the git arguments, read-only.
//   cwd: string, the repository.
// Returns:
//   string: trimmed stdout. Throws Refusal on any git error.
function gitText(args, cwd) {
    const r = gitRead(args, { cwd });
    if (r.out === null) throw new Refusal('git ' + args.join(' ') + ' failed: ' + r.error);
    return r.out.trim();
}

// Args:
//   argv: string[], the arguments after the script name.
//   cwd: string, the directory the recorder was run from.
// Returns:
//   number: the exit code. Throws on refusal or crash, before any write.
function record(argv, cwd) {
    const reportFile = path.resolve(cwd, reportPathFrom(argv));

    const repo = locateRepo(cwd);
    if (repo.notARepo) throw new Refusal('not inside a git repository');
    if (!repo.gitDir) throw new Refusal('could not locate the repository: ' + repo.error);
    const root = repo.toplevel;

    const branch = gitText(['rev-parse', '--abbrev-ref', 'HEAD'], root);
    if (!isFeatureBranch(branch)) throw new Refusal('branch "' + branch + '" is not a feature branch');
    const recordRel = 'features/' + branch + '.md';
    const recordFile = path.join(root, recordRel);
    if (!fs.existsSync(recordFile)) throw new Refusal('no feature record at ' + recordRel);
    const recordText = fs.readFileSync(recordFile, 'utf-8');

    const criteria = parseAcceptance(recordText);
    if (criteria.length === 0) {
        throw new Refusal('no ## Acceptance criteria in ' + recordRel + '; add them with ' + cmd('feature-new'));
    }

    const dirty = verification.dirtyPaths(root);
    if (dirty === null) throw new Refusal('could not read the working tree status');
    if (dirty.length > 0) {
        throw new Refusal('uncommitted changes, so the evidence would not be about HEAD; commit or discard:\n  ' + dirty.join('\n  '));
    }

    const tree = verification.codeTreeHash(root);
    if (tree === null) throw new Refusal('could not hash the committed code');
    const markerFile = markerPaths(root).verify;
    if (markerFile === null) throw new Refusal('could not locate the verification marker');
    const shortSha = gitText(['rev-parse', '--short', 'HEAD'], root);

    const parsed = verification.parseReport(fs.readFileSync(reportFile, 'utf-8'), criteria.length);
    const section = verification.renderSection({
        criteria,
        rows: parsed.rows,
        verdict: parsed.verdict,
        date: today(),
        shortSha,
        problems: parsed.problems,
    });

    // Writes begin here: the record first, then the marker.
    fs.writeFileSync(recordFile, replaceVerification(recordText, section));
    const pass = parsed.verdict === VERDICT_PASS;
    if (pass) {
        fs.writeFileSync(markerFile, verification.markerBody(tree, verification.acceptanceHash(criteria)));
    } else {
        fs.rmSync(markerFile, { force: true });
    }

    const count = result => parsed.rows.filter(r => r.result === result).length;
    logEvent('verify.completed', {
        verdict: parsed.verdict,
        criteria: criteria.length,
        pass: count('PASS'),
        fail: count('FAIL'),
        unverified: criteria.length - count('PASS') - count('FAIL'),
        repo: root,
    });

    process.stdout.write(section + TRAILER_PREFIX + parsed.verdict + '\n');
    return pass ? EXIT_PASS : EXIT_FAIL;
}

if (require.main === module) {
    try {
        process.exitCode = record(process.argv.slice(2), process.cwd());
    } catch (e) {
        process.stderr.write((e instanceof Refusal ? e.message : 'record-verification crashed: ' + (e && e.stack || e)) + '\n');
        process.exitCode = EXIT_ERROR;
    }
}

module.exports = { record };
