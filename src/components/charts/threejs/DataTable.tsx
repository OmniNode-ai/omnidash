import { ChevronUp, ChevronDown, Search } from 'lucide-react';
import { Text } from '@/components/ui/typography';
import type { DataTableColumnConfig, EmptyStateConfig } from '@shared/types/chart-config';
import type { IDataTableAdapter } from '@shared/types/chart-adapter-table';
import { useTableSearch } from './hooks/useTableSearch';
import { useTableSort } from './hooks/useTableSort';
import { useTablePagination } from './hooks/useTablePagination';

const DEFAULT_PAGE_SIZE = 25;

function resolveEmptyMessage(emptyState: EmptyStateConfig | undefined): string {
  return emptyState?.defaultMessage ?? 'No data';
}

interface DataTableProps<T extends Record<string, unknown>> {
  projectionData: T[];
  columns: DataTableColumnConfig[];
  pageSize?: number;
  emptyState?: EmptyStateConfig;
}

/**
 * Generic data table primitive — sort, search, and paginate over any
 * projection-reduced row type T. Extracts the reusable internals from
 * `RoutingDecisionTable` so Phase 2 (OMN-10293) can migrate that widget
 * to use this component as its rendering layer.
 *
 * Doctrine: `projectionData` must arrive pre-validated and canonically
 * ordered. This component renders; it does not infer authoritative state.
 */
export function DataTable<T extends Record<string, unknown>>({
  projectionData,
  columns,
  pageSize: pageSizeProp,
  emptyState,
}: DataTableProps<T>) {
  const pageSize =
    typeof pageSizeProp === 'number' && pageSizeProp > 0 ? pageSizeProp : DEFAULT_PAGE_SIZE;

  const { query, setQuery, filtered } = useTableSearch(projectionData, columns);
  const { sort, sorted, toggleSort } = useTableSort(filtered);
  const { page, totalPages, pageRows, goToPage, resetPage } = useTablePagination(sorted, pageSize);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    resetPage();
  };

  const handleSort = (key: string) => {
    toggleSort(key);
    resetPage();
  };

  if (projectionData.length === 0) {
    return (
      <div
        data-testid="datatable-container"
        style={{ padding: '2rem 0.5rem', textAlign: 'center' }}
      >
        <Text size="lg" color="tertiary" family="mono">
          {resolveEmptyMessage(emptyState)}
        </Text>
      </div>
    );
  }

  const colWidths = columns.map((c) => (c.width != null ? `${c.width}px` : undefined));

  return (
    <div
      data-testid="datatable-container"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
    >
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
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search…"
          aria-label="Filter table rows"
          className="text-input-md"
          style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'inherit' }}
        />
      </div>

      <div
        style={{
          height: 360,
          overflow: 'auto',
          border: '1px solid var(--line-2)',
          borderRadius: 6,
        }}
      >
        <table
          style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}
        >
          {colWidths.some(Boolean) && (
            <colgroup>
              {columns.map((col, i) => (
                <col key={col.field} style={colWidths[i] ? { width: colWidths[i] } : undefined} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sort?.key === col.field;
                const ariaSort: 'ascending' | 'descending' | 'none' = isSorted
                  ? sort.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';
                return (
                  <th
                    key={col.field}
                    aria-sort={ariaSort}
                    scope="col"
                    style={{
                      position: 'sticky',
                      top: 0,
                      textAlign: 'left',
                      padding: '0.375rem 0.5rem',
                      background: 'var(--panel-2)',
                      borderBottom: '1px solid var(--line)',
                      cursor: col.sortable !== false ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    {col.sortable !== false ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.field)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSort(col.field);
                          }
                        }}
                        aria-label={`Sort by ${col.header}`}
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
                          {col.header}
                        </Text>
                        {isSorted &&
                          (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                      </button>
                    ) : (
                      <Text
                        size="xs"
                        weight="semibold"
                        color="secondary"
                        family="mono"
                        transform="uppercase"
                        className="text-tracked"
                      >
                        {col.header}
                      </Text>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: '2rem 0.5rem', textAlign: 'center' }}
                >
                  <Text size="lg" color="tertiary" family="mono">
                    No results match &ldquo;{query}&rdquo;
                  </Text>
                </td>
              </tr>
            )}
            {pageRows.map((row, idx) => (
              <tr
                key={idx}
                data-testid={`datatable-row-${idx}`}
                style={{ borderBottom: '1px solid var(--line-2)' }}
              >
                {columns.map((col) => {
                  const raw = row[col.field];
                  const display = raw == null ? '' : String(raw);
                  return (
                    <td key={col.field} style={{ padding: '0.375rem 0.5rem' }}>
                      <Text size="md" family="mono">
                        {display}
                      </Text>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text size="sm" color="secondary" family="mono">
          {sorted.length} {sorted.length === 1 ? 'result' : 'results'}
          {query && ` (filtered from ${projectionData.length})`}
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => goToPage(page - 1)}
            disabled={page === 0}
            style={{ padding: '4px 10px' }}
          >
            <Text size="sm">Previous</Text>
          </button>
          <Text size="sm" color="secondary" family="mono">
            Page {page + 1} of {totalPages}
          </Text>
          <button
            type="button"
            className="btn ghost"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages - 1}
            style={{ padding: '4px 10px' }}
          >
            <Text size="sm">Next</Text>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Named alias used by the adapter resolver to identify the threejs implementation. */
export const DataTableThreeJs: IDataTableAdapter = DataTable as IDataTableAdapter;

export type { DataTableProps };
export { DEFAULT_PAGE_SIZE };
