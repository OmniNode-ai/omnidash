/**
 * Node Registry Dashboard Page (OMN-2097)
 *
 * Real-time visualization of 2-way node registration events from omnibase_infra.
 * Displays node introspection, heartbeat, and registration state transitions.
 *
 * Data flow: Kafka → EventConsumer → ProjectionService → REST snapshot → Dashboard
 *            ProjectionService → WebSocket invalidation → re-fetch snapshot
 *
 * Uses the server-side NodeRegistryProjection for materialized state,
 * with useProjectionStream for Snapshot + Invalidation delivery.
 * Falls back to mock data when the projection has no nodes.
 */

import { useMemo } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import {
  nodeRegistryDashboardConfig,
  generateNodeRegistryMockData,
  type RegisteredNode,
  type RegistrationEvent,
} from '@/lib/configs/node-registry-dashboard';
import { useProjectionStream } from '@/hooks/useProjectionStream';
import {
  transformNodeRegistryPayload,
  type NodeRegistryPayload,
} from '@/lib/data-sources/node-registry-projection-source';
import type { DashboardData } from '@/lib/dashboard-schema';
import { SUFFIX_NODE_INTROSPECTION, resolveTopicName } from '@shared/topics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wifi, WifiOff, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function NodeRegistry() {
  // Server-side projection stream: fetches snapshot, re-fetches on invalidation
  const { data, cursor, isLoading, error, isConnected, refresh } =
    useProjectionStream<NodeRegistryPayload>('node-registry');

  // Determine if we have real data from the projection
  const hasProjectionData = data !== null && data.nodes.length > 0;

  // Transform projection payload → DashboardData, or fall back to mock
  const dashboardData: DashboardData = useMemo(() => {
    if (hasProjectionData) {
      return transformNodeRegistryPayload(data);
    }

    // Fallback to mock data when projection is empty
    const mockData = generateNodeRegistryMockData();
    return {
      totalNodes: (mockData.registeredNodes as RegisteredNode[]).length,
      activeNodes: (mockData.registeredNodes as RegisteredNode[]).filter(
        (n) => n.state === 'active'
      ).length,
      pendingNodes: (mockData.registeredNodes as RegisteredNode[]).filter((n) =>
        ['pending_registration', 'awaiting_ack', 'ack_received', 'accepted'].includes(n.state)
      ).length,
      failedNodes: (mockData.registeredNodes as RegisteredNode[]).filter((n) =>
        ['rejected', 'liveness_expired', 'ack_timed_out'].includes(n.state)
      ).length,
      nodeStatuses: (mockData.registeredNodes as RegisteredNode[]).map((n) => ({
        node_id: n.node_id,
        status:
          n.state === 'active'
            ? ('healthy' as const)
            : ['rejected', 'liveness_expired', 'ack_timed_out'].includes(n.state)
              ? ('error' as const)
              : ('warning' as const),
      })),
      nodeTypeDistribution: Object.entries(
        (mockData.registeredNodes as RegisteredNode[]).reduce(
          (acc, n) => {
            acc[n.node_type] = (acc[n.node_type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      ).map(([name, value]) => ({ name, value })),
      registeredNodes: mockData.registeredNodes,
      registrationEvents: mockData.registrationEvents as RegistrationEvent[],
    };
  }, [data, hasProjectionData]);

  const connectionStatus = isLoading ? 'connecting' : isConnected ? 'connected' : 'disconnected';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{nodeRegistryDashboardConfig.name}</h1>
          <p className="text-muted-foreground">{nodeRegistryDashboardConfig.description}</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Cursor position */}
          {hasProjectionData && (
            <div className="text-sm text-muted-foreground">
              Cursor: <span className="font-mono">{cursor}</span>
            </div>
          )}

          {/* Data source badge */}
          <Badge variant={hasProjectionData ? 'default' : 'secondary'}>
            {hasProjectionData ? 'Live Data' : 'Mock Data'}
          </Badge>

          {/* Connection status */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                    isConnected
                      ? 'bg-green-500'
                      : isLoading
                        ? 'bg-yellow-500 animate-pulse'
                        : 'bg-red-500'
                  }`}
                />
                {isConnected ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground capitalize">{connectionStatus}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Projection: {connectionStatus}</p>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </TooltipContent>
          </Tooltip>

          {/* Refresh button */}
          <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Registration Protocol Info (at top for context) */}
      <div className="p-4 border rounded-lg bg-muted/50">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold mb-2">Node Registration Protocol</h2>
            <p className="text-sm text-muted-foreground mb-4">
              2-way registration flow: Node initiates introspection → Registry accepts/rejects →
              Node acknowledges → Heartbeat monitoring begins.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Node Types:</span>
                <div className="text-muted-foreground mt-1">
                  EFFECT, COMPUTE, REDUCER, ORCHESTRATOR
                </div>
              </div>
              <div>
                <span className="font-medium">Registration States:</span>
                <div className="text-muted-foreground mt-1">
                  pending → accepted → awaiting_ack → active
                </div>
              </div>
              <div>
                <span className="font-medium">Failure States:</span>
                <div className="text-muted-foreground mt-1">
                  rejected, ack_timed_out, liveness_expired
                </div>
              </div>
              <div>
                <span className="font-medium">Kafka Topics:</span>
                <div className="text-muted-foreground mt-1">
                  {resolveTopicName(SUFFIX_NODE_INTROSPECTION)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard grid */}
      <DashboardRenderer
        config={nodeRegistryDashboardConfig}
        data={dashboardData}
        isLoading={isLoading}
      />
    </div>
  );
}
