"""Analyse the code review / TDD timing log.

Reads ~/.claude/code-review-timing.jsonl (override with --log-path) and prints
per-gate fast-path rates, expensive-phase percentiles, and per-repo hygiene
check distributions.

Stdlib only — runnable from any conda env.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--days', type=int, default=7,
                   help='Window in days (default: 7). Use 0 for all.')
    p.add_argument('--repo', type=str, default=None,
                   help='Filter by repo toplevel (forward-slash path).')
    p.add_argument('--variant', type=str, default=None,
                   help='Filter by variant tag (e.g. v0, v1). Matches the '
                        "'variant' field written by timing-log when "
                        'CLAUDE_REVIEW_VARIANT is set.')
    p.add_argument('--log-path', type=str, default=None,
                   help='Path to the JSONL log (default: ~/.claude/code-review-timing.jsonl).')
    p.add_argument('--json', action='store_true',
                   help='Emit the aggregated report as JSON instead of text.')
    return p.parse_args()


def default_log_path() -> Path:
    return Path.home() / '.claude' / 'code-review-timing.jsonl'


def load_events(log_path: Path, since: datetime | None, repo: str | None,
                variant: str | None = None) -> list[dict]:
    if not log_path.exists():
        return []
    events: list[dict] = []
    with log_path.open('r', encoding='utf-8') as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts_raw = rec.get('ts')
            if ts_raw and since is not None:
                try:
                    ts = datetime.fromisoformat(ts_raw.replace('Z', '+00:00'))
                except ValueError:
                    ts = None
                if ts is not None and ts < since:
                    continue
            if repo and rec.get('repo') != repo:
                continue
            if variant and rec.get('variant') != variant:
                continue
            events.append(rec)
    return events


def pct(xs: list[float], q: float) -> float | None:
    if not xs:
        return None
    xs_sorted = sorted(xs)
    k = max(0, min(len(xs_sorted) - 1, int(round(q * (len(xs_sorted) - 1)))))
    return xs_sorted[k]


def fmt_ms(ms: float | None) -> str:
    if ms is None:
        return '—'
    if ms < 1000:
        return f'{int(ms)}ms'
    if ms < 60_000:
        return f'{ms / 1000:.1f}s'
    mins = int(ms // 60_000)
    secs = int((ms % 60_000) / 1000)
    return f'{mins}m {secs:02d}s'


def summarise(events: list[dict]) -> dict:
    """Aggregate the event stream into a report-ready dict."""
    by_event: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        by_event[e.get('event', '')].append(e)

    # Fast-path hit rate = hook.end events from pre-commit-review with
    # approve + via in the "fast path" set.
    review_ends = [e for e in by_event.get('hook.end', []) if e.get('hook') == 'pre-commit-review']
    via_counter: Counter[str] = Counter()
    via_durations: dict[str, list[float]] = defaultdict(list)
    for e in review_ends:
        via = e.get('via') or 'unknown'
        via_counter[via] += 1
        if isinstance(e.get('total_ms'), (int, float)):
            via_durations[via].append(float(e['total_ms']))

    total_commits = len(review_ends)
    fast_path_vias = {
        # current names
        'marker-match', 'classifier-trivial-diff', 'classifier-presentational',
        'coverage-thresholds-met', 'coverage-thresholds-met-empty-gap',
        # names written before the checks were renamed (Sep 2026)
        'gate3a-hash-match', 'gate3b-trivial-diff', 'gate3b-presentational',
        'gate3c-thresholds-met', 'gate3c-thresholds-met-empty-gap',
    }
    fast_hits = sum(v for k, v in via_counter.items() if k in fast_path_vias)

    # Expensive phases
    regen_events = by_event.get('regen.coverage', [])
    regen_durations = [float(e['duration_ms']) for e in regen_events
                       if isinstance(e.get('duration_ms'), (int, float))]
    regen_successes = sum(1 for e in regen_events if e.get('success'))

    dc_events = by_event.get('diff_cover', [])
    dc_durations = [float(e['duration_ms']) for e in dc_events
                    if isinstance(e.get('duration_ms'), (int, float))]

    inferred = by_event.get('review.completed_inferred', [])
    inferred_durations = [float(e['duration_ms']) for e in inferred
                          if isinstance(e.get('duration_ms'), (int, float))]

    # Reviews as the skill reports them: agent, round, verdict, findings.
    completed = by_event.get('review.completed', [])
    reviews_by_agent: Counter[str] = Counter()
    reviews_by_verdict: Counter[str] = Counter()
    rounds: list[float] = []
    findings = {'critical': 0, 'important': 0, 'advisory': 0}
    for e in completed:
        reviews_by_agent[str(e.get('agent') or '?')] += 1
        reviews_by_verdict[str(e.get('verdict') or '?')] += 1
        if isinstance(e.get('round'), (int, float)):
            rounds.append(float(e['round']))
        for k in findings:
            if isinstance(e.get(k), (int, float)):
                findings[k] += int(e[k])

    # Hygiene: per-repo per-check durations
    hygiene_checks = by_event.get('hygiene.check', [])
    by_repo_check: dict[tuple[str, str], list[float]] = defaultdict(list)
    by_repo_check_fails: Counter[tuple[str, str]] = Counter()
    for e in hygiene_checks:
        if not isinstance(e.get('duration_ms'), (int, float)):
            continue
        key = (e.get('repo') or '?', e.get('check') or '?')
        by_repo_check[key].append(float(e['duration_ms']))
        if not e.get('success'):
            by_repo_check_fails[key] += 1

    def stat(xs: list[float]) -> dict:
        return {
            'n': len(xs),
            'p50_ms': pct(xs, 0.5),
            'p95_ms': pct(xs, 0.95),
            'max_ms': max(xs) if xs else None,
            'mean_ms': statistics.fmean(xs) if xs else None,
        }

    return {
        'event_count': len(events),
        'review_hook_runs': total_commits,
        'fast_path_hit_rate': (fast_hits / total_commits) if total_commits else None,
        'via_breakdown': [
            {
                'via': via,
                'count': count,
                **stat(via_durations[via]),
            }
            for via, count in via_counter.most_common()
        ],
        'expensive_phases': {
            'coverage_regen': {**stat(regen_durations), 'failures': len(regen_events) - regen_successes},
            'diff_cover': stat(dc_durations),
            'sub_agent_review_inferred': stat(inferred_durations),
        },
        'reviews': {
            'n': len(completed),
            'by_agent': dict(reviews_by_agent),
            'by_verdict': dict(reviews_by_verdict),
            'max_round': max(rounds) if rounds else None,
            'findings': findings,
        },
        'hygiene_by_repo_check': sorted([
            {
                'repo': repo,
                'check': check,
                **stat(xs),
                'failures': by_repo_check_fails[(repo, check)],
            }
            for (repo, check), xs in by_repo_check.items()
        ], key=lambda d: (d['repo'], -(d.get('p50_ms') or 0))),
    }


def print_report(report: dict) -> None:
    print(f"Events in window: {report['event_count']}")
    n = report['review_hook_runs']
    hit = report['fast_path_hit_rate']
    if n == 0:
        print('No pre-commit-review events in window.')
    else:
        hit_pct = f'{hit * 100:.0f}%' if hit is not None else '—'
        print(f"pre-commit-review invocations: {n}   Fast-path hit rate: {hit_pct}")
        print('\nBreakdown by exit gate:')
        for row in report['via_breakdown']:
            share = row['count'] / n * 100 if n else 0
            p50 = fmt_ms(row.get('p50_ms'))
            p95 = fmt_ms(row.get('p95_ms'))
            print(f"  {row['via']:<30}  {row['count']:>4}  ({share:>5.1f}%)  p50 {p50:<6}  p95 {p95}")

    print('\nExpensive phases (when they fire):')
    ep = report['expensive_phases']
    for name, label in [
        ('coverage_regen', 'coverage auto-regen'),
        ('diff_cover', 'diff-cover'),
        ('sub_agent_review_inferred', 'sub-agent review (inferred)'),
    ]:
        s = ep[name]
        extra = f"  failures={s['failures']}" if 'failures' in s else ''
        print(f"  {label:<32}  n={s['n']:>4}  p50 {fmt_ms(s.get('p50_ms')):<6}  "
              f"p95 {fmt_ms(s.get('p95_ms')):<6}  max {fmt_ms(s.get('max_ms'))}{extra}")

    rv = report.get('reviews') or {}
    if rv.get('n'):
        print('\nReviews (as reported by the skill):')
        agents = ', '.join(f'{k}={v}' for k, v in sorted(rv['by_agent'].items()))
        verdicts = ', '.join(f'{k}={v}' for k, v in sorted(rv['by_verdict'].items()))
        f = rv['findings']
        print(f"  n={rv['n']}  agents: {agents}  verdicts: {verdicts}  max round: {rv['max_round']}")
        print(f"  findings: critical={f['critical']} important={f['important']} advisory={f['advisory']}")

    if report['hygiene_by_repo_check']:
        print('\nHygiene checks (per repo, per check):')
        current_repo = None
        for row in report['hygiene_by_repo_check']:
            if row['repo'] != current_repo:
                print(f"  {row['repo']}")
                current_repo = row['repo']
            fails = f"  fails={row['failures']}" if row['failures'] else ''
            print(f"    {row['check']:<24}  n={row['n']:>4}  p50 {fmt_ms(row.get('p50_ms')):<6}  "
                  f"p95 {fmt_ms(row.get('p95_ms')):<6}  max {fmt_ms(row.get('max_ms'))}{fails}")


def main() -> int:
    args = parse_args()
    log_path = Path(args.log_path) if args.log_path else default_log_path()
    since = None
    if args.days > 0:
        since = datetime.now(timezone.utc) - timedelta(days=args.days)
    events = load_events(log_path, since, args.repo, args.variant)
    report = summarise(events)
    if args.json:
        json.dump(report, sys.stdout, indent=2, default=str)
        sys.stdout.write('\n')
    else:
        header = f"Code review / TDD timing — last {args.days} day(s)" if args.days > 0 else 'Code review / TDD timing — all time'
        if args.repo:
            header += f' — repo={args.repo}'
        if args.variant:
            header += f' — variant={args.variant}'
        print(header)
        print('=' * len(header))
        print_report(report)
    return 0


if __name__ == '__main__':
    sys.exit(main())
