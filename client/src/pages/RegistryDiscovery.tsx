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

import { useState, useMemo, useCallback, useEffect } from 'react';
import { DashboardRenderer } from '@/lib/widgets';
import {
  registryDiscoveryDashboardConfig,
  generateMockRegistryDiscoveryData,
  type RegistryDiscoveryData,
  type RegisteredNodeInfo,
} from '@/lib/configs/registry-discovery-dashboard';
import { useRegistryDiscovery } from '@/hooks/useRegistryDiscovery';
import { useRegistryWebSocket } from '@/hooks/useRegistryWebSocket';
import { useRegistryFilters } from '@/hooks/useRegistryFilters';
import { useRegistryData } from '@/hooks/useRegistryData';
import { useRegistryKeyboardShortcuts } from '@/hooks/useRegistryKeyboardShortcuts';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RegistryEmptyState } from '@/components/EmptyState';
import { FilterBar } from '@/components/FilterBar';
import { DashboardPageHeader } from '@/components/DashboardPageHeader';
import { NodeDetailPanel } from '@/components/NodeDetailPanel';
import { ContractBanner } from '@/components/ContractBanner';
import {
  SystemHealthBadge,
  calculateHealthLevel,
  getHealthTooltip,
} from '@/components/SystemHealthBadge';
import { NodesTable } from '@/components/NodesTable';
import { EventFeedSidebar } from '@/components/EventFeedSidebar';
import { AlertCircle } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isOfflineState, isPendingState } from '@shared/schemas';

// LocalStorage key for banner dismissal
const BANNER_STORAGE_KEY = 'registry-discovery-banner-dismissed';

// Registry-specific event types to show in Live Events panel
const REGISTRY_EVENT_TYPES = [
  'NODE_REGISTERED',
  'NODE_STATE_CHANGED',
  'NODE_DEREGISTERED',
  'INSTANCE_HEALTH_CHANGED',
  'INSTANCE_ADDED',
  'INSTANCE_REMOVED',
];

// Keyboard shortcuts for DashboardPageHeader
const KEYBOARD_SHORTCUTS = [
  { key: 'R', description: 'Refresh data' },
  { key: 'F', description: 'Focus search' },
  { key: 'Esc', description: 'Close panel' },
];

export default function RegistryDiscovery() {
  // Filter state and configuration
  const {
    typeFilter,
    stateFilter,
    healthFilter,
    capabilitySearch,
    filterConfigs,
    clearFilters,
    hasFilters,
    capabilityInputRef,
  } = useRegistryFilters();

  // UI state
  const [useMockData, setUseMockData] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<RegisteredNodeInfo | null>(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Visibility toggles for offline/pending nodes
  const [showOffline, setShowOffline] = useState(false);
  const [showPending, setShowPending] = useState(true);

  // WebSocket connection for real-time updates
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
  const mockData = useMemo(
    () => (useMockData ? generateMockRegistryDiscoveryData() : null),
    [useMockData]
  );

  // Use API data or mock data
  const rawData: RegistryDiscoveryData | undefined = useMockData
    ? (mockData ?? undefined)
    : apiData;

  // Transform and filter data
  const {
    filteredData: baseFilteredData,
    dashboardData,
    hasNoData: baseHasNoData,
    healthBadgeData,
  } = useRegistryData(rawData, {
    healthFilter,
    capabilitySearch,
  });

  // Apply visibility toggles for offline/pending nodes
  const filteredData = useMemo(() => {
    if (!baseFilteredData) return undefined;

    const visibleNodes = baseFilteredData.nodes.filter((node) => {
      // Filter out offline nodes if toggle is off
      if (!showOffline && isOfflineState(node.state)) {
        return false;
      }
      // Filter out pending nodes if toggle is off
      if (!showPending && isPendingState(node.state)) {
        return false;
      }
      return true;
    });

    // Filter instances to match visible nodes
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.node_id));
    const visibleInstances = baseFilteredData.live_instances.filter((inst) =>
      visibleNodeIds.has(inst.node_id)
    );

    return {
      ...baseFilteredData,
      nodes: visibleNodes,
      live_instances: visibleInstances,
    };
    // Note: No time-based dependency needed here. Filtering logic operates on
    // node state strings (showOffline, showPending), not on heartbeat recency.
    // Health badge calculation (calculateHealthLevel) also uses static counts
    // rather than time-based values, so no timer-based re-renders are required.
  }, [baseFilteredData, showOffline, showPending]);

  // Recompute hasNoData based on visibility-filtered data
  const hasNoData =
    baseHasNoData ||
    !filteredData ||
    (filteredData.nodes.length === 0 && filteredData.live_instances.length === 0);

  // Filter events to registry-specific types only
  const filteredRegistryEvents = useMemo(
    () => recentEvents.filter((event) => REGISTRY_EVENT_TYPES.includes(event.type)),
    [recentEvents]
  );

  // Handlers
  const handleRefresh = useCallback(() => {
    if (!useMockData) refetch();
  }, [useMockData, refetch]);

  const handleNodeClick = useCallback((node: RegisteredNodeInfo) => {
    setSelectedNode(node);
    setIsDetailPanelOpen(true);
  }, []);

  const closeDetailPanel = useCallback(() => {
    setIsDetailPanelOpen(false);
    setSelectedNode(null);
  }, []);

  // Keyboard shortcuts
  useRegistryKeyboardShortcuts({
    onRefresh: handleRefresh,
    onClosePanel: closeDetailPanel,
    searchInputRef: capabilityInputRef,
  });

  // Computed values
  // Note: healthTick is NOT included here because calculateHealthLevel()
  // uses static counts (failed_nodes, pending_nodes, by_health) rather than
  // time-based heartbeat recency. The badge only needs to re-render when
  // the underlying health data changes, not every second.
  const healthBadge = useMemo(() => {
    if (!healthBadgeData || isLoading) return null;
    const status = calculateHealthLevel(healthBadgeData);
    const tooltip = getHealthTooltip(healthBadgeData, status);
    return <SystemHealthBadge status={status} title={tooltip} />;
  }, [healthBadgeData, isLoading]);

  const headerActions = useMemo(
    () => (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setUseMockData(!useMockData)}
        className="hidden md:flex"
      >
        {useMockData ? 'Use Live Data' : 'Use Mock Data'}
      </Button>
    ),
    [useMockData]
  );

  // Custom fallback for RegistryDiscovery page errors
  const errorFallback = useMemo(
    () => (
      <div className="space-y-4 md:space-y-6">
        <DashboardPageHeader
          title={registryDiscoveryDashboardConfig.name}
          description={registryDiscoveryDashboardConfig.description}
          onRefresh={handleRefresh}
          isLoading={false}
          isFetching={false}
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Dashboard Error</AlertTitle>
          <AlertDescription>
            An unexpected error occurred while rendering the Registry Discovery dashboard.
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    ),
    [handleRefresh]
  );

  return (
    <TooltipProvider>
      <ErrorBoundary fallback={errorFallback}>
        <div className="space-y-4 md:space-y-6">
          {/* Contract-Driven Banner */}
          <ContractBanner
            storageKey={BANNER_STORAGE_KEY}
            title="Contract-driven dashboard"
            description="nodes auto-register their capabilities. No hardcoded widgets."
          />

          {/* Header */}
          <DashboardPageHeader
            title={registryDiscoveryDashboardConfig.name}
            description={registryDiscoveryDashboardConfig.description}
            statusBadge={healthBadge}
            lastUpdated={lastUpdated}
            isConnected={isConnected}
            connectionStatus={connectionStatus}
            onRefresh={handleRefresh}
            isFetching={isFetching}
            isLoading={isLoading}
            useMockData={useMockData}
            keyboardShortcuts={KEYBOARD_SHORTCUTS}
            actions={headerActions}
          />

          {/* Filters */}
          <FilterBar
            filters={filterConfigs}
            isOpen={isFiltersOpen}
            onOpenChange={setIsFiltersOpen}
            onClear={clearFilters}
            hasActiveFilters={hasFilters}
          />

          {/* Visibility Toggles */}
          <div className="flex items-center gap-6 text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOffline}
                onChange={(e) => setShowOffline(e.target.checked)}
                className="rounded border-input h-4 w-4 accent-primary"
              />
              <span className="text-muted-foreground">Show offline</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPending}
                onChange={(e) => setShowPending(e.target.checked)}
                className="rounded border-input h-4 w-4 accent-primary"
              />
              <span className="text-muted-foreground">Show pending</span>
            </label>
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

          {/* Main content */}
          {hasNoData && !isLoading ? (
            <RegistryEmptyState
              hasFilters={hasFilters}
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

              <EventFeedSidebar
                events={filteredRegistryEvents}
                isConnected={isConnected}
                onClearEvents={clearEvents}
                lastEventTime={stats.lastEventTime}
              />

              <Separator className="my-2" />

              {filteredData && filteredData.nodes.length > 0 && (
                <NodesTable nodes={filteredData.nodes} onNodeClick={handleNodeClick} />
              )}
            </div>
          )}

          {/* Node Detail Panel */}
          <NodeDetailPanel
            node={selectedNode}
            instances={filteredData?.live_instances || []}
            open={isDetailPanelOpen}
            onClose={closeDetailPanel}
          />
        </div>
      </ErrorBoundary>
    </TooltipProvider>
  );
}
