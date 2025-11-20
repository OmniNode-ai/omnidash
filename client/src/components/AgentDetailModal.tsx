import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DetailModal } from './DetailModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Clock,
  CheckCircle,
  XCircle,
  Settings,
  Play,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalRuns: number;
  successRate: number;
  avgExecutionTime: number;
  avgQualityScore: number;
  efficiency: number;
  popularity: number;
  lastUsed: string;
}

interface AgentExecution {
  id: string;
  query: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  result?: {
    success: boolean;
    output?: string;
    qualityScore?: number;
    metrics?: {
      tokensUsed?: number;
      computeUnits?: number;
      cost?: number;
    };
    error?: string;
  };
  routingDecision?: {
    confidence: number;
    strategy: string;
    alternatives?: string[];
  };
}

interface AgentDetailModalProps {
  agent: AgentPerformance | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (type: string, id: string) => void;
}

function ExpandableContent({
  summary,
  fullContent,
  maxLength = 200,
}: {
  summary?: string;
  fullContent: string;
  maxLength?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = fullContent.length > maxLength;
  const displayText =
    isExpanded || !shouldTruncate ? fullContent : fullContent.slice(0, maxLength) + '...';

  return (
    <div className="space-y-2">
      {summary && <div className="text-sm text-muted-foreground">{summary}</div>}
      <div className="text-sm">
        <pre className="whitespace-pre-wrap font-mono bg-muted p-3 rounded-lg text-xs overflow-x-auto">
          {displayText}
        </pre>
      </div>
      {shouldTruncate && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-2" />
              Show Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-2" />
              Show More
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export function AgentDetailModal({ agent, isOpen, onClose }: AgentDetailModalProps) {
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch execution history
  const { data: executions, isLoading: executionsLoading } = useQuery<AgentExecution[]>({
    queryKey: ['agent-executions', agent?.agentId],
    queryFn: async () => {
      if (!agent?.agentId) return [];
      // For now, return mock data
      // In production, fetch from /api/agents/${agentId}/executions
      return [
        {
          id: 'exec-1',
          query:
            'Analyze the database connection issues in the authentication service and provide recommendations for fixing timeout errors.',
          status: 'completed',
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          completedAt: new Date(Date.now() - 3580000).toISOString(),
          duration: 20,
          result: {
            success: true,
            output:
              'The database connection timeout issues are caused by insufficient connection pool size. The current pool size is 5, but peak load requires at least 20 connections. Additionally, connection retry logic is missing, causing immediate failures. Recommendations:\n\n1. Increase connection pool size to 25 with a maximum of 50\n2. Implement exponential backoff retry logic\n3. Add connection health checks\n4. Monitor connection usage patterns',
            qualityScore: 0.92,
            metrics: {
              tokensUsed: 1250,
              computeUnits: 45,
              cost: 0.035,
            },
          },
          routingDecision: {
            confidence: 0.89,
            strategy: 'direct-routing',
            alternatives: ['agent-debug-intelligence'],
          },
        },
        {
          id: 'exec-2',
          query: 'Create a React component for user profile display with edit functionality',
          status: 'completed',
          startedAt: new Date(Date.now() - 7200000).toISOString(),
          completedAt: new Date(Date.now() - 7180000).toISOString(),
          duration: 25,
          result: {
            success: true,
            output: 'Created UserProfile.tsx component with edit functionality...',
            qualityScore: 0.88,
            metrics: {
              tokensUsed: 2100,
              computeUnits: 67,
              cost: 0.058,
            },
          },
          routingDecision: {
            confidence: 0.91,
            strategy: 'direct-routing',
          },
        },
        {
          id: 'exec-3',
          query: 'Fix memory leak in event processing pipeline',
          status: 'failed',
          startedAt: new Date(Date.now() - 10800000).toISOString(),
          completedAt: new Date(Date.now() - 10790000).toISOString(),
          duration: 10,
          result: {
            success: false,
            error: 'Timeout: Analysis exceeded maximum execution time of 10 seconds',
            qualityScore: 0.0,
            metrics: {
              tokensUsed: 850,
              computeUnits: 12,
              cost: 0.015,
            },
          },
          routingDecision: {
            confidence: 0.65,
            strategy: 'fallback-routing',
            alternatives: ['agent-performance', 'agent-debug-intelligence'],
          },
        },
      ];
    },
    enabled: !!agent?.agentId && isOpen,
  });

  if (!agent) return null;

  return (
    <DetailModal isOpen={isOpen} onClose={onClose} title={agent.agentName} subtitle={agent.agentId}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Performance Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {Math.max(0, Math.min(100, agent.successRate)).toFixed(1)}%
                </div>
                <Progress value={Math.max(0, Math.min(100, agent.successRate))} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{agent.totalRuns.toLocaleString()}</div>
                <p className="text-sm text-muted-foreground mt-2">
                  Last used: {new Date(agent.lastUsed).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Avg Execution Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{agent.avgExecutionTime.toFixed(1)}s</div>
                <p className="text-sm text-muted-foreground mt-2">Average per execution</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{agent.avgQualityScore.toFixed(1)}/10</div>
                <Progress
                  value={Math.max(0, Math.min(100, agent.avgQualityScore * 10))}
                  className="mt-2"
                />
              </CardContent>
            </Card>
          </div>

          {/* Efficiency & Popularity */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Efficiency</span>
                  <span className="font-medium">
                    {Math.max(0, Math.min(100, agent.efficiency)).toFixed(1)}%
                  </span>
                </div>
                <Progress value={Math.max(0, Math.min(100, agent.efficiency))} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Popularity</span>
                  <span className="font-medium">
                    {Math.max(0, Math.min(100, agent.popularity)).toFixed(1)}%
                  </span>
                </div>
                <Progress value={Math.max(0, Math.min(100, agent.popularity))} />
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Button>
              <Play className="w-4 h-4 mr-2" />
              Run Agent
            </Button>
            <Button variant="outline">
              <Settings className="w-4 h-4 mr-2" />
              Configure
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="executions" className="space-y-4 mt-4">
          {executionsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {executions?.map((exec) => (
                <Card key={exec.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          {exec.status === 'completed' ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : exec.status === 'failed' ? (
                            <XCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <Clock className="w-4 h-4 text-yellow-500" />
                          )}
                          Execution {exec.id.slice(-6)}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {new Date(exec.startedAt).toLocaleString()}
                          {exec.duration && ` • ${exec.duration}s`}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          exec.status === 'completed'
                            ? 'default'
                            : exec.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {exec.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-sm font-medium mb-2">Query</div>
                      <ExpandableContent fullContent={exec.query} maxLength={150} />
                    </div>

                    {exec.result && (
                      <div>
                        <div className="text-sm font-medium mb-2">Result</div>
                        {exec.result.success ? (
                          <ExpandableContent
                            summary={`Quality Score: ${((exec.result.qualityScore || 0) * 100).toFixed(1)}%`}
                            fullContent={exec.result.output || 'No output'}
                            maxLength={200}
                          />
                        ) : (
                          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">
                            {exec.result.error}
                          </div>
                        )}
                      </div>
                    )}

                    {exec.result?.metrics && (
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Tokens</div>
                          <div className="font-medium">
                            {exec.result.metrics.tokensUsed?.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Compute</div>
                          <div className="font-medium">{exec.result.metrics.computeUnits}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Cost</div>
                          <div className="font-medium">${exec.result.metrics.cost?.toFixed(4)}</div>
                        </div>
                      </div>
                    )}

                    {exec.routingDecision && (
                      <div>
                        <div className="text-sm font-medium mb-2">Routing Decision</div>
                        <div className="text-sm space-y-1">
                          <div>Strategy: {exec.routingDecision.strategy}</div>
                          <div>
                            Confidence: {(exec.routingDecision.confidence * 100).toFixed(1)}%
                          </div>
                          {exec.routingDecision.alternatives &&
                            exec.routingDecision.alternatives.length > 0 && (
                              <div>
                                Alternatives: {exec.routingDecision.alternatives.join(', ')}
                              </div>
                            )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {executions?.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No execution history available
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="configuration" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Configuration</CardTitle>
              <CardDescription>Current settings and capabilities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-2">Agent ID</div>
                <code className="text-sm bg-muted px-2 py-1 rounded">{agent.agentId}</code>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Status</div>
                <Badge variant="default">Active</Badge>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Capabilities</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Code Analysis</Badge>
                  <Badge variant="outline">Debug Intelligence</Badge>
                  <Badge variant="outline">Performance Optimization</Badge>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <Settings className="w-4 h-4 mr-2" />
                Edit Configuration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Agent Logs</CardTitle>
              <CardDescription>Recent execution logs and debug information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs">
                {[
                  { time: '14:32:15', level: 'INFO', message: 'Agent initialized successfully' },
                  { time: '14:32:16', level: 'INFO', message: 'Starting execution exec-1' },
                  {
                    time: '14:32:18',
                    level: 'DEBUG',
                    message: 'Routing decision: direct-routing (confidence: 0.89)',
                  },
                  { time: '14:32:25', level: 'INFO', message: 'Execution completed in 20s' },
                  { time: '14:32:26', level: 'INFO', message: 'Quality score: 0.92' },
                ].map((log, idx) => (
                  <div key={idx} className="flex gap-4">
                    <span className="text-muted-foreground w-20">{log.time}</span>
                    <Badge
                      variant={
                        log.level === 'ERROR'
                          ? 'destructive'
                          : log.level === 'WARN'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="w-16 text-xs"
                    >
                      {log.level}
                    </Badge>
                    <span className="flex-1">{log.message}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DetailModal>
  );
}
