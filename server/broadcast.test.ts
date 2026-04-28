// T10 — broadcast() channel-filter unit test.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSocket } from 'ws';

import { broadcast, clients } from './index.js';

interface FakeWs {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
}

function makeFake(open = true): FakeWs {
  return {
    readyState: open ? WebSocket.OPEN : WebSocket.CLOSED,
    send: vi.fn(),
  };
}

describe('broadcast() channel filter', () => {
  beforeEach(() => {
    clients.clear();
  });

  it('sends to clients subscribed to the exact channel', () => {
    const ws = makeFake();
    clients.set(ws as unknown as WebSocket, new Set(['cost-trends']));
    broadcast('cost-trends', { foo: 1 });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(ws.send.mock.calls[0]?.[0] as string);
    expect(payload).toMatchObject({ type: 'INVALIDATE', channel: 'cost-trends' });
  });

  it('sends to clients subscribed to the wildcard "*"', () => {
    const ws = makeFake();
    clients.set(ws as unknown as WebSocket, new Set(['*']));
    broadcast('routing-decisions', null);
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it('skips clients without a matching subscription', () => {
    const a = makeFake();
    const b = makeFake();
    clients.set(a as unknown as WebSocket, new Set(['cost-trends']));
    clients.set(b as unknown as WebSocket, new Set(['delegation']));
    broadcast('cost-trends', null);
    expect(a.send).toHaveBeenCalledTimes(1);
    expect(b.send).not.toHaveBeenCalled();
  });

  it('skips clients whose readyState is not OPEN', () => {
    const closed = makeFake(false);
    clients.set(closed as unknown as WebSocket, new Set(['*']));
    broadcast('cost-trends', null);
    expect(closed.send).not.toHaveBeenCalled();
  });
});
