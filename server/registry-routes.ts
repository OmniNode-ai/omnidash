/**
 * Registry Discovery Routes (OMN-2320)
 *
 * Express BFF endpoints for the ONEX Node Registry Discovery API.
 * Primary data source: NodeRegistryProjection (server-side materialized view).
 * Fallback: MockDataStore when DEMO_MODE=true and projection is empty.
 *
 * Routes:
 * - GET /api/registry/discovery     - Full dashboard payload
 * - GET /api/registry/nodes         - Node list with pagination
 * - GET /api/registry/nodes/:id     - Single node detail
 * - GET /api/registry/widgets/mapping - Capability -> widget mapping
 * - GET /api/registry/health        - Service health check
 */

import { Router, type Request, type Response } from 'express';
import type { NodeType, RegistrationState, NodeState } from '@shared/projection-types';
import { projectionService } from './projection-bootstrap';
import type { NodeRegistryProjection } from './projections/node-registry-projection';

// DEMO_MODE imports — only used when DEMO_MODE=true and projection is empty
import { mockDataStore, filterNodes, getWidgetMappings } from './registry-mock-data';
import type { RegistryNodeView, RegistryErrorResponse } from '@shared/registry-types';

const router = Router();

// ============================================================================
// Projection access
// ============================================================================

/** Retrieve the materialized node-registry projection, if bootstrapped. */
function getProjection(): NodeRegistryProjection | undefined {
  return projectionService.getView('node-registry') as NodeRegistryProjection | undefined;
}

/**
 * Check if we should use mock data (DEMO_MODE=true and projection has no nodes).
 */
function shouldUseMockData(projection: NodeRegistryProjection | undefined): boolean {
  if (process.env.DEMO_MODE !== 'true') return false;
  if (!projection) return true;
  const snapshot = projection.getSnapshot();
  return (snapshot.payload?.nodes?.length ?? 0) === 0;
}

// ============================================================================
// Adapter: NodeState -> RegistryNodeView-like shape for backward compat
// ============================================================================

/**
 * Adapt projection NodeState to the response shape the frontend expects.
 * Uses snake_case keys matching the existing API contract.
 */
function adaptNodeState(node: NodeState): Record<string, unknown> {
  // Flatten capabilities for the capabilities array the frontend table/grid expects.
  // Use a Set for consistent O(1) deduplication across all three sources.
  const capSet = new Set<string>();
  if (node.capabilities?.declared) {
    for (const c of node.capabilities.declared) capSet.add(c);
  }
  if (node.capabilities?.discovered) {
    for (const c of node.capabilities.discovered) capSet.add(c);
  }
  if (node.capabilities?.contract) {
    for (const c of node.capabilities.contract) capSet.add(c);
  }
  const flatCapabilities = Array.from(capSet);

  return {
    node_id: node.nodeId,
    name: node.nodeId, // projection does not have a separate name; use nodeId
    service_name: node.nodeId,
    namespace: node.metadata?.cluster ?? null,
    display_name: node.nodeId,
    node_type: node.nodeType,
    version: node.version,
    state: node.state,
    capabilities: flatCapabilities,
    registered_at: node.lastSeen,
    last_heartbeat_at: node.lastSeen,
    // Extended fields from projection
    uptime_seconds: node.uptimeSeconds,
    last_seen: node.lastSeen,
    memory_usage_mb: node.memoryUsageMb,
    cpu_usage_percent: node.cpuUsagePercent,
    endpoints: node.endpoints,
    metadata: node.metadata,
    reason: node.reason,
    structured_capabilities: node.capabilities,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Build a timestamped error response conforming to RegistryErrorResponse. */
function createErrorResponse(error: string, message: string): RegistryErrorResponse {
  return {
    error,
    message,
    timestamp: new Date().toISOString(),
  };
}

/** Extract and clamp limit/offset pagination params from the query string. */
function parsePaginationParams(req: Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 250);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
  return { limit, offset };
}

/** Set response headers to prevent any client or proxy caching. */
function setNoCacheHeaders(res: Response): void {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

/** Set public Cache-Control header for cacheable responses. */
function setStaticCacheHeaders(res: Response, maxAge: number = 60): void {
  res.set('Cache-Control', `public, max-age=${maxAge}`);
}

// ============================================================================
// State classification helpers
// ============================================================================

const PENDING_STATES: RegistrationState[] = [
  'pending_registration',
  'accepted',
  'awaiting_ack',
  'ack_received',
];

const FAILED_STATES: RegistrationState[] = ['ack_timed_out', 'liveness_expired', 'rejected'];

/** Normalize states: mock data uses UPPER_CASE, projection uses lowercase */
function normalizeState(state: string): RegistrationState {
  return state.toLowerCase() as RegistrationState;
}

/** Return true if the normalized state equals 'active'. */
function isActiveState(state: string): boolean {
  return normalizeState(state) === 'active';
}

/** Return true if the state is in the pending registration lifecycle (pre-active). */
function isPendingState(state: string): boolean {
  return PENDING_STATES.includes(normalizeState(state));
}

/** Return true if the state indicates a terminal failure (timeout, expiry, rejection). */
function isFailedState(state: string): boolean {
  return FAILED_STATES.includes(normalizeState(state));
}

// ============================================================================
// Filtering helpers for projection nodes
// ============================================================================

interface FilterParams {
  state?: string;
  type?: string;
  capability?: string;
  namespace?: string;
  search?: string;
}

/** Apply query-string filters (state, type, capability, namespace, search) to projection nodes. */
function filterProjectionNodes(nodes: NodeState[], params: FilterParams): NodeState[] {
  let filtered = nodes;

  if (params.state) {
    const target = normalizeState(params.state);
    filtered = filtered.filter((n) => n.state === target);
  }

  if (params.type) {
    const targetType = params.type.toUpperCase();
    filtered = filtered.filter((n) => n.nodeType === targetType);
  }

  if (params.capability) {
    const cap = params.capability.toLowerCase();
    filtered = filtered.filter((n) => {
      const caps = n.capabilities;
      if (!caps) return false;
      return (
        caps.declared?.some((c) => c.toLowerCase() === cap) ||
        caps.discovered?.some((c) => c.toLowerCase() === cap) ||
        caps.contract?.some((c) => c.toLowerCase() === cap)
      );
    });
  }

  if (params.namespace) {
    const target = params.namespace.toLowerCase();
    filtered = filtered.filter((n) => (n.metadata?.cluster ?? '').toLowerCase() === target);
  }

  if (params.search) {
    const searchLower = params.search.toLowerCase();
    filtered = filtered.filter((n) => n.nodeId.toLowerCase().includes(searchLower));
  }

  return filtered;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/registry/discovery
 *
 * Full dashboard payload with nodes, summary statistics.
 * Supports filtering by state, type, and capability.
 */
router.get('/discovery', (req: Request, res: Response) => {
  try {
    setNoCacheHeaders(res);

    const { limit, offset } = parsePaginationParams(req);
    const projection = getProjection();

    // DEMO_MODE fallback: use mock data when projection is empty
    if (shouldUseMockData(projection)) {
      return serveMockDiscovery(req, res, limit, offset);
    }

    if (!projection) {
      return res
        .status(503)
        .json(createErrorResponse('service_unavailable', 'Node registry projection not ready'));
    }

    const snapshot = projection.getSnapshot();
    const allNodes = snapshot.payload.nodes;
    const _stats = snapshot.payload.stats; // reserved for future stats endpoint

    // Apply filters
    const params: FilterParams = {
      state: req.query.state as string | undefined,
      type: req.query.type as string | undefined,
      capability: req.query.capability as string | undefined,
      namespace: req.query.namespace as string | undefined,
      search: req.query.search as string | undefined,
    };

    const filteredNodes = filterProjectionNodes(allNodes, params);

    // Paginate
    const paginatedNodes = filteredNodes.slice(offset, offset + limit);

    // Compute summary from filtered data
    const byType: Record<string, number> = {};
    let activeNodes = 0;
    let pendingNodes = 0;
    let failedNodes = 0;

    for (const node of filteredNodes) {
      byType[node.nodeType] = (byType[node.nodeType] ?? 0) + 1;
      if (isActiveState(node.state)) activeNodes++;
      else if (isPendingState(node.state)) pendingNodes++;
      else if (isFailedState(node.state)) failedNodes++;
    }

    const summary = {
      total_nodes: filteredNodes.length,
      active_nodes: activeNodes,
      pending_nodes: pendingNodes,
      failed_nodes: failedNodes,
      unhealthy_instances: 0, // Instances not tracked in projection
      by_type: byType,
      by_health: { passing: 0, warning: 0, critical: 0, unknown: 0 },
    };

    const response = {
      timestamp: new Date().toISOString(),
      warnings: [],
      summary,
      nodes: paginatedNodes.map(adaptNodeState),
      live_instances: [], // Instances are not part of the projection
      pagination: {
        total: allNodes.length,
        filtered: filteredNodes.length,
        limit,
        offset,
      },
      source: 'projection',
    };

    res.json(response);
  } catch (error) {
    console.error('[registry-routes] Error in /discovery:', error);
    res.status(500).json(createErrorResponse('internal_error', 'Failed to fetch discovery data'));
  }
});

/**
 * GET /api/registry/nodes
 *
 * Node list with filtering and pagination.
 */
router.get('/nodes', (req: Request, res: Response) => {
  try {
    setNoCacheHeaders(res);

    const { limit, offset } = parsePaginationParams(req);
    const projection = getProjection();

    if (shouldUseMockData(projection)) {
      return serveMockNodes(req, res, limit, offset);
    }

    if (!projection) {
      return res
        .status(503)
        .json(createErrorResponse('service_unavailable', 'Node registry projection not ready'));
    }

    const snapshot = projection.getSnapshot();
    const allNodes = snapshot.payload.nodes;

    const params: FilterParams = {
      state: req.query.state as string | undefined,
      type: req.query.type as string | undefined,
      capability: req.query.capability as string | undefined,
      namespace: req.query.namespace as string | undefined,
      search: req.query.search as string | undefined,
    };

    const filteredNodes = filterProjectionNodes(allNodes, params);
    const paginatedNodes = filteredNodes.slice(offset, offset + limit);

    const response = {
      timestamp: new Date().toISOString(),
      nodes: paginatedNodes.map(adaptNodeState),
      pagination: {
        total: allNodes.length,
        filtered: filteredNodes.length,
        limit,
        offset,
      },
      source: 'projection',
    };

    res.json(response);
  } catch (error) {
    console.error('[registry-routes] Error in /nodes:', error);
    res.status(500).json(createErrorResponse('internal_error', 'Failed to fetch nodes'));
  }
});

/**
 * GET /api/registry/nodes/:id
 *
 * Single node detail. Looks up strictly by node_id (UUID) in both projection
 * and mock modes. Name-based lookup is intentionally not supported here;
 * use the `search` query parameter on GET /api/registry/nodes instead.
 */
router.get('/nodes/:id', (req: Request, res: Response) => {
  try {
    setNoCacheHeaders(res);

    const { id } = req.params;
    const projection = getProjection();

    if (shouldUseMockData(projection)) {
      return serveMockNodeDetail(req, res, id);
    }

    if (!projection) {
      return res
        .status(503)
        .json(createErrorResponse('service_unavailable', 'Node registry projection not ready'));
    }

    const snapshot = projection.getSnapshot();
    // Lookup by nodeId only -- consistent with mock mode (see serveMockNodeDetail).
    // NodeState has no separate name field, so name-based lookup is not possible.
    const node = snapshot.payload.nodes.find((n) => n.nodeId === id);

    if (!node) {
      return res
        .status(404)
        .json(createErrorResponse('not_found', `Node with ID '${id}' not found`));
    }

    const response = {
      timestamp: new Date().toISOString(),
      node: adaptNodeState(node),
      instances: [], // Instances not tracked in projection
      source: 'projection',
    };

    res.json(response);
  } catch (error) {
    console.error('[registry-routes] Error in /nodes/:id:', error);
    res.status(500).json(createErrorResponse('internal_error', 'Failed to fetch node details'));
  }
});

/**
 * GET /api/registry/widgets/mapping
 *
 * Static capability-to-widget mapping configuration.
 * Cacheable for 60 seconds.
 */
router.get('/widgets/mapping', (_req: Request, res: Response) => {
  try {
    setStaticCacheHeaders(res, 60);

    const mappings = getWidgetMappings();

    const response = {
      timestamp: new Date().toISOString(),
      mappings,
      version: '1.0.0',
    };

    res.json(response);
  } catch (error) {
    console.error('[registry-routes] Error in /widgets/mapping:', error);
    res.status(500).json(createErrorResponse('internal_error', 'Failed to fetch widget mappings'));
  }
});

/**
 * GET /api/registry/health
 *
 * Service health check. Reports projection health when available.
 */
router.get('/health', (_req: Request, res: Response) => {
  try {
    setNoCacheHeaders(res);

    const projection = getProjection();
    const hasProjectionData = projection
      ? projection.getSnapshot().payload.nodes.length > 0
      : false;

    const response = {
      timestamp: new Date().toISOString(),
      status: 'healthy' as const,
      services: {
        projection: hasProjectionData ? ('healthy' as const) : ('degraded' as const),
      },
      source: hasProjectionData
        ? 'projection'
        : process.env.DEMO_MODE === 'true'
          ? 'mock'
          : 'empty',
    };

    res.json(response);
  } catch (error) {
    console.error('[registry-routes] Error in /health:', error);
    res.status(500).json(createErrorResponse('internal_error', 'Health check failed'));
  }
});

// ============================================================================
// DEMO_MODE mock fallback handlers
// ============================================================================

/** DEMO_MODE fallback: serve the full discovery payload from the mock data store. */
function serveMockDiscovery(req: Request, res: Response, limit: number, offset: number): void {
  const allNodes = mockDataStore.getNodes();
  const allInstances = mockDataStore.getInstances();

  const params = {
    state: req.query.state as RegistryNodeView['state'] | undefined,
    type: req.query.type as NodeType | undefined,
    capability: req.query.capability as string | undefined,
    namespace: req.query.namespace as string | undefined,
    search: req.query.search as string | undefined,
    limit,
    offset,
  };

  const { nodes: filteredNodes, total } = filterNodes(allNodes, params);
  const nodeIds = new Set(filteredNodes.map((n) => n.node_id));
  const filteredInstances = allInstances.filter((i) => nodeIds.has(i.node_id));

  const byType: Record<string, number> = {
    EFFECT: 0,
    COMPUTE: 0,
    REDUCER: 0,
    ORCHESTRATOR: 0,
    SERVICE: 0,
  };
  const byHealth: Record<string, number> = {
    passing: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
  };
  let activeNodes = 0,
    pendingNodes = 0,
    failedNodes = 0;

  for (const node of filteredNodes) {
    byType[node.node_type] = (byType[node.node_type] ?? 0) + 1;
    if (node.state === 'ACTIVE') activeNodes++;
    else if (
      ['PENDING_REGISTRATION', 'ACCEPTED', 'AWAITING_ACK', 'ACK_RECEIVED'].includes(node.state)
    )
      pendingNodes++;
    else if (['ACK_TIMED_OUT', 'LIVENESS_EXPIRED', 'REJECTED'].includes(node.state)) failedNodes++;
  }
  for (const instance of filteredInstances) {
    byHealth[instance.health_status] = (byHealth[instance.health_status] ?? 0) + 1;
  }

  const summary = {
    total_nodes: filteredNodes.length,
    active_nodes: activeNodes,
    pending_nodes: pendingNodes,
    failed_nodes: failedNodes,
    unhealthy_instances: (byHealth.critical ?? 0) + (byHealth.warning ?? 0),
    by_type: byType,
    by_health: byHealth,
  };

  res.json({
    timestamp: new Date().toISOString(),
    warnings: [],
    summary,
    nodes: filteredNodes,
    live_instances: filteredInstances,
    pagination: {
      total: allNodes.length,
      filtered: total,
      limit,
      offset,
    },
    source: 'mock',
  });
}

/** DEMO_MODE fallback: serve a filtered, paginated node list from mock data. */
function serveMockNodes(req: Request, res: Response, limit: number, offset: number): void {
  const allNodes = mockDataStore.getNodes();

  const params = {
    state: req.query.state as RegistryNodeView['state'] | undefined,
    type: req.query.type as NodeType | undefined,
    capability: req.query.capability as string | undefined,
    namespace: req.query.namespace as string | undefined,
    search: req.query.search as string | undefined,
    limit,
    offset,
  };

  const { nodes: filteredNodes, total } = filterNodes(allNodes, params);

  res.json({
    timestamp: new Date().toISOString(),
    nodes: filteredNodes,
    pagination: {
      total: allNodes.length,
      filtered: total,
      limit,
      offset,
    },
    source: 'mock',
  });
}

/** DEMO_MODE fallback: serve a single node detail with its instances from mock data. */
function serveMockNodeDetail(_req: Request, res: Response, id: string): void {
  const allNodes = mockDataStore.getNodes();
  // Lookup by node_id only -- consistent with projection mode which matches
  // on nodeId. NodeState has no separate name field, so name-based lookup
  // would be a mock-only behavior that silently breaks when switching modes.
  const node = allNodes.find((n) => n.node_id === id);

  if (!node) {
    res.status(404).json(createErrorResponse('not_found', `Node with ID '${id}' not found`));
    return;
  }

  const allInstances = mockDataStore.getInstances();
  const nodeInstances = allInstances.filter((i) => i.node_id === node.node_id);

  res.json({
    timestamp: new Date().toISOString(),
    node,
    instances: nodeInstances,
    source: 'mock',
  });
}

export default router;
