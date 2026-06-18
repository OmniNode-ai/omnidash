import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCapabilityDeclarationEnvelope,
  emitCapabilityDeclaration,
  startCapabilityHeartbeat,
  CapabilityProducerError,
  type CapabilityDeclarationInput,
} from '../renderer-capability-producer.js';
import { RENDERER_CAPABILITY_DECLARED_TOPIC } from '../../shared/types/command-topics.js';
import { webRendererCapability } from '../../shared/types/web-renderer-capability.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function baseInput(
  overrides: Partial<CapabilityDeclarationInput> = {},
): CapabilityDeclarationInput {
  return {
    capability: webRendererCapability(),
    ...overrides,
  };
}

// ── Declaration payload shape (matches W5 ModelRendererCapabilityDeclaration) ──
describe('capability declaration payload shape', () => {
  it('carries { capability, declared_at } matching ModelRendererCapabilityDeclaration', () => {
    const env = buildCapabilityDeclarationEnvelope(baseInput());
    // The reducer (node_renderer_capability_projection) folds the declaration
    // payload, keyed on capability.renderer_id with declared_at as the freshness
    // anchor. The payload MUST carry exactly those two fields.
    expect(env.payload).toHaveProperty('capability');
    expect(env.payload).toHaveProperty('declared_at');
    expect(env.payload.capability).toEqual(webRendererCapability());
  });

  it('declared_at is an ISO-8601 timestamp (heartbeat freshness anchor)', () => {
    const env = buildCapabilityDeclarationEnvelope(baseInput());
    expect(typeof env.payload.declared_at).toBe('string');
    expect(new Date(env.payload.declared_at).getTime()).not.toBeNaN();
  });

  it('carries the full capability surface verbatim (renderer_id, platform, kinds, version)', () => {
    const env = buildCapabilityDeclarationEnvelope(baseInput());
    const cap = env.payload.capability;
    expect(cap.renderer_id).toBe('omnidash-web');
    expect(cap.platform).toBe('web');
    expect(cap.supported_component_kinds).toEqual(['chart', 'table', 'metric_card']);
    expect(cap.contract_version).toEqual({ major: 1, minor: 0, patch: 0 });
  });
});

// ── Envelope identity convention (mirrors W2) ─────────────────────────────────
describe('capability declaration envelope identity', () => {
  it('mints a correlation_id when none supplied', () => {
    const env = buildCapabilityDeclarationEnvelope(baseInput());
    expect(env.correlation_id).toMatch(UUID_RE);
  });

  it('preserves a supplied correlation_id verbatim', () => {
    const correlationId = '11111111-2222-3333-4444-555555555555';
    const env = buildCapabilityDeclarationEnvelope(baseInput({ correlationId }));
    expect(env.correlation_id).toBe(correlationId);
  });

  it('rejects a non-UUID correlation_id', () => {
    expect(() =>
      buildCapabilityDeclarationEnvelope(baseInput({ correlationId: 'not-a-uuid' })),
    ).toThrow(CapabilityProducerError);
  });

  it('mints envelope_id and ISO envelope_timestamp', () => {
    const env = buildCapabilityDeclarationEnvelope(baseInput());
    expect(env.envelope_id).toMatch(UUID_RE);
    expect(new Date(env.envelope_timestamp).getTime()).not.toBeNaN();
  });

  it('sets source_tool=omnidash-ui and transport.kind=thin-publish for the declared topic', () => {
    const env = buildCapabilityDeclarationEnvelope(baseInput());
    expect(env.source_tool).toBe('omnidash-ui');
    expect(env.transport.kind).toBe('thin-publish');
    expect(env.transport.topic).toBe(RENDERER_CAPABILITY_DECLARED_TOPIC);
  });

  it('rejects a capability missing renderer_id (fail-fast, no silent drop)', () => {
    const bad = { ...webRendererCapability(), renderer_id: '' };
    expect(() =>
      buildCapabilityDeclarationEnvelope({ capability: bad }),
    ).toThrow(CapabilityProducerError);
  });

  it('rejects a capability missing platform', () => {
    const bad = { ...webRendererCapability(), platform: '' };
    expect(() =>
      buildCapabilityDeclarationEnvelope({ capability: bad }),
    ).toThrow(CapabilityProducerError);
  });

  it('rejects a capability with empty supported_component_kinds', () => {
    const bad = { ...webRendererCapability(), supported_component_kinds: [] };
    expect(() =>
      buildCapabilityDeclarationEnvelope({ capability: bad }),
    ).toThrow(CapabilityProducerError);
  });
});

// ── Thin-publish transport ────────────────────────────────────────────────────
describe('capability declaration thin-publish transport', () => {
  it('publishes the envelope verbatim to the declared capability topic', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const env = await emitCapabilityDeclaration(baseInput(), { publish });

    expect(publish).toHaveBeenCalledOnce();
    const [topic, value] = publish.mock.calls[0] as [string, unknown];
    expect(topic).toBe(RENDERER_CAPABILITY_DECLARED_TOPIC);
    expect(value).toEqual(env);
  });

  it('propagates a producer failure rather than swallowing it', async () => {
    const publish = vi.fn().mockRejectedValue(new Error('broker gone'));
    await expect(emitCapabilityDeclaration(baseInput(), { publish })).rejects.toThrow(
      'broker gone',
    );
  });
});

// ── G-D thin-producer bounds (mechanically asserted) ──────────────────────────
describe('thin-producer bounds (G-D)', () => {
  it('publishes ONLY to the declared capability topic — no other topic', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    await emitCapabilityDeclaration(baseInput(), { publish });
    await emitCapabilityDeclaration(baseInput(), { publish });
    const topics = publish.mock.calls.map((c) => c[0]);
    expect(new Set(topics)).toEqual(new Set([RENDERER_CAPABILITY_DECLARED_TOPIC]));
  });

  it('carries the capability surface unchanged — no business-derived fields added', () => {
    const env = buildCapabilityDeclarationEnvelope(baseInput());
    // The producer validates shape + publishes; it does not invent is_degraded,
    // last_heartbeat, observed_at, or empty_state_reason — those are the W5
    // reducer's to derive, not the renderer's to assert.
    for (const forbidden of [
      'is_degraded',
      'last_heartbeat',
      'observed_at',
      'empty_state_reason',
    ]) {
      expect(Object.keys(env.payload)).not.toContain(forbidden);
      expect(Object.keys(env.payload.capability)).not.toContain(forbidden);
    }
  });

  it('producer source contains no reducer/projection business logic (regression guard)', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const src = await readFile(
      resolve(process.cwd(), 'server/renderer-capability-producer.ts'),
      'utf8',
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // A thin producer never derives projection freshness state.
    expect(code).not.toMatch(/is_degraded/);
    expect(code).not.toMatch(/last_heartbeat/);
    expect(code).not.toMatch(/empty_state_reason/);
    // It never names a downstream reducer/node.
    expect(code).not.toMatch(/node_[a-z_]+/);
  });
});

// ── Heartbeat scheduler ───────────────────────────────────────────────────────
describe('capability heartbeat scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes once immediately on start, then re-publishes on the interval', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const handle = startCapabilityHeartbeat({
      intervalMs: 30_000,
      input: baseInput(),
      deps: { publish },
    });

    // Immediate startup declaration.
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledTimes(1);

    // Two more on the interval.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(publish).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(publish).toHaveBeenCalledTimes(3);

    handle.stop();
  });

  it('stops re-publishing after stop() is called', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const handle = startCapabilityHeartbeat({
      intervalMs: 30_000,
      input: baseInput(),
      deps: { publish },
    });
    await vi.advanceTimersByTimeAsync(0);
    handle.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-positive interval (fail-fast on misconfiguration)', () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    expect(() =>
      startCapabilityHeartbeat({ intervalMs: 0, input: baseInput(), deps: { publish } }),
    ).toThrow(CapabilityProducerError);
  });

  it('a failed heartbeat publish does not stop the scheduler (next tick still fires)', async () => {
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient broker blip'))
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const handle = startCapabilityHeartbeat({
      intervalMs: 30_000,
      input: baseInput(),
      deps: { publish },
      onError,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(publish).toHaveBeenCalledTimes(2);
    handle.stop();
  });
});
