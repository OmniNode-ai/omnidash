import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invokeRuntimeCommand,
  RuntimeEdgeError,
} from '../runtime-skill-client.js';

describe('invokeRuntimeCommand', () => {
  const savedUrl = process.env.OMNIDASH_RUNTIME_EDGE_URL;
  const savedTimeout = process.env.OMNIDASH_RUNTIME_EDGE_TIMEOUT_MS;

  beforeEach(() => {
    process.env.OMNIDASH_RUNTIME_EDGE_URL = 'http://runtime.onex-dev:8085/';
    process.env.OMNIDASH_RUNTIME_EDGE_TIMEOUT_MS = '120000';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedUrl === undefined) delete process.env.OMNIDASH_RUNTIME_EDGE_URL;
    else process.env.OMNIDASH_RUNTIME_EDGE_URL = savedUrl;
    if (savedTimeout === undefined) delete process.env.OMNIDASH_RUNTIME_EDGE_TIMEOUT_MS;
    else process.env.OMNIDASH_RUNTIME_EDGE_TIMEOUT_MS = savedTimeout;
  });

  it('sends the canonical /skill request and returns the typed terminal response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      command_name: 'node_delegate_skill_orchestrator',
      command_topic: 'onex.cmd.omnimarket.delegate-skill.v1',
      correlation_id: '11111111-2222-3333-4444-555555555555',
      dispatch_result: { status: 'completed' },
      output_payloads: [{ answer: 'done' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const result = await invokeRuntimeCommand({
      commandName: 'node_delegate_skill_orchestrator',
      payload: { prompt: 'work', task_type: 'reasoning', source: 'external-client' },
      correlationId: '11111111-2222-3333-4444-555555555555',
      timeoutMs: 30000,
    }, { fetchImpl });

    expect(result.ok).toBe(true);
    expect(result.output_payloads).toEqual([{ answer: 'done' }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://runtime.onex-dev:8085/skill');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      command_name: 'node_delegate_skill_orchestrator',
      payload: { prompt: 'work', task_type: 'reasoning', source: 'external-client' },
      correlation_id: '11111111-2222-3333-4444-555555555555',
      timeout_ms: 30000,
    });
  });

  it('turns a runtime ok=false body into a fail-closed typed error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      command_name: 'node_delegate_skill_orchestrator',
      error: { code: 'dispatch_timeout', message: 'timed out', retryable: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(invokeRuntimeCommand({
      commandName: 'node_delegate_skill_orchestrator',
      payload: {},
    }, { fetchImpl })).rejects.toMatchObject({
      name: 'RuntimeEdgeError',
      code: 'dispatch_timeout',
      retryable: true,
      message: 'timed out',
    });
  });

  it('rejects an invalid response shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(invokeRuntimeCommand({ commandName: 'node', payload: {} }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'invalid_runtime_response' });
  });

  it('fails before network I/O when no runtime edge is configured', async () => {
    delete process.env.OMNIDASH_RUNTIME_EDGE_URL;
    const fetchImpl = vi.fn();

    await expect(invokeRuntimeCommand({ commandName: 'node', payload: {} }, { fetchImpl }))
      .rejects.toBeInstanceOf(RuntimeEdgeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
