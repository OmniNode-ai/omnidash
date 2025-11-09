import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Clock, CheckCircle, AlertCircle, Code, Database, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/ExportButton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { USE_MOCK_DATA } from "@/lib/mock-data/config";

// TypeScript interfaces for trace events
interface TraceEvent {
  id: string;
  eventType: 'routing' | 'action' | 'manifest' | 'error';
  timestamp: string;
  agentName?: string;
  details: any;
  durationMs?: number;
}

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

export default function CorrelationTrace() {
  const [correlationId, setCorrelationId] = useState("");
  const [searchId, setSearchId] = useState<string | null>(null);

  // Fetch trace data when searchId changes, or show sample trace when no search ID
  const { data: traceData, isLoading, error } = useQuery<TraceResponse>({
    queryKey: [`/api/intelligence/trace/${searchId || 'sample'}`],
    queryFn: async () => {
      // If USE_MOCK_DATA is enabled or no search ID, return mock data
      if (USE_MOCK_DATA || !searchId || searchId.length === 0) {
        // Return preloaded 4-hop sample trace
        const now = Date.now();
        return {
          correlationId: '550e8400-e29b-41d4-a716-446655440000',
          events: [
            {
              id: '1',
              eventType: 'routing',
              timestamp: new Date(now - 4000).toISOString(),
              agentName: 'Router',
              details: { decision: 'polymorphic-agent', confidence: 0.94 },
              durationMs: 45
            },
            {
              id: '2',
              eventType: 'manifest',
              timestamp: new Date(now - 3950).toISOString(),
              agentName: 'Polymorphic Agent',
              details: { patternId: 'auth-pattern', injected: true },
              durationMs: 12
            },
            {
              id: '3',
              eventType: 'action',
              timestamp: new Date(now - 3900).toISOString(),
              agentName: 'Polymorphic Agent',
              details: { action: 'code-generation', status: 'success' },
              durationMs: 1200
            },
            {
              id: '4',
              eventType: 'action',
              timestamp: new Date(now - 2700).toISOString(),
              agentName: 'Code Reviewer',
              details: { action: 'code-review', status: 'success' },
              durationMs: 800
            }
          ],
          summary: {
            totalEvents: 4,
            routingDecisions: 1,
            actions: 2,
            errors: 0,
            totalDurationMs: 2057
          }
        };
      }
      // Try to fetch real trace
      const response = await fetch(`/api/intelligence/trace/${searchId}`);
      if (response.ok) {
        return response.json();
      }
      throw new Error('Failed to fetch trace');
    },
  });

  const handleSearch = () => {
    if (correlationId.trim()) {
      setSearchId(correlationId.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getEventIcon = (eventType: string) => {
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
  };

  const getEventColor = (eventType: string) => {
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
  };

  const getEventLabel = (eventType: string) => {
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
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Correlation Trace</h1>
        <p className="text-muted-foreground">
          Trace complete agent execution flow using correlation IDs
        </p>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle>Search by Correlation ID</CardTitle>
          <CardDescription>
            Enter a correlation ID (UUID format) to trace the entire execution flow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
              value={correlationId}
              onChange={(e) => setCorrelationId(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={!correlationId.trim()}>
              <Search className="w-4 h-4 mr-2" />
              Trace
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
              <p className="text-muted-foreground">Loading trace data...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error Loading Trace</h3>
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : 'Failed to load trace data'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Section */}
      {traceData && traceData.events.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Trace Results</h2>
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
              <CardDescription>
                Events sorted by timestamp (newest first)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {traceData.events.map((event, index) => (
                  <Collapsible key={event.id}>
                    <div className="flex items-start gap-4">
                      {/* Timeline Indicator */}
                      <div className="flex flex-col items-center">
                        <div className={`rounded-full p-2 border ${getEventColor(event.eventType)}`}>
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

      {/* No Results State */}
      {traceData && traceData.events.length === 0 && (
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

      {/* Empty State (before search) */}
      {!searchId && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Search className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Start Tracing</h3>
              <p className="text-muted-foreground max-w-md">
                Enter a correlation ID above to trace the complete execution flow across all
                systems and view detailed event timelines
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
