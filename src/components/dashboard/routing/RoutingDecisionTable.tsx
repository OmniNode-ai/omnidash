import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { applyTimeRange, resolveTimeRange } from '@/hooks/useTimeRange';
import { useTimezone } from '@/hooks/useTimezone';
import { useFrameStore } from '@/store/store';
import { Text } from '@/components/ui/typography';

export interface RoutingDecision {
  id: string;
  created_at: string;
  llm_agent: string;
  fuzzy_agent: string;
  agreement: boolean;
  llm_confidence: number;
  fuzzy_confidence: number;
  cost_usd: number;
}

type SortKey = 'created_at' | 'llm_agent' | 'fuzzy_agent' | 'agreement' | 'llm_confidence' | 'cost_usd';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

interface Column {
  key: SortKey;
  label: string;
}

// Column widths are declared via a <colgroup> so `tableLayout: fixed`
// respects them — otherwise the browser distributes 1/6 to each column
// regardless of content, which made Timestamp wrap and wasted space on
// LLM Conf. and Cost (which only hold 3–7 chars).
const COLUMNS: Array<Column & { width: string }> = [
  { key: 'created_at',    label: 'Timestamp',   width: '24%' },
  { key: 'llm_agent',     label: 'LLM Agent',   width: '21%' },
  { key: 'fuzzy_agent',   label: 'Fuzzy Agent', width: '21%' },
  { key: 'agreement',     label: 'Agreement',   width: '13%' },
  { key: 'llm_confidence', label: 'LLM Conf.',  width: '9%' },
  { key: 'cost_usd',      label: 'Cost',        width: '12%' },
];

function formatTimestamp(iso: string, timeZone: string): string {
  // Compact "MM/DD HH:MM AM/PM" — fits the Timestamp column without
  // wrapping at typical widget widths. toLocaleString() was producing
  // strings like "4/20/2026, 10:40:00 AM" which are ~22 chars and
  // wrap whenever the widget isn't full-width.
  //
  // `timeZone` is the dashboard-level zone (`useTimezone()`); MM/DD
  // and HH:MM both come from the same zone so a row's date and time
  // can never disagree across a midnight boundary.
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value;
  const time = `${get('hour')}:${get('minute')}${dayPeriod ? ` ${dayPeriod}` : ''}`;
  return `${get('month')}/${get('day')} ${time}`;
}

export default function RoutingDecisionTable({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useProjectionQuery<RoutingDecision>({
    topic: 'onex.snapshot.projection.delegation.decisions.v1',
    queryKey: ['routing-decisions'],
    refetchInterval: 60_000,
  });

  const tz = useTimezone();
  const [query, setQuery] = useState('');
  // null sort = insertion order; otherwise { key, dir }.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [page, setPage] = useState(0);

  // Dashboard-level time range. Applied first (before the search filter)
  // so the row count shown in the footer reflects the window the user
  // selected. supports_time_range: true in the manifest.
  const timeRange = useFrameStore((s) => s.globalFilters.timeRange);
  const resolved = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const inRange = useMemo(
    () => applyTimeRange(data, (d) => d.created_at, resolved),
    [data, resolved],
  );

  // Search filter on top of the time-windowed rows.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inRange;
    return inRange.filter((row) => {
      return (
        row.llm_agent.toLowerCase().includes(q) ||
        row.fuzzy_agent.toLowerCase().includes(q) ||
        (row.agreement ? 'agree' : 'disagree').includes(q)
      );
    });
  }, [inRange, query]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = Number(av) - Number(bv);
      else cmp = String(av).localeCompare(String(bv));
      return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [sorted, safePage],
  );

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null; // third click clears sort
    });
    setPage(0);
  };

  const isEmpty = !data || data.length === 0;

  return (
    <ComponentWrapper
      title="Routing Decisions"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No routing decisions"
      emptyHint="Decisions appear after LLM routing events are recorded"
    >
      {data && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Search input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.375rem 0.625rem',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: 'var(--panel-2)',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search agents or agreement…"
              aria-label="Filter routing decisions"
              className="text-input-md"
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                background: 'transparent',
                color: 'inherit',
              }}
            />
          </div>

          {/* Scrollable table */}
          <div style={{ height: 360, overflow: 'auto', border: '1px solid var(--line-2)', borderRadius: 6 }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                // Font sizing matches EventStream's row/header so the two
                // "data feed" widgets read as a set: 0.75rem body rows,
                // 10px uppercase headers. Both derive from the same mono
                // token declared in globals.css. Typography is now applied
                // per-cell via <Text family="mono"> wrappers.
                tableLayout: 'fixed',
              }}
            >
              <colgroup>
                {COLUMNS.map((col) => (
                  <col key={col.key} style={{ width: col.width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {COLUMNS.map((col) => {
                    const isSorted = sort?.key === col.key;
                    const ariaSort: 'ascending' | 'descending' | 'none' = isSorted
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none';
                    return (
                      <th
                        key={col.key}
                        aria-sort={ariaSort}
                        scope="col"
                        style={{
                          position: 'sticky',
                          top: 0,
                          textAlign: 'left',
                          padding: '0.375rem 0.5rem',
                          background: 'var(--panel-2)',
                          borderBottom: '1px solid var(--line)',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleSort(col.key);
                            }
                          }}
                          aria-label={`Sort by ${col.label}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: 'transparent',
                            border: 0,
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          <Text
                            size="xs"
                            weight="semibold"
                            color="secondary"
                            family="mono"
                            transform="uppercase"
                            className="text-tracked"
                          >
                            {col.label}
                          </Text>
                          {isSorted &&
                            (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      style={{
                        padding: '2rem 0.5rem',
                        textAlign: 'center',
                      }}
                    >
                      <Text size="lg" color="tertiary" family="mono">
                        No routing decisions match "{query}"
                      </Text>
                    </td>
                  </tr>
                )}
                {pageRows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                    <td
                      style={{
                        padding: '0.375rem 0.5rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={new Date(row.created_at).toLocaleString(undefined, { timeZone: tz })}
                    >
                      {/* Timestamps are ambient metadata; dim them so the
                          primary data columns read as primary. Matches
                          EventStream's treatment of its time column. */}
                      <Text size="md" family="mono" color="tertiary" tabularNums>
                        {formatTimestamp(row.created_at, tz)}
                      </Text>
                    </td>
                    <td style={{ padding: '0.375rem 0.5rem' }}>
                      <Text size="md" family="mono">{row.llm_agent}</Text>
                    </td>
                    <td style={{ padding: '0.375rem 0.5rem' }}>
                      <Text size="md" family="mono">{row.fuzzy_agent}</Text>
                    </td>
                    <td style={{ padding: '0.375rem 0.5rem' }}>
                      <Text
                        size="md"
                        family="mono"
                        weight="medium"
                        color={row.agreement ? 'ok' : 'bad'}
                      >
                        {row.agreement ? 'Agree' : 'Disagree'}
                      </Text>
                    </td>
                    <td style={{ padding: '0.375rem 0.5rem' }}>
                      <Text size="md" family="mono" tabularNums>
                        {(row.llm_confidence * 100).toFixed(0)}%
                      </Text>
                    </td>
                    <td style={{ padding: '0.375rem 0.5rem' }}>
                      <Text size="md" family="mono" tabularNums>
                        ${row.cost_usd.toFixed(4)}
                      </Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls — status text mirrors EventStream's
              status row (11px, --ink-2, mono on the numeric spans);
              buttons keep the shared .btn chrome (sans-serif) for
              consistency with other buttons in the app. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text size="sm" color="secondary" family="mono">
              {sorted.length} {sorted.length === 1 ? 'result' : 'results'}
              {query && ` (filtered from ${inRange.length})`}
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                style={{ padding: '4px 10px' }}
              >
                <Text size="sm">Previous</Text>
              </button>
              <Text size="sm" color="secondary" family="mono">
                Page {safePage + 1} of {totalPages}
              </Text>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                style={{ padding: '4px 10px' }}
              >
                <Text size="sm">Next</Text>
              </button>
            </div>
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
