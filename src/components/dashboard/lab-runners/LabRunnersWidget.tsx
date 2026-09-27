import { useEffect, useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { fetchExposureCensus } from '@/data-source/exposure-census';
import type { EmptyStateReason } from '@shared/types/chart-config';
import type { ProjectionSnapshot } from '@/data-source';
import { useProjectionSnapshotQuery } from '@/hooks/useProjectionSnapshotQuery';
import { useDataSourceMode } from '@/hooks/useDataSourceMode';
import { TOPICS } from '@shared/types/topics';
import { FreshnessLine } from '@/components/dashboard/lab/FreshnessLine';

/**
 * OMN-18773 — C6: the Runners widget.
 *
 * Renders `omninode_internal.runner_fleet_liveness` (OMN-18768, C1) — the ONE
 * row per runner that node_projection_runner_fleet keeps current from
 * `onex.evt.omnibase-infra.runner-fleet.v1`. This is deliberately the ONLY
 * data path: no GitHub API read from the browser or the bridge, and no
 * container-runtime probe (`docker inspect` et al.). The archived dashboard
 * shelled `docker inspect` over two hardcoded container prefixes on one host
 * and could not see the rest of the lab; that shape is refused here, not
 * ported.
 *
 * An offline runner is rendered, never omitted — a fleet view that drops the
 * dead runner reports full health during exactly the incident it exists for.
 */

export interface RunnerFleetRow {
  runner_name: string;
  runner_id: number | null;
  label_class: string;
  labels: string[];
  host: string;
  observing_host: string;
  status: 'online' | 'busy' | 'offline';
  current_job_id: string | null;
  observed_at: string;
  projection_cursor: string;
}

type SortKey = 'runner_name' | 'label_class' | 'host' | 'status';
const RUNNER_FLEET_EMPTY_REASON: EmptyStateReason = 'upstream-blocked';

function emptySnapshot(): ProjectionSnapshot<RunnerFleetRow> {
  return {
    rows: [],
    rowCount: 0,
    dataFreshness: 'unknown',
    latestEventAt: null,
    readAt: new Date().toISOString(),
  };
}

interface ClassCounts {
  label_class: string;
  total: number;
  online: number;
  busy: number;
  offline: number;
}

interface HostCounts {
  host: string;
  total: number;
  online: number;
  busy: number;
  offline: number;
}

function bump(counts: { total: number; online: number; busy: number; offline: number }, status: RunnerFleetRow['status']) {
  counts.total += 1;
  if (status === 'offline') counts.offline += 1;
  else {
    counts.online += 1;
    if (status === 'busy') counts.busy += 1;
  }
}

function rollupByClass(rows: RunnerFleetRow[]): ClassCounts[] {
  const byClass = new Map<string, ClassCounts>();
  for (const row of rows) {
    const entry = byClass.get(row.label_class) ?? { label_class: row.label_class, total: 0, online: 0, busy: 0, offline: 0 };
    bump(entry, row.status);
    byClass.set(row.label_class, entry);
  }
  return [...byClass.values()].sort((a, b) => a.label_class.localeCompare(b.label_class));
}

function rollupByHost(rows: RunnerFleetRow[]): HostCounts[] {
  const byHost = new Map<string, HostCounts>();
  for (const row of rows) {
    const entry = byHost.get(row.host) ?? { host: row.host, total: 0, online: 0, busy: 0, offline: 0 };
    bump(entry, row.status);
    byHost.set(row.host, entry);
  }
  return [...byHost.values()].sort((a, b) => a.host.localeCompare(b.host));
}

const statusColor = (status: RunnerFleetRow['status']) =>
  status === 'offline' ? 'warn' : status === 'busy' ? 'ok' : 'secondary';

export function LabRunnersView({
  snapshot,
  available,
  isLoading = false,
  error = null,
}: {
  snapshot: ProjectionSnapshot<RunnerFleetRow>;
  available: boolean;
  isLoading?: boolean;
  error?: Error | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [descending, setDescending] = useState(true);

  const rows = useMemo(() => {
    return [...snapshot.rows].sort((left, right) => {
      const comparison = String(left[sortKey] ?? '').localeCompare(String(right[sortKey] ?? ''), undefined, { numeric: true });
      return descending ? -comparison : comparison;
    });
  }, [descending, snapshot.rows, sortKey]);

  const classRollup = useMemo(() => rollupByClass(snapshot.rows), [snapshot.rows]);
  const hostRollup = useMemo(() => rollupByHost(snapshot.rows), [snapshot.rows]);
  const totals = useMemo(() => {
    const acc = { total: 0, online: 0, busy: 0, offline: 0 };
    for (const row of snapshot.rows) bump(acc, row.status);
    return acc;
  }, [snapshot.rows]);

  const chooseSort = (key: SortKey) => {
    if (sortKey === key) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(false);
    }
  };

  if (isLoading || error) {
    return (
      <ComponentWrapper title="Runners" isLoading={isLoading} error={error} isEmpty={false}>
        <span />
      </ComponentWrapper>
    );
  }

  if (!available) {
    return (
      <ComponentWrapper title="Runners" isEmpty={false}>
        <div data-empty-state-reason={RUNNER_FLEET_EMPTY_REASON}>
          <Text as="div" size="sm" color="warn">Runner fleet producer missing</Text>
          <Text as="div" size="xs" color="tertiary">
            {TOPICS.runnerFleet} not yet bus-backed on this lane.
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
  const grid = 'minmax(180px, 2fr) minmax(140px, 1fr) minmax(100px, 1fr) 80px 1fr';

  return (
    <ComponentWrapper
      title="Runners"
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && snapshot.rows.length === 0}
      emptyMessage="No runner rows"
      emptyHint="The runner-fleet projection is bus-backed on this lane, but returned zero rows."
      isLive
      headerExtra={(
        <FreshnessLine
          freshness={snapshot.dataFreshness}
          latestEventAt={snapshot.latestEventAt}
          readAt={snapshot.readAt}
        />
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div data-testid="runner-fleet-rollup" style={{ display: 'flex', gap: 16 }}>
          <Text as="span" size="sm" weight="semibold">Registered {totals.total}</Text>
          <Text as="span" size="sm" color="secondary">Online {totals.online}</Text>
          <Text as="span" size="sm" color="ok">Busy {totals.busy}</Text>
          <Text as="span" size="sm" color={totals.offline > 0 ? 'warn' : 'secondary'}>Offline {totals.offline}</Text>
        </div>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <Text as="div" size="xs" weight="semibold" color="tertiary">By class</Text>
            <div data-testid="runner-fleet-by-class" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {classRollup.map((entry) => (
                <Text as="div" key={entry.label_class} size="xs" family="mono" color={entry.offline > 0 ? 'warn' : 'secondary'}>
                  {entry.label_class}: {entry.online}/{entry.total} online{entry.offline > 0 ? ` (${entry.offline} offline)` : ''}
                </Text>
              ))}
            </div>
          </div>
          <div>
            <Text as="div" size="xs" weight="semibold" color="tertiary">By host</Text>
            <div data-testid="runner-fleet-by-host" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {hostRollup.map((entry) => (
                <Text as="div" key={entry.host} size="xs" family="mono" color={entry.offline > 0 ? 'warn' : 'secondary'}>
                  {entry.host}: {entry.online}/{entry.total} online{entry.offline > 0 ? ` (${entry.offline} offline)` : ''}
                </Text>
              ))}
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 700 }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
              {header('Runner', 'runner_name')}
              {header('Class', 'label_class')}
              {header('Host', 'host')}
              {header('Status', 'status')}
              <Text as="span" size="xs" weight="semibold" color="tertiary">Job</Text>
            </div>
            {rows.map((row) => (
              <div key={row.runner_name} data-testid="runner-fleet-row" data-status={row.status} style={{ display: 'grid', gridTemplateColumns: grid, gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line-2)', alignItems: 'center' }}>
                <Text as="span" size="xs" family="mono" color="primary" truncate title={row.runner_name}>{row.runner_name}</Text>
                <Text as="span" size="xs" family="mono" color="secondary">{row.label_class}</Text>
                <Text as="span" size="xs" family="mono" color="secondary">{row.host}</Text>
                <Text as="span" size="xs" family="mono" color={statusColor(row.status)}>{row.status}</Text>
                <Text as="span" size="xs" family="mono" color="tertiary" truncate title={row.current_job_id ?? undefined}>
                  {row.status === 'busy' ? (row.current_job_id ?? '—') : ''}
                </Text>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ComponentWrapper>
  );
}

export default function LabRunnersWidget() {
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
        const topic = census.rows.find((row) => row.topic === TOPICS.runnerFleet);
        setAvailability(topic?.reachability === 'reachable' ? 'available' : 'missing');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setCensusError(reason instanceof Error ? reason : new Error(String(reason)));
        setAvailability('error');
      });
    return () => { active = false; };
  }, [fileMode]);

  const query = useProjectionSnapshotQuery<RunnerFleetRow>({
    topic: TOPICS.runnerFleet,
    queryKey: ['lab-runner-fleet'],
    enabled: availability === 'available',
    refetchInterval: 15_000,
  });

  return (
    <LabRunnersView
      snapshot={query.data ?? emptySnapshot()}
      available={availability === 'available'}
      isLoading={availability === 'loading' || query.isLoading}
      error={censusError || query.error}
    />
  );
}
