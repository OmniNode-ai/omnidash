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

import { useState, useMemo, useCallback } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import type { OnWidgetRowClick } from '@/lib/widgets/DashboardRenderer';
import {
  nodeRegistryDashboardConfig,
  generateNodeRegistryMockData,
  type RegisteredNode,
  type RegistrationEvent as _RegistrationEvent,
} from '@/lib/configs/node-registry-dashboard';
import { useDemoProjectionStream } from '@/hooks/useDemoProjectionStream';
import { useDemoMode } from '@/contexts/DemoModeContext';
import { DemoBanner } from '@/components/DemoBanner';
import {
  transformNodeRegistryPayload,
  type NodeRegistryPayload,
} from '@/lib/data-sources/node-registry-projection-source';
import type { DashboardData } from '@/lib/dashboard-schema';
import type { NodeState } from '@shared/projection-types';
import { SUFFIX_NODE_INTROSPECTION } from '@shared/topics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NodeDetailPanel } from '@/components/registry/NodeDetailPanel';
import { RegistrationStateBadge } from '@/components/registry/RegistrationStateBadge';
import { RefreshCw, Wifi, WifiOff, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { WidgetPropsMap } from '@/lib/widgets';
import { formatRelativeTime } from '@/lib/date-utils';

// ============================================================================
// Demo payload factory
// ============================================================================

/**
 * Builds a NodeRegistryPayload from the existing mock data generator.
 * Used by useDemoProjectionStream when demo mode is active.
 */
function getDemoNodeRegistryPayload(): NodeRegistryPayload {
  const mockData = generateNodeRegistryMockData();
  const registered = mockData.registeredNodes as RegisteredNode[];

  const byState: Record<string, number> = {};
  for (const n of registered) {
    byState[n.state] = (byState[n.state] ?? 0) + 1;
  }

  const nodes: NodeState[] = registered.map((n) => ({
    nodeId: n.node_id,
    nodeType: n.node_type,
    state: n.state,
    version: n.version,
    uptimeSeconds: n.uptime_seconds,
    lastSeen: n.last_seen,
    memoryUsageMb: n.memory_usage_mb,
    cpuUsagePercent: n.cpu_usage_percent,
  }));

  return {
    nodes,
    recentStateChanges: [],
    stats: {
      totalNodes: registered.length,
      activeNodes: registered.filter((n) => n.state === 'active').length,
      byState,
    },
  };
}

export default function NodeRegistry() {
  const { isDemoMode } = useDemoMode();

  // Server-side projection stream: fetches snapshot, re-fetches on invalidation.
  // In demo mode, useDemoProjectionStream returns a static canned snapshot and
  // disables the live network connection.
  const {
    data: snapshot,
    cursor,
    isLoading,
    error,
    isConnected,
    refresh,
  } = useDemoProjectionStream<NodeRegistryPayload>(
    'node-registry',
    getDemoNodeRegistryPayload,
    undefined,
    {}
  );

  // Unwrap the projection envelope to get the domain payload
  const data = snapshot?.payload ?? null;

  // ------ Node selection state ------
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Transform real projection payload → DashboardData (only runs when data changes)
  const projectionDashboardData: DashboardData | null = useMemo(() => {
    if (!data || data.nodes.length === 0) return null;
    return transformNodeRegistryPayload(data);
  }, [data]);

  const hasProjectionData = projectionDashboardData !== null;

  const emptyDashboardData: DashboardData = {
    totalNodes: 0,
    activeNodes: 0,
    pendingNodes: 0,
    failedNodes: 0,
    nodeStatuses: [],
    nodeTypeDistribution: [],
    registeredNodes: [],
    registrationEvents: [],
  };

  const dashboardData: DashboardData = projectionDashboardData ?? emptyDashboardData;

  // ------ Resolve selected node (kept fresh as snapshot updates) ------

  const nodeStates: NodeState[] = useMemo(() => {
    if (data && data.nodes.length > 0) return data.nodes;
    return [];
  }, [data]);

  // Resolve to the latest version of the selected node whenever the snapshot changes
  const selectedNodeState: NodeState | null = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeStates.find((n) => n.nodeId === selectedNodeId) ?? null;
  }, [selectedNodeId, nodeStates]);

  // Handle table row click — map snake_case row data to nodeId for lookup
  const handleWidgetRowClick: OnWidgetRowClick = useCallback((widgetId, row) => {
    if (widgetId !== 'table-node-details') return;
    const nodeId = (row.node_id ?? row.nodeId) as string | undefined;
    if (!nodeId) return;
    // Toggle: clicking the same row deselects it
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const connectionStatus = isLoading ? 'connecting' : isConnected ? 'connected' : 'disconnected';

  // Contextual empty-state messages for the Registration Events feed.
  // When connected with real data but no state-change events, show the snapshot
  // time so users understand the system is working — just quiet.
  const eventFeedEmptyProps = useMemo(() => {
    if (isLoading) {
      return { emptyTitle: 'Loading event stream...' };
    }
    if (!isConnected) {
      return {
        emptyTitle: 'Disconnected',
        emptyDescription: 'Waiting for connection to projection service',
      };
    }
    // Connected — derive a human-readable snapshot timestamp
    const snapshotMs = snapshot?.snapshotTimeMs;
    if (snapshotMs) {
      const formatted = formatRelativeTime(new Date(snapshotMs), { compact: true });
      return {
        emptyTitle: `No registration events since ${formatted}`,
        emptyDescription: 'State changes will appear here in real time',
      };
    }
    return {
      emptyTitle: 'No registration events received',
      emptyDescription: 'State changes will appear here in real time',
    };
  }, [isLoading, isConnected, snapshot?.snapshotTimeMs]);

  const registryWidgetProps: WidgetPropsMap = useMemo(
    () => ({
      'event-feed-registrations': eventFeedEmptyProps,
      'table-node-details': {
        customCellRenderers: {
          state: (value: unknown) => <RegistrationStateBadge state={String(value ?? '')} />,
        },
      },
    }),
    [eventFeedEmptyProps]
  );

  return (
    <div className="space-y-6">
      <DemoBanner />

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
          <Badge
            variant={isDemoMode ? 'outline' : hasProjectionData ? 'default' : 'secondary'}
            className={isDemoMode ? 'border-amber-500/50 text-amber-400' : undefined}
          >
            {isDemoMode ? 'Demo Data' : hasProjectionData ? 'Live Data' : 'Mock Data'}
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
              {error && <p className="text-xs text-destructive">{error.message}</p>}
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
                  EFFECT, COMPUTE, REDUCER, ORCHESTRATOR, SERVICE
                </div>
              </div>
              <div>
                <span className="font-medium">Registration States:</span>
                <div className="text-muted-foreground mt-1">
                  pending_registration → accepted → awaiting_ack → ack_received → active
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
                <div className="text-muted-foreground mt-1">{SUFFIX_NODE_INTROSPECTION}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard grid with NodeDetailPanel injected into the slot
          previously occupied by status-grid-nodes (row 1-3, col 0-6). */}
      <DashboardRenderer
        config={nodeRegistryDashboardConfig}
        data={dashboardData}
        isLoading={isLoading}
        onWidgetRowClick={handleWidgetRowClick}
        widgetProps={registryWidgetProps}
      >
        {/* NodeDetailPanel: replaces status-grid-nodes in grid row 1-3, col 0-6 */}
        <div style={{ gridColumn: '1 / span 7', gridRow: '2 / span 3' }}>
          <NodeDetailPanel node={selectedNodeState} className="h-full" />
        </div>
      </DashboardRenderer>
    </div>
  );
}
