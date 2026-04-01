/**
 * Tests for PlatformProjectionHandler node registration handlers (OMN-7126)
 *
 * Verifies:
 * - Introspection inserts active node with metadata
 * - Heartbeat updates liveness without clobbering metadata
 * - State-change updates is_active without clobbering capabilities
 * - Missing optional fields don't wipe existing values
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformProjectionHandler } from '../consumers/read-model/platform-projections';
import {
  SUFFIX_NODE_INTROSPECTION,
  SUFFIX_NODE_HEARTBEAT,
  SUFFIX_NODE_STATE_CHANGE,
} from '@shared/topics';
import type { ProjectionContext, MessageMeta } from '../consumers/read-model/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw SQL string from a drizzle sql`` tagged template.
 * Drizzle SQL objects have a `queryChunks` array of {value} objects
 * interleaved with SQL string chunks. We stringify the whole thing
 * to get a searchable representation.
 */
function extractSqlText(callArgs: unknown[]): string {
  // The drizzle sql`` object is the first argument to db.execute()
  return JSON.stringify(callArgs[0]);
}

function createMockDb() {
  const calls: unknown[][] = [];
  const db = {
    execute: vi.fn(async (...args: unknown[]) => {
      calls.push(args);
    }),
  };
  return { db, calls };
}

function makeMeta(partition = 0, offset = '0'): MessageMeta {
  return { partition, offset, fallbackId: `fallback-${partition}-${offset}` };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlatformProjectionHandler — node registration (OMN-7126)', () => {
  let handler: PlatformProjectionHandler;

  beforeEach(() => {
    handler = new PlatformProjectionHandler();
  });

  describe('canHandle', () => {
    it('accepts node-introspection topic', () => {
      expect(handler.canHandle(SUFFIX_NODE_INTROSPECTION)).toBe(true);
    });

    it('accepts node-heartbeat topic', () => {
      expect(handler.canHandle(SUFFIX_NODE_HEARTBEAT)).toBe(true);
    });

    it('accepts node-state-change topic', () => {
      expect(handler.canHandle(SUFFIX_NODE_STATE_CHANGE)).toBe(true);
    });
  });

  describe('projectNodeIntrospectionEvent', () => {
    it('inserts a node with full metadata via ON CONFLICT upsert', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const data = {
        node_id: 'node-abc-123',
        service_url: 'http://localhost:8085',
        node_type: 'EFFECT',
        health_status: 'active',
        metadata: { environment: 'local', description: 'Test node' },
      };

      const result = await handler.projectEvent(
        SUFFIX_NODE_INTROSPECTION,
        data,
        context,
        makeMeta()
      );

      expect(result).toBe(true);
      expect(db.execute).toHaveBeenCalledTimes(1);

      // Verify the SQL shape by stringifying the drizzle sql object
      const sqlStr = extractSqlText(calls[0]);
      expect(sqlStr).toContain('INSERT INTO node_service_registry');
      expect(sqlStr).toContain('ON CONFLICT (service_name) DO UPDATE');
      expect(sqlStr).toContain('service_url = EXCLUDED.service_url');
      expect(sqlStr).toContain('metadata = EXCLUDED.metadata');
    });

    it('uses service_name over node_name and node_id when all provided', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const data = {
        service_name: 'my-custom-service',
        node_name: 'my-node',
        node_id: 'node-abc-123',
        service_url: 'http://localhost:8085',
      };

      await handler.projectEvent(SUFFIX_NODE_INTROSPECTION, data, context, makeMeta());

      const sqlStr = extractSqlText(calls[0]);
      expect(sqlStr).toContain('my-custom-service');
    });

    it('prefers node_name over node_id when service_name is absent (OMN-6405)', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const data = {
        node_name: 'intent_classifier',
        node_id: 'eec09dd8-3057-5625-b276-3e798d97ec5d',
        node_type: 'compute',
      };

      await handler.projectEvent(SUFFIX_NODE_INTROSPECTION, data, context, makeMeta());

      const sqlStr = extractSqlText(calls[0]);
      expect(sqlStr).toContain('intent_classifier');
      // node_id should be stored in metadata, not used as service_name
      expect(sqlStr).toContain('eec09dd8-3057-5625-b276-3e798d97ec5d');
    });

    it('stores node_name in metadata even when falling back to node_id (OMN-6405)', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      // Simulate current upstream: node_name is null, only node_id present
      const data = {
        node_id: 'eec09dd8-3057-5625-b276-3e798d97ec5d',
        node_type: 'orchestrator',
        metadata: { environment: 'local' },
      };

      await handler.projectEvent(SUFFIX_NODE_INTROSPECTION, data, context, makeMeta());

      const sqlStr = extractSqlText(calls[0]);
      // node_id should be stored in metadata for display fallback
      expect(sqlStr).toContain('node_id');
      expect(sqlStr).toContain('eec09dd8-3057-5625-b276-3e798d97ec5d');
    });

    it('skips when service_name/node_id is missing', async () => {
      const { db } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const result = await handler.projectEvent(
        SUFFIX_NODE_INTROSPECTION,
        { some_other_field: 'value' },
        context,
        makeMeta()
      );

      expect(result).toBe(true); // returns true (skip, don't block watermark)
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('returns false when DB is unavailable', async () => {
      const context: ProjectionContext = { db: null };

      const result = await handler.projectEvent(
        SUFFIX_NODE_INTROSPECTION,
        { node_id: 'node-1' },
        context,
        makeMeta()
      );

      expect(result).toBe(false);
    });

    it('handles missing table gracefully', async () => {
      const db = {
        execute: vi.fn(async () => {
          const err = new Error('relation "node_service_registry" does not exist');
          (err as unknown as { code: string }).code = '42P01';
          throw err;
        }),
      };
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const result = await handler.projectEvent(
        SUFFIX_NODE_INTROSPECTION,
        { node_id: 'node-1', service_url: 'http://localhost' },
        context,
        makeMeta()
      );

      expect(result).toBe(true); // graceful degrade
    });
  });

  describe('projectNodeHeartbeatEvent', () => {
    it('updates only liveness fields (health_status, last_health_check)', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const data = {
        node_id: 'node-abc-123',
        health_status: 'healthy',
      };

      const result = await handler.projectEvent(SUFFIX_NODE_HEARTBEAT, data, context, makeMeta());

      expect(result).toBe(true);
      expect(db.execute).toHaveBeenCalledTimes(1);

      const sqlStr = extractSqlText(calls[0]);
      // Must use UPDATE, not INSERT
      expect(sqlStr).toContain('UPDATE node_service_registry');
      expect(sqlStr).toContain('health_status');
      expect(sqlStr).toContain('last_health_check');
      // Must NOT touch metadata or capabilities
      expect(sqlStr).not.toContain('metadata');
      expect(sqlStr).not.toContain('service_type');
      expect(sqlStr).not.toContain('is_active');
    });

    it('defaults health_status to healthy when not provided', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      await handler.projectEvent(
        SUFFIX_NODE_HEARTBEAT,
        { node_id: 'node-abc' },
        context,
        makeMeta()
      );

      const sqlStr = extractSqlText(calls[0]);
      expect(sqlStr).toContain('healthy');
    });
  });

  describe('projectNodeStateChangeEvent', () => {
    it('updates state and is_active without clobbering capabilities', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const data = {
        node_id: 'node-abc-123',
        new_state: 'active',
      };

      const result = await handler.projectEvent(
        SUFFIX_NODE_STATE_CHANGE,
        data,
        context,
        makeMeta()
      );

      expect(result).toBe(true);
      expect(db.execute).toHaveBeenCalledTimes(1);

      const sqlStr = extractSqlText(calls[0]);
      expect(sqlStr).toContain('UPDATE node_service_registry');
      expect(sqlStr).toContain('health_status');
      expect(sqlStr).toContain('is_active');
      // Must NOT touch metadata or capabilities
      expect(sqlStr).not.toContain('metadata');
      expect(sqlStr).not.toContain('service_type');
      expect(sqlStr).not.toContain('service_url');
    });

    it('sets is_active=true when new_state is active', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      await handler.projectEvent(
        SUFFIX_NODE_STATE_CHANGE,
        { node_id: 'node-1', new_state: 'active' },
        context,
        makeMeta()
      );

      const sqlStr = extractSqlText(calls[0]);
      // The boolean true should be serialized in the SQL params
      expect(sqlStr).toContain('true');
    });

    it('sets is_active=false when new_state is not active', async () => {
      const { db, calls } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      await handler.projectEvent(
        SUFFIX_NODE_STATE_CHANGE,
        { node_id: 'node-1', new_state: 'liveness_expired' },
        context,
        makeMeta()
      );

      const sqlStr = extractSqlText(calls[0]);
      expect(sqlStr).toContain('false');
      expect(sqlStr).toContain('liveness_expired');
    });
  });

  describe('missing optional fields', () => {
    it('introspection with minimal fields does not fail', async () => {
      const { db } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const result = await handler.projectEvent(
        SUFFIX_NODE_INTROSPECTION,
        { node_id: 'minimal-node' },
        context,
        makeMeta()
      );

      expect(result).toBe(true);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('heartbeat for unknown node succeeds (no-op UPDATE)', async () => {
      const { db } = createMockDb();
      const context: ProjectionContext = { db: db as unknown as ProjectionContext['db'] };

      const result = await handler.projectEvent(
        SUFFIX_NODE_HEARTBEAT,
        { node_id: 'unknown-node' },
        context,
        makeMeta()
      );

      expect(result).toBe(true);
    });
  });
});
