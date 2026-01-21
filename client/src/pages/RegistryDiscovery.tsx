/**
 * Registry Discovery Dashboard Page
 *
 * Contract-driven dashboard showing registered nodes and live service instances.
 * Fetches data from /api/registry/discovery and renders using the DashboardRenderer.
 *
 * Features:
 * - Real-time data refresh (30s default)
 * - WebSocket-based live updates (OMN-1278 Phase 4)
 * - Filtering by node type, state, health, and capability
 * - Loading and error state handling
 * - Warnings display from API response
 * - Live event feed showing recent registry events
 * - Node detail side panel
 * - Keyboard shortcuts (R=refresh, F=focus filter, Escape=close panel)
 *
 * OMN-1278 Phase 5: Investor Demo Polish
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import {
  registryDiscoveryDashboardConfig,
  transformRegistryData,
  generateMockRegistryDiscoveryData,
  type RegistryDiscoveryData,
  type NodeType,
  type NodeState,
  type HealthStatus,
  type RegisteredNodeInfo,
} from '@/lib/configs/registry-discovery-dashboard';
import { useRegistryDiscovery } from '@/hooks/useRegistryDiscovery';
import { useRegistryWebSocket } from '@/hooks/useRegistryWebSocket';
import type { DashboardData } from '@/lib/dashboard-schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RegistryEmptyState } from '@/components/EmptyState';
import { FilterBar, type FilterConfig } from '@/components/FilterBar';
import { DashboardPageHeader } from '@/components/DashboardPageHeader';
import {
  NodeDetailPanel,
  NodeTypeIcon,
  NodeStateBadge,
  NODE_TYPE_CONFIG,
  NODE_STATE_CONFIG,
} from '@/components/NodeDetailPanel';
import { AlertCircle, X, Radio, Activity, Trash2, Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// LocalStorage key for banner dismissal
const BANNER_DISMISSED_KEY = 'registry-discovery-banner-dismissed';

// Filter options
const NODE_TYPES: NodeType[] = ['EFFECT', 'COMPUTE', 'REDUCER', 'ORCHESTRATOR'];
const NODE_STATES: NodeState[] = [
  'PENDING_REGISTRATION',
  'ACCEPTED',
  'AWAITING_ACK',
  'ACK_RECEIVED',
  'ACTIVE',
  'ACK_TIMED_OUT',
  'LIVENESS_EXPIRED',
  'REJECTED',
];
const HEALTH_STATUSES: HealthStatus[] = ['passing', 'warning', 'critical', 'unknown'];

// Event type styling
const EVENT_TYPE_STYLES: Record<string, { color: string; icon: string; bg: string }> = {
  NODE_REGISTERED: { color: 'text-green-500', icon: '+', bg: 'bg-green-500/10' },
  NODE_STATE_CHANGED: { color: 'text-blue-500', icon: '~', bg: 'bg-blue-500/10' },
  NODE_HEARTBEAT: { color: 'text-gray-500', icon: '*', bg: 'bg-gray-500/10' },
  NODE_DEREGISTERED: { color: 'text-red-500', icon: '-', bg: 'bg-red-500/10' },
  INSTANCE_HEALTH_CHANGED: { color: 'text-yellow-500', icon: '!', bg: 'bg-yellow-500/10' },
  INSTANCE_ADDED: { color: 'text-green-500', icon: '+', bg: 'bg-green-500/10' },
  INSTANCE_REMOVED: { color: 'text-red-500', icon: '-', bg: 'bg-red-500/10' },
};

// Registry-specific event types to show in Live Events panel
// Excludes NODE_HEARTBEAT as it's too noisy for the feed
const REGISTRY_EVENT_TYPES = [
  'NODE_REGISTERED',
  'NODE_STATE_CHANGED',
  'NODE_DEREGISTERED',
  'INSTANCE_HEALTH_CHANGED',
  'INSTANCE_ADDED',
  'INSTANCE_REMOVED',
];

// Format event type for display
function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// Format timestamp for display
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function RegistryDiscovery() {
  // Filter state
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [healthFilter, setHealthFilter] = useState<string | undefined>(undefined);
  const [capabilitySearch, setCapabilitySearch] = useState('');
  const [useMockData, setUseMockData] = useState(false);
  const [showEventFeed, setShowEventFeed] = useState(true);

  // UI state
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
    }
    return false;
  });
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Node detail panel state
  const [selectedNode, setSelectedNode] = useState<RegisteredNodeInfo | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);

  // Last updated tracking
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Ref for capability search input (for keyboard shortcut)
  const capabilityInputRef = useRef<HTMLInputElement>(null);

  // Dismiss banner handler
  const dismissBanner = useCallback(() => {
    setIsBannerDismissed(true);
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  }, []);

  // WebSocket connection for real-time updates (OMN-1278 Phase 4)
  const { isConnected, connectionStatus, recentEvents, clearEvents, stats } = useRegistryWebSocket({
    maxRecentEvents: 100,
  });

  // Fetch data from API
  const {
    data: apiData,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useRegistryDiscovery({
    type: typeFilter,
    state: stateFilter,
    enabled: !useMockData,
  });

  // Update lastUpdated when data is fetched
  useEffect(() => {
    if (dataUpdatedAt) {
      setLastUpdated(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  // Generate mock data if needed
  const mockData = useMemo(() => {
    if (useMockData) {
      return generateMockRegistryDiscoveryData();
    }
    return null;
  }, [useMockData]);

  // Use API data or mock data
  const rawData: RegistryDiscoveryData | undefined = useMockData
    ? (mockData ?? undefined)
    : apiData;

  // Apply additional client-side filters (health, capability search)
  const filteredData = useMemo<RegistryDiscoveryData | undefined>(() => {
    if (!rawData) return undefined;

    let filteredNodes = [...rawData.nodes];
    let filteredInstances = [...rawData.live_instances];

    // Filter by capability search
    if (capabilitySearch.trim()) {
      const searchLower = capabilitySearch.toLowerCase().trim();
      filteredNodes = filteredNodes.filter(
        (node) =>
          node.capabilities.some((cap) => cap.toLowerCase().includes(searchLower)) ||
          node.name.toLowerCase().includes(searchLower)
      );
    }

    // Filter instances to only include those belonging to filtered nodes
    // This ensures by_health summary reflects the filtered node set
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.node_id));
    filteredInstances = filteredInstances.filter((inst) => filteredNodeIds.has(inst.node_id));

    // Filter instances by health (applied after node-based filtering)
    if (healthFilter) {
      filteredInstances = filteredInstances.filter((inst) => inst.health_status === healthFilter);
    }

    // Recalculate summary based on filtered data
    // Note: States are UPPERCASE to match RegistrationState enum from @shared/registry-types
    const activeNodes = filteredNodes.filter((n) => n.state === 'ACTIVE').length;
    const pendingNodes = filteredNodes.filter((n) =>
      ['PENDING_REGISTRATION', 'AWAITING_ACK', 'ACCEPTED', 'ACK_RECEIVED'].includes(n.state)
    ).length;
    const failedNodes = filteredNodes.filter((n) =>
      ['REJECTED', 'LIVENESS_EXPIRED', 'ACK_TIMED_OUT'].includes(n.state)
    ).length;

    const typeCounts = filteredNodes.reduce(
      (acc, n) => {
        acc[n.node_type] = (acc[n.node_type] || 0) + 1;
        return acc;
      },
      {} as Record<NodeType, number>
    );

    const by_type = Object.entries(typeCounts).map(([name, value]) => ({
      name,
      value,
    }));

    const healthCounts = filteredInstances.reduce(
      (acc, i) => {
        acc[i.health_status] = (acc[i.health_status] || 0) + 1;
        return acc;
      },
      { passing: 0, warning: 0, critical: 0, unknown: 0 } as Record<HealthStatus, number>
    );

    return {
      ...rawData,
      summary: {
        total_nodes: filteredNodes.length,
        active_nodes: activeNodes,
        pending_nodes: pendingNodes,
        failed_nodes: failedNodes,
        by_type,
        by_health: healthCounts,
      },
      nodes: filteredNodes,
      live_instances: filteredInstances,
    };
  }, [rawData, capabilitySearch, healthFilter]);

  // Transform data for dashboard rendering
  const dashboardData: DashboardData = useMemo(() => {
    if (!filteredData) {
      return {
        summary: {
          total_nodes: 0,
          active_nodes: 0,
          pending_nodes: 0,
          failed_nodes: 0,
          by_type: [],
          by_health: { passing: 0, warning: 0, critical: 0, unknown: 0 },
        },
        nodes: [],
        live_instances: [],
        healthStatusItems: [],
      };
    }
    return transformRegistryData(filteredData);
  }, [filteredData]);

  // Filter events to registry-specific types only (memoized for performance)
  const filteredRegistryEvents = useMemo(() => {
    return recentEvents.filter((event) => REGISTRY_EVENT_TYPES.includes(event.type));
  }, [recentEvents]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    if (!useMockData) {
      refetch();
    }
  }, [useMockData, refetch]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setTypeFilter(undefined);
    setStateFilter(undefined);
    setHealthFilter(undefined);
    setCapabilitySearch('');
  }, []);

  // Handle node click
  const handleNodeClick = useCallback((node: RegisteredNodeInfo) => {
    setSelectedNode(node);
    setIsDetailPanelOpen(true);
  }, []);

  // Close detail panel
  const closeDetailPanel = useCallback(() => {
    setIsDetailPanelOpen(false);
    setSelectedNode(null);
  }, []);

  const hasFilters = typeFilter || stateFilter || healthFilter || capabilitySearch.trim();
  const hasNoData =
    !filteredData || (filteredData.nodes.length === 0 && filteredData.live_instances.length === 0);

  // Build filter configs for FilterBar
  const filterConfigs = useMemo<FilterConfig[]>(() => {
    return [
      {
        type: 'select' as const,
        id: 'type',
        placeholder: 'Node Type',
        value: typeFilter,
        onChange: setTypeFilter,
        allLabel: 'All Types',
        options: NODE_TYPES.map((type) => {
          const config = NODE_TYPE_CONFIG[type];
          const Icon = config.icon;
          return {
            value: type,
            label: type,
            icon: <Icon className={cn('h-3.5 w-3.5', config.color)} />,
          };
        }),
      },
      {
        type: 'select' as const,
        id: 'state',
        placeholder: 'State',
        value: stateFilter,
        onChange: setStateFilter,
        allLabel: 'All States',
        options: NODE_STATES.map((state) => ({
          value: state,
          label: NODE_STATE_CONFIG[state]?.label || state,
        })),
      },
      {
        type: 'select' as const,
        id: 'health',
        placeholder: 'Health',
        value: healthFilter,
        onChange: setHealthFilter,
        allLabel: 'All Health',
        options: HEALTH_STATUSES.map((status) => ({
          value: status,
          label: status.charAt(0).toUpperCase() + status.slice(1),
        })),
      },
      {
        type: 'search' as const,
        id: 'capability',
        placeholder: 'Search...',
        value: capabilitySearch,
        onChange: setCapabilitySearch,
        inputRef: capabilityInputRef,
      },
    ];
  }, [typeFilter, stateFilter, healthFilter, capabilitySearch]);

  // Keyboard shortcuts for DashboardPageHeader
  const keyboardShortcuts = useMemo(
    () => [
      { key: 'R', description: 'Refresh data' },
      { key: 'F', description: 'Focus search' },
      { key: 'Esc', description: 'Close panel' },
    ],
    []
  );

  // Header action buttons
  const headerActions = useMemo(
    () => (
      <>
        {/* Event feed toggle */}
        <Button
          variant={showEventFeed ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowEventFeed(!showEventFeed)}
          className="gap-2"
        >
          <Activity className="h-4 w-4" />
          <span className="hidden sm:inline">Events</span>
          {stats.totalEventsReceived > 0 && (
            <Badge variant="outline" className="ml-1 text-xs">
              {stats.totalEventsReceived}
            </Badge>
          )}
        </Button>

        {/* Toggle mock data */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUseMockData(!useMockData)}
          className="hidden md:flex"
        >
          {useMockData ? 'Use Live Data' : 'Use Mock Data'}
        </Button>
      </>
    ),
    [showEventFeed, stats.totalEventsReceived, useMockData]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        // Allow Escape to blur and close panel
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          closeDetailPanel();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'r':
          // Refresh data
          e.preventDefault();
          handleRefresh();
          break;
        case 'f':
          // Focus capability search
          e.preventDefault();
          capabilityInputRef.current?.focus();
          break;
        case 'escape':
          // Close detail panel
          closeDetailPanel();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRefresh, closeDetailPanel]);

  return (
    <TooltipProvider>
      <div className="space-y-4 md:space-y-6">
        {/* Contract-Driven Banner - Dismissable */}
        {!isBannerDismissed && (
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <Zap className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-sm text-muted-foreground flex-1">
                <span className="font-medium text-foreground">Contract-driven dashboard</span>
                {' — '}nodes auto-register their capabilities. No hardcoded widgets.
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0 hover:bg-destructive/10"
                onClick={dismissBanner}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Header */}
        <DashboardPageHeader
          title={registryDiscoveryDashboardConfig.name}
          description={registryDiscoveryDashboardConfig.description}
          lastUpdated={lastUpdated}
          isConnected={isConnected}
          connectionStatus={connectionStatus}
          onRefresh={handleRefresh}
          isFetching={isFetching}
          isLoading={isLoading}
          useMockData={useMockData}
          keyboardShortcuts={keyboardShortcuts}
          actions={headerActions}
        />

        {/* Collapsible Filters */}
        <FilterBar
          filters={filterConfigs}
          isOpen={isFiltersOpen}
          onOpenChange={setIsFiltersOpen}
          onClear={clearFilters}
          hasActiveFilters={!!hasFilters}
        />

        {/* Warnings */}
        {rawData?.warnings && rawData.warnings.length > 0 && (
          <Alert variant="default">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2">
                {rawData.warnings.map((warning, index) => (
                  <li key={index} className="text-sm">
                    {warning}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Error state */}
        {isError && !useMockData && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading data</AlertTitle>
            <AlertDescription>
              {error?.message || 'Failed to fetch registry discovery data.'}
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Main content area with optional event feed */}
        <div
          className={cn(
            'grid gap-4 md:gap-6',
            showEventFeed ? 'grid-cols-1 lg:grid-cols-[1fr_320px]' : ''
          )}
        >
          {/* Dashboard grid or empty state */}
          {hasNoData && !isLoading ? (
            <RegistryEmptyState
              hasFilters={!!hasFilters}
              onClearFilters={clearFilters}
              onRefresh={handleRefresh}
              className="min-h-[400px] border rounded-lg"
            />
          ) : (
            <div className="space-y-6">
              {/* Metric Cards + Charts */}
              <DashboardRenderer
                config={registryDiscoveryDashboardConfig}
                data={dashboardData}
                isLoading={isLoading && !useMockData}
              />

              {/* Visual separator between charts and tables */}
              <Separator className="my-2" />

              {/* Interactive Nodes Table */}
              {filteredData && filteredData.nodes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium">Registered Nodes</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Click a node to view details and live instances
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="rounded-md border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left py-3 px-4 font-medium">Name</th>
                              <th className="text-left py-3 px-4 font-medium">Type</th>
                              <th className="text-left py-3 px-4 font-medium">State</th>
                              <th className="text-left py-3 px-4 font-medium hidden md:table-cell">
                                Version
                              </th>
                              <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">
                                Capabilities
                              </th>
                              <th className="w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredData.nodes.map((node: RegisteredNodeInfo, idx: number) => {
                              const capabilities = node.capabilities;
                              const displayCaps = capabilities.slice(0, 3);
                              const moreCaps = capabilities.length - 3;

                              return (
                                <tr
                                  key={node.node_id || node.name}
                                  className={cn(
                                    'border-b last:border-b-0 cursor-pointer transition-colors',
                                    'hover:bg-muted/50',
                                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                                  )}
                                  onClick={() => handleNodeClick(node)}
                                >
                                  <td className="py-3 px-4">
                                    <span className="font-medium">{node.name}</span>
                                  </td>
                                  <td className="py-3 px-4">
                                    <NodeTypeIcon type={node.node_type} showLabel />
                                  </td>
                                  <td className="py-3 px-4">
                                    <NodeStateBadge state={node.state} />
                                  </td>
                                  <td className="py-3 px-4 hidden md:table-cell">
                                    <span className="font-mono text-xs">{node.version}</span>
                                  </td>
                                  <td className="py-3 px-4 hidden lg:table-cell">
                                    <div className="flex flex-wrap gap-1 max-w-[300px]">
                                      {displayCaps.map((cap) => (
                                        <Badge
                                          key={cap}
                                          variant="outline"
                                          className="text-xs font-mono bg-muted/50"
                                        >
                                          {cap}
                                        </Badge>
                                      ))}
                                      {moreCaps > 0 && (
                                        <Badge variant="secondary" className="text-xs">
                                          +{moreCaps} more
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Event feed sidebar */}
          {showEventFeed && (
            <Card className="h-fit lg:sticky lg:top-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Radio className="h-4 w-4" />
                    Live Events
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {filteredRegistryEvents.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearEvents}
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {filteredRegistryEvents.length}
                    </Badge>
                  </div>
                </div>
                {stats.lastEventTime && (
                  <p className="text-xs text-muted-foreground">
                    Last event: {formatTime(stats.lastEventTime)}
                  </p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {filteredRegistryEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {isConnected ? (
                      <>
                        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Waiting for registry events...</p>
                        <p className="text-xs mt-1">Node and instance events will appear here</p>
                      </>
                    ) : (
                      <>
                        <Radio className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Not connected</p>
                        <p className="text-xs mt-1">WebSocket connection required</p>
                      </>
                    )}
                  </div>
                ) : (
                  <ScrollArea className="h-[300px] md:h-[400px] pr-4">
                    <div className="space-y-2">
                      {filteredRegistryEvents.slice(0, 50).map((event, idx) => {
                        const style = EVENT_TYPE_STYLES[event.type] || {
                          color: 'text-gray-500',
                          icon: '?',
                          bg: 'bg-gray-500/10',
                        };
                        return (
                          <div
                            key={`${event.id}-${idx}`}
                            className={cn(
                              'p-2 rounded-md text-xs border border-transparent hover:border-border transition-colors',
                              style.bg
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  className={cn('font-mono font-bold flex-shrink-0', style.color)}
                                >
                                  {style.icon}
                                </span>
                                <span className="font-medium">{formatEventType(event.type)}</span>
                              </div>
                              <span className="text-muted-foreground whitespace-nowrap text-[10px]">
                                {formatTime(event.timestamp)}
                              </span>
                            </div>
                            {event.payload && Object.keys(event.payload).length > 0 && (
                              <div className="mt-1 pl-5 text-muted-foreground space-y-0.5">
                                {'node_id' in event.payload && (
                                  <p className="break-all">
                                    <span className="text-muted-foreground/70">Node:</span>{' '}
                                    <span className="font-mono">
                                      {String(event.payload.node_id)}
                                    </span>
                                  </p>
                                )}
                                {'instance_id' in event.payload && (
                                  <p className="break-all">
                                    <span className="text-muted-foreground/70">Instance:</span>{' '}
                                    <span className="font-mono">
                                      {String(event.payload.instance_id)}
                                    </span>
                                  </p>
                                )}
                                {'new_state' in event.payload && (
                                  <p>
                                    State: {String(event.payload.previous_state)} &rarr;{' '}
                                    {String(event.payload.new_state)}
                                  </p>
                                )}
                                {'new_health' in event.payload && (
                                  <p>
                                    Health: {String(event.payload.previous_health)} &rarr;{' '}
                                    {String(event.payload.new_health)}
                                  </p>
                                )}
                                {'health_status' in event.payload && (
                                  <p>Status: {String(event.payload.health_status)}</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Node Detail Panel */}
        <NodeDetailPanel
          node={selectedNode}
          instances={filteredData?.live_instances || []}
          open={isDetailPanelOpen}
          onClose={closeDetailPanel}
        />
      </div>
    </TooltipProvider>
  );
}
