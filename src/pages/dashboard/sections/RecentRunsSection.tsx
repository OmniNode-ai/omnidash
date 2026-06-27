import { useState } from 'react';
import { Text } from '@/components/ui/typography';
import { useFrameStore } from '@/store/store';
import { SectionCard } from '../SectionCard';
import { GateBadge } from '../GateBadge';
import { formatUsdCents, formatCompact, formatLatency, formatRelativeTime } from '../lib/format';
import { TIER_LABEL } from '../lib/tier';
import { useDelegationRuns } from '../lib/useDelegationRuns';

/** How many rows are revealed initially, and per "Show more" click. */
const PAGE_SIZE = 8;

/**
 * The standing list of recent delegated runs (the projection's recent window),
 * revealed a page at a time via "Show more". The full history lives behind "View
 * all tasks", which opens the tasks-list page. Rows + gate come from the shared
 * useDelegationRuns join.
 */
export function RecentRunsSection() {
  const setActivePage = useFrameStore((s) => s.setActivePage);
  const { rows, isLoading, error, sample, sessionCount } = useDelegationRuns();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const shown = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;

  return (
    <SectionCard
      eyebrow="Recent runs"
      sub={<Text as="span" size="md" color="tertiary">Latest units of delegated work.</Text>}
      isLoading={isLoading}
      error={error}
      isEmpty={rows.length === 0}
      emptyMessage="No runs in this period yet."
      sample={sample}
      className="sd-runs"
    >
      <table className="sd-table">
        <thead>
          <tr>
            {(['When', 'Run', 'Served by', 'Gate'] as const).map((h) => (
              <Text key={h} as="th" size="xs" color="tertiary" transform="uppercase" weight="semibold">{h}</Text>
            ))}
            {(['Tokens', 'Cost', 'Saved', 'Latency'] as const).map((h) => (
              <Text key={h} as="th" size="xs" color="tertiary" transform="uppercase" weight="semibold" className="sd-num">{h}</Text>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              key={r.session_id}
              className="sd-row-link"
              role="button"
              tabIndex={0}
              onClick={() => setActivePage('run-detail', { runId: r.session_id, from: 'dashboard' })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActivePage('run-detail', { runId: r.session_id, from: 'dashboard' });
                }
              }}
            >
              <Text as="td" size="md" color="secondary">{formatRelativeTime(r.created_at)}</Text>
              <Text as="td" size="md" color="secondary" family="mono">run {r.session_id.slice(0, 6)}</Text>
              <Text as="td" size="md" color="secondary">{TIER_LABEL[r.tier]}</Text>
              <td><GateBadge passed={r.gate} /></td>
              <Text as="td" size="md" color="secondary" className="sd-num">{formatCompact(r.tokens)}</Text>
              <Text as="td" size="md" color="secondary" className="sd-num">{formatUsdCents(r.cost_usd)}</Text>
              <Text as="td" size="md" color="primary" weight="semibold" className="sd-num">{formatUsdCents(r.saved_usd)}</Text>
              <Text as="td" size="md" color="secondary" className="sd-num">{formatLatency(r.latency_ms)}</Text>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sd-runs-controls">
        {hasMore && (
          <button
            type="button"
            className="sd-show-more"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            aria-label={`Show ${Math.min(PAGE_SIZE, rows.length - visibleCount)} more runs`}
          >
            <Text as="span" size="md" weight="semibold" color="secondary">Show more</Text>
          </button>
        )}
        <div className="sd-runs-foot">
          <Text as="span" size="sm" color="tertiary">Showing {shown.length} of {rows.length} recent runs</Text>
          {sessionCount !== undefined && sessionCount > rows.length && (
            <Text as="span" size="sm" color="tertiary">
              {' · '}{sessionCount.toLocaleString('en-US')} total ·{' '}
              <button type="button" className="sd-linkbtn" onClick={() => setActivePage('tasks')}>View all tasks →</button>
            </Text>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
