// For the test suites. git exports GIT_DIR, GIT_INDEX_FILE and the rest to
// the hooks it runs, and a suite started from inside one inherits them: its
// git calls, and the hooks it spawns, then drive the outer repository instead
// of the suite's temp repos. git itself names the variables that locate a
// repository (`--local-env-vars`, the set it clears for submodules), so the
// list is git's, not a copy that drifts. git is asked from a clean
// environment: some of those same variables (GIT_INTERNAL_SUPER_PREFIX) make
// `git rev-parse` itself refuse to run.
'use strict';

const { execFileSync } = require('child_process');

// Returns:
//   nothing; deletes each repository-local git variable from process.env, so
//   children inherit none of them.
function isolateGitEnv() {
    const vars = execFileSync('git', ['rev-parse', '--local-env-vars'],
        { encoding: 'utf-8', env: { PATH: process.env.PATH } });
    for (const v of vars.split('\n')) if (v) delete process.env[v];
}

module.exports = { isolateGitEnv };
