import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TimeRangeSelector } from '@/components/TimeRangeSelector';
import { X, Search } from 'lucide-react';

export interface FilterState {
  searchQuery: string;
  timeRange?: string;
  columnFilters: Record<string, string>;
}

export interface ColumnFilter {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

interface TableFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  columnFilters?: ColumnFilter[];
  showTimeRange?: boolean;
  searchPlaceholder?: string;
}

export function TableFilters({
  filters,
  onFiltersChange,
  columnFilters = [],
  showTimeRange = false,
  searchPlaceholder = 'Search...',
}: TableFiltersProps) {
  const handleSearchChange = (value: string) => {
    onFiltersChange({
      ...filters,
      searchQuery: value,
    });
  };

  const handleTimeRangeChange = (value: string) => {
    onFiltersChange({
      ...filters,
      timeRange: value,
    });
  };

  const handleColumnFilterChange = (key: string, value: string) => {
    onFiltersChange({
      ...filters,
      columnFilters: {
        ...filters.columnFilters,
        [key]: value,
      },
    });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      searchQuery: '',
      timeRange: filters.timeRange,
      columnFilters: {},
    });
  };

  const hasActiveFilters =
    filters.searchQuery ||
    Object.keys(filters.columnFilters).some((key) => filters.columnFilters[key]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={searchPlaceholder}
          value={filters.searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Time Range Selector */}
      {showTimeRange && filters.timeRange !== undefined && (
        <TimeRangeSelector value={filters.timeRange} onChange={handleTimeRangeChange} />
      )}

      {/* Column Filters */}
      {columnFilters.map((filter) => (
        <Select
          key={filter.key}
          value={filters.columnFilters[filter.key] || 'all'}
          onValueChange={(value) =>
            handleColumnFilterChange(filter.key, value === 'all' ? '' : value)
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All {filter.label}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-10 px-3">
          <X className="h-4 w-4 mr-2" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}
