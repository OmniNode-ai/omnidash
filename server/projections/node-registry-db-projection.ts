/**
 * NodeRegistryDbProjection — DB-backed projection for node registry (OMN-7127)
 *
 * Projects from: ReadModelConsumer node registration handlers (OMN-7126)
 * Source table:  node_service_registry (populated by platform-projections.ts)
 *
 * Snapshot payload shape:
 *   NodeRegistryPayload { nodes, recentStateChanges, stats }
 *
 * Routes access this via nodeRegistryDbProjection.ensureFresh()
 * — no direct DB imports allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';
import type {
  NodeState,
  NodeRegistryPayload,
  NodeRegistryStats,
  NodeType,
  RegistrationState,
} from '@shared/projection-types';

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

// ============================================================================
// Row-to-NodeState mapping
// ============================================================================

interface NodeServiceRegistryRow {
  service_name: string;
  service_url: string;
  service_type: string | null;
  health_status: string;
  last_health_check: string | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  updated_at: string | null;
}

function mapRowToNodeState(row: NodeServiceRegistryRow): NodeState {
  const nodeType = normalizeNodeType(row.service_type);
  const state = normalizeRegistrationState(row.health_status, row.is_active);

  return {
    nodeId: row.service_name,
    nodeType,
    state,
    version: '1.0.0',
    uptimeSeconds: 0,
    lastSeen: row.last_health_check ?? row.updated_at ?? new Date().toISOString(),
    metadata: row.metadata
      ? {
          environment: (row.metadata.environment as string) ?? undefined,
          region: (row.metadata.region as string) ?? undefined,
          cluster: (row.metadata.cluster as string) ?? undefined,
          description: (row.metadata.description as string) ?? undefined,
          node_name: (row.metadata.node_name as string) ?? undefined,
        }
      : undefined,
    capabilities: row.metadata?.capabilities
      ? {
          declared: Array.isArray(row.metadata.capabilities)
            ? (row.metadata.capabilities as string[])
            : undefined,
        }
      : undefined,
  };
}

function normalizeNodeType(serviceType: string | null): NodeType {
  if (!serviceType) return 'COMPUTE';
  const upper = serviceType.toUpperCase();
  const valid: NodeType[] = ['EFFECT', 'COMPUTE', 'REDUCER', 'ORCHESTRATOR', 'SERVICE'];
  if (valid.includes(upper as NodeType)) return upper as NodeType;
  return 'COMPUTE';
}

function normalizeRegistrationState(healthStatus: string, isActive: boolean): RegistrationState {
  if (isActive) return 'active';
  const lower = healthStatus.toLowerCase();
  if (lower === 'active') return 'active';
  if (lower === 'liveness_expired') return 'liveness_expired';
  if (lower === 'rejected') return 'rejected';
  return 'pending_registration';
}

// ============================================================================
// Projection
// ============================================================================

export class NodeRegistryDbProjection extends DbBackedProjectionView<NodeRegistryPayload> {
  readonly viewId = 'node-registry';

  protected emptyPayload(): NodeRegistryPayload {
    return {
      nodes: [],
      recentStateChanges: [],
      stats: { totalNodes: 0, activeNodes: 0, byState: {} },
    };
  }

  protected async querySnapshot(db: Db): Promise<NodeRegistryPayload> {
    try {
      const result = await db.execute(sql`
        SELECT
          service_name,
          service_url,
          service_type,
          health_status,
          last_health_check::text,
          metadata,
          is_active,
          updated_at::text
        FROM node_service_registry
        WHERE is_active = true
        ORDER BY updated_at DESC
      `);

      const rows = (result.rows ?? []) as unknown as NodeServiceRegistryRow[];
      const nodes = rows.map(mapRowToNodeState);

      const stats = computeStats(nodes);

      return {
        nodes,
        recentStateChanges: [],
        stats,
      };
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('node_service_registry') && msg.includes('does not exist'))
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}

function computeStats(nodes: NodeState[]): NodeRegistryStats {
  const byState: Record<string, number> = {};
  let activeNodes = 0;

  for (const node of nodes) {
    byState[node.state] = (byState[node.state] ?? 0) + 1;
    if (node.state === 'active') activeNodes++;
  }

  return {
    totalNodes: nodes.length,
    activeNodes,
    byState,
  };
}
