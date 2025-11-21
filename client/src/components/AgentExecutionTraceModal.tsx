import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DetailModal } from './DetailModal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Activity,
  Code,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExecutionTrace {
  correlationId: string;
  routingDecision: {
    userRequest: string;
    selectedAgent: string;
    confidenceScore: number;
    routingStrategy: string;
    routingTimeMs: number;
    timestamp: string;
    actualSuccess: boolean | null;
    alternatives: any[];
    reasoning: string | null;
    triggerConfidence: number | null;
    contextConfidence: number | null;
    capabilityConfidence: number | null;
    historicalConfidence: number | null;
  };
  actions: Array<{
    id: string;
    actionType: string;
    actionName: string;
    actionDetails: any;
    durationMs: number | null;
    timestamp: string;
    status: string;
  }>;
  summary: {
    totalActions: number;
    totalDuration: number;
    status: string;
    startTime: string;
    endTime: string;
  };
}

interface AgentExecutionTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  correlationId: string;
  agentName: string;
}

function ExpandableJSON({ data, label }: { data: any; label: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-between"
      >
        <span className="text-sm font-medium">{label}</span>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>
      {isExpanded && (
        <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

export function AgentExecutionTraceModal({
  isOpen,
  onClose,
  correlationId,
  agentName,
}: AgentExecutionTraceModalProps) {
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch execution trace
  const {
    data: trace,
    isLoading,
    error,
  } = useQuery<ExecutionTrace>({
    queryKey: ['execution-trace', correlationId],
    queryFn: async () => {
      const response = await fetch(`/api/intelligence/execution/${correlationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch execution trace');
      }
      return response.json();
    },
    enabled: isOpen && !!correlationId,
  });

  if (!isOpen) return null;

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Agent Execution Trace"
      subtitle={`${agentName} • ${correlationId.length > 8 ? `${correlationId.slice(0, 8)}...` : correlationId}`}
    >
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">Failed to load execution trace</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      ) : !trace ? (
        <div className="text-center py-8 text-muted-foreground">No execution data found</div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="routing">Routing Decision</TabsTrigger>
            <TabsTrigger value="actions">Actions ({trace.actions.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    {trace.summary.status === 'success' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    Execution Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge
                    variant={trace.summary.status === 'success' ? 'default' : 'destructive'}
                    className="text-lg px-4 py-1"
                  >
                    {trace.summary.status.toUpperCase()}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Total Duration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatDuration(trace.summary.totalDuration)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Selected Agent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-medium">{trace.routingDecision.selectedAgent}</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Confidence: {(trace.routingDecision.confidenceScore * 100).toFixed(1)}%
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Total Actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{trace.summary.totalActions}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Execution Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started:</span>
                  <span className="font-medium">{formatTimestamp(trace.summary.startTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ended:</span>
                  <span className="font-medium">{formatTimestamp(trace.summary.endTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Routing Strategy:</span>
                  <Badge variant="outline">{trace.routingDecision.routingStrategy}</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Routing Decision Tab */}
          <TabsContent value="routing" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">User Request</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">
                  {trace.routingDecision.userRequest}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Routing Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Selected Agent</div>
                    <div className="font-medium">{trace.routingDecision.selectedAgent}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Confidence Score</div>
                    <div className="font-medium">
                      {(trace.routingDecision.confidenceScore * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Routing Time</div>
                    <div className="font-medium">
                      {formatDuration(trace.routingDecision.routingTimeMs)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Strategy</div>
                    <Badge variant="outline">{trace.routingDecision.routingStrategy}</Badge>
                  </div>
                </div>

                {/* Confidence Breakdown */}
                {(trace.routingDecision.triggerConfidence !== null ||
                  trace.routingDecision.contextConfidence !== null ||
                  trace.routingDecision.capabilityConfidence !== null ||
                  trace.routingDecision.historicalConfidence !== null) && (
                  <div className="pt-3 border-t">
                    <div className="text-sm font-medium mb-2">Confidence Breakdown</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {trace.routingDecision.triggerConfidence !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trigger:</span>
                          <span>{(trace.routingDecision.triggerConfidence * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      {trace.routingDecision.contextConfidence !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Context:</span>
                          <span>{(trace.routingDecision.contextConfidence * 100).toFixed(1)}%</span>
                        </div>
                      )}
                      {trace.routingDecision.capabilityConfidence !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Capability:</span>
                          <span>
                            {(trace.routingDecision.capabilityConfidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {trace.routingDecision.historicalConfidence !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Historical:</span>
                          <span>
                            {(trace.routingDecision.historicalConfidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reasoning */}
                {trace.routingDecision.reasoning && (
                  <div className="pt-3 border-t">
                    <div className="text-sm font-medium mb-2">Reasoning</div>
                    <p className="text-sm text-muted-foreground">
                      {trace.routingDecision.reasoning}
                    </p>
                  </div>
                )}

                {/* Alternatives */}
                {trace.routingDecision.alternatives &&
                  trace.routingDecision.alternatives.length > 0 && (
                    <div className="pt-3 border-t">
                      <div className="text-sm font-medium mb-2">Alternative Agents Considered</div>
                      <ExpandableJSON
                        data={trace.routingDecision.alternatives}
                        label={`${trace.routingDecision.alternatives.length} alternatives`}
                      />
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="actions" className="space-y-4 mt-4">
            {trace.actions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No actions recorded for this execution
              </div>
            ) : (
              <div className="space-y-3">
                {trace.actions.map((action, _index) => (
                  <Card key={action.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Code className="w-4 h-4" />
                            {action.actionName}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {formatTimestamp(action.timestamp)}
                            {action.durationMs && ` • ${formatDuration(action.durationMs)}`}
                          </CardDescription>
                        </div>
                        <Badge variant="outline">{action.actionType}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ExpandableJSON data={action.actionDetails} label="View Action Details" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Execution Timeline</CardTitle>
                <CardDescription>
                  Chronological view of all events in this execution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Routing Decision Event */}
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <div className="w-px h-full bg-border" />
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">Routing</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(trace.routingDecision.timestamp)}
                        </span>
                      </div>
                      <div className="text-sm font-medium">
                        Agent Selected: {trace.routingDecision.selectedAgent}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDuration(trace.routingDecision.routingTimeMs)} •{' '}
                        {(trace.routingDecision.confidenceScore * 100).toFixed(1)}% confidence
                      </div>
                    </div>
                  </div>

                  {/* Action Events */}
                  {trace.actions.map((action, index) => (
                    <div key={action.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        {index < trace.actions.length - 1 && (
                          <div className="w-px h-full bg-border" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary">{action.actionType}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(action.timestamp)}
                          </span>
                        </div>
                        <div className="text-sm font-medium">{action.actionName}</div>
                        {action.durationMs && (
                          <div className="text-xs text-muted-foreground">
                            {formatDuration(action.durationMs)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* End Event */}
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          trace.summary.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={trace.summary.status === 'success' ? 'default' : 'destructive'}
                        >
                          {trace.summary.status.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(trace.summary.endTime)}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Total execution time: {formatDuration(trace.summary.totalDuration)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </DetailModal>
  );
}
