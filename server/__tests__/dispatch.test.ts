import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { TenantContext } from '../auth-middleware.js';

const runtimeMocks = vi.hoisted(() => ({
  invokeRuntimeCommand: vi.fn(),
}));

vi.mock('../runtime-skill-client.js', async () => {
  const actual = await vi.importActual<typeof import('../runtime-skill-client.js')>(
    '../runtime-skill-client.js',
  );
  return { ...actual, invokeRuntimeCommand: runtimeMocks.invokeRuntimeCommand };
});

import { RuntimeEdgeError } from '../runtime-skill-client.js';

const MOCK_TENANT: TenantContext = {
  tenant_id: 'test-tenant-id',
  tenant_slug: 'test-tenant',
  sub: 'user-test',
  roles: [],
};

async function loadRoutes() {
  vi.resetModules();
  const mod = await import('../routes.js');
  return mod.default;
}

function buildApp(routes: express.Router, tenant: TenantContext = MOCK_TENANT) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.tenant = tenant; next(); });
  app.use(routes);
  return app;
}

function completedRuntimeResponse(commandName: string, topic: string, correlationId: string) {
  return {
    ok: true,
    command_name: commandName,
    resolved_node_name: commandName,
    contract_name: commandName,
    command_topic: topic,
    terminal_event: topic.replace('onex.cmd.', 'onex.evt.').replace('-requested', '-completed'),
    correlation_id: correlationId,
    output_payloads: [{ result: 'completed' }],
  };
}

describe('POST /api/delegation/trigger', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
    runtimeMocks.invokeRuntimeCommand.mockImplementation(async (input) =>
      completedRuntimeResponse(
        input.commandName,
        'onex.cmd.omnimarket.delegate-skill.v1',
        input.correlationId,
      ));
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

  it('returns 400 when task_type is outside the contract taxonomy', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'do work', task_type: 'general' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid task_type');
    expect(res.body.allowed_task_types).toContain('reasoning');
  });

  // OMN-16840: the shared task-type contract now carries the routing
  // authority's routing_availability declaration. A class declared
  // pending_capability has no tier that can execute it — publishing the
  // envelope only buys a dispatch_timeout, so the route refuses up front.
  it('refuses a task_type the contract declares routing-unavailable', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'break this objective into subtasks', task_type: 'agent_delegation' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('task_type_unavailable');
    expect(res.body.missing_capability).toBe('agent_orchestration');
    expect(res.body.reason).toMatch(/No routing tier can execute agentic/i);
    expect(res.body.retryable).toBe(false);
    expect(runtimeMocks.invokeRuntimeCommand).not.toHaveBeenCalled();
  });

  it('still dispatches a task_type with no routing_availability declaration', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'escalate this', task_type: 'escalation' });

    expect(res.status).toBe(200);
    expect(runtimeMocks.invokeRuntimeCommand).toHaveBeenCalledOnce();
    expect(runtimeMocks.invokeRuntimeCommand.mock.calls[0][0].payload.task_type).toBe('escalation');
  });

  it('invokes the typed delegation contract through the runtime edge', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'Review this PR', task_type: 'code_review' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accepted: true,
      completed: true,
      topic: 'onex.cmd.omnimarket.delegate-skill.v1',
      output_payloads: [{ result: 'completed' }],
    });
    expect(runtimeMocks.invokeRuntimeCommand).toHaveBeenCalledOnce();
    const call = runtimeMocks.invokeRuntimeCommand.mock.calls[0][0];
    expect(call.commandName).toBe('node_delegate_skill_orchestrator');
    expect(call.correlationId).toBe(res.body.correlation_id);
    expect(call.payload).toEqual({
      prompt: 'Review this PR',
      task_type: 'code_review',
      source: 'external-client',
      wait: true,
      correlation_id: res.body.correlation_id,
      metadata: {
        requested_by: 'omnidash-ui',
        source_surface: 'delegation-control-plane',
        tenant_id: MOCK_TENANT.tenant_id,
        tenant_slug: MOCK_TENANT.tenant_slug,
        sub: MOCK_TENANT.sub,
      },
      tenant_id: MOCK_TENANT.tenant_id,
    });
  });

  it('returns the typed runtime error instead of fabricating acceptance', async () => {
    runtimeMocks.invokeRuntimeCommand.mockRejectedValue(
      new RuntimeEdgeError('runtime is draining', {
        code: 'runtime_unavailable',
        retryable: true,
      }),
    );
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/delegation/trigger')
      .send({ prompt: 'do work', task_type: 'reasoning' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'runtime_unavailable',
      detail: 'runtime is draining',
      retryable: true,
    });
  });
});

describe('POST /api/sea/generate', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
    runtimeMocks.invokeRuntimeCommand.mockImplementation(async (input) =>
      completedRuntimeResponse(
        input.commandName,
        'onex.cmd.omnimarket.node-generation-requested.v1',
        input.correlationId,
      ));
  });

  afterEach(() => {
    delete process.env.OMNIDASH_DATA_SOURCE;
    vi.clearAllMocks();
  });

  it('returns 400 when task_description is missing', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).post('/api/sea/generate').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'task_description is required' });
  });

  it('invokes node generation through the runtime edge', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/sea/generate')
      .send({ task_description: 'Generate a summarizer node' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accepted: true,
      completed: true,
      topic: 'onex.cmd.omnimarket.node-generation-requested.v1',
    });
    const call = runtimeMocks.invokeRuntimeCommand.mock.calls[0][0];
    expect(call.commandName).toBe('node_generation_consumer');
    expect(call.correlationId).toBe(res.body.correlation_id);
    expect(call.payload).toEqual({
      task_description: 'Generate a summarizer node',
      correlation_id: res.body.correlation_id,
    });
  });

  it('returns 503 when the runtime edge fails', async () => {
    runtimeMocks.invokeRuntimeCommand.mockRejectedValue(
      new RuntimeEdgeError('MSK unavailable', { code: 'dispatch_error', retryable: true }),
    );
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/sea/generate')
      .send({ task_description: 'Generate a summarizer node' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('dispatch_error');
    expect(res.body.retryable).toBe(true);
  });

  it('does not expose a /api/hackathon/generate route', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/hackathon/generate')
      .send({ task_description: 'anything' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/renderer/emit', () => {
  beforeEach(() => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
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

  it.each([
    ['renderer_id', { renderer_id: undefined }, 'renderer_id is required'],
    ['action_contract_id', { action_contract_id: undefined }, 'action_contract_id is required'],
    ['contract_version', { contract_version: undefined }, 'contract_version is required'],
    ['payload', { payload: undefined }, 'payload is required and must be an object'],
  ])('returns 400 when %s is invalid', async (_field, override, error) => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes))
      .post('/api/renderer/emit')
      .send({ ...validBody, ...override });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it('fails closed because no contract-declared renderer dispatcher exists', async () => {
    const routes = await loadRoutes();
    const res = await request(buildApp(routes)).post('/api/renderer/emit').send(validBody);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'renderer_action_dispatcher_unavailable',
      detail: 'No contract-declared runtime handler consumes renderer actions',
    });
    expect(runtimeMocks.invokeRuntimeCommand).not.toHaveBeenCalled();
  });
});

describe('COMMAND_TOPICS registry', () => {
  it('retains contract topic constants for projection and evidence display', async () => {
    const { COMMAND_TOPICS } = await import('../../shared/types/command-topics.js');
    expect(COMMAND_TOPICS.delegateSkill).toBe('onex.cmd.omnimarket.delegate-skill.v1');
    expect(COMMAND_TOPICS.nodeGenerationRequested).toBe(
      'onex.cmd.omnimarket.node-generation-requested.v1',
    );
    expect(COMMAND_TOPICS.rendererAction).toBe('onex.cmd.omnidash.renderer-action.v1');
  });
});
