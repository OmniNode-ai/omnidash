import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emitRendererAction, DEFAULT_RENDERER_ID } from './renderer-emit-api';

function okResponse(body: Record<string, unknown>) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const SERVER_OK = {
  accepted: true,
  correlation_id: '11111111-2222-3333-4444-555555555555',
  causation_id: null,
  envelope_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  topic: 'onex.cmd.omnidash.renderer-action.v1',
};

describe('emitRendererAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/renderer/emit with renderer_id, action_contract_id, contract_version, payload', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(SERVER_OK));
    vi.stubGlobal('fetch', fetchMock);

    await emitRendererAction({
      actionContractId: 'delegation.trigger.v1',
      contractVersion: 'v1',
      payload: { prompt: 'hi', task_type: 'reasoning' },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/renderer/emit');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent.renderer_id).toBe(DEFAULT_RENDERER_ID);
    expect(sent.action_contract_id).toBe('delegation.trigger.v1');
    expect(sent.contract_version).toBe('v1');
    expect(sent.payload).toEqual({ prompt: 'hi', task_type: 'reasoning' });
    // No identity defaulting on the client — the server mints correlation_id.
    expect(sent).not.toHaveProperty('correlation_id');
    expect(sent).not.toHaveProperty('causation_id');
  });

  it('forwards correlation_id and causation_id when the action follows a prior event', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(okResponse(SERVER_OK));
    vi.stubGlobal('fetch', fetchMock);

    await emitRendererAction({
      actionContractId: 'delegation.trigger.v1',
      contractVersion: 'v1',
      payload: {},
      correlationId: '11111111-2222-3333-4444-555555555555',
      causationId: '99999999-8888-7777-6666-555555555555',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent.correlation_id).toBe('11111111-2222-3333-4444-555555555555');
    expect(sent.causation_id).toBe('99999999-8888-7777-6666-555555555555');
  });

  it('returns the server identity echo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(okResponse(SERVER_OK)));

    const res = await emitRendererAction({
      actionContractId: 'delegation.trigger.v1',
      contractVersion: 'v1',
      payload: {},
    });
    expect(res.accepted).toBe(true);
    expect(res.topic).toBe('onex.cmd.omnidash.renderer-action.v1');
    expect(res.correlation_id).toBe(SERVER_OK.correlation_id);
  });

  it('throws on a non-OK HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'kafka_unavailable',
      } as Response),
    );

    await expect(
      emitRendererAction({ actionContractId: 'x.v1', contractVersion: 'v1', payload: {} }),
    ).rejects.toThrow(/503/);
  });
});
