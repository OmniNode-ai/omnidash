import React from "react";
import { DetailModal } from "./DetailModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Bot, 
  Settings, 
  Play, 
  Download, 
  RefreshCw, 
  Code, 
  Zap, 
  Clock, 
  CheckCircle, 
  XCircle,
  Activity,
  TrendingUp,
  Target
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  title: string;
  description: string;
  capabilities?: Array<{
    name: string;
    level: string;
    description: string;
  }>;
  activationTriggers?: string[];
  performance?: {
    successRate?: number;
    avgResponseTime?: number;
    avgExecutionTime?: number;
    totalExecutions?: number;
    totalRuns?: number;
    lastUsed?: string;
  };
  configuration?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
  };
  logs?: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
}

interface AgentRegistryDetailModalProps {
  agent: Agent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AgentRegistryDetailModal({ agent, isOpen, onClose }: AgentRegistryDetailModalProps) {
  if (!agent) return null;

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title={agent.title}
      subtitle={agent.name}
    >
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div>
            <h3 className="font-semibold mb-2">Description</h3>
            <p className="text-sm text-muted-foreground">{agent.description}</p>
          </div>
          
          {agent.activationTriggers && agent.activationTriggers.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Activation Triggers</h3>
              <div className="flex flex-wrap gap-1">
                {agent.activationTriggers.map((trigger, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {trigger}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Success Rate</div>
              <div className="text-2xl font-bold font-mono">
                {agent.performance?.successRate != null
                  ? `${Math.max(0, Math.min(100, agent.performance.successRate)).toFixed(1)}%`
                  : 'N/A'}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Avg Execution Time</div>
              <div className="text-2xl font-bold font-mono">
                {agent.performance?.avgExecutionTime != null || agent.performance?.avgResponseTime != null
                  ? `${(agent.performance.avgExecutionTime || agent.performance.avgResponseTime || 0).toFixed(0)}ms`
                  : 'N/A'}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Total Runs</div>
              <div className="text-lg font-semibold">
                {(agent.performance?.totalRuns || agent.performance?.totalExecutions || 0).toLocaleString()}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-1">Last Used</div>
              <div className="text-sm">
                {agent.performance?.lastUsed
                  ? new Date(agent.performance.lastUsed).toLocaleString()
                  : 'N/A'}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="capabilities" className="space-y-4 mt-4">
          <div className="space-y-4">
            {agent.capabilities && agent.capabilities.length > 0 ? (
              agent.capabilities.map((capability, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-sm">{capability.name}</div>
                    <Badge variant="outline" className="text-xs">
                      {capability.level}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {capability.description}
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No capabilities data available for this agent
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-2">Success Rate</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {agent.performance?.successRate != null
                      ? `${Math.max(0, Math.min(100, agent.performance.successRate)).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                  <span className="text-muted-foreground">Target: 95%</span>
                </div>
                <Progress
                  value={agent.performance?.successRate != null ? Math.max(0, Math.min(100, agent.performance.successRate)) : 0}
                  className="h-2"
                />
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs text-muted-foreground mb-2">Execution Time</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {agent.performance?.avgExecutionTime != null || agent.performance?.avgResponseTime != null
                      ? `${(agent.performance.avgExecutionTime || agent.performance.avgResponseTime || 0).toFixed(0)}ms`
                      : 'N/A'}
                  </span>
                  <span className="text-muted-foreground">Target: &lt;2000ms</span>
                </div>
                <Progress
                  value={
                    agent.performance?.avgExecutionTime != null || agent.performance?.avgResponseTime != null
                      ? Math.max(0, Math.min(100, (2000 - (agent.performance.avgExecutionTime || agent.performance.avgResponseTime || 0)) / 20))
                      : 0
                  }
                  className="h-2"
                />
              </div>
            </Card>
          </div>

          {agent.configuration && (
            <div className="space-y-4">
              <h3 className="font-semibold">Configuration</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Model</div>
                  <div className="text-sm font-mono">{agent.configuration.model || 'N/A'}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Temperature</div>
                  <div className="text-sm font-mono">{agent.configuration.temperature ?? 'N/A'}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Max Tokens</div>
                  <div className="text-sm font-mono">{agent.configuration.maxTokens || 'N/A'}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Timeout</div>
                  <div className="text-sm font-mono">{agent.configuration.timeout ? `${agent.configuration.timeout}s` : 'N/A'}</div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <div className="space-y-2">
            {agent.logs && agent.logs.length > 0 ? (
              agent.logs.map((log, index) => (
                <div key={index} className="p-3 rounded-lg bg-muted">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <Badge
                      variant={log.level === "ERROR" ? "destructive" : log.level === "WARN" ? "secondary" : "default"}
                      className="text-xs"
                    >
                      {log.level}
                    </Badge>
                  </div>
                  <div className="text-sm">{log.message}</div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No logs available for this agent
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      <div className="flex gap-2 pt-4 border-t">
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          Configure
        </Button>
        <Button variant="outline" size="sm">
          <Play className="w-4 h-4 mr-2" />
          Test Run
        </Button>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
        <Button variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
    </DetailModal>
  );
}
