/**
 * Dashboard Demo Page
 *
 * Event-driven dashboard using WebSocket connection to Kafka event stream.
 * No REST endpoints - all data flows through real-time events.
 */

import { useState, useCallback } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import { agentOperationsDashboardConfig } from '@/lib/configs/agent-operations-demo';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { DashboardData } from '@/lib/dashboard-schema';

interface AgentMetric {
  agent: string;
  totalRequests: number;
  avgRoutingTime: number;
  avgConfidence: number;
}

interface InitialState {
  metrics: AgentMetric[];
  recentActions: unknown[];
  routingDecisions: unknown[];
  health: {
    status: string;
    eventsProcessed: number;
  };
}

export default function DashboardDemo() {
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    activeAgents: 0,
    totalRequests: 0,
    avgConfidence: 0,
    avgLatencyMs: 0,
  });

  const [eventCount, setEventCount] = useState(0);

  // Derive dashboard data from event stream
  const handleMessage = useCallback((message: { type: string; data?: unknown }) => {
    switch (message.type) {
      case 'INITIAL_STATE': {
        const state = message.data as InitialState;
        const metrics = state.metrics || [];
        updateDashboardFromMetrics(metrics);
        break;
      }

      case 'AGENT_METRIC_UPDATE': {
        const metrics = message.data as AgentMetric[];
        updateDashboardFromMetrics(metrics);
        setEventCount((c) => c + 1);
        break;
      }

      case 'ROUTING_DECISION':
      case 'AGENT_ACTION': {
        setEventCount((c) => c + 1);
        break;
      }
    }
  }, []);

  const updateDashboardFromMetrics = (metrics: AgentMetric[]) => {
    if (!Array.isArray(metrics)) return;

    const activeAgents = metrics.length;
    const totalRequests = metrics.reduce((sum, m) => sum + (m.totalRequests || 0), 0);
    const avgConfidence =
      metrics.length > 0
        ? (metrics.reduce((sum, m) => sum + (m.avgConfidence || 0), 0) / metrics.length) * 100
        : 0;
    const avgLatencyMs =
      metrics.length > 0
        ? metrics.reduce((sum, m) => sum + (m.avgRoutingTime || 0), 0) / metrics.length
        : 0;

    setDashboardData({
      activeAgents,
      totalRequests,
      avgConfidence,
      avgLatencyMs,
    });
  };

  const { isConnected, connectionStatus } = useWebSocket({
    onMessage: handleMessage,
    debug: false,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{agentOperationsDashboardConfig.name}</h1>
          <p className="text-muted-foreground">Event-driven metrics from Kafka → WebSocket</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">Events: {eventCount}</div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? 'bg-green-500'
                  : connectionStatus === 'connecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-muted-foreground capitalize">{connectionStatus}</span>
          </div>
        </div>
      </div>

      <DashboardRenderer
        config={agentOperationsDashboardConfig}
        data={dashboardData}
        isLoading={connectionStatus === 'connecting'}
      />

      <div className="mt-8 p-4 border rounded-lg bg-muted/50">
        <h2 className="text-lg font-semibold mb-2">Event Stream</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Data flows: Kafka → EventConsumer → WebSocket → Dashboard
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">WebSocket:</span>{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/ws</code>
          </div>
          <div>
            <span className="font-medium">Events:</span>{' '}
            <span className="text-muted-foreground">
              INITIAL_STATE, AGENT_METRIC_UPDATE, ROUTING_DECISION
            </span>
          </div>
          <div>
            <span className="font-medium">Source:</span>{' '}
            <span className="text-muted-foreground">Kafka topics via EventConsumer</span>
          </div>
          <div>
            <span className="font-medium">Update:</span>{' '}
            <span className="text-muted-foreground">Real-time push</span>
          </div>
        </div>
      </div>
    </div>
  );
}
