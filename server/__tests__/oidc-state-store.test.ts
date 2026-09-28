import { describe, expect, it, vi } from 'vitest';
import { createOidcStateStore, redisErrorStatus } from '../session.js';

describe('Redis OIDC state store', () => {
  it('reduces Redis failures to fixed diagnostic statuses without retaining messages', () => {
    expect(redisErrorStatus(Object.assign(new Error('redis://user:secret@host failed'), { code: 'ECONNREFUSED' }))).toBe('unavailable');
    expect(redisErrorStatus(Object.assign(new Error('private timeout detail'), { name: 'AbortError' }))).toBe('timeout');
    expect(redisErrorStatus(new Error('redis://user:secret@host failed'))).toBe('error');
  });

  it('uses SET NX PX and consumes state with Redis GETDEL', async () => {
    const client = {
      set: vi.fn().mockResolvedValue('OK'),
      getDel: vi.fn().mockResolvedValue('{"state":"state"}'),
    };
    const store = createOidcStateStore(client as never);

    await store.store('session-1', 'state', { state: 'state' }, 600_000);
    await expect(store.claim('session-1', 'state')).resolves.toEqual({ state: 'state' });

    expect(client.set).toHaveBeenCalledWith(
      'omnidash:oidc-pkce:session-1:state',
      '{"state":"state"}',
      { NX: true, PX: 600_000 },
    );
    expect(client.getDel).toHaveBeenCalledWith('omnidash:oidc-pkce:session-1:state');
  });

  it('fails closed if Redis cannot create a unique state key', async () => {
    const store = createOidcStateStore({ set: vi.fn().mockResolvedValue(null), getDel: vi.fn() } as never);
    await expect(store.store('session-1', 'state', {}, 1_000)).rejects.toThrow('could not store OIDC login state');
  });
});
