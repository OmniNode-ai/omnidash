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

async function loadRoutes() {
  vi.resetModules();
  // Re-import after resetting so the mocked module is picked up cleanly.
  const mod = await import('../routes.js');
  return mod.default;
}

function buildApp(routes: express.Router) {
  const app = express();
  app.use(express.json());
  app.use(routes);
  return app;
}

describe('POST /api/dispatch', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'file';
    vi.mocked(kafkaProducer.isProducerConnected).mockReturnValue(true);
    vi.mocked(kafkaProducer.publishMessage).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    vi.clearAllMocks();
  });

  it('returns 400 when command_type is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/dispatch')
      .send({ target_node_id: 'node_build_loop', payload: {} });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'command_type is required' });
  });

  it('returns 400 when target_node_id is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/dispatch')
      .send({ command_type: 'run-node', payload: {} });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'target_node_id is required' });
  });

  it('returns 400 when payload is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/dispatch')
      .send({ command_type: 'run-node', target_node_id: 'node_build_loop' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'payload is required and must be an object' });
  });

  it('returns 400 when payload is an array', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/dispatch')
      .send({ command_type: 'run-node', target_node_id: 'node_build_loop', payload: [] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'payload is required and must be an object' });
  });

  it('returns 503 when Kafka producer is not connected', async () => {
    vi.mocked(kafkaProducer.isProducerConnected).mockReturnValue(false);

    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/dispatch')
      .send({ command_type: 'run-node', target_node_id: 'node_build_loop', payload: {} });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'kafka_unavailable' });
  });

  it('returns 503 when publishMessage throws', async () => {
    vi.mocked(kafkaProducer.publishMessage).mockRejectedValue(new Error('broker gone'));

    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/dispatch')
      .send({ command_type: 'run-node', target_node_id: 'node_build_loop', payload: {} });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'kafka_unavailable' });
  });

  it('returns 200 with request_id, status, topic, and timestamp on happy path', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/dispatch')
      .send({ command_type: 'run-node', target_node_id: 'node_build_loop', payload: { branch: 'main' } });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
    expect(res.body.topic).toBe('onex.cmd.omnimarket.dispatch-request.v1');
    expect(typeof res.body.request_id).toBe('string');
    expect(res.body.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(typeof res.body.timestamp).toBe('string');
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });

  it('publishes the correct envelope to Kafka', async () => {
    const routes = await loadRoutes();
    await request(buildApp(routes))
      .post('/api/dispatch')
      .send({ command_type: 'trigger-delegation', target_node_id: 'node_delegation', payload: { prompt: 'hello' } });

    expect(kafkaProducer.publishMessage).toHaveBeenCalledOnce();
    const [topic, envelope] = vi.mocked(kafkaProducer.publishMessage).mock.calls[0] as [string, Record<string, unknown>];
    expect(topic).toBe('onex.cmd.omnimarket.dispatch-request.v1');
    expect(envelope.command_type).toBe('trigger-delegation');
    expect(envelope.target_node_id).toBe('node_delegation');
    expect((envelope.payload as Record<string, unknown>).prompt).toBe('hello');
    expect(envelope.requested_by).toBe('omnidash-ui');
    expect(typeof envelope.request_id).toBe('string');
    expect(typeof envelope.requested_at).toBe('string');
  });
});

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
    });
  });
});

// OMN-12149: topic registration test
describe('COMMAND_TOPICS registry', () => {
  it('dispatchRequest key maps to the correct topic string', async () => {
    const { COMMAND_TOPICS } = await import('../../shared/types/command-topics.js');
    expect(COMMAND_TOPICS.dispatchRequest).toBe('onex.cmd.omnimarket.dispatch-request.v1');
  });

  it('delegateSkill key maps to the contract-declared delegate-skill command topic', async () => {
    const { COMMAND_TOPICS } = await import('../../shared/types/command-topics.js');
    expect(COMMAND_TOPICS.delegateSkill).toBe('onex.cmd.omnimarket.delegate-skill.v1');
  });
});
