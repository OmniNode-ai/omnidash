/**
 * PatternLearning Dashboard
 *
 * PATLEARN-focused dashboard with evidence-based score debugging.
 * Part of OMN-1699: Pattern Dashboard with Evidence-Based Score Debugging
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
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
import { RefreshCw, Database, CheckCircle, Clock, Archive } from 'lucide-react';
import { patlearnSource, type PatlearnArtifact, type LifecycleState } from '@/lib/data-sources';
import { LifecycleStateBadge, PatternScoreDebugger } from '@/components/pattern';
import { POLLING_INTERVAL_MEDIUM, getPollingInterval } from '@/lib/constants/query-config';
import { queryKeys } from '@/lib/query-keys';

// ===========================
// Types
// ===========================

type FilterState = 'all' | LifecycleState;

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

export default function PatternLearning() {
  const [filter, setFilter] = useState<FilterState>('all');
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
  });

  // Fetch patterns list based on filter
  const {
    data: patterns,
    isLoading: patternsLoading,
    isError: patternsError,
    error: patternsErrorData,
    refetch: refetchPatterns,
  } = useQuery({
    queryKey: queryKeys.patlearn.list(filter),
    queryFn: () => {
      if (filter === 'all') {
        return patlearnSource.list({ limit: 100, sort: 'score', order: 'desc' });
      }
      return patlearnSource.list({ state: filter, limit: 100, sort: 'score', order: 'desc' });
    },
    refetchInterval: getPollingInterval(POLLING_INTERVAL_MEDIUM),
  });

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
              value={summary?.promotionsLast24h ?? 0}
              icon={Archive}
              description="Patterns promoted to validated"
            />
          </>
        )}
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterState)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="candidate">Candidates</TabsTrigger>
          <TabsTrigger value="provisional">Provisional</TabsTrigger>
          <TabsTrigger value="validated">Validated</TabsTrigger>
          <TabsTrigger value="deprecated">Deprecated</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Patterns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Patterns</CardTitle>
          <CardDescription>Click a row to view scoring evidence and debug details</CardDescription>
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
          ) : patterns && patterns.length > 0 ? (
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
                {patterns.map((artifact) => (
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
              No patterns found for the selected filter.
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
