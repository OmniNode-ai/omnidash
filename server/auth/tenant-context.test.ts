// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  getActiveTenantId,
  getTenantContext,
  runWithTenantContext,
} from './tenant-context.js';

describe('tenant-context', () => {
  it('returns null outside any tenant context', () => {
    expect(getActiveTenantId()).toBeNull();
    expect(getTenantContext()).toBeNull();
  });

  it('exposes the tenant id inside runWithTenantContext', () => {
    const seen = runWithTenantContext({ tenantId: 'tenant-a', subject: 'user-1' }, () =>
      getActiveTenantId(),
    );
    expect(seen).toBe('tenant-a');
    // Context does not leak after run() returns.
    expect(getActiveTenantId()).toBeNull();
  });

  it('propagates through async continuations', async () => {
    const seen = await runWithTenantContext({ tenantId: 'tenant-b', subject: null }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return getActiveTenantId();
    });
    expect(seen).toBe('tenant-b');
  });

  it('supports nested contexts with inner-most winning', () => {
    const seen = runWithTenantContext({ tenantId: 'outer', subject: null }, () =>
      runWithTenantContext({ tenantId: 'inner', subject: null }, () => getActiveTenantId()),
    );
    expect(seen).toBe('inner');
  });

  it('rejects an empty tenant id (fail closed, no anonymous tenant)', () => {
    expect(() => runWithTenantContext({ tenantId: '', subject: null }, () => 1)).toThrow(
      /non-empty tenantId/,
    );
    expect(() => runWithTenantContext({ tenantId: '   ', subject: null }, () => 1)).toThrow(
      /non-empty tenantId/,
    );
  });
});
