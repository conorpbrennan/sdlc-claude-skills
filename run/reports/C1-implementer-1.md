# C1 implementer report

Status: DONE. Not staged, not committed, version not bumped.

## Files touched
- src/hooks/pre-pr-branch-review.js (item 1 fix)
- src/hooks/test-pre-pr-branch-review.js (item 1 rows, plus a `nomatch` field in the table loop)
- src/hooks/lib/branch-report.js (item 3 fix)
- src/hooks/test-branch-report.js (item 3 rows)
- src/hooks/test-branch-repos-write.js (item 2 rows)
- src/hooks/test-review-config.js (item 4 rows)

## Item 1 (red run)
Before the fix: `node src/hooks/test-pre-pr-branch-review.js`
  FAIL: unparsable config, fix text names the config file: text
  FAIL: unparsable config, fix text names the config file: text lacks
  Results: 54 passed, 2 failed
After: 56 passed, 0 failed. Any config.error (read, parse, no repos object) now says
"Fix the config file <path> (unreadable, not valid JSON or no "repos" object), then retry."
Git failures keep "Fix the git problem named above, then retry." (row added to pin it).

## Item 2
Rows for enable and disable with `fs.renameSync` stubbed to throw: ok:false, bytes equal, no stray files.
Passed without a code change. The code already removes the tmp file. Test file: 89 passed, 0 failed.

## Item 3 (red run)
With the old lib: `FAIL: URL with a port is not file:line  verdict PASS (want FAIL)`.
Fix: strip URL tokens (`scheme://...`) from each line before testing FILE_LINE. Real `lib/a.js:12`
still counts, also on a line that has a URL before it (row added). test-branch-report: 28 passed, 0 failed.
Note: the example in the brief, `http://host:8080/x`, was never evidence (no dot before the colon).
The row uses `http://example.com:8080/x`, which was.

## Item 4
Rows for string `'5000'` and float `2500.5`: both fall back to defaults with one warning. Existing
behaviour, no change. No disagreement.

## Item 5
Already covered: test-branch-review-cli.js has 'cap 5 and 5 lines is not over' (cap == changed lines,
overCap false). No change made.

## Decisions
- Item 1 uses one config-file message for all config errors, not only the parse error.
  Every config.error is about the config file.

## Disagreements and gaps
- A bare `example.com:8080` with no scheme is still counted as file:line. It has the same shape as `a.js:12`.
  Not fixable by pattern. Named as a gap.

## Gate
- `bash tools/run-tests.sh`: Files: 56  failed: 0
- `claude plugin validate .`: exit 0
