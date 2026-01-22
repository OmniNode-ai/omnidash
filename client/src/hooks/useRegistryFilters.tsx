/**
 * useRegistryFilters Hook
 *
 * Manages filter state for the Registry Discovery dashboard.
 * Extracts filter logic from RegistryDiscovery.tsx for better separation of concerns.
 *
 * Features:
 * - Type, state, health, and capability search filters
 * - Memoized filter configurations for FilterBar component
 * - Clear all filters callback
 * - Computed hasFilters flag
 */

import { useState, useMemo, useCallback, useRef, type RefObject } from 'react';
import type { FilterConfig } from '@/components/FilterBar';
import { NODE_TYPE_CONFIG, NODE_STATE_CONFIG } from '@/components/NodeDetailPanel';
import type { NodeType, NodeState, HealthStatus } from '@/lib/configs/registry-discovery-dashboard';
import { cn } from '@/lib/utils';

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

/**
 * Format a raw state name (e.g., "PENDING_REGISTRATION") to a readable label (e.g., "Pending Registration")
 * Used as fallback when NODE_STATE_CONFIG doesn't have a label for a state
 */
function formatStateName(state: string): string {
  return state
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Filter state values
 */
export interface RegistryFilterState {
  typeFilter: string | undefined;
  stateFilter: string | undefined;
  healthFilter: string | undefined;
  capabilitySearch: string;
}

/**
 * Filter setters
 */
export interface RegistryFilterSetters {
  setTypeFilter: (value: string | undefined) => void;
  setStateFilter: (value: string | undefined) => void;
  setHealthFilter: (value: string | undefined) => void;
  setCapabilitySearch: (value: string) => void;
}

/**
 * Return type for useRegistryFilters hook
 */
export interface UseRegistryFiltersReturn extends RegistryFilterState, RegistryFilterSetters {
  /** Memoized filter configurations for FilterBar component */
  filterConfigs: FilterConfig[];
  /** Clear all filters */
  clearFilters: () => void;
  /** Whether any filters are currently active */
  hasFilters: boolean;
  /** Ref for capability search input (for keyboard shortcut focus) */
  capabilityInputRef: RefObject<HTMLInputElement>;
}

/**
 * Hook for managing registry discovery filters.
 *
 * Provides filter state, setters, memoized configurations, and utilities
 * for the Registry Discovery dashboard filtering functionality.
 *
 * @example
 * ```tsx
 * const {
 *   typeFilter,
 *   stateFilter,
 *   healthFilter,
 *   capabilitySearch,
 *   filterConfigs,
 *   clearFilters,
 *   hasFilters,
 *   capabilityInputRef,
 * } = useRegistryFilters();
 *
 * // Use with FilterBar component
 * <FilterBar
 *   filters={filterConfigs}
 *   onClear={clearFilters}
 *   hasActiveFilters={hasFilters}
 *   ...
 * />
 * ```
 */
export function useRegistryFilters(): UseRegistryFiltersReturn {
  // Filter state
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [healthFilter, setHealthFilter] = useState<string | undefined>(undefined);
  const [capabilitySearch, setCapabilitySearch] = useState('');

  // Ref for capability search input (for keyboard shortcut)
  const capabilityInputRef = useRef<HTMLInputElement>(null);

  // Computed hasFilters flag
  const hasFilters = !!(typeFilter || stateFilter || healthFilter || capabilitySearch.trim());

  // Clear all filters callback
  const clearFilters = useCallback(() => {
    setTypeFilter(undefined);
    setStateFilter(undefined);
    setHealthFilter(undefined);
    setCapabilitySearch('');
  }, []);

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
          label: NODE_STATE_CONFIG[state]?.label || formatStateName(state),
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

  return {
    // State
    typeFilter,
    stateFilter,
    healthFilter,
    capabilitySearch,
    // Setters
    setTypeFilter,
    setStateFilter,
    setHealthFilter,
    setCapabilitySearch,
    // Derived
    filterConfigs,
    clearFilters,
    hasFilters,
    capabilityInputRef,
  };
}
