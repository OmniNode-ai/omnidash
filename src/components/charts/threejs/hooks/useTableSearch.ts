import { useState, useMemo } from 'react';
import type { DataTableColumnConfig } from '@shared/types/chart-config';

export function useTableSearch<T extends Record<string, unknown>>(
  rows: T[],
  columns: DataTableColumnConfig[],
) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const searchableCols = columns.filter((c) => c.searchable !== false);
    return rows.filter((row) =>
      searchableCols.some((col) => {
        const val = row[col.field];
        return val != null && String(val).toLowerCase().includes(q);
      }),
    );
  }, [rows, columns, query]);

  return { query, setQuery, filtered };
}
