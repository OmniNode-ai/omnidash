/**
 * PatternLearning Dashboard
 *
 * PATLEARN-focused dashboard with evidence-based score debugging.
 * Part of OMN-1699: Pattern Dashboard with Evidence-Based Score Debugging
 */

import {
  useState,
  useMemo,
  useCallback,
  useDeferredValue,
  Component,
  type ReactNode,
  type ErrorInfo,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw,
  Database,
  CheckCircle,
  Clock,
  Archive,
  Filter,
  X,
  Search,
  Loader2,
} from 'lucide-react';
import { patlearnSource, type PatlearnArtifact, type LifecycleState } from '@/lib/data-sources';
import { LifecycleStateBadge, PatternScoreDebugger } from '@/components/pattern';
import { POLLING_INTERVAL_MEDIUM, getPollingInterval } from '@/lib/constants/query-config';
import { queryKeys } from '@/lib/query-keys';

// ===========================
// Constants
// ===========================

/** Maximum patterns to fetch from API */
const MAX_PATTERN_FETCH = 500;

/** Limit options for pagination */
const LIMIT_OPTIONS = [25, 50, 100, 250] as const;

/** Available lifecycle states for filtering */
const LIFECYCLE_STATES: LifecycleState[] = ['candidate', 'provisional', 'validated', 'deprecated'];

// ===========================
// Error Boundary
// ===========================

/**
 * Error boundary for PatternLearning dashboard
 * Catches rendering errors and displays a fallback UI
 */
class PatternLearningErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[PatternLearning] Render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center" data-testid="page-pattern-learning-error">
          <h2 className="text-xl font-semibold text-destructive mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button variant="outline" onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===========================
// Types
// ===========================

interface FilterState {
  state: LifecycleState | null;
  patternType: string | null;
  search: string;
  limit: number;
}

// ===========================
// Stats Card Component
// ===========================

function StatsCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

// ===========================
// Main Dashboard Component
// ===========================

function PatternLearningContent() {
  const [filters, setFilters] = useState<FilterState>({
    state: null,
    patternType: null,
    search: '',
    limit: 50,
  });

  // Defer the search value to avoid excessive re-renders during rapid typing
  // The input shows typed characters immediately, but filtering uses the deferred value
  const deferredSearch = useDeferredValue(filters.search);

  // Detect when search filtering is pending (input value differs from deferred value)
  const isSearchPending = filters.search !== deferredSearch;

  const [selectedArtifact, setSelectedArtifact] = useState<PatlearnArtifact | null>(null);
  const [debuggerOpen, setDebuggerOpen] = useState(false);

  // Fetch summary metrics
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErrorData,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: queryKeys.patlearn.summary('24h'),
    queryFn: () => patlearnSource.summary('24h'),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM),
    staleTime: 30_000, // 30 seconds - prevents unnecessary refetches on remount
  });

  // Fetch all patterns (we filter client-side for better UX)
  const {
    data: patterns,
    isLoading: patternsLoading,
    isError: patternsError,
    error: patternsErrorData,
    refetch: refetchPatterns,
  } = useQuery({
    queryKey: queryKeys.patlearn.list(`all-limit${MAX_PATTERN_FETCH}`),
    queryFn: () => patlearnSource.list({ limit: MAX_PATTERN_FETCH, sort: 'score', order: 'desc' }),
    refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM),
    staleTime: 30_000, // 30 seconds - prevents unnecessary refetches on remount
  });

  // Derive unique pattern types from the data
  const availablePatternTypes = useMemo(() => {
    if (!patterns) return [];
    const types = new Set(patterns.map((p) => p.patternType));
    return Array.from(types).sort();
  }, [patterns]);

  // Client-side filtering with useMemo
  // Uses deferredSearch to avoid re-filtering on every keystroke
  const filteredPatterns = useMemo(() => {
    if (!patterns) return [];

    let result = patterns;

    // Filter by lifecycle state
    if (filters.state) {
      result = result.filter((p) => p.lifecycleState === filters.state);
    }

    // Filter by pattern type
    if (filters.patternType) {
      result = result.filter((p) => p.patternType === filters.patternType);
    }

    // Filter by search term (uses deferred value for smoother typing)
    if (deferredSearch) {
      const searchLower = deferredSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.patternName.toLowerCase().includes(searchLower) ||
          p.patternType.toLowerCase().includes(searchLower) ||
          (p.language && p.language.toLowerCase().includes(searchLower))
      );
    }

    // Apply limit
    return result.slice(0, filters.limit);
  }, [patterns, filters.state, filters.patternType, filters.limit, deferredSearch]);

  // Check if any filters are active
  const hasActiveFilters = filters.state || filters.patternType || filters.search;

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      state: null,
      patternType: null,
      search: '',
    }));
  }, []);

  const handleRowClick = (artifact: PatlearnArtifact) => {
    setSelectedArtifact(artifact);
    setDebuggerOpen(true);
  };

  const handleRefresh = () => {
    refetchSummary();
    refetchPatterns();
  };

  return (
    <div className="space-y-6" data-testid="page-pattern-learning">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pattern Learning</h1>
          <p className="text-muted-foreground">
            PATLEARN dashboard with evidence-based score debugging
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryError ? (
          <div className="col-span-full text-center py-8">
            <p className="text-destructive font-medium">Failed to load summary data</p>
            <p className="text-sm text-muted-foreground mt-1">
              {summaryErrorData instanceof Error
                ? summaryErrorData.message
                : 'Please try refreshing the page.'}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetchSummary()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : summaryLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="Total Patterns"
              value={summary?.totalPatterns ?? 0}
              icon={Database}
              description="Across all lifecycle states"
            />
            <StatsCard
              title="Candidates"
              value={(summary?.byState.candidate ?? 0) + (summary?.byState.provisional ?? 0)}
              icon={Clock}
              description="Pending validation"
            />
            <StatsCard
              title="Validated"
              value={summary?.byState.validated ?? 0}
              icon={CheckCircle}
              description="Confirmed learned patterns"
            />
            <StatsCard
              title="Promotions (24h)"
              value={summary?.promotionsInWindow ?? 0}
              icon={Archive}
              description="Patterns promoted to validated"
            />
          </>
        )}
      </div>

      {/* Filter Bar */}
      <Card className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          {/* State Filter */}
          <Select
            value={filters.state || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({
                ...prev,
                state: value === 'all' ? null : (value as LifecycleState),
              }))
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {LIFECYCLE_STATES.map((state) => (
                <SelectItem key={state} value={state}>
                  {state.charAt(0).toUpperCase() + state.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Pattern Type Filter */}
          <Select
            value={filters.patternType || 'all'}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, patternType: value === 'all' ? null : value }))
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {availablePatternTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search Input */}
          <div className="flex-1 max-w-xs relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search patterns..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              className="h-9 pl-9 pr-8"
            />
            {isSearchPending && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </div>

          {/* Limit Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show:</span>
            <Select
              value={String(filters.limit)}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, limit: Number(value) }))}
            >
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}

          {/* Active Filter Badges */}
          <div className="flex items-center gap-2">
            {filters.state && (
              <Badge variant="secondary" className="gap-1">
                State: {filters.state}
                <button
                  type="button"
                  aria-label={`Remove ${filters.state} state filter`}
                  className="ml-0.5 rounded-sm hover:text-destructive focus:outline-none focus:ring-1 focus:ring-ring"
                  onClick={() => setFilters((prev) => ({ ...prev, state: null }))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {filters.patternType && (
              <Badge variant="secondary" className="gap-1">
                Type: {filters.patternType}
                <button
                  type="button"
                  aria-label={`Remove ${filters.patternType} pattern type filter`}
                  className="ml-0.5 rounded-sm hover:text-destructive focus:outline-none focus:ring-1 focus:ring-ring"
                  onClick={() => setFilters((prev) => ({ ...prev, patternType: null }))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {filters.search && (
              <Badge variant="secondary" className="gap-1">
                Search: "{filters.search}"
                <button
                  type="button"
                  aria-label={`Remove "${filters.search}" search filter`}
                  className="ml-0.5 rounded-sm hover:text-destructive focus:outline-none focus:ring-1 focus:ring-ring"
                  onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Patterns Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Patterns</CardTitle>
              <CardDescription>
                {patternsLoading
                  ? 'Loading patterns...'
                  : `Showing ${filteredPatterns.length}${patterns && filteredPatterns.length < patterns.length ? ` of ${patterns.length}` : ''} patterns. Click a row to view scoring evidence.`}
              </CardDescription>
            </div>
            {hasActiveFilters && patterns && filteredPatterns.length < patterns.length && (
              <Badge variant="outline" className="text-muted-foreground">
                {patterns.length - filteredPatterns.length} hidden by filters
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {patternsError ? (
            <div className="text-center py-8">
              <p className="text-destructive font-medium">Failed to load patterns</p>
              <p className="text-sm text-muted-foreground mt-1">
                {patternsErrorData instanceof Error
                  ? patternsErrorData.message
                  : 'Please try refreshing the page.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetchPatterns()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : patternsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredPatterns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPatterns.map((artifact) => (
                  <TableRow
                    key={artifact.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(artifact)}
                  >
                    <TableCell className="font-medium">{artifact.patternName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{artifact.patternType}</Badge>
                    </TableCell>
                    <TableCell>{artifact.language || '—'}</TableCell>
                    <TableCell>
                      <LifecycleStateBadge state={artifact.lifecycleState} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(artifact.compositeScore * 100).toFixed(0)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {patterns && patterns.length > 0
                ? 'No patterns match the current filters.'
                : 'No patterns found.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Debugger Sheet */}
      <PatternScoreDebugger
        artifact={selectedArtifact}
        open={debuggerOpen}
        onOpenChange={setDebuggerOpen}
      />
    </div>
  );
}

// ===========================
// Default Export with Error Boundary
// ===========================

export default function PatternLearning() {
  return (
    <PatternLearningErrorBoundary>
      <PatternLearningContent />
    </PatternLearningErrorBoundary>
  );
}
