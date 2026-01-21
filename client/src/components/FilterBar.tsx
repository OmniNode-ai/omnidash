/**
 * FilterBar Component
 *
 * A reusable, collapsible filter bar for dashboard pages.
 * Supports multiple filter types: select dropdowns and search inputs.
 *
 * @module components/FilterBar
 */

import { type ReactNode, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Filter, X, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Configuration for a select filter dropdown.
 */
export interface SelectFilterConfig {
  type: 'select';
  /** Unique identifier for this filter */
  id: string;
  /** Placeholder text when no value selected */
  placeholder: string;
  /** Current selected value (undefined = all) */
  value: string | undefined;
  /** Callback when value changes */
  onChange: (value: string | undefined) => void;
  /** Available options */
  options: Array<{
    value: string;
    label: string;
    /** Optional icon to render before label */
    icon?: ReactNode;
  }>;
  /** Label for "all" option */
  allLabel?: string;
}

/**
 * Configuration for a search input filter.
 */
export interface SearchFilterConfig {
  type: 'search';
  /** Unique identifier for this filter */
  id: string;
  /** Placeholder text */
  placeholder: string;
  /** Current search value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Ref for the input element (for focus management) */
  inputRef?: RefObject<HTMLInputElement>;
}

export type FilterConfig = SelectFilterConfig | SearchFilterConfig;

/**
 * Props for the FilterBar component.
 */
export interface FilterBarProps {
  /** Array of filter configurations */
  filters: FilterConfig[];
  /** Whether the filter bar is expanded */
  isOpen: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback to clear all filters */
  onClear: () => void;
  /** Whether any filters are currently active */
  hasActiveFilters: boolean;
  /** Optional className for the container */
  className?: string;
}

/**
 * A collapsible filter bar with support for select dropdowns and search inputs.
 *
 * The filter bar automatically opens when filters are active and provides
 * a unified UI for filtering across dashboard pages.
 *
 * @example
 * ```tsx
 * const [typeFilter, setTypeFilter] = useState<string | undefined>();
 * const [searchQuery, setSearchQuery] = useState('');
 *
 * <FilterBar
 *   filters={[
 *     {
 *       type: 'select',
 *       id: 'type',
 *       placeholder: 'Type',
 *       value: typeFilter,
 *       onChange: setTypeFilter,
 *       options: [
 *         { value: 'A', label: 'Type A' },
 *         { value: 'B', label: 'Type B' },
 *       ],
 *     },
 *     {
 *       type: 'search',
 *       id: 'search',
 *       placeholder: 'Search...',
 *       value: searchQuery,
 *       onChange: setSearchQuery,
 *     },
 *   ]}
 *   isOpen={isFiltersOpen}
 *   onOpenChange={setIsFiltersOpen}
 *   onClear={clearFilters}
 *   hasActiveFilters={!!typeFilter || !!searchQuery}
 * />
 * ```
 */
export function FilterBar({
  filters,
  isOpen,
  onOpenChange,
  onClear,
  hasActiveFilters,
  className,
}: FilterBarProps) {
  return (
    <Collapsible
      open={isOpen || hasActiveFilters}
      onOpenChange={onOpenChange}
      className={className}
    >
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 h-8 px-2">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">Filters</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                (isOpen || hasActiveFilters) && 'rotate-180'
              )}
            />
          </Button>
        </CollapsibleTrigger>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="gap-1 text-muted-foreground h-7"
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 p-3 border rounded-lg bg-muted/20">
          {filters.map((filter) => (
            <FilterField key={filter.id} filter={filter} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Renders a single filter field based on its configuration type.
 */
function FilterField({ filter }: { filter: FilterConfig }) {
  if (filter.type === 'select') {
    return <SelectFilter filter={filter} />;
  }
  return <SearchFilter filter={filter} />;
}

/**
 * Renders a select dropdown filter.
 */
function SelectFilter({ filter }: { filter: SelectFilterConfig }) {
  const allLabel = filter.allLabel ?? `All ${filter.placeholder}`;

  return (
    <Select
      value={filter.value ?? 'all'}
      onValueChange={(value) => filter.onChange(value === 'all' ? undefined : value)}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder={filter.placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {filter.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.icon ? (
              <span className="flex items-center gap-2">
                {option.icon}
                {option.label}
              </span>
            ) : (
              option.label
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Renders a search input filter with clear button.
 */
function SearchFilter({ filter }: { filter: SearchFilterConfig }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={filter.inputRef}
        placeholder={filter.placeholder}
        value={filter.value}
        onChange={(e) => filter.onChange(e.target.value)}
        className="pl-9 h-9"
      />
      {filter.value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
          onClick={() => filter.onChange('')}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
