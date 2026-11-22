# Fable access check: S1 probe findings

Run date 22 Nov 2026, Claude Code 2.1.329. Counts, field names and fixed labels only.
Tags: CONFIRMED (observed in a run or counted), INFERRED (follows from observations, not proved), GUESSED (no evidence).

Runs:
- Run A: one foreground general-purpose dispatch, model haiku, via `claude -p`. Succeeded. Main-session geo `"global"`: backend direct (INFERRED from geo; no gateway var seen). Cost $0.12.
- Run B: one foreground general-purpose dispatch, model fable, replying "ok". Succeeded (model usage lists claude-fable-5-2). Main-session geo `"global"`: backend direct (INFERRED). Cost $0.385.
- No run went through the gateway. Every gateway claim below rests on history counts and is INFERRED.
- History scan: 5033 transcript files and 484 main sessions in the last 40 days.

## Stdin

- CONFIRMED (runs A, B): PreToolUse for `Agent` stdin keys are `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `effort`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`. Both `session_id` and `transcript_path` arrive and are non-empty strings. `transcript_path` was readable at PreToolUse in 2 of 2 runs.
- CONFIRMED: `tool_input` keys are `description`, `prompt`, `subagent_type`, `model`, `run_in_background`. `model` carries the dispatch's explicit model (`haiku`, `fable`).
- CONFIRMED: PostToolUse adds `tool_response` (an object) and `duration_ms`. `tool_response` keys: `status`, `prompt`, `agentId`, `agentType`, `harnessNoteCount`, `harnessTailCount`, `harnessSectionHash`, `content`, `resolvedModel`, `totalDurationMs`, `totalTokens`, `totalToolUseCount`, `usage`, `canContinueAgent`. No 403 text in either (both runs succeeded). The shape of a 403 `tool_response` is NOT observed: GUESSED to be the same object shape with failure text in `content`.
- CONFIRMED: no `agent_id` key on stdin for a main-session dispatch.
- Transcript timing at PreToolUse: the assistant record holding this call's `tool_use` was ABSENT from the last five records in run A and PRESENT (fifth from last) in run B. CONFIRMED for both runs, cause INFERRED: the transcript write races the hook. S2 must not depend on the dispatching record being there. In run A the last five records were all non-message types (`api-request-blob`, `api-request`, `last-prompt`, `session-owner`, `atis-latch`); S2 must skip non-message record types and read further back than five records.
- CONFIRMED: at PostToolUse the dispatching assistant record was present in both runs (`model` claude-sonnet-5-5, geo `"global"`, a string).
- Env: names matching `^(ANTHROPIC|CLAUDE)_` seen in the hook: `CLAUDE_CODE_CHILD_NOTES_DIR`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_EFFORT`, `CLAUDE_PID`, `CLAUDE_PROJECT_DIR`, all set (CONFIRMED). No `ANTHROPIC_*` var was set (CONFIRMED): candidate E has nothing to read on the direct backend.
- Known gap: S1 probes main-session dispatches only. A sub-agent's Agent call may carry another `transcript_path` or `agent_id`. Not chased.

## Timing

- CONFIRMED (runs A, B): both runs were foreground (`run_in_background` false). PreToolUse fired before the sub-agent ran; PostToolUse fired at completion, 1.4 s later (run A) and 2.3 s later (run B).
- Background dispatch (`run_in_background` true) was NOT tested. Whether PostToolUse fires at launch or at completion for it is GUESSED: launch. Matters only for the later paid-probe plan.
- A hook that runs at PreToolUse reads the transcript as it stands then. Run A shows the newest record can be missing; the verdict must come from older records (see Decision table).

## Signals

Candidate pick: A (transcript `inference_geo`), with B and C as the overrides in the decision table. D and E are not used.

- A, geo by model, all main and sub-agent assistant records, last 40 days (CONFIRMED counts): opus-5-5 `"global"` 30921, `""` 32544, missing 1307; sonnet-5-5 `"global"` 51324, `""` 107280, missing 3455; haiku-5-5 `"global"` 93, `""` 781; fable-5-1 `"global"` 676; fable-5-2 `"global"` 139. `<synthetic>` records carry `null`: 57.
- A, Fable never `""`: 815 of 815 Fable records are `"global"` (CONFIRMED).
- A, geo as backend marker: runs A and B read `"global"` on the direct backend (CONFIRMED observation, direct is INFERRED). In history, 4 of 4 sessions with a real 403 refusal had `""` as the newest geo-bearing main record before the first refusal (CONFIRMED count). So `""` means gateway: INFERRED, not proved.
- A, backend switches mid-session: 3 main sessions changed geo value part way (CONFIRMED). First decisive record from the newest end must win.
- B, refusal shapes, 403 phrase plus Fable in a record, classified by shape (CONFIRMED counts): main-file `task-notification-failed` 4 (the real refusals); main-file `agent-tool-result` 0; main-file `tool-result-Read` 18, `tool-result-Bash` 3, `user-string-other` 8 (all quoting, not counted); sub-agent files `tool-result-Bash` 18, `tool-result-Read` 16, `user-string-other` 10 (quoting) and `synthetic-api-error` 6 (real refusals inside sub-agent files, not read by the rule). 34 files hold the phrase; 4 main sessions are real refusals. A plain grep overcounts by 30 files.
- C, Fable reply in a main transcript: 3 main sessions (CONFIRMED). The newest geo-bearing record before the first such reply: none (the Fable record was the first geo-bearing record in each; its own geo is `"global"`). In run B the Fable reply sat in the sub-agent, not in the main transcript, which held only Sonnet `"global"` records: a Fable dispatch that succeeds does not by itself put a Fable record in the main transcript (CONFIRMED, run B). C therefore fires only when the main session itself ran Fable.
- E: not usable on the direct backend (no `ANTHROPIC_*` var). Gateway value not observed (GUESSED).

## Decision table

| Record | Verdict | Evidence label | Count and run | Tag |
|---|---|---|---|---|
| assistant, `message.model` starts `claude-fable` (C) | reachable | `fable-reply` | 815 Fable records, all `"global"`; 3 main sessions replied as Fable; run B Fable dispatch succeeded | CONFIRMED |
| user record: `<task-notification>` failed with `Agent "` summary, or Agent `tool_result`, text matches 403 and names Fable (B) | unreachable | `refused-403` | 4 task-notification refusals in main files; 0 Agent `tool_result` refusals seen; 73 other quoting hits (Read, Bash, plain strings) must not count; no refusal in runs A or B | CONFIRMED for the notification shape; the Agent `tool_result` shape is GUESSED |
| assistant, `usage.inference_geo === "global"` (A) | reachable | `geo-global` | 82,338 non-Fable records plus 815 Fable; runs A and B both `"global"` and Fable succeeded in B | CONFIRMED for the observation; reachable on direct is CONFIRMED by run B |
| assistant, `usage.inference_geo === ""` (A) | unreachable | `geo-empty` | 140,605 records; 4 of 4 refused sessions had `""` before the first refusal; no gateway run | INFERRED |
| assistant with `inference_geo` missing, `null` or other; `<synthetic>` model; non-message record types | skip, read older | none | missing: 4762 (sonnet 3455, opus 1307); `null`: 57 synthetic; run A: five trailing records were non-message types | CONFIRMED |
| no decisive record in the tail; file missing or unreadable | unknown | `no-signal`, `unreadable` | run A: a fresh session's first dispatch has no earlier assistant record, and the dispatching record itself was absent at PreToolUse | CONFIRMED for the case, INFERRED that it stays `unknown` through the scan |

Amendments to section 4's table: none to the rows. Two notes for S2: (1) do not require the dispatching record to be present, and skip every non-message record type; (2) a first-turn dispatch can read `unknown`.

## Contingency

- Candidates A to C decide on the direct backend: CONFIRMED by runs A and B (geo `"global"`, Fable reply succeeded).
- On the gateway the same candidates decide by history only: `""` precedes 4 of 4 refusals (CONFIRMED count) and means unreachable (INFERRED). No gateway run was made, so gateway behaviour is not CONFIRMED.
- A free signal exists on every backend seen. Weak spots, all handled by the `unknown` verdict: a session's first dispatch has no earlier assistant record; the dispatching record can be absent at PreToolUse (run A); a 403 shape other than the task-notification is not seen. The plan's decision 6 fallback (build no automatic check) is not triggered.
- A paid probe is not needed to build S2 to S5. It would only add the gateway `tool_response` shape and background timing.

Paid probe needed: no
