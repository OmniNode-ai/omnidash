import { useEffect, useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { fetchExposureCensus } from '@/data-source/exposure-census';
import type { EmptyStateReason } from '@shared/types/chart-config';
import type { ProjectionSnapshot } from '@/data-source';
import { useProjectionSnapshotQuery } from '@/hooks/useProjectionSnapshotQuery';
import { useDataSourceMode } from '@/hooks/useDataSourceMode';
import { TOPICS } from '@shared/types/topics';
import { formatAge } from '@/utils/time-format';
import { FreshnessLine } from '@/components/dashboard/lab/FreshnessLine';

export interface TopicActivityRow {
  topic: string;
  sampled_at: string;
  high_watermark_total: number;
  low_watermark_total: number;
  retained_messages: number;
  messages_since_previous_sample: number;
  rate_per_second: number;
  messages_last_hour: number;
  messages_last_24h: number;
  rate_last_hour_per_second: number;
  retention_truncated: boolean;
  newest_message_at: string | null;
  newest_message_age_seconds_at_sample: number | null;
  activity_state: 'ACTIVE' | 'QUIET' | 'UNKNOWN';
  projection_cursor: string;
}

type SortKey = 'topic' | 'rate_per_second' | 'messages_last_hour' | 'messages_last_24h' | 'newest_message_at';
const TOPIC_ACTIVITY_EMPTY_REASON: EmptyStateReason = 'upstream-blocked';

function emptySnapshot(): ProjectionSnapshot<TopicActivityRow> {
  return {
    rows: [],
    rowCount: 0,
    dataFreshness: 'unknown',
    latestEventAt: null,
    readAt: new Date().toISOString(),
  };
}

export function TopicActivityView({
  snapshot,
  available,
  isLoading = false,
  error = null,
}: {
  snapshot: ProjectionSnapshot<TopicActivityRow>;
  available: boolean;
  isLoading?: boolean;
  error?: Error | null;
}) {
  const [topicFilter, setTopicFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rate_per_second');
  const [descending, setDescending] = useState(true);
  const rows = useMemo(() => {
    const filtered = snapshot.rows.filter((row) =>
      row.topic.toLowerCase().endsWith(topicFilter.trim().toLowerCase()));
    return [...filtered].sort((left, right) => {
      const leftValue = left[sortKey];
      const rightValue = right[sortKey];
      const comparison = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), undefined, { numeric: true });
      return descending ? -comparison : comparison;
    });
  }, [descending, snapshot.rows, sortKey, topicFilter]);

  const chooseSort = (key: SortKey) => {
    if (sortKey === key) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(key !== 'topic');
    }
  };

  if (isLoading || error) {
    return (
      <ComponentWrapper title="Topic Activity" isLoading={isLoading} error={error} isEmpty={false}>
        <span />
      </ComponentWrapper>
    );
  }

  if (!available) {
    return (
      <ComponentWrapper title="Topic Activity" isEmpty={false}>
        <div data-empty-state-reason={TOPIC_ACTIVITY_EMPTY_REASON}>
          <Text as="div" size="sm" color="warn">Topic activity producer missing</Text>
          <Text as="div" size="xs" color="tertiary">
            OMN-19716 topic-activity projection not yet bus-backed on this lane.
          </Text>
        </div>
      </ComponentWrapper>
    );
  }

  const header = (label: string, key: SortKey) => (
    <button type="button" className="btn" onClick={() => chooseSort(key)} aria-label={`Sort by ${label}`}>
      <Text as="span" size="xs" weight="semibold" color="tertiary">
        {label}{sortKey === key ? (descending ? ' ↓' : ' ↑') : ''}
      </Text>
    </button>
  );
  const grid = 'minmax(220px, 2fr) 88px 90px 90px 96px 130px 84px';

  return (
    <ComponentWrapper
      title="Topic Activity"
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && snapshot.rows.length === 0}
      emptyMessage="No topic activity samples"
      emptyHint="OMN-19716 is bus-backed on this lane, but the projection returned zero sample rows."
      isLive
      headerExtra={(
        <FreshnessLine
          freshness={snapshot.dataFreshness}
          latestEventAt={snapshot.latestEventAt}
          readAt={snapshot.readAt}
        />
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text as="span" size="xs" color="tertiary">Topic suffix</Text>
          <input aria-label="Filter topic activity by suffix" className="text-input-md" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} />
        </label>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 880 }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
              {header('Topic', 'topic')}
              {header('Rate/s', 'rate_per_second')}
              {header('Last hour', 'messages_last_hour')}
              {header('Last 24h', 'messages_last_24h')}
              <Text as="span" size="xs" weight="semibold" color="tertiary">Retained</Text>
              {header('Newest age at read', 'newest_message_at')}
              <Text as="span" size="xs" weight="semibold" color="tertiary">State</Text>
            </div>
            {rows.map((row) => (
              <div key={row.topic} data-testid="topic-activity-row" style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                <Text as="span" size="xs" family="mono" color="primary" truncate title={row.topic}>{row.topic}</Text>
                <Text as="span" size="xs" family="mono" color="secondary">{row.rate_per_second.toFixed(2)}</Text>
                <Text as="span" size="xs" family="mono" color="secondary">{row.messages_last_hour.toLocaleString()}</Text>
                <Text as="span" size="xs" family="mono" color="secondary">{row.messages_last_24h.toLocaleString()}</Text>
                <Text as="span" size="xs" family="mono" color={row.retention_truncated ? 'warn' : 'secondary'}>{row.retained_messages.toLocaleString()}{row.retention_truncated ? '+' : ''}</Text>
                <Text as="span" size="xs" family="mono" color="secondary">{formatAge(row.newest_message_at, new Date(snapshot.readAt).getTime())}</Text>
                <Text as="span" size="xs" family="mono" color={row.activity_state === 'ACTIVE' ? 'ok' : row.activity_state === 'QUIET' ? 'tertiary' : 'warn'}>{row.activity_state}</Text>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ComponentWrapper>
  );
}

export default function TopicActivityWidget() {
  const mode = useDataSourceMode();
  const fileMode = mode === 'file';
  const [availability, setAvailability] = useState<'loading' | 'available' | 'missing' | 'error'>(fileMode ? 'available' : 'loading');
  const [censusError, setCensusError] = useState<Error | null>(null);

  useEffect(() => {
    if (fileMode) {
      setAvailability('available');
      setCensusError(null);
      return;
    }
    let active = true;
    void fetchExposureCensus()
      .then((census) => {
        if (!active) return;
        const topic = census.rows.find((row) => row.topic === TOPICS.topicActivity);
        setAvailability(topic?.reachability === 'reachable' ? 'available' : 'missing');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setCensusError(reason instanceof Error ? reason : new Error(String(reason)));
        setAvailability('error');
      });
    return () => { active = false; };
  }, [fileMode]);

  const query = useProjectionSnapshotQuery<TopicActivityRow>({
    topic: TOPICS.topicActivity,
    queryKey: ['lab-topic-activity'],
    enabled: availability === 'available',
    refetchInterval: 5_000,
  });

  return (
    <TopicActivityView
      snapshot={query.data ?? emptySnapshot()}
      available={availability === 'available'}
      isLoading={availability === 'loading' || query.isLoading}
      error={censusError || query.error}
    />
  );
}
