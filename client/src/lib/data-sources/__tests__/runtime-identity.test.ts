import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockResponse,
  setupFetchMock,
  resetFetchMock,
} from '../../../tests/utils/mock-fetch';

/**
 * Runtime Identity API response interface
 * Matches the response from GET /api/intelligence/runtime/identity
 */
export interface RuntimeIdentityResponse {
  node_id: string | null;
  contract_fingerprint: string | null;
  runtime_mode: string;
  env: string;
  supervised: boolean;
  supervisor_pid: string | null;
  injected_at: string | null;
}

/**
 * Helper function to fetch runtime identity
 */
async function fetchRuntimeIdentity(): Promise<RuntimeIdentityResponse> {
  const response = await fetch('/api/intelligence/runtime/identity');
  if (!response.ok) {
    throw new Error(`Failed to fetch runtime identity: ${response.statusText}`);
  }
  return response.json();
}

describe('Runtime Identity API', () => {
  beforeEach(() => {
    resetFetchMock();
    vi.clearAllMocks();
  });

  describe('GET /api/intelligence/runtime/identity', () => {
    it('should return identity with default standalone mode when no env vars set', async () => {
      const mockIdentity: RuntimeIdentityResponse = {
        node_id: null,
        contract_fingerprint: null,
        runtime_mode: 'standalone',
        env: 'dev',
        supervised: false,
        supervisor_pid: null,
        injected_at: null,
      };

      setupFetchMock(
        new Map([['/api/intelligence/runtime/identity', createMockResponse(mockIdentity)]])
      );

      const result = await fetchRuntimeIdentity();

      expect(result.node_id).toBeNull();
      expect(result.contract_fingerprint).toBeNull();
      expect(result.runtime_mode).toBe('standalone');
      expect(result.env).toBe('dev');
      expect(result.supervised).toBe(false);
      expect(result.supervisor_pid).toBeNull();
      expect(result.injected_at).toBeNull();
    });

    it('should return supervised=true when ONEX_NODE_ID is present', async () => {
      const mockIdentity: RuntimeIdentityResponse = {
        node_id: 'node-omnidash-001',
        contract_fingerprint: 'abc123def456',
        runtime_mode: 'managed',
        env: 'production',
        supervised: true,
        supervisor_pid: '12345',
        injected_at: '2026-01-25T10:00:00Z',
      };

      setupFetchMock(
        new Map([['/api/intelligence/runtime/identity', createMockResponse(mockIdentity)]])
      );

      const result = await fetchRuntimeIdentity();

      expect(result.supervised).toBe(true);
      expect(result.node_id).toBe('node-omnidash-001');
      expect(result.contract_fingerprint).toBe('abc123def456');
      expect(result.runtime_mode).toBe('managed');
      expect(result.env).toBe('production');
      expect(result.supervisor_pid).toBe('12345');
      expect(result.injected_at).toBe('2026-01-25T10:00:00Z');
    });

    it('should return all expected fields', async () => {
      const mockIdentity: RuntimeIdentityResponse = {
        node_id: 'test-node',
        contract_fingerprint: 'fingerprint-123',
        runtime_mode: 'standalone',
        env: 'dev',
        supervised: true,
        supervisor_pid: '999',
        injected_at: '2026-01-25T12:00:00Z',
      };

      setupFetchMock(
        new Map([['/api/intelligence/runtime/identity', createMockResponse(mockIdentity)]])
      );

      const result = await fetchRuntimeIdentity();

      // Verify all expected fields are present
      expect(result).toHaveProperty('node_id');
      expect(result).toHaveProperty('contract_fingerprint');
      expect(result).toHaveProperty('runtime_mode');
      expect(result).toHaveProperty('env');
      expect(result).toHaveProperty('supervised');
      expect(result).toHaveProperty('supervisor_pid');
      expect(result).toHaveProperty('injected_at');

      // Verify field types
      expect(typeof result.runtime_mode).toBe('string');
      expect(typeof result.env).toBe('string');
      expect(typeof result.supervised).toBe('boolean');
    });

    it('should handle API errors gracefully', async () => {
      setupFetchMock(
        new Map([
          [
            '/api/intelligence/runtime/identity',
            createMockResponse(null, { status: 500, statusText: 'Internal Server Error' }),
          ],
        ])
      );

      await expect(fetchRuntimeIdentity()).rejects.toThrow('Failed to fetch runtime identity');
    });

    it('should return supervised=false when node_id is null', async () => {
      const mockIdentity: RuntimeIdentityResponse = {
        node_id: null,
        contract_fingerprint: null,
        runtime_mode: 'standalone',
        env: 'dev',
        supervised: false,
        supervisor_pid: null,
        injected_at: null,
      };

      setupFetchMock(
        new Map([['/api/intelligence/runtime/identity', createMockResponse(mockIdentity)]])
      );

      const result = await fetchRuntimeIdentity();

      expect(result.node_id).toBeNull();
      expect(result.supervised).toBe(false);
    });

    it('should support different runtime modes', async () => {
      const runtimeModes = ['standalone', 'managed', 'orchestrated', 'development'];

      for (const mode of runtimeModes) {
        const mockIdentity: RuntimeIdentityResponse = {
          node_id: mode === 'standalone' ? null : 'test-node',
          contract_fingerprint: null,
          runtime_mode: mode,
          env: 'dev',
          supervised: mode !== 'standalone',
          supervisor_pid: null,
          injected_at: null,
        };

        setupFetchMock(
          new Map([['/api/intelligence/runtime/identity', createMockResponse(mockIdentity)]])
        );

        const result = await fetchRuntimeIdentity();
        expect(result.runtime_mode).toBe(mode);
      }
    });

    it('should support different environment values', async () => {
      const environments = ['dev', 'staging', 'production', 'test'];

      for (const env of environments) {
        const mockIdentity: RuntimeIdentityResponse = {
          node_id: null,
          contract_fingerprint: null,
          runtime_mode: 'standalone',
          env,
          supervised: false,
          supervisor_pid: null,
          injected_at: null,
        };

        setupFetchMock(
          new Map([['/api/intelligence/runtime/identity', createMockResponse(mockIdentity)]])
        );

        const result = await fetchRuntimeIdentity();
        expect(result.env).toBe(env);
      }
    });
  });
});
