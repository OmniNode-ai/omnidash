/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype primitive layout while source-level typography compliance is enforced separately. */
import { useState, useMemo, useCallback, type ReactNode, type CSSProperties } from 'react';

// ── Sort hook ──────────────────────────────────────────────────────

interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface ColumnDef<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  mono?: boolean;
  hidden?: boolean;
}

export function useSort<T>(
  rows: T[],
  initialSort: SortState | null,
  columns: ColumnDef<T>[],
) {
  const [sort, setSort] = useState<SortState | null>(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue || ((r: T) => (r as Record<string, unknown>)[sort.key] as string | number | null);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort, columns]);

  const onSort = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return null;
    });
  }, []);

  return { sorted, sort, onSort };
}

// ── Sort arrow indicator ───────────────────────────────────────────

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' | null }) {
  if (!active)
    return (
      <span style={{ display: 'inline-block', width: 8, marginLeft: 4, opacity: 0.25 }}>
        &#x21D5;
      </span>
    );
  return (
    <span style={{ display: 'inline-block', width: 8, marginLeft: 4, color: 'var(--accent)' }}>
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

// ── SortableTable ──────────────────────────────────────────────────

export interface SortableTableProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  initialSort?: SortState | null;
  rowKey?: string;
  dense?: boolean;
  onRowClick?: (row: T) => void;
  rowStyle?: (row: T, index: number) => CSSProperties;
}

export function SortableTable<T>({
  rows,
  columns,
  initialSort = null,
  rowKey = 'id',
  dense = false,
  onRowClick,
  rowStyle,
}: SortableTableProps<T>) {
  const visibleCols = columns.filter((c) => !c.hidden);
  const { sorted, sort, onSort } = useSort(rows, initialSort, visibleCols);
  const gridTemplate = visibleCols.map((c) => c.width || '1fr').join(' ');
  const padY = dense ? 5 : 8;

  // Sum minimum widths from declared widths
  const minWidth = visibleCols.reduce((sum, c) => {
    const w = c.width || '1fr';
    if (w.endsWith('px')) return sum + parseInt(w);
    const mm = /minmax\((\d+)px/.exec(w);
    if (mm) return sum + parseInt(mm[1]);
    return sum + 80; // 1fr fallback
  }, 0) + (visibleCols.length - 1) * 12 + 24;

  return (
    <div className="sortable-table" style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <div style={{ minWidth }}>
        {/* Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridTemplate,
            gap: 12,
            padding: '8px 12px',
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          {visibleCols.map((col) => {
            const active = sort?.key === col.key;
            return (
              <button
                key={col.key}
                type="button"
                onClick={() => onSort(col.key)}
                className="mono"
                style={{
                  appearance: 'none',
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: col.align || 'left',
                  fontSize: 9,
                  fontWeight: 700,
                  color: active ? 'var(--accent-ink)' : 'var(--ink-3)',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                }}
                title={`Sort by ${col.label}`}
              >
                {col.label}
                <SortArrow active={active} dir={active ? sort!.dir : null} />
              </button>
            );
          })}
        </div>

        {/* Rows */}
        {sorted.map((row, i) => (
          <div
            key={(row as Record<string, unknown>)[rowKey] as string ?? i}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              gap: 12,
              padding: `${padY}px 12px`,
              borderBottom: i < sorted.length - 1 ? '1px solid var(--line-2)' : 'none',
              cursor: onRowClick ? 'pointer' : 'default',
              alignItems: 'center',
              ...(typeof rowStyle === 'function' ? rowStyle(row, i) : {}),
            }}
          >
            {visibleCols.map((col) => (
              <div
                key={col.key}
                className={col.mono ? 'mono tnum' : ''}
                style={{
                  fontSize: 12,
                  textAlign: col.align || 'left',
                  color: 'var(--ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as ReactNode}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
