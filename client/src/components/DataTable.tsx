import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TableFilters, FilterState, ColumnFilter } from '@/components/TableFilters';
import { TablePagination, PaginationState } from '@/components/TablePagination';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T extends { id: string | number }> {
  data: T[];
  columns: Column<T>[];
  title?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  searchKeys?: (keyof T)[];
  columnFilters?: ColumnFilter[];
  showTimeRange?: boolean;
  searchPlaceholder?: string;
  defaultPageSize?: number;
  maxHeight?: string;
  className?: string;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  key: string | null;
  direction: SortDirection;
}

export function DataTable<T extends Record<string, any> & { id: string | number }>({
  data,
  columns,
  title,
  isLoading = false,
  emptyMessage = 'No data available',
  searchKeys = [],
  columnFilters = [],
  showTimeRange = false,
  searchPlaceholder = 'Search...',
  defaultPageSize = 50,
  maxHeight = '600px',
  className,
}: DataTableProps<T>) {
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    timeRange: showTimeRange ? '24h' : undefined,
    columnFilters: {},
  });

  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: defaultPageSize,
  });

  const [sort, setSort] = useState<SortState>({
    key: null,
    direction: null,
  });

  // Handle sorting
  const handleSort = (columnKey: string) => {
    const column = columns.find((col) => col.key === columnKey);
    if (!column?.sortable) return;

    setSort((prev) => {
      if (prev.key !== columnKey) {
        return { key: columnKey, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key: columnKey, direction: 'desc' };
      }
      return { key: null, direction: null };
    });
  };

  // Filter and sort data
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply search filter
    if (filters.searchQuery && searchKeys.length > 0) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter((item) =>
        searchKeys.some((key) => {
          const value = item[key];
          return value && String(value).toLowerCase().includes(query);
        })
      );
    }

    // Apply column filters
    Object.entries(filters.columnFilters).forEach(([key, value]) => {
      if (value) {
        result = result.filter((item) => String(item[key]) === value);
      }
    });

    // Apply sorting
    if (sort.key && sort.direction) {
      result.sort((a, b) => {
        const aValue = a[sort.key!];
        const bValue = b[sort.key!];

        // Handle null/undefined values - sort them last
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return 1;
        if (bValue == null) return -1;

        if (aValue === bValue) return 0;

        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else {
          comparison = aValue < bValue ? -1 : 1;
        }

        return sort.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, filters, sort, searchKeys]);

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return processedData.slice(start, end);
  }, [processedData, pagination]);

  // Reset to page 1 when filters change
  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Render sort icon
  const renderSortIcon = (columnKey: string) => {
    if (sort.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-2 h-4 w-4" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4" />;
  };

  return (
    <Card className={cn('p-6', className)}>
      {title && <h3 className="text-base font-semibold mb-4">{title}</h3>}

      {/* Filters */}
      <div className="mb-4">
        <TableFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          columnFilters={columnFilters}
          showTimeRange={showTimeRange}
          searchPlaceholder={searchPlaceholder}
        />
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : processedData.length === 0 ? (
        /* Empty State */
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <>
          {/* Table Container with Fixed Header */}
          <div className="relative border rounded-lg overflow-hidden" style={{ maxHeight }}>
            <div className="overflow-auto" style={{ maxHeight }}>
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10 border-b">
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead
                        key={column.key}
                        className={cn(
                          column.className,
                          column.sortable && 'cursor-pointer select-none hover:bg-muted/50'
                        )}
                        onClick={() => column.sortable && handleSort(column.key)}
                      >
                        <div className="flex items-center">
                          {column.header}
                          {column.sortable && renderSortIcon(column.key)}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((item) => (
                    <TableRow key={item.id}>
                      {columns.map((column) => (
                        <TableCell key={`${item.id}-${column.key}`} className={column.className}>
                          {column.render ? column.render(item) : String(item[column.key] ?? '')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          <TablePagination
            pagination={pagination}
            onPaginationChange={setPagination}
            totalItems={processedData.length}
          />
        </>
      )}
    </Card>
  );
}
