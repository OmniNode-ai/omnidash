import { useState, useMemo } from 'react';

export function useTablePagination<T>(rows: T[], pageSize: number) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const pageRows = useMemo(
    () => rows.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [rows, safePage, pageSize],
  );

  const goToPage = (p: number) => setPage(Math.max(0, Math.min(totalPages - 1, p)));
  const resetPage = () => setPage(0);

  return { page: safePage, totalPages, pageRows, goToPage, resetPage };
}
