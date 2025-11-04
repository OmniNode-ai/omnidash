import { useQuery } from '@tanstack/react-query';

// ============================================================================
// Type Definitions
// ============================================================================

export interface Activity {
  id: string;
  timestamp: string | number | Date;
  description: string;
}

export interface UsageExample {
  id: string;
  project: string;
  module: string;
}

export interface AgentDetails {
  name: string;
  status: 'active' | 'idle' | 'error';
  successRate: number;
  responseTime: number;
  tasksCompleted: number;
  currentTask: string | null;
  recentActivity: Activity[];
  metrics?: {
    totalRequests: number;
    avgConfidence: number;
    avgRoutingTime: number;
  };
}

export interface PatternDetails {
  id: string;
  name: string;
  quality: number;
  usage: number;
  usageCount?: number;
  category: string;
  description?: string;
  trend: number;
  usageExamples: UsageExample[];
}

export interface ServiceDetails {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  responseTime: number;
  lastCheck: string;
  details?: Record<string, any>;
}

// ============================================================================
// API Fetch Functions
// ============================================================================

async function fetchAgentDetails(agentName: string, timeWindow: string = '24h'): Promise<AgentDetails> {
  const response = await fetch(`/api/intelligence/agents/${encodeURIComponent(agentName)}/details?timeWindow=${timeWindow}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch agent details: ${response.statusText}`);
  }

  return response.json();
}

async function fetchPatternDetails(patternId: string): Promise<PatternDetails> {
  const response = await fetch(`/api/intelligence/patterns/${encodeURIComponent(patternId)}/details`);

  if (!response.ok) {
    throw new Error(`Failed to fetch pattern details: ${response.statusText}`);
  }

  return response.json();
}

async function fetchServiceDetails(serviceName: string): Promise<ServiceDetails> {
  const response = await fetch(`/api/intelligence/services/${encodeURIComponent(serviceName)}/details`);

  if (!response.ok) {
    throw new Error(`Failed to fetch service details: ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch agent details with real-time updates
 * @param agentName - Name of the agent to fetch details for
 * @param timeWindow - Time window for metrics (default: '24h')
 * @param enabled - Whether to enable the query (default: true)
 */
export function useAgentDetails(
  agentName: string | null,
  timeWindow: string = '24h',
  enabled: boolean = true
) {
  return useQuery<AgentDetails, Error>({
    queryKey: ['agent-details', agentName, timeWindow],
    queryFn: () => fetchAgentDetails(agentName!, timeWindow),
    enabled: enabled && !!agentName,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 30_000, // Refetch every 30 seconds for real-time updates
    retry: 2,
  });
}

/**
 * Hook to fetch pattern details
 * @param patternId - ID of the pattern to fetch details for
 * @param enabled - Whether to enable the query (default: true)
 */
export function usePatternDetails(
  patternId: string | null,
  enabled: boolean = true
) {
  return useQuery<PatternDetails, Error>({
    queryKey: ['pattern-details', patternId],
    queryFn: () => fetchPatternDetails(patternId!),
    enabled: enabled && !!patternId,
    staleTime: 60_000, // 1 minute
    retry: 2,
  });
}

/**
 * Hook to fetch service details
 * @param serviceName - Name of the service to fetch details for
 * @param enabled - Whether to enable the query (default: true)
 */
export function useServiceDetails(
  serviceName: string | null,
  enabled: boolean = true
) {
  return useQuery<ServiceDetails, Error>({
    queryKey: ['service-details', serviceName],
    queryFn: () => fetchServiceDetails(serviceName!),
    enabled: enabled && !!serviceName,
    staleTime: 15_000, // 15 seconds
    refetchInterval: 15_000, // Refetch every 15 seconds for health monitoring
    retry: 2,
  });
}
