// The plugin's name, and the namespaced names Claude is told to invoke.
//
// A plugin's commands, skills and agents are addressed as `<plugin>:<name>`,
// so a hook message that names a bare command names something that does
// not exist once the toolchain is installed as a plugin. This file is the one
// place the plugin name is spelled in code; every hook builds names from it.
//
// Labels are not names: marker tags (`code-reviewer:round1:PASS`) and timing
// tags (`agent=code-reviewer`) stay bare and do not come from here.

const PLUGIN = 'sdlc';

// A slash command or user-invocable skill: `/sdlc:<name>`.
function cmd(name) {
    return '/' + PLUGIN + ':' + name;
}

// A sub-agent, as a `subagent_type` value: `sdlc:<name>`.
function agent(name) {
    return PLUGIN + ':' + name;
}

// A skill, as the Skill tool's `skill` value: `sdlc:<name>`. Same form as an
// agent, kept separate so a call site says which kind of name it builds.
function skill(name) {
    return PLUGIN + ':' + name;
}

module.exports = { PLUGIN, cmd, agent, skill };
