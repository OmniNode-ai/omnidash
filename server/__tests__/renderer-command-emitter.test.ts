import { describe, it, expect, vi } from 'vitest';
import {
  buildRendererCommandEnvelope,
  emitRendererCommand,
  RendererEmitterError,
  type RendererCommandInput,
} from '../renderer-command-emitter.js';
import { RENDERER_ACTION_TOPIC } from '../../shared/types/command-topics.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function baseInput(overrides: Partial<RendererCommandInput> = {}): RendererCommandInput {
  return {
    rendererId: 'omnidash-web',
    actionContractId: 'delegation.trigger.v1',
    contractVersion: 'v1',
    payload: { prompt: 'do work', task_type: 'reasoning' },
    ...overrides,
  };
}

// ── Envelope identity (W2 §4.1) ───────────────────────────────────────────────
describe('renderer command envelope identity', () => {
  it('always carries a correlation_id, minting a UUID when none is supplied', () => {
    const env = buildRendererCommandEnvelope(baseInput());
    expect(env.correlation_id).toMatch(UUID_RE);
  });

  it('preserves a caller-supplied correlation_id verbatim', () => {
    const correlationId = '11111111-2222-3333-4444-555555555555';
    const env = buildRendererCommandEnvelope(baseInput({ correlationId }));
    expect(env.correlation_id).toBe(correlationId);
  });

  it('omits causation_id when the action does not follow a prior event', () => {
    const env = buildRendererCommandEnvelope(baseInput());
    expect(env.causation_id).toBeNull();
  });

  it('sets causation_id when the action follows a prior projection/event', () => {
    const causationId = '99999999-8888-7777-6666-555555555555';
    const env = buildRendererCommandEnvelope(baseInput({ causationId }));
    expect(env.causation_id).toBe(causationId);
  });

  it('carries renderer_id, action_contract_id, and contract_version (not optional)', () => {
    const env = buildRendererCommandEnvelope(baseInput());
    expect(env.renderer_id).toBe('omnidash-web');
    expect(env.action_contract_id).toBe('delegation.trigger.v1');
    expect(env.contract_version).toBe('v1');
  });

  it('mints an envelope_id and ISO envelope_timestamp', () => {
    const env = buildRendererCommandEnvelope(baseInput());
    expect(env.envelope_id).toMatch(UUID_RE);
    expect(typeof env.envelope_timestamp).toBe('string');
    expect(new Date(env.envelope_timestamp).getTime()).not.toBeNaN();
  });

  it('rejects an envelope missing renderer_id', () => {
    expect(() => buildRendererCommandEnvelope(baseInput({ rendererId: '' }))).toThrow(
      RendererEmitterError,
    );
  });

  it('rejects an envelope missing action_contract_id', () => {
    expect(() => buildRendererCommandEnvelope(baseInput({ actionContractId: '' }))).toThrow(
      RendererEmitterError,
    );
  });

  it('rejects an envelope missing contract_version', () => {
    expect(() => buildRendererCommandEnvelope(baseInput({ contractVersion: '' }))).toThrow(
      RendererEmitterError,
    );
  });

  it('rejects a non-object payload', () => {
    expect(() =>
      buildRendererCommandEnvelope(baseInput({ payload: 'not-an-object' as unknown as Record<string, unknown> })),
    ).toThrow(RendererEmitterError);
  });

  it('rejects an array payload (payload must be a keyed object)', () => {
    expect(() =>
      buildRendererCommandEnvelope(baseInput({ payload: [] as unknown as Record<string, unknown> })),
    ).toThrow(RendererEmitterError);
  });

  it('rejects a non-UUID correlation_id', () => {
    expect(() => buildRendererCommandEnvelope(baseInput({ correlationId: 'not-a-uuid' }))).toThrow(
      RendererEmitterError,
    );
  });

  it('rejects a non-UUID causation_id', () => {
    expect(() => buildRendererCommandEnvelope(baseInput({ causationId: 'nope' }))).toThrow(
      RendererEmitterError,
    );
  });
});

// ── Thin-producer transport (W2 §7.4) ─────────────────────────────────────────
describe('renderer command thin-publish transport', () => {
  it('publishes the envelope verbatim to the declared topic via the injected producer', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const env = await emitRendererCommand(baseInput(), { publish });

    expect(publish).toHaveBeenCalledOnce();
    const [topic, value] = publish.mock.calls[0] as [string, unknown];
    expect(topic).toBe(RENDERER_ACTION_TOPIC);
    // verbatim: the value handed to the producer is exactly the built envelope
    expect(value).toEqual(env);
  });

  it('attaches transport metadata (transport=thin-publish) without touching business payload', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const env = await emitRendererCommand(baseInput(), { publish });

    expect(env.transport.kind).toBe('thin-publish');
    expect(env.transport.producer).toBe('omnidash-renderer-command-emitter');
    // payload is carried unchanged — same reference content, no derived fields
    expect(env.payload).toEqual({ prompt: 'do work', task_type: 'reasoning' });
  });

  it('propagates a producer failure rather than swallowing it', async () => {
    const publish = vi.fn().mockRejectedValue(new Error('broker gone'));
    await expect(emitRendererCommand(baseInput(), { publish })).rejects.toThrow('broker gone');
  });
});

// ── Item D: Tenant context propagation ───────────────────────────────────────
describe('tenant context in command envelope', () => {
  it('populates tenant fields from tenantContext when provided', () => {
    const env = buildRendererCommandEnvelope(baseInput({
      tenantContext: { tenant_id: 'tenant-abc', tenant_slug: 'acme', sub: 'user-42' },
    }));
    expect(env.tenant_id).toBe('tenant-abc');
    expect(env.tenant_slug).toBe('acme');
    expect(env.tenant_sub).toBe('user-42');
  });

  it('sets tenant fields to null when tenantContext is absent', () => {
    const env = buildRendererCommandEnvelope(baseInput());
    expect(env.tenant_id).toBeNull();
    expect(env.tenant_slug).toBeNull();
    expect(env.tenant_sub).toBeNull();
  });

  it('tenant fields are propagated verbatim to the published envelope', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const env = await emitRendererCommand(
      baseInput({ tenantContext: { tenant_id: 'tenant-abc', tenant_slug: 'acme', sub: 'user-42' } }),
      { publish },
    );
    expect(env.tenant_id).toBe('tenant-abc');
    const published = publish.mock.calls[0]?.[1] as typeof env;
    expect(published.tenant_id).toBe('tenant-abc');
  });
});

// ── G-D thin-producer MAY / MAY-NOT bounds (mechanically asserted) ─────────────
describe('thin-producer bounds (G-D)', () => {
  it('publishes EVERY action to the SAME declared topic — no dispatch on action type', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    await emitRendererCommand(baseInput({ actionContractId: 'delegation.trigger.v1' }), { publish });
    await emitRendererCommand(baseInput({ actionContractId: 'sea.generate.v1' }), { publish });
    await emitRendererCommand(baseInput({ actionContractId: 'layout.save.v1' }), { publish });

    const topics = publish.mock.calls.map((c) => c[0]);
    expect(new Set(topics)).toEqual(new Set([RENDERER_ACTION_TOPIC]));
  });

  it('does not rewrite intent: payload bytes round-trip unchanged regardless of content', () => {
    const payload = { arbitrary: { nested: [1, 2, 3] }, intent: 'whatever-the-renderer-said' };
    const env = buildRendererCommandEnvelope(baseInput({ payload }));
    expect(env.payload).toEqual(payload);
  });

  it('does not choose a business workflow: envelope exposes no workflow/target-node/handler field', () => {
    const env = buildRendererCommandEnvelope(baseInput());
    const keys = Object.keys(env);
    // A thin producer must NOT select downstream business behavior. These keys
    // would mean the renderer is routing — the dispatcher (W4) owns that.
    for (const forbidden of [
      'workflow',
      'workflow_id',
      'target_node_id',
      'target_node',
      'handler',
      'handler_id',
      'dispatch_on',
      'route',
      'capability',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('does not mutate payload semantics: no business-derived keys added to payload', () => {
    const env = buildRendererCommandEnvelope(baseInput({ payload: { prompt: 'x' } }));
    // The producer is forbidden from inferring/computing business truth into the
    // payload (e.g. selected_model, routing_rule, cost_estimate). Payload keys
    // must equal exactly what the renderer supplied.
    expect(Object.keys(env.payload as Record<string, unknown>).sort()).toEqual(['prompt']);
  });

  it('emitter source module contains no business-routing logic (regression guard)', async () => {
    // OMN-13131 G-D regression: if business/router/dispatch logic creeps into the
    // thin producer, this fails. We scan the emitter source for the canonical
    // routing/business markers a thin producer must never contain.
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    // vitest runs with cwd = repo root; the emitter lives at server/.
    const src = await readFile(resolve(process.cwd(), 'server/renderer-command-emitter.ts'), 'utf8');
    // Strip line comments + block comments so doctrine prose ("must not dispatch
    // on action type") does not trip the guard — only executable code is scanned.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // Branching on the action contract id (or payload contents) = routing.
    expect(code).not.toMatch(/switch\s*\(\s*[^)]*action[Cc]ontract/);
    expect(code).not.toMatch(/if\s*\(\s*[^)]*action[Cc]ontract[Ii]d\s*===/);
    // A thin producer never names a downstream business workflow / node.
    expect(code).not.toMatch(/node_[a-z_]+/);
    expect(code).not.toMatch(/workflow/i);
  });
});
