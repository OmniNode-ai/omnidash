/**
 * Registry Discovery Routes
 *
 * Express BFF endpoints for the ONEX Node Registry Discovery API.
 * Proxies to the FastAPI infra service (with mock data for development).
 *
 * Routes:
 * - GET /api/registry/discovery     - Full dashboard payload
 * - GET /api/registry/nodes         - Node list with pagination
 * - GET /api/registry/nodes/:id     - Single node detail
 * - GET /api/registry/instances     - Live Consul instances
 * - GET /api/registry/widgets/mapping - Capability -> widget mapping
 * - GET /api/registry/health        - Service health check
 */

import { Router, type Request, type Response } from 'express';
import type {
  NodeType,
  RegistrationState,
  HealthStatus,
  RegistryDiscoveryResponse,
  RegistryNodesResponse,
  RegistryNodeDetailResponse,
  RegistryInstancesResponse,
  RegistryWidgetMappingResponse,
  RegistryHealthResponse,
  RegistryErrorResponse,
  RegistryNodeQueryParams,
  RegistryInstanceQueryParams,
} from '@shared/registry-types';
import {
  generateMockNodes,
  generateMockInstances,
  generateMockSummary,
  filterNodes,
  filterInstances,
  getWidgetMappings,
} from './registry-mock-data';

const router = Router();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create standardized error response with timestamp
 */
function createErrorResponse(error: string, message: string): RegistryErrorResponse {
  return {
    error,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Parse and validate pagination parameters
 */
function parsePaginationParams(req: Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 250);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
  return { limit, offset };
}

/**
 * Set standard cache headers
 */
function setNoCacheHeaders(res: Response): void {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

function setStaticCacheHeaders(res: Response, maxAge: number = 60): void {
  res.set('Cache-Control', `public, max-age=${maxAge}`);
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/registry/discovery
 *
 * Full dashboard payload with nodes, instances, and summary statistics.
 * Supports filtering by state, type, and capability.
 */
router.get('/discovery', (req: Request, res: Response) => {
  try {
    setNoCacheHeaders(res);

    const { limit, offset } = parsePaginationParams(req);

    // Parse filter parameters
    const params: RegistryNodeQueryParams = {
      state: req.query.state as RegistrationState | undefined,
      type: req.query.type as NodeType | undefined,
      capability: req.query.capability as string | undefined,
      namespace: req.query.namespace as string | undefined,
      search: req.query.search as string | undefined,
      limit,
      offset,
    };

    // Generate mock data
    const allNodes = generateMockNodes();
    const allInstances = generateMockInstances(allNodes);

    // Filter nodes first
    const { nodes: filteredNodes, total } = filterNodes(allNodes, params);

    // Filter instances to only include those for returned nodes
    const nodeIds = new Set(filteredNodes.map((n) => n.node_id));
    const filteredInstances = allInstances.filter((i) => nodeIds.has(i.node_id));

    // Generate summary from FILTERED data (not all data)
    const summary = generateMockSummary(filteredNodes, filteredInstances);

    const response: RegistryDiscoveryResponse = {
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

    const params: RegistryNodeQueryParams = {
      state: req.query.state as RegistrationState | undefined,
      type: req.query.type as NodeType | undefined,
      capability: req.query.capability as string | undefined,
      namespace: req.query.namespace as string | undefined,
      search: req.query.search as string | undefined,
      limit,
      offset,
    };

    const allNodes = generateMockNodes();
    const { nodes: filteredNodes, total } = filterNodes(allNodes, params);

    const response: RegistryNodesResponse = {
      timestamp: new Date().toISOString(),
      nodes: filteredNodes,
      pagination: {
        total: allNodes.length,
        filtered: total,
        limit,
        offset,
      },
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
 * Single node detail with associated instances.
 */
router.get('/nodes/:id', (req: Request, res: Response) => {
  try {
    setNoCacheHeaders(res);

    const { id } = req.params;

    const allNodes = generateMockNodes();
    const node = allNodes.find((n) => n.node_id === id || n.name === id);

    if (!node) {
      return res
        .status(404)
        .json(createErrorResponse('not_found', `Node with ID '${id}' not found`));
    }

    const allInstances = generateMockInstances(allNodes);
    const nodeInstances = allInstances.filter((i) => i.node_id === node.node_id);

    const response: RegistryNodeDetailResponse = {
      timestamp: new Date().toISOString(),
      node,
      instances: nodeInstances,
    };

    res.json(response);
  } catch (error) {
    console.error('[registry-routes] Error in /nodes/:id:', error);
    res.status(500).json(createErrorResponse('internal_error', 'Failed to fetch node details'));
  }
});

/**
 * GET /api/registry/instances
 *
 * Live Consul service instances with filtering.
 */
router.get('/instances', (req: Request, res: Response) => {
  try {
    setNoCacheHeaders(res);

    const { limit, offset } = parsePaginationParams(req);

    const params: RegistryInstanceQueryParams = {
      node_id: req.query.node_id as string | undefined,
      service_name: req.query.service_name as string | undefined,
      health_status: req.query.health_status as HealthStatus | undefined,
      limit,
      offset,
    };

    const allNodes = generateMockNodes();
    const allInstances = generateMockInstances(allNodes);
    const { instances: filteredInstances, total } = filterInstances(allInstances, params);

    const response: RegistryInstancesResponse = {
      timestamp: new Date().toISOString(),
      instances: filteredInstances,
      pagination: {
        total: allInstances.length,
        filtered: total,
        limit,
        offset,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('[registry-routes] Error in /instances:', error);
    res.status(500).json(createErrorResponse('internal_error', 'Failed to fetch instances'));
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

    const response: RegistryWidgetMappingResponse = {
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
 * Service health check for upstream dependencies.
 * In mock mode, simulates healthy services.
 */
router.get('/health', (_req: Request, res: Response) => {
  try {
    setNoCacheHeaders(res);

    // In mock mode, simulate healthy services with realistic latencies
    const postgresLatency = 5 + Math.floor(Math.random() * 10);
    const consulLatency = 3 + Math.floor(Math.random() * 8);

    const response: RegistryHealthResponse = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      services: {
        postgres: 'healthy',
        consul: 'healthy',
      },
      latency_ms: {
        postgres: postgresLatency,
        consul: consulLatency,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('[registry-routes] Error in /health:', error);
    res.status(500).json(createErrorResponse('internal_error', 'Health check failed'));
  }
});

export default router;
