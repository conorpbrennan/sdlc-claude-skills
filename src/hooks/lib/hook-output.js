// What a PreToolUse hook prints to block a tool call. The one owner of that shape.
//
// Claude sees `hookSpecificOutput.permissionDecisionReason`. It does not see
// `systemMessage`, which is shown to the user, and once the deny shape is present
// it does not see the legacy `reason` either (checked against the harness on
// 2026-10-12). The hooks put their instructions -- the marker recipe, the rounds
// policy, the timing command, a failing check's output -- in the message, so the
// deny reason carries the short reason and the message both.
//
// The legacy `decision`, `reason` and `systemMessage` stay for the transition
// planned in docs/plans/sdlc-hardening.md step 4a, which also makes allow silent.
//
// A crash handler registered before any require cannot use this file; it builds
// the same shape inline (test-hook-output.js checks that it does).

// Builds the block output.
//
// Args:
//   reason: the short reason, one line.
//   message: the full instructions for Claude, or empty.
// Returns:
//   the object to print with JSON.stringify.
function deny(reason, message) {
    const seen = !message ? reason : (message.includes(reason) ? message : reason + '\n' + message);
    const out = {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: seen,
        },
        decision: 'block',
        reason,
    };
    if (message) out.systemMessage = message;
    return out;
}

module.exports = { deny };
