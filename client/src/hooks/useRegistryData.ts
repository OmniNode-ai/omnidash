/**
 * useRegistryData Hook
 *
 * Transforms and filters registry discovery data for dashboard rendering.
 * Extracts data transformation logic from RegistryDiscovery.tsx.
 *
 * Features:
 * - Client-side filtering by capability search and health status
 * - Recalculates summary statistics based on filtered data
 * - Transforms filtered data for DashboardRenderer consumption
 */

import { useMemo } from 'react';
import {
  transformRegistryData,
  type RegistryDiscoveryData,
  type NodeType,
  type HealthStatus,
} from '@/lib/configs/registry-discovery-dashboard';
import type { DashboardData } from '@/lib/dashboard-schema';

/**
 * Filter parameters for registry data
 */
export interface RegistryDataFilters {
  /** Filter instances by health status */
  healthFilter?: string;
  /** Filter nodes by capability or name search */
  capabilitySearch: string;
}

/**
 * Health data for computing system health badge
 */
export interface HealthBadgeData {
  total_nodes: number;
  active_nodes: number;
  failed_nodes: number;
  pending_nodes: number;
  by_health: {
    passing: number;
    warning: number;
    critical: number;
    unknown: number;
  };
}

/**
 * Return type for useRegistryData hook
 */
export interface UseRegistryDataReturn {
  /** Filtered registry data with recalculated summary */
  filteredData: RegistryDiscoveryData | undefined;
  /** Transformed data for DashboardRenderer consumption */
  dashboardData: DashboardData;
  /** Whether filtered data has no nodes or instances */
  hasNoData: boolean;
  /** Health data for computing system health badge */
  healthBadgeData: HealthBadgeData | null;
}

/**
 * Default empty dashboard data for loading/error states
 */
const EMPTY_DASHBOARD_DATA: DashboardData = {
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

/**
 * Hook for transforming and filtering registry discovery data.
 *
 * Applies client-side filters (capability search, health) that aren't
 * supported by the API, and transforms the data for dashboard rendering.
 *
 * @param rawData - Raw data from API or mock generator
 * @param filters - Filter parameters to apply
 * @returns Filtered data and dashboard-ready transformed data
 *
 * @example
 * ```tsx
 * const { filteredData, dashboardData, hasNoData } = useRegistryData(
 *   apiData,
 *   { healthFilter, capabilitySearch }
 * );
 *
 * if (hasNoData) {
 *   return <EmptyState />;
 * }
 *
 * return <DashboardRenderer data={dashboardData} />;
 * ```
 */
export function useRegistryData(
  rawData: RegistryDiscoveryData | undefined,
  filters: RegistryDataFilters
): UseRegistryDataReturn {
  const { healthFilter, capabilitySearch } = filters;

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
      return EMPTY_DASHBOARD_DATA;
    }
    return transformRegistryData(filteredData);
  }, [filteredData]);

  // Compute hasNoData flag
  const hasNoData =
    !filteredData || (filteredData.nodes.length === 0 && filteredData.live_instances.length === 0);

  // Compute health badge data for SystemHealthBadge component
  const healthBadgeData = useMemo<HealthBadgeData | null>(() => {
    if (!filteredData) return null;

    return {
      total_nodes: filteredData.summary.total_nodes,
      active_nodes: filteredData.summary.active_nodes,
      failed_nodes: filteredData.summary.failed_nodes,
      pending_nodes: filteredData.summary.pending_nodes,
      by_health: filteredData.summary.by_health,
    };
  }, [filteredData]);

  return {
    filteredData,
    dashboardData,
    hasNoData,
    healthBadgeData,
  };
}
