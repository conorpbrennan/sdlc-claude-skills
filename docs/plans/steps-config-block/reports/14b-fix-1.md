# 14b-fix-1: echo | grep -q pipes to here-strings

Files: src/hooks/test-stop-hook.sh (6 pipes), src/hooks/test-post-commit-hook.sh (3), src/hooks/test-pre-commit-hygiene.sh (4: lines 36, 37, 146, 627). Total 13. Leading `!` kept at line 627. Nothing else touched; nothing staged.

Shape: `echo "$V" | grep -q PAT` became `grep -q PAT <<<"$V"` (2>/dev/null kept after the here-string).

Gate:
- Each suite run 5 times, all rc=0: test-stop-hook 16 passed 0 failed (x5); test-post-commit-hook 17 passed 0 failed (x5); test-pre-commit-hygiene 31 passed 0 failed (x5).
- `grep -nE '(echo|printf)[^|]*\| *grep -q'` on the three files: no output.
- `node src/test-plugin-layout.js`: exit 0.

Pipes left: none in these three files. Other test-*.sh files not touched, per scope.
