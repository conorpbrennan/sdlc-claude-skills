# Step 12 report, implementer round 1

Status: DONE

Files changed (unstaged): README.md, .claude/sdlc-review.json.example, CLAUDE.md.

Built:
- README "Turning steps off" rewritten: leads with block and /sdlc:steps, schema example, R1-R6, opt-in note, Guard and "Alias (still works)" table, guard and alias-wins rules, /plugin disable row kept.
- README commands table: /sdlc:steps row. Configuration: `steps` added to the sdlc-review.json line.
- Example config: `steps` entry (hygiene true, orchestration enabled + read-trim) and one sentence on guard areas in the top-level _comment.
- CLAUDE.md: row for /sdlc:steps and the resolver.

Gate:
- JSON.parse of the example: rc=0.
- grep -c "sdlc:steps" README.md: 5.
- Every step id from `steps-cli.js list` appears in the README (checked by loop; only non-step footer words flagged).
- All HEAD alias rows kept (orchestrate off, feature-tracking.disabled, tdd-mandate.disabled/exempt_*, hygiene/verify opt-in, mainModel off, sdlc-cache-ttl.disabled, sdlc-autoupdate.disabled, autoUpdate false, plugin disable). "No switch" rows now read "None" or point at the block.
- Run against a scratch user config: hygiene:false and orchestration.read-trim:false show off with source user file.

Unverified: the repo-file warning text for guard areas (R2). A scratch repo config with review:false left review-gate on (confirmed), but the scratch dir was not a git repo, so no warning was printed. The README says `/sdlc:steps` "warns and ignores"; check in a real repo.
Also unverified: that hygiene:false in the block switches off a listed repo at run time (list shows it off; hook behaviour is step 3-11 work).
