import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock the kafka-producer module so tests never need a real broker.
vi.mock('../kafka-producer.js', () => ({
  isProducerConnected: vi.fn(),
  publishMessage: vi.fn(),
  connectProducer: vi.fn(),
  disconnectProducer: vi.fn(),
}));

import * as kafkaProducer from '../kafka-producer.js';
import type { TenantContext } from '../auth-middleware.js';

const MOCK_TENANT: TenantContext = {
  tenant_id: 'test-tenant-id',
  tenant_slug: 'test-tenant',
  sub: 'user-test',
  roles: [],
};

async function loadRoutes() {
  vi.resetModules();
  // Re-import after resetting so the mocked module is picked up cleanly.
  const mod = await import('../routes.js');
  return mod.default;
}

function buildApp(routes: express.Router, tenant: TenantContext = MOCK_TENANT) {
  const app = express();
  app.use(express.json());
  // Inject tenant context — mirrors what authMiddleware does in production.
  app.use((req, _res, next) => { req.tenant = tenant; next(); });
  app.use(routes);
  return app;
}

// OMN-12809: POST /api/dispatch tests removed — the route is retired.
// Callers now use POST /api/renderer/emit (renderer-command-emitter.ts).

describe('POST /api/delegation/trigger', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
    vi.mocked(kafkaProducer.isProducerConnected).mockReturnValue(true);
    vi.mocked(kafkaProducer.publishMessage).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    vi.clearAllMocks();
  });

  it('returns 400 when prompt is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ task_type: 'reasoning' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'prompt is required' });
  });

  it('returns 400 when task_type is outside the delegate-skill contract taxonomy', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'do work', task_type: 'general' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid task_type');
    expect(res.body.allowed_task_types).toContain('reasoning');
    expect(res.body.allowed_task_types).not.toContain('general');
  });

  it('returns 503 when Kafka producer is not connected in live data-source mode', async () => {
    vi.mocked(kafkaProducer.isProducerConnected).mockReturnValue(false);

    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'do work', task_type: 'reasoning' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'kafka_unavailable' });
  });

  it('publishes the delegate-skill event envelope to Kafka', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'Review this PR for correctness', task_type: 'code_review' });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.topic).toBe('onex.cmd.omnimarket.delegate-skill.v1');
    expect(typeof res.body.correlation_id).toBe('string');
    expect(kafkaProducer.publishMessage).toHaveBeenCalledOnce();

    const [topic, envelope] = vi.mocked(kafkaProducer.publishMessage).mock.calls[0] as [string, Record<string, unknown>];
    expect(topic).toBe('onex.cmd.omnimarket.delegate-skill.v1');
    expect(envelope.event_type).toBe('omnimarket.delegate-skill');
    expect(envelope.source_tool).toBe('omnidash-ui');
    expect(envelope.correlation_id).toBe(res.body.correlation_id);
    expect(typeof envelope.envelope_id).toBe('string');
    expect(typeof envelope.envelope_timestamp).toBe('string');

    const payload = envelope.payload as Record<string, unknown>;
    expect(payload.prompt).toBe('Review this PR for correctness');
    expect(payload.task_type).toBe('code_review');
    expect(payload.source).toBe('codex');
    expect(payload.wait).toBe(true);
    expect(payload.correlation_id).toBe(res.body.correlation_id);
    expect(payload.metadata).toEqual({
      requested_by: 'omnidash-ui',
      source_surface: 'delegation-control-plane',
      tenant_id: MOCK_TENANT.tenant_id,
      tenant_slug: MOCK_TENANT.tenant_slug,
      sub: MOCK_TENANT.sub,
    });
  });
});

// OMN-12775: SEA thin publisher — node-generation-requested
describe('POST /api/sea/generate', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
    vi.mocked(kafkaProducer.isProducerConnected).mockReturnValue(true);
    vi.mocked(kafkaProducer.publishMessage).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    vi.clearAllMocks();
  });

  it('returns 400 when task_description is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/sea/generate')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'task_description is required' });
  });

  it('returns 503 when Kafka producer is not connected in live data-source mode', async () => {
    vi.mocked(kafkaProducer.isProducerConnected).mockReturnValue(false);

    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/sea/generate')
      .send({ task_description: 'Generate a summarizer node' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'kafka_unavailable' });
  });

  it('publishes envelope to node-generation-requested.v1 and returns correlation_id', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/sea/generate')
      .send({ task_description: 'Generate a summarizer node' });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.topic).toBe('onex.cmd.omnimarket.node-generation-requested.v1');
    expect(typeof res.body.correlation_id).toBe('string');
    expect(kafkaProducer.publishMessage).toHaveBeenCalledOnce();

    const [topic, envelope] = vi.mocked(kafkaProducer.publishMessage).mock.calls[0] as [string, Record<string, unknown>];
    // Topic must byte-match node_generation_consumer subscribe_topics
    expect(topic).toBe('onex.cmd.omnimarket.node-generation-requested.v1');
    // Publisher carries no business-payload truth — only wraps user input
    expect(envelope.source_tool).toBe('omnidash-ui');
    expect(envelope.event_type).toBe('omnimarket.node-generation-requested');
    expect(typeof envelope.envelope_id).toBe('string');
    expect(typeof envelope.envelope_timestamp).toBe('string');
    expect(envelope.correlation_id).toBe(res.body.correlation_id);

    const payload = envelope.payload as Record<string, unknown>;
    // Payload is the user input only — no inferred/computed business truth
    expect(payload.task_description).toBe('Generate a summarizer node');
    expect(payload.correlation_id).toBe(res.body.correlation_id);
    // No business logic: publisher must not add derived fields
    expect(Object.keys(payload).sort()).toEqual(['correlation_id', 'task_description']);
  });

  it('returns 503 when publishMessage throws', async () => {
    vi.mocked(kafkaProducer.publishMessage).mockRejectedValue(new Error('broker gone'));

    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/sea/generate')
      .send({ task_description: 'Generate a summarizer node' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'kafka_unavailable', detail: 'Error: broker gone' });
  });

  it('does not expose a /api/hackathon/generate route', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/hackathon/generate')
      .send({ task_description: 'anything' });

    // Route must not exist (Express returns 404 for unregistered POST paths)
    expect(res.status).toBe(404);
  });
});

// OMN-13131 (W2): renderer bus-native command emit path
describe('POST /api/renderer/emit', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
    vi.mocked(kafkaProducer.isProducerConnected).mockReturnValue(true);
    vi.mocked(kafkaProducer.publishMessage).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    vi.clearAllMocks();
  });

  const validBody = {
    renderer_id: 'omnidash-web',
    action_contract_id: 'delegation.trigger.v1',
    contract_version: 'v1',
    payload: { prompt: 'do work', task_type: 'reasoning' },
  };

  it('returns 400 when renderer_id is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/renderer/emit')
      .send({ ...validBody, renderer_id: undefined });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'renderer_id is required' });
  });

  it('returns 400 when action_contract_id is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/renderer/emit')
      .send({ ...validBody, action_contract_id: undefined });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'action_contract_id is required' });
  });

  it('returns 400 when contract_version is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/renderer/emit')
      .send({ ...validBody, contract_version: undefined });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'contract_version is required' });
  });

  it('returns 400 when payload is missing or not an object', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/renderer/emit')
      .send({ ...validBody, payload: undefined });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'payload is required and must be an object' });
  });

  it('returns 503 when Kafka producer is not connected', async () => {
    vi.mocked(kafkaProducer.isProducerConnected).mockReturnValue(false);

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).post('/api/renderer/emit').send(validBody);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'kafka_unavailable' });
  });

  it('returns 503 when publishMessage throws', async () => {
    vi.mocked(kafkaProducer.publishMessage).mockRejectedValue(new Error('broker gone'));

    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).post('/api/renderer/emit').send(validBody);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('kafka_unavailable');
  });

  it('publishes the renderer command envelope to the declared topic and echoes identity', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).post('/api/renderer/emit').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(res.body.topic).toBe('onex.cmd.omnidash.renderer-action.v1');
    expect(typeof res.body.correlation_id).toBe('string');
    expect(res.body.causation_id).toBeNull();
    expect(typeof res.body.envelope_id).toBe('string');

    expect(kafkaProducer.publishMessage).toHaveBeenCalledOnce();
    const [topic, envelope] = vi.mocked(kafkaProducer.publishMessage).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(topic).toBe('onex.cmd.omnidash.renderer-action.v1');
    expect(envelope.renderer_id).toBe('omnidash-web');
    expect(envelope.action_contract_id).toBe('delegation.trigger.v1');
    expect(envelope.contract_version).toBe('v1');
    expect(envelope.correlation_id).toBe(res.body.correlation_id);
    expect(envelope.causation_id).toBeNull();
    expect(envelope.source_tool).toBe('omnidash-ui');
    expect((envelope.transport as Record<string, unknown>).kind).toBe('thin-publish');
    // Payload carried verbatim — no business-derived keys added.
    expect(envelope.payload).toEqual({ prompt: 'do work', task_type: 'reasoning' });
  });

  it('preserves a caller-supplied correlation_id and sets causation_id when the action follows a prior event', async () => {
    const correlationId = '11111111-2222-3333-4444-555555555555';
    const causationId = '99999999-8888-7777-6666-555555555555';
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/renderer/emit')
      .send({ ...validBody, correlation_id: correlationId, causation_id: causationId });

    expect(res.status).toBe(200);
    expect(res.body.correlation_id).toBe(correlationId);
    expect(res.body.causation_id).toBe(causationId);
    const [, envelope] = vi.mocked(kafkaProducer.publishMessage).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(envelope.correlation_id).toBe(correlationId);
    expect(envelope.causation_id).toBe(causationId);
  });

  it('returns 400 when a supplied correlation_id is not a UUID', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/renderer/emit')
      .send({ ...validBody, correlation_id: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/correlation_id/);
    expect(kafkaProducer.publishMessage).not.toHaveBeenCalled();
  });

  it('routes EVERY action contract id to the SAME declared topic (no dispatch on action type)', async () => {
    const routes = await loadRoutes();
    const app = buildApp(routes);
    await request(app).post('/api/renderer/emit').send({ ...validBody, action_contract_id: 'delegation.trigger.v1' });
    await request(app).post('/api/renderer/emit').send({ ...validBody, action_contract_id: 'sea.generate.v1' });

    const topics = vi.mocked(kafkaProducer.publishMessage).mock.calls.map((c) => c[0]);
    expect(new Set(topics)).toEqual(new Set(['onex.cmd.omnidash.renderer-action.v1']));
  });

  // OMN-13131 (W2): the action-specific /api/delegation/trigger path MUST still
  // exist alongside the bus-native emit path. Its removal is W3 (parked behind
  // OMN-13105), not this item.
  it('the existing /api/delegation/trigger route is still mounted (not removed in W2)', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'do work', task_type: 'reasoning' });

    // 200 (published) — definitively not a 404 unmounted route.
    expect(res.status).toBe(200);
    expect(res.body.topic).toBe('onex.cmd.omnimarket.delegate-skill.v1');
  });
});

// OMN-12149: topic registration test
// OMN-12809: dispatchRequest removed from COMMAND_TOPICS — generic router-hop retired.
describe('COMMAND_TOPICS registry', () => {
  it('delegateSkill key maps to the contract-declared delegate-skill command topic', async () => {
    const { COMMAND_TOPICS } = await import('../../shared/types/command-topics.js');
    expect(COMMAND_TOPICS.delegateSkill).toBe('onex.cmd.omnimarket.delegate-skill.v1');
  });

  // OMN-12775: SEA generation command topic
  it('nodeGenerationRequested key maps to the node_generation_consumer subscribe topic', async () => {
    const { COMMAND_TOPICS } = await import('../../shared/types/command-topics.js');
    expect(COMMAND_TOPICS.nodeGenerationRequested).toBe('onex.cmd.omnimarket.node-generation-requested.v1');
  });

  // OMN-13131 (W2): renderer bus-native command topic
  it('rendererAction key maps to the declared renderer-action command topic', async () => {
    const { COMMAND_TOPICS, RENDERER_ACTION_TOPIC } = await import(
      '../../shared/types/command-topics.js'
    );
    expect(COMMAND_TOPICS.rendererAction).toBe('onex.cmd.omnidash.renderer-action.v1');
    expect(RENDERER_ACTION_TOPIC).toBe(COMMAND_TOPICS.rendererAction);
  });
});
