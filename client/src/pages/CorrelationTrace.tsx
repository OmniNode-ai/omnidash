/**
 * CorrelationTrace (OMN-2301)
 *
 * Trace complete agent execution flows using correlation IDs.
 * Defaults to live data mode, showing recent traces from the API
 * with click-to-select for full hop-by-hop timeline visualization.
 *
 * Data sources:
 *   GET /api/intelligence/traces/recent?limit=20 - Recent traces list
 *   GET /api/intelligence/trace/:correlationId   - Full trace detail
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Clock,
  AlertCircle,
  Code,
  Database,
  Zap,
  Activity,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/ExportButton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatRelativeTime } from '@/lib/date-utils';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DemoBanner } from '@/components/DemoBanner';

// ============================================================================
// Types
// ============================================================================

/** Summary row returned by GET /api/intelligence/traces/recent */
interface RecentTrace {
  correlationId: string;
  selectedAgent: string;
  confidenceScore: number;
  userRequest: string | null;
  routingTimeMs: number;
  createdAt: string | null;
  eventCount: number;
}

/** Single hop in a trace timeline */
interface TraceEvent {
  id: string;
  eventType: 'routing' | 'action' | 'manifest' | 'error';
  timestamp: string;
  agentName?: string;
  details: Record<string, unknown>;
  durationMs?: number;
}

/** Full trace detail returned by GET /api/intelligence/trace/:id */
interface TraceResponse {
  correlationId: string;
  events: TraceEvent[];
  summary: {
    totalEvents: number;
    routingDecisions: number;
    actions: number;
    errors: number;
    totalDurationMs: number;
  };
}

// ============================================================================
// Demo data (shown when demo mode is active)
// ============================================================================

/** Demo correlation ID matching the event-bus-demo.ts narrative. */
const DEMO_CORRELATION_ID = 'cor-demo-7f3a';

const DEMO_RECENT_TRACES: RecentTrace[] = [
  {
    correlationId: DEMO_CORRELATION_ID,
    selectedAgent: 'frontend-developer',
    confidenceScore: 0.94,
    userRequest: 'feat(dash): implement demo mode toggle',
    routingTimeMs: 38,
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    eventCount: 6,
  },
  {
    correlationId: 'cor-demo-8b2c',
    selectedAgent: 'debug',
    confidenceScore: 0.88,
    userRequest: 'fix(validation): add missing error boundaries',
    routingTimeMs: 29,
    createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    eventCount: 4,
  },
];

const DEMO_TRACE_DETAIL: TraceResponse = (() => {
  const base = Date.now() - 12 * 60 * 1000;
  return {
    correlationId: DEMO_CORRELATION_ID,
    events: [
      {
        id: 'demo-002',
        eventType: 'routing' as const,
        timestamp: new Date(base + 12_000).toISOString(),
        agentName: 'omniarchon',
        details: {
          selectedAgent: 'frontend-developer',
          confidence: 0.94,
          candidateAgents: ['frontend-developer', 'python-fastapi-expert', 'code-quality-analyzer'],
          routingStrategy: 'hook-classifier',
        },
        durationMs: 38,
      },
      {
        id: 'demo-004',
        eventType: 'manifest' as const,
        timestamp: new Date(base + 30_000).toISOString(),
        agentName: 'omniclaude',
        details: {
          patternsInjected: 8,
          tokenCount: 1240,
          injectionLatencyMs: 38,
        },
        durationMs: 38,
      },
      {
        id: 'demo-005',
        eventType: 'action' as const,
        timestamp: new Date(base + 66_000).toISOString(),
        agentName: 'frontend-developer',
        details: {
          actionType: 'Read',
          file_path: 'client/src/contexts/DemoModeContext.tsx',
          success: true,
        },
        durationMs: 42,
      },
      {
        id: 'demo-009',
        eventType: 'action' as const,
        timestamp: new Date(base + 168_000).toISOString(),
        agentName: 'frontend-developer',
        details: {
          actionType: 'Edit',
          file_path: 'client/src/lib/mock-data/event-bus-demo.ts',
          success: true,
        },
        durationMs: 88,
      },
      {
        id: 'demo-012',
        eventType: 'action' as const,
        timestamp: new Date(base + 228_000).toISOString(),
        agentName: 'frontend-developer',
        details: { actionType: 'Bash', command: 'npm run check', success: true },
        durationMs: 4210,
      },
    ],
    summary: {
      totalEvents: 6,
      routingDecisions: 1,
      actions: 3,
      errors: 0,
      totalDurationMs: 480_000,
    },
  };
})();

// ============================================================================
// Sample data (shown as fallback when no live traces exist)
// ============================================================================

const SAMPLE_TRACE: TraceResponse = (() => {
  const now = Date.now();
  return {
    correlationId: '550e8400-e29b-41d4-a716-446655440000',
    events: [
      {
        id: '1',
        eventType: 'routing' as const,
        timestamp: new Date(now - 4000).toISOString(),
        agentName: 'Router',
        details: { decision: 'polymorphic-agent', confidence: 0.94 },
        durationMs: 45,
      },
      {
        id: '2',
        eventType: 'manifest' as const,
        timestamp: new Date(now - 3950).toISOString(),
        agentName: 'Polymorphic Agent',
        details: { patternId: 'auth-pattern', injected: true },
        durationMs: 12,
      },
      {
        id: '3',
        eventType: 'action' as const,
        timestamp: new Date(now - 3900).toISOString(),
        agentName: 'Polymorphic Agent',
        details: { action: 'code-generation', status: 'success' },
        durationMs: 1200,
      },
      {
        id: '4',
        eventType: 'action' as const,
        timestamp: new Date(now - 2700).toISOString(),
        agentName: 'Code Reviewer',
        details: { action: 'code-review', status: 'success' },
        durationMs: 800,
      },
    ],
    summary: {
      totalEvents: 4,
      routingDecisions: 1,
      actions: 2,
      errors: 0,
      totalDurationMs: 2057,
    },
  };
})();

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string | null | undefined, maxLen: number): string {
  if (!text) return '--';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function formatConfidence(score: number): string {
  return `${(score * 100).toFixed(0)}%`;
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case 'routing':
      return <Zap className="w-4 h-4" />;
    case 'action':
      return <Code className="w-4 h-4" />;
    case 'manifest':
      return <Database className="w-4 h-4" />;
    case 'error':
      return <AlertCircle className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

function getEventColor(eventType: string) {
  switch (eventType) {
    case 'routing':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'action':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'manifest':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
}

function getEventLabel(eventType: string) {
  switch (eventType) {
    case 'routing':
      return 'Routing Decision';
    case 'action':
      return 'Agent Action';
    case 'manifest':
      return 'Manifest Injection';
    case 'error':
      return 'Error Event';
    default:
      return 'Event';
  }
}

// ============================================================================
// Sub-components
// ============================================================================

/** Loading skeleton for the recent traces table. */
function RecentTracesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-64 flex-1" />
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Empty state when the API returns no recent traces. Shows sample data preview. */
function EmptyRecentTraces({ onSelectSample }: { onSelectSample: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/40 border border-border/50">
        <Info className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium mb-1">No recent traces found</p>
          <p className="text-sm text-muted-foreground">
            Traces appear here when OmniClaude sessions generate routing decisions. Start a Claude
            Code session with the ONEX plugin enabled to generate trace data.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs text-muted-foreground border-muted-foreground/30"
          >
            Sample Data
          </Badge>
          <span className="text-xs text-muted-foreground">Preview of what a trace looks like</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Correlation ID</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Request</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="cursor-pointer hover:bg-muted/80" onClick={onSelectSample}>
              <TableCell className="font-mono text-xs">
                {truncate(SAMPLE_TRACE.correlationId, 16)}
              </TableCell>
              <TableCell>Router</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                Sample: Analyze the auth module
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {SAMPLE_TRACE.summary.totalEvents}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">just now</TableCell>
              <TableCell className="text-muted-foreground text-sm">94%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function CorrelationTrace() {
  const { isDemoMode } = useDemoMode();
  const [correlationId, setCorrelationId] = useState('');
  const [searchId, setSearchId] = useState<string | null>(null);
  const [showingSample, setShowingSample] = useState(false);

  // Pre-populate the demo correlation ID when demo mode is enabled,
  // and clear it when demo mode is disabled.
  useEffect(() => {
    if (isDemoMode) {
      setCorrelationId(DEMO_CORRELATION_ID);
    } else {
      setCorrelationId('');
      setSearchId(null);
      setShowingSample(false);
    }
  }, [isDemoMode]);

  // -------------------------------------------------------------------------
  // Recent traces query (auto-refreshes every 30s)
  // In demo mode: returns the canned list immediately without fetching.
  // -------------------------------------------------------------------------

  const {
    data: recentTraces,
    isLoading: recentLoading,
    error: recentError,
  } = useQuery<RecentTrace[]>({
    queryKey: ['/api/intelligence/traces/recent?limit=20', isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_RECENT_TRACES;
      const response = await fetch('/api/intelligence/traces/recent?limit=20');
      if (!response.ok) {
        throw new Error(`Failed to fetch recent traces: ${response.status}`);
      }
      return response.json();
    },
    refetchInterval: isDemoMode ? false : 30_000,
  });

  // -------------------------------------------------------------------------
  // Trace detail query (fetches when a trace is selected)
  // In demo mode: returns the canned trace detail for the demo correlation ID.
  // -------------------------------------------------------------------------

  const {
    data: traceData,
    isLoading: traceLoading,
    error: traceError,
  } = useQuery<TraceResponse>({
    queryKey: ['/api/intelligence/trace/', searchId ?? '', showingSample, isDemoMode],
    queryFn: async () => {
      if (showingSample) return SAMPLE_TRACE;
      if (isDemoMode) return DEMO_TRACE_DETAIL;
      const response = await fetch(`/api/intelligence/trace/${searchId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch trace: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!searchId,
  });

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSearch = () => {
    if (correlationId.trim()) {
      setShowingSample(false);
      setSearchId(correlationId.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSelectTrace = (trace: RecentTrace) => {
    setShowingSample(false);
    setCorrelationId(trace.correlationId);
    setSearchId(trace.correlationId);
  };

  const handleSelectSample = () => {
    setShowingSample(true);
    setSearchId('sample');
    setCorrelationId(SAMPLE_TRACE.correlationId);
  };

  const handleClearSelection = () => {
    setShowingSample(false);
    setSearchId(null);
    setCorrelationId('');
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const hasRecentTraces = recentTraces && recentTraces.length > 0;
  const isTraceSelected = !!searchId;

  return (
    <div className="space-y-6">
      <DemoBanner />

      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Correlation Trace</h1>
        <p className="text-muted-foreground">
          Trace complete agent execution flow using correlation IDs
        </p>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search by Correlation ID</CardTitle>
          <CardDescription>
            Enter a correlation ID to trace a specific execution, or select from recent traces below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
              value={correlationId}
              onChange={(e) => setCorrelationId(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 font-mono text-sm"
            />
            <Button onClick={handleSearch} disabled={!correlationId.trim()}>
              <Search className="w-4 h-4 mr-2" />
              Trace
            </Button>
            {isTraceSelected && (
              <Button variant="outline" onClick={handleClearSelection}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Traces Panel (shown when no trace is selected, or always as a collapsible) */}
      {!isTraceSelected && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Recent Traces
                </CardTitle>
                <CardDescription className="mt-1">
                  Latest routing decisions from OmniClaude sessions
                </CardDescription>
              </div>
              {hasRecentTraces && (
                <Badge variant="outline" className="text-xs">
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Auto-refresh 30s
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Loading */}
            {recentLoading && <RecentTracesSkeleton />}

            {/* Error fetching recent traces */}
            {recentError && !recentLoading && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium mb-1">Failed to load recent traces</p>
                  <p className="text-sm text-muted-foreground">
                    {recentError instanceof Error
                      ? recentError.message
                      : 'Could not connect to the traces API'}
                  </p>
                </div>
              </div>
            )}

            {/* Recent traces table */}
            {hasRecentTraces && !recentLoading && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correlation ID</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="hidden md:table-cell">Request</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTraces.map((trace) => (
                    <TableRow
                      key={trace.correlationId}
                      className="cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => handleSelectTrace(trace)}
                    >
                      <TableCell className="font-mono text-xs">
                        {truncate(trace.correlationId, 16)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{trace.selectedAgent}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-[300px]">
                        {truncate(trace.userRequest || '--', 60)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {trace.eventCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {trace.createdAt ? formatRelativeTime(trace.createdAt) : 'unknown'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            trace.confidenceScore >= 0.9
                              ? 'text-green-500 text-sm font-medium'
                              : trace.confidenceScore >= 0.7
                                ? 'text-yellow-500 text-sm font-medium'
                                : 'text-red-500 text-sm font-medium'
                          }
                        >
                          {formatConfidence(trace.confidenceScore)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Empty state with sample data fallback */}
            {!hasRecentTraces && !recentLoading && !recentError && (
              <EmptyRecentTraces onSelectSample={handleSelectSample} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Back to Recent Traces link (when viewing a trace detail) */}
      {isTraceSelected && (
        <Button variant="ghost" size="sm" onClick={handleClearSelection} className="gap-1.5">
          <Search className="w-3.5 h-3.5" />
          Back to Recent Traces
        </Button>
      )}

      {/* Trace Detail: Loading State */}
      {traceLoading && isTraceSelected && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
              <p className="text-muted-foreground">Loading trace data...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trace Detail: Error State */}
      {traceError && isTraceSelected && (
        <Card className="border-destructive/50">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error Loading Trace</h3>
              <p className="text-muted-foreground">
                {traceError instanceof Error ? traceError.message : 'Failed to load trace data'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trace Detail: Summary Cards */}
      {traceData && traceData.events.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Trace Results</h2>
              <p className="text-sm text-muted-foreground font-mono">
                {traceData.correlationId}
                {showingSample && (
                  <Badge
                    variant="outline"
                    className="ml-2 text-xs text-muted-foreground border-muted-foreground/30"
                  >
                    Sample Data
                  </Badge>
                )}
              </p>
            </div>
            <ExportButton
              data={traceData as unknown as Record<string, unknown>}
              filename={`correlation-trace-${searchId}-${new Date().toISOString().split('T')[0]}`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{traceData.summary.totalEvents}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Routing Decisions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{traceData.summary.routingDecisions}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{traceData.summary.actions}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{traceData.summary.errors}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{traceData.summary.totalDurationMs}ms</div>
              </CardContent>
            </Card>
          </div>

          {/* Timeline Section */}
          <Card>
            <CardHeader>
              <CardTitle>Execution Timeline</CardTitle>
              <CardDescription>Events sorted by timestamp (newest first)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {traceData.events.map((event, index) => (
                  <Collapsible key={event.id}>
                    <div className="flex items-start gap-4">
                      {/* Timeline Indicator */}
                      <div className="flex flex-col items-center">
                        <div
                          className={`rounded-full p-2 border ${getEventColor(event.eventType)}`}
                        >
                          {getEventIcon(event.eventType)}
                        </div>
                        {index < traceData.events.length - 1 && (
                          <div className="w-0.5 h-12 bg-border mt-2" />
                        )}
                      </div>

                      {/* Event Content */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={getEventColor(event.eventType)}>
                              {getEventLabel(event.eventType)}
                            </Badge>
                            {event.agentName && (
                              <span className="text-sm text-muted-foreground">
                                {event.agentName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {event.durationMs !== undefined && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {event.durationMs}ms
                              </span>
                            )}
                            <span>{new Date(event.timestamp).toLocaleString()}</span>
                          </div>
                        </div>

                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8">
                            View Details
                          </Button>
                        </CollapsibleTrigger>

                        <CollapsibleContent className="mt-2">
                          <Card className="bg-muted/50">
                            <CardContent className="p-4">
                              <pre className="text-xs overflow-auto">
                                {JSON.stringify(event.details, null, 2)}
                              </pre>
                            </CardContent>
                          </Card>
                        </CollapsibleContent>
                      </div>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* No Events in Selected Trace */}
      {traceData && traceData.events.length === 0 && isTraceSelected && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Search className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Events Found</h3>
              <p className="text-muted-foreground">
                No trace data found for correlation ID: {searchId}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
