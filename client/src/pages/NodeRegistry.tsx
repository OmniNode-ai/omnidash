/**
 * Node Registry Dashboard Page
 *
 * Real-time visualization of 2-way node registration events from omnibase_infra.
 * Displays node introspection, heartbeat, and registration state transitions.
 *
 * Data flows: Kafka -> EventConsumer -> WebSocket -> Dashboard
 *
 * When connected to WebSocket, receives real-time updates from:
 * - NODE_INTROSPECTION: Node introspection events
 * - NODE_HEARTBEAT: Heartbeat events with health metrics
 * - NODE_STATE_CHANGE: Registration state transitions
 *
 * Falls back to mock data when WebSocket is not available.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import {
  nodeRegistryDashboardConfig,
  generateNodeRegistryMockData,
  type RegisteredNode,
  type RegistrationEvent,
  type NodeType,
  type RegistrationState,
} from '@/lib/configs/node-registry-dashboard';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { DashboardData } from '@/lib/dashboard-schema';
import { SUFFIX_NODE_INTROSPECTION, resolveTopicName } from '@shared/topics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wifi, WifiOff, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NodeRegistryState {
  nodes: Map<string, RegisteredNode>;
  events: RegistrationEvent[];
}

interface WebSocketMessage {
  type: string;
  data?: unknown;
  message?: string;
  timestamp: string;
}

interface NodeIntrospectionData {
  node_id: string;
  node_type: NodeType;
  node_version: string;
  endpoints: Record<string, string>;
  current_state: RegistrationState;
  reason: 'STARTUP' | 'HEARTBEAT' | 'REQUESTED';
  correlation_id: string;
}

interface NodeHeartbeatData {
  node_id: string;
  uptime_seconds: number;
  active_operations_count: number;
  memory_usage_mb: number;
  cpu_usage_percent: number;
}

interface NodeStateChangeData {
  node_id: string;
  previous_state: RegistrationState;
  new_state: RegistrationState;
}

interface InitialStateData {
  registeredNodes?: RegisteredNode[];
  nodeRegistryStats?: {
    totalNodes: number;
    activeNodes: number;
    pendingNodes: number;
    failedNodes: number;
    typeDistribution: Record<NodeType, number>;
  };
}

/**
 * Convert registration state to status grid color
 */
function stateToStatus(state: RegistrationState): 'healthy' | 'warning' | 'error' {
  switch (state) {
    case 'active':
      return 'healthy';
    case 'pending_registration':
    case 'accepted':
    case 'awaiting_ack':
    case 'ack_received':
      return 'warning';
    case 'rejected':
    case 'ack_timed_out':
    case 'liveness_expired':
      return 'error';
    default:
      return 'warning';
  }
}

/**
 * Convert state to severity for event feed
 */
function stateToSeverity(state: RegistrationState): 'info' | 'success' | 'warning' | 'error' {
  switch (state) {
    case 'active':
      return 'success';
    case 'pending_registration':
    case 'accepted':
    case 'awaiting_ack':
    case 'ack_received':
      return 'info';
    case 'rejected':
    case 'ack_timed_out':
    case 'liveness_expired':
      return 'error';
    default:
      return 'warning';
  }
}

export default function NodeRegistry() {
  // State management for nodes and events
  const [registryState, setRegistryState] = useState<NodeRegistryState>({
    nodes: new Map(),
    events: [],
  });
  const [eventCount, setEventCount] = useState(0);
  const [useMockData, setUseMockData] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Initialize with mock data
  useEffect(() => {
    if (useMockData) {
      const mockData = generateNodeRegistryMockData();
      const nodes = new Map<string, RegisteredNode>();
      (mockData.registeredNodes as RegisteredNode[]).forEach((node) => {
        nodes.set(node.node_id, node);
      });
      setRegistryState({
        nodes,
        events: mockData.registrationEvents as RegistrationEvent[],
      });
      setLastUpdate(new Date());
    }
  }, [useMockData]);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    const timestamp = message.timestamp || new Date().toISOString();

    switch (message.type) {
      case 'INITIAL_STATE': {
        // Initial state from server - contains full state object
        const data = message.data as InitialStateData;
        const initialNodes = data?.registeredNodes;
        if (Array.isArray(initialNodes) && initialNodes.length > 0) {
          const nodes = new Map<string, RegisteredNode>();
          initialNodes.forEach((node) => {
            nodes.set(node.node_id, node);
          });
          setRegistryState((prev) => ({
            nodes,
            events: prev.events,
          }));
          setUseMockData(false);
          setLastUpdate(new Date());
        }
        break;
      }

      case 'NODE_REGISTRY_UPDATE': {
        // Full registry update from server
        const nodes = message.data as RegisteredNode[] | undefined;
        if (Array.isArray(nodes) && nodes.length > 0) {
          const nodeMap = new Map<string, RegisteredNode>();
          nodes.forEach((node) => {
            nodeMap.set(node.node_id, node);
          });
          setRegistryState((prev) => ({
            nodes: nodeMap,
            events: prev.events,
          }));
          setUseMockData(false);
          setLastUpdate(new Date());
        }
        break;
      }

      case 'NODE_INTROSPECTION': {
        const data = message.data as NodeIntrospectionData;
        if (!data?.node_id) break;

        setRegistryState((prev) => {
          const nodes = new Map(prev.nodes);
          const existingNode = nodes.get(data.node_id);

          nodes.set(data.node_id, {
            node_id: data.node_id,
            node_type: data.node_type,
            state: data.current_state,
            version: data.node_version,
            uptime_seconds: existingNode?.uptime_seconds || 0,
            last_seen: timestamp,
            memory_usage_mb: existingNode?.memory_usage_mb,
            cpu_usage_percent: existingNode?.cpu_usage_percent,
          });

          const newEvent: RegistrationEvent = {
            type: 'introspection',
            node_id: data.node_id,
            message: `Introspection from ${data.node_id} (${data.reason})`,
            severity: 'info',
            timestamp,
          };

          return {
            nodes,
            events: [newEvent, ...prev.events].slice(0, 50),
          };
        });
        setEventCount((c) => c + 1);
        setLastUpdate(new Date());
        setUseMockData(false);
        break;
      }

      case 'NODE_HEARTBEAT': {
        const data = message.data as NodeHeartbeatData;
        if (!data?.node_id) break;

        setRegistryState((prev) => {
          const nodes = new Map(prev.nodes);
          const existingNode = nodes.get(data.node_id);

          if (existingNode) {
            nodes.set(data.node_id, {
              ...existingNode,
              uptime_seconds: data.uptime_seconds,
              last_seen: timestamp,
              memory_usage_mb: data.memory_usage_mb,
              cpu_usage_percent: data.cpu_usage_percent,
            });
          }

          const severity =
            data.cpu_usage_percent > 80
              ? 'warning'
              : data.memory_usage_mb > 900
                ? 'warning'
                : 'success';

          const newEvent: RegistrationEvent = {
            type: 'heartbeat',
            node_id: data.node_id,
            message: `Heartbeat from ${data.node_id} (CPU: ${data.cpu_usage_percent}%, Mem: ${data.memory_usage_mb}MB)`,
            severity,
            timestamp,
          };

          return {
            nodes,
            events: [newEvent, ...prev.events].slice(0, 50),
          };
        });
        setEventCount((c) => c + 1);
        setLastUpdate(new Date());
        setUseMockData(false);
        break;
      }

      case 'NODE_STATE_CHANGE': {
        const data = message.data as NodeStateChangeData;
        if (!data?.node_id) break;

        setRegistryState((prev) => {
          const nodes = new Map(prev.nodes);
          const existingNode = nodes.get(data.node_id);

          if (existingNode) {
            nodes.set(data.node_id, {
              ...existingNode,
              state: data.new_state,
              last_seen: timestamp,
            });
          }

          const newEvent: RegistrationEvent = {
            type: 'state_change',
            node_id: data.node_id,
            message: `${data.node_id}: ${data.previous_state} -> ${data.new_state}`,
            severity: stateToSeverity(data.new_state),
            timestamp,
          };

          return {
            nodes,
            events: [newEvent, ...prev.events].slice(0, 50),
          };
        });
        setEventCount((c) => c + 1);
        setLastUpdate(new Date());
        setUseMockData(false);
        break;
      }

      case 'CONNECTED': {
        // WebSocket connected - wait for INITIAL_STATE with real data
        break;
      }
    }
  }, []);

  // WebSocket connection
  const { isConnected, connectionStatus, subscribe } = useWebSocket({
    onMessage: handleMessage,
    onOpen: () => {
      // Subscribe to node registry events
      subscribe(['node-introspection', 'node-heartbeat', 'node-state-change', 'node-registry']);
    },
    debug: false,
  });

  // Transform state to dashboard data format
  const dashboardData: DashboardData = useMemo(() => {
    const nodesArray = Array.from(registryState.nodes.values());

    const activeNodes = nodesArray.filter((n) => n.state === 'active').length;
    const pendingNodes = nodesArray.filter((n) =>
      ['pending_registration', 'awaiting_ack', 'ack_received', 'accepted'].includes(n.state)
    ).length;
    const failedNodes = nodesArray.filter((n) =>
      ['rejected', 'liveness_expired', 'ack_timed_out'].includes(n.state)
    ).length;

    // Node statuses for status grid
    const nodeStatuses = nodesArray.map((n) => ({
      node_id: n.node_id,
      status: stateToStatus(n.state),
    }));

    // Node type distribution for pie chart
    const typeCounts = nodesArray.reduce(
      (acc, n) => {
        acc[n.node_type] = (acc[n.node_type] || 0) + 1;
        return acc;
      },
      {} as Record<NodeType, number>
    );

    const nodeTypeDistribution = Object.entries(typeCounts).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      totalNodes: nodesArray.length,
      activeNodes,
      pendingNodes,
      failedNodes,
      nodeStatuses,
      nodeTypeDistribution,
      registeredNodes: nodesArray,
      registrationEvents: registryState.events,
    };
  }, [registryState]);

  // Refresh mock data
  const handleRefresh = useCallback(() => {
    if (useMockData) {
      const mockData = generateNodeRegistryMockData();
      const nodes = new Map<string, RegisteredNode>();
      (mockData.registeredNodes as RegisteredNode[]).forEach((node) => {
        nodes.set(node.node_id, node);
      });
      setRegistryState({
        nodes,
        events: mockData.registrationEvents as RegistrationEvent[],
      });
      setLastUpdate(new Date());
    }
  }, [useMockData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{nodeRegistryDashboardConfig.name}</h1>
          <p className="text-muted-foreground">{nodeRegistryDashboardConfig.description}</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Event counter */}
          <div className="text-sm text-muted-foreground">
            Events: <span className="font-mono">{eventCount}</span>
          </div>

          {/* Data source badge */}
          <Badge variant={useMockData ? 'secondary' : 'default'}>
            {useMockData ? 'Mock Data' : 'Live Data'}
          </Badge>

          {/* Connection status */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                    isConnected
                      ? 'bg-green-500'
                      : connectionStatus === 'connecting'
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
              <p>WebSocket: {connectionStatus}</p>
              {lastUpdate && (
                <p className="text-xs text-muted-foreground">
                  Last update: {lastUpdate.toLocaleTimeString()}
                </p>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Refresh button (only for mock data) */}
          {useMockData && (
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          )}
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
        isLoading={connectionStatus === 'connecting' && registryState.nodes.size === 0}
      />
    </div>
  );
}
