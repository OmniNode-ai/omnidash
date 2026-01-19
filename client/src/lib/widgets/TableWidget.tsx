/**
 * TableWidget
 *
 * A contract-driven wrapper for data tables that pulls data from DashboardData
 * based on the widget configuration. Supports pagination, sorting, and
 * configurable column formatting.
 */

import { useState, useMemo } from 'react';
import type { WidgetDefinition, WidgetConfigTable, DashboardData } from '@/lib/dashboard-schema';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface TableWidgetProps {
  widget: WidgetDefinition;
  config: WidgetConfigTable;
  data: DashboardData;
  isLoading?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  key: string | null;
  direction: SortDirection;
}

// Type for a single row of data
type RowData = Record<string, unknown>;

export function TableWidget({ widget: _widget, config, data, isLoading }: TableWidgetProps) {
  // Initialize sort state from config defaults
  const [sortState, setSortState] = useState<SortState>({
    key: config.default_sort_key ?? null,
    direction: config.default_sort_direction ?? null,
  });

  const [currentPage, setCurrentPage] = useState(1);

  // Get raw rows from data
  const rawRows = useMemo((): RowData[] => {
    const rows = data[config.rows_key];
    if (!Array.isArray(rows)) return [];
    return rows as RowData[];
  }, [data, config.rows_key]);

  // Sort rows if sorting is active
  const sortedRows = useMemo(() => {
    if (!sortState.key || !sortState.direction) return rawRows;

    const column = config.columns.find((col) => col.key === sortState.key);
    if (!column) return rawRows;

    return [...rawRows].sort((a, b) => {
      const aVal = a[sortState.key!];
      const bVal = b[sortState.key!];

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortState.direction === 'asc' ? -1 : 1;
      if (bVal == null) return sortState.direction === 'asc' ? 1 : -1;

      // Compare based on type
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortState.direction === 'asc' ? comparison : -comparison;
    });
  }, [rawRows, sortState, config.columns]);

  // Calculate pagination
  const pageSize = config.page_size ?? 10;
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRows = sortedRows.slice(startIndex, endIndex);

  // Handle sort click
  const handleSortClick = (columnKey: string) => {
    const column = config.columns.find((col) => col.key === columnKey);
    if (!column?.sortable) return;

    setSortState((prev) => {
      if (prev.key !== columnKey) {
        return { key: columnKey, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key: columnKey, direction: 'desc' };
      }
      // Reset to no sort
      return { key: null, direction: null };
    });
    // Reset to first page when sort changes
    setCurrentPage(1);
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <Table>
          <TableHeader>
            <TableRow>
              {config.columns.map((column) => (
                <TableHead key={column.key} style={column.width ? { width: column.width } : {}}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: Math.min(pageSize, 5) }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {config.columns.map((column) => (
                  <TableCell key={column.key}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Render empty state
  if (rawRows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {config.columns.map((column) => (
                <TableHead
                  key={column.key}
                  style={column.width ? { width: column.width } : {}}
                  className={cn(
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right',
                    column.sortable && 'cursor-pointer select-none hover:bg-muted/50'
                  )}
                  onClick={() => column.sortable && handleSortClick(column.key)}
                >
                  <div
                    className={cn(
                      'flex items-center gap-1',
                      column.align === 'center' && 'justify-center',
                      column.align === 'right' && 'justify-end'
                    )}
                  >
                    <span>{column.header}</span>
                    {column.sortable && (
                      <SortIndicator columnKey={column.key} sortState={sortState} />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                className={cn(
                  config.striped && rowIndex % 2 === 1 && 'bg-muted/30',
                  config.hover_highlight && 'hover:bg-muted/50'
                )}
              >
                {config.columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right'
                    )}
                  >
                    <CellValue value={row[column.key]} format={column.format} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {config.show_pagination !== false && totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-2">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, sortedRows.length)} of {sortedRows.length}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sort indicator icon for column headers
 */
function SortIndicator({ columnKey, sortState }: { columnKey: string; sortState: SortState }) {
  if (sortState.key !== columnKey) {
    return <ChevronsUpDown className="h-4 w-4 text-muted-foreground/50" />;
  }
  if (sortState.direction === 'asc') {
    return <ChevronUp className="h-4 w-4" />;
  }
  return <ChevronDown className="h-4 w-4" />;
}

/**
 * Format and render a cell value based on the column format configuration.
 */
function CellValue({ value, format }: { value: unknown; format?: string }) {
  // Handle null/undefined
  if (value == null) {
    return <span className="text-muted-foreground">-</span>;
  }

  // Format based on type
  switch (format) {
    case 'number':
      if (typeof value === 'number') {
        return <span>{value.toLocaleString()}</span>;
      }
      return <span>{String(value)}</span>;

    case 'date':
      if (value instanceof Date) {
        return <span>{value.toLocaleDateString()}</span>;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return <span>{date.toLocaleDateString()}</span>;
        }
      }
      return <span>{String(value)}</span>;

    case 'datetime':
      if (value instanceof Date) {
        return <span>{value.toLocaleString()}</span>;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return <span>{date.toLocaleString()}</span>;
        }
      }
      return <span>{String(value)}</span>;

    case 'badge':
      return <BadgeCell value={value} />;

    case 'link':
      if (typeof value === 'string') {
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            {value}
          </a>
        );
      }
      if (typeof value === 'object' && value !== null && 'href' in value && 'text' in value) {
        const linkObj = value as { href: string; text: string };
        return (
          <a
            href={linkObj.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            {linkObj.text}
          </a>
        );
      }
      return <span>{String(value)}</span>;

    case 'percent':
      if (typeof value === 'number') {
        return <span>{value.toFixed(1)}%</span>;
      }
      return <span>{String(value)}</span>;

    case 'currency':
      if (typeof value === 'number') {
        return (
          <span>
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(value)}
          </span>
        );
      }
      return <span>{String(value)}</span>;

    case 'text':
    default:
      return <span>{String(value)}</span>;
  }
}

/**
 * Render a value as a badge with semantic coloring based on value.
 */
function BadgeCell({ value }: { value: unknown }) {
  const text = String(value);

  // Map common status values to badge variants
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    // Success states
    success: 'default',
    active: 'default',
    healthy: 'default',
    online: 'default',
    completed: 'default',
    // Warning/secondary states
    warning: 'secondary',
    pending: 'secondary',
    processing: 'secondary',
    // Error/destructive states
    error: 'destructive',
    failed: 'destructive',
    offline: 'destructive',
    critical: 'destructive',
    // Default outline for unknown
    inactive: 'outline',
    unknown: 'outline',
  };

  const normalizedValue = text.toLowerCase();
  const variant = variantMap[normalizedValue] ?? 'outline';

  return <Badge variant={variant}>{text}</Badge>;
}
