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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { LiveIndicator } from '@/components/LiveIndicator';
import { RegistryEmptyState } from '@/components/EmptyState';
import {
  NodeDetailPanel,
  NodeTypeIcon,
  NodeStateBadge,
  NODE_TYPE_CONFIG,
} from '@/components/NodeDetailPanel';
import {
  RefreshCw,
  AlertCircle,
  Database,
  Filter,
  X,
  Loader2,
  Radio,
  Activity,
  Trash2,
  Search,
  Info,
  Clock,
  Keyboard,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Filter options
const NODE_TYPES: NodeType[] = ['EFFECT', 'COMPUTE', 'REDUCER', 'ORCHESTRATOR'];
const NODE_STATES: NodeState[] = [
  'registered',
  'active',
  'inactive',
  'pending',
  'deprecated',
  'failed',
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

// Format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 10) {
    return 'just now';
  }
  if (diffSeconds < 60) {
    return `${diffSeconds} seconds ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  }
  return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
}

export default function RegistryDiscovery() {
  // Filter state
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [healthFilter, setHealthFilter] = useState<string | undefined>(undefined);
  const [capabilitySearch, setCapabilitySearch] = useState('');
  const [useMockData, setUseMockData] = useState(false);
  const [showEventFeed, setShowEventFeed] = useState(true);

  // Node detail panel state
  const [selectedNode, setSelectedNode] = useState<RegisteredNodeInfo | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);

  // Last updated tracking
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Ref for capability search input (for keyboard shortcut)
  const capabilityInputRef = useRef<HTMLInputElement>(null);

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
          node.capabilities.toLowerCase().includes(searchLower) ||
          node.name.toLowerCase().includes(searchLower)
      );
    }

    // Filter instances by health
    if (healthFilter) {
      filteredInstances = filteredInstances.filter((inst) => inst.health_status === healthFilter);
    }

    // Recalculate summary based on filtered data
    const activeNodes = filteredNodes.filter((n) => n.state === 'active').length;
    const pendingNodes = filteredNodes.filter((n) => n.state === 'pending').length;
    const failedNodes = filteredNodes.filter((n) => n.state === 'failed').length;

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
        {/* Contract-Driven Banner */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm flex items-center gap-2">
                Registry is the Source of Truth
                <Badge variant="secondary" className="text-xs">
                  Contract-Driven
                </Badge>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                This dashboard auto-configures based on registered nodes. No hardcoded widgets
                &mdash; add a node to the registry and it automatically appears here with its
                capabilities, health status, and live instances.
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="text-sm">
                  The ONEX 4-node architecture (Effect, Compute, Reducer, Orchestrator) enables
                  self-describing nodes that report their capabilities through contracts.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">
              {registryDiscoveryDashboardConfig.name}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base">
              {registryDiscoveryDashboardConfig.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            {/* Last updated timestamp */}
            {lastUpdated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Updated</span>{' '}
                    {formatRelativeTime(lastUpdated)}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Last updated: {lastUpdated.toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Live indicator (WebSocket status) */}
            <LiveIndicator
              isConnected={isConnected}
              connectionStatus={connectionStatus}
              size="sm"
            />

            {/* Data source badge */}
            <Badge variant={useMockData ? 'secondary' : 'default'} className="gap-1 hidden sm:flex">
              <Database className="h-3 w-3" />
              {useMockData ? 'Mock Data' : 'Live API'}
            </Badge>

            {/* Fetching indicator */}
            {isFetching && !isLoading && (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">Updating...</span>
              </Badge>
            )}

            {/* Keyboard shortcuts hint */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="hidden md:flex">
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="space-y-1 text-xs">
                  <p>
                    <kbd className="bg-muted px-1 rounded">R</kbd> Refresh data
                  </p>
                  <p>
                    <kbd className="bg-muted px-1 rounded">F</kbd> Focus search
                  </p>
                  <p>
                    <kbd className="bg-muted px-1 rounded">Esc</kbd> Close panel
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>

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

            {/* Refresh button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading || useMockData}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Enhanced Filters */}
        <div className="flex flex-col gap-3 p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1 text-muted-foreground h-7 ml-auto"
              >
                <X className="h-3 w-3" />
                Clear all
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Node type filter */}
            <Select
              value={typeFilter ?? 'all'}
              onValueChange={(value) => setTypeFilter(value === 'all' ? undefined : value)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Node Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {NODE_TYPES.map((type) => {
                  const config = NODE_TYPE_CONFIG[type];
                  const Icon = config.icon;
                  return (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        <Icon className={cn('h-3.5 w-3.5', config.color)} />
                        {type}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* State filter */}
            <Select
              value={stateFilter ?? 'all'}
              onValueChange={(value) => setStateFilter(value === 'all' ? undefined : value)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {NODE_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state.charAt(0).toUpperCase() + state.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Health filter */}
            <Select
              value={healthFilter ?? 'all'}
              onValueChange={(value) => setHealthFilter(value === 'all' ? undefined : value)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Health" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Health</SelectItem>
                {HEALTH_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Capability search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={capabilityInputRef}
                placeholder="Search capabilities or node name..."
                value={capabilitySearch}
                onChange={(e) => setCapabilitySearch(e.target.value)}
                className="pl-9 h-9"
              />
              {capabilitySearch && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setCapabilitySearch('')}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>

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
              <DashboardRenderer
                config={registryDiscoveryDashboardConfig}
                data={dashboardData}
                isLoading={isLoading && !useMockData}
              />

              {/* Enhanced Nodes Table with clickable rows */}
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
                            {filteredData.nodes.map((node, idx) => {
                              const capabilities = node.capabilities
                                .split(',')
                                .map((c) => c.trim());
                              const displayCaps = capabilities.slice(0, 3);
                              const moreCaps = capabilities.length - 3;

                              return (
                                <tr
                                  key={idx}
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
                                      {displayCaps.map((cap, capIdx) => (
                                        <Badge
                                          key={capIdx}
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
                    {recentEvents.length > 0 && (
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
                      {recentEvents.length}
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
                {recentEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {isConnected ? (
                      <>
                        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Waiting for events...</p>
                        <p className="text-xs mt-1">Events will appear here in real-time</p>
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
                      {recentEvents.slice(0, 50).map((event) => {
                        const style = EVENT_TYPE_STYLES[event.type] || {
                          color: 'text-gray-500',
                          icon: '?',
                          bg: 'bg-gray-500/10',
                        };
                        return (
                          <div
                            key={event.id}
                            className={cn(
                              'p-2 rounded-md text-xs border border-transparent hover:border-border transition-colors',
                              style.bg
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={cn('font-mono font-bold', style.color)}>
                                  {style.icon}
                                </span>
                                <span className="font-medium truncate">
                                  {formatEventType(event.type)}
                                </span>
                              </div>
                              <span className="text-muted-foreground whitespace-nowrap">
                                {formatTime(event.timestamp)}
                              </span>
                            </div>
                            {event.payload && Object.keys(event.payload).length > 0 && (
                              <div className="mt-1 pl-5 text-muted-foreground">
                                {'node_id' in event.payload && (
                                  <p className="truncate">Node: {String(event.payload.node_id)}</p>
                                )}
                                {'instance_id' in event.payload && (
                                  <p className="truncate">
                                    Instance: {String(event.payload.instance_id)}
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
