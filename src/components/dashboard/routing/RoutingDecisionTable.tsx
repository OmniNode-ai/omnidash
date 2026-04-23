import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';

interface RoutingDecision {
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

const COLUMNS: Column[] = [
  { key: 'created_at', label: 'Timestamp' },
  { key: 'llm_agent', label: 'LLM Agent' },
  { key: 'fuzzy_agent', label: 'Fuzzy Agent' },
  { key: 'agreement', label: 'Agreement' },
  { key: 'llm_confidence', label: 'LLM Conf.' },
  { key: 'cost_usd', label: 'Cost' },
];

export default function RoutingDecisionTable({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useProjectionQuery<RoutingDecision>({
    topic: 'onex.snapshot.projection.delegation.decisions.v1',
    queryKey: ['routing-decisions'],
    refetchInterval: 60_000,
  });

  const [query, setQuery] = useState('');
  // null sort = insertion order; otherwise { key, dir }.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [page, setPage] = useState(0);

  // Filter → sort → paginate. Recompute only when inputs change.
  const filtered = useMemo(() => {
    if (!data) return [] as RoutingDecision[];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => {
      return (
        row.llm_agent.toLowerCase().includes(q) ||
        row.fuzzy_agent.toLowerCase().includes(q) ||
        (row.agreement ? 'agree' : 'disagree').includes(q)
      );
    });
  }, [data, query]);

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
            <Search size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search agents or agreement…"
              aria-label="Filter routing decisions"
              style={{
                flex: 1,
                border: 0,
                outline: 0,
                background: 'transparent',
                color: 'var(--ink)',
                fontSize: 13,
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Scrollable table */}
          <div style={{ height: 360, overflow: 'auto', border: '1px solid var(--line-2)', borderRadius: 6 }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8125rem',
                tableLayout: 'fixed',
              }}
            >
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
                          fontWeight: 600,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--ink-2)',
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
                            font: 'inherit',
                            color: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          {col.label}
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
                        color: 'var(--ink-3)',
                        fontSize: 13,
                      }}
                    >
                      No routing decisions match "{query}"
                    </td>
                  </tr>
                )}
                {pageRows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--line-2)' }}>
                    <td style={{ padding: '0.375rem 0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.375rem 0.5rem' }}>{row.llm_agent}</td>
                    <td style={{ padding: '0.375rem 0.5rem' }}>{row.fuzzy_agent}</td>
                    <td
                      style={{
                        padding: '0.375rem 0.5rem',
                        color: row.agreement ? 'var(--status-ok)' : 'var(--status-bad)',
                        fontWeight: 500,
                      }}
                    >
                      {row.agreement ? 'Agree' : 'Disagree'}
                    </td>
                    <td style={{ padding: '0.375rem 0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                      {(row.llm_confidence * 100).toFixed(0)}%
                    </td>
                    <td style={{ padding: '0.375rem 0.5rem', fontVariantNumeric: 'tabular-nums' }}>
                      ${row.cost_usd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--ink-2)',
            }}
          >
            <span>
              {sorted.length} {sorted.length === 1 ? 'result' : 'results'}
              {query && ` (filtered from ${data.length})`}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                Previous
              </button>
              <span>
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
