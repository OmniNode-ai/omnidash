/**
 * TableWidget
 *
 * A contract-driven wrapper for data tables that pulls data from DashboardData
 * based on the widget configuration. Supports pagination, sorting, and
 * configurable column formatting.
 *
 * @module lib/widgets/TableWidget
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

/**
 * Props for the TableWidget component.
 *
 * @interface TableWidgetProps
 */
interface TableWidgetProps {
  /**
   * The widget definition containing common properties like
   * widget_id, title, and description.
   */
  widget: WidgetDefinition;

  /**
   * The table-specific configuration including:
   * - rows_key: Key to look up the data array in DashboardData
   * - columns: Array of column definitions with headers, keys, and formatters
   * - page_size: Number of rows per page
   * - default_sort_key/direction: Initial sorting
   * - striped: Whether to use alternating row colors
   * - hover_highlight: Whether to highlight rows on hover
   * - show_pagination: Whether to show pagination controls
   */
  config: WidgetConfigTable;

  /**
   * The dashboard data object containing the table rows.
   * The widget looks for an array at config.rows_key.
   */
  data: DashboardData;

  /**
   * When true, displays a loading skeleton instead of actual data.
   *
   * @default false
   */
  isLoading?: boolean;
}

/**
 * Sort direction for table columns.
 * - 'asc': Ascending order (A-Z, 0-9)
 * - 'desc': Descending order (Z-A, 9-0)
 * - null: No sorting applied
 */
type SortDirection = 'asc' | 'desc' | null;

/**
 * Current sort state for the table.
 *
 * @interface SortState
 */
interface SortState {
  /** The column key being sorted, or null if no sort */
  key: string | null;
  /** The sort direction */
  direction: SortDirection;
}

/**
 * Type for a single row of data in the table.
 *
 * Represents a generic record where keys are column identifiers
 * and values can be any type (formatted by CellValue based on column config).
 */
type RowData = Record<string, unknown>;

/**
 * Renders a data table widget with sorting and pagination support.
 *
 * The TableWidget displays tabular data with features like:
 * - Column sorting (click headers to toggle asc/desc/none)
 * - Pagination with configurable page size
 * - Multiple cell formats (text, number, date, badge, link, percent, currency)
 * - Striped rows and hover highlighting options
 * - Responsive with horizontal scrolling for overflow
 *
 * @example
 * ```tsx
 * const config: WidgetConfigTable = {
 *   type: 'table',
 *   rows_key: 'agents',
 *   page_size: 10,
 *   columns: [
 *     { key: 'name', header: 'Name', sortable: true },
 *     { key: 'status', header: 'Status', format: 'badge' },
 *     { key: 'cpu', header: 'CPU %', format: 'percent', align: 'right' }
 *   ],
 *   striped: true,
 *   hover_highlight: true
 * };
 *
 * <TableWidget
 *   widget={widgetDef}
 *   config={config}
 *   data={{
 *     agents: [
 *       { name: 'Agent-1', status: 'active', cpu: 45.2 },
 *       { name: 'Agent-2', status: 'warning', cpu: 78.9 }
 *     ]
 *   }}
 * />
 * ```
 *
 * @param props - Component props
 * @returns A table component with sorting and pagination
 */
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
                key={String(row.id ?? row.node_id ?? row.widget_id ?? rowIndex)}
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
 * Renders the sort direction indicator icon for sortable column headers.
 *
 * Displays:
 * - Bidirectional arrows (muted) when column is not actively sorted
 * - Up arrow when sorted ascending
 * - Down arrow when sorted descending
 *
 * @param props - Component props
 * @param props.columnKey - The key of the column this indicator represents
 * @param props.sortState - Current sort state with active key and direction
 * @returns An icon indicating the current sort state for this column
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
 * Formats and renders a table cell value based on column format configuration.
 *
 * Supports multiple format types:
 * - `text`: Default string rendering
 * - `number`: Locale-formatted number
 * - `date`: Date only (localized)
 * - `datetime`: Date and time (localized)
 * - `badge`: Semantic colored badge based on value
 * - `link`: Clickable hyperlink (string URL or {href, text} object)
 * - `percent`: Number with % suffix
 * - `currency`: USD currency format
 *
 * Handles null/undefined values by displaying a muted dash.
 *
 * @param props - Component props
 * @param props.value - The raw cell value to format
 * @param props.format - The format type from column configuration
 * @returns A formatted React element for the cell content
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
      // JSON data has dates as strings or numbers, not Date objects
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return <span>{date.toLocaleDateString()}</span>;
        }
      }
      return <span>{String(value)}</span>;

    case 'datetime':
      // JSON data has dates as strings or numbers, not Date objects
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
 * Renders a value as a Badge component with semantic coloring.
 *
 * Maps common status values to appropriate badge variants:
 * - **default** (green): success, active, healthy, online, completed
 * - **secondary** (yellow): warning, pending, processing
 * - **destructive** (red): error, failed, offline, critical
 * - **outline** (gray): inactive, unknown, or unrecognized values
 *
 * @param props - Component props
 * @param props.value - The value to display (converted to string)
 * @returns A Badge component with semantic variant styling
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
