/**
 * Integration tests for WebSocket ↔ EventBusDataSource broadcast pipeline.
 *
 * Tests the event flow:
 *   EventBusDataSource.emit('event') → eventBusEventHandler → broadcast('EVENT_BUS_EVENT', ..., 'event-bus') → client
 *
 * These tests use a real HTTP+WS server but mock Kafka and database dependencies
 * to validate the broadcast wiring without external infrastructure.
 *
 * Key scenarios:
 * - EventBusDataSource 'event' emission broadcasts EVENT_BUS_EVENT to subscribed clients
 * - Clients subscribed to 'all' receive event-bus events
 * - Clients subscribed only to 'event-bus' receive event-bus events
 * - Clients NOT subscribed to 'event-bus' or 'all' do NOT receive event-bus events
 * - INITIAL_STATE includes eventBusEvents from preloaded cache
 * - EventBusDataSource status events (connected/disconnected/error) broadcast correctly
 * - Heartbeat keeps connections alive (no flapping)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';

// ---- Mocks ----

class MockEventConsumer extends EventEmitter {
  getAgentMetrics() {
    return [];
  }
  getRecentActions() {
    return [];
  }
  getRoutingDecisions() {
    return [];
  }
  getRecentTransformations() {
    return [];
  }
  getPerformanceStats() {
    return {};
  }
  getHealthStatus() {
    return { status: 'healthy', eventsProcessed: 0, timestamp: new Date().toISOString() };
  }
  getRegisteredNodes() {
    return [];
  }
  getNodeRegistryStats() {
    return { totalNodes: 0, activeNodes: 0, inactiveNodes: 0 };
  }
  getPreloadedEventBusEvents() {
    return [];
  }
}

const mockEventConsumer = new MockEventConsumer();

// A real EventEmitter that we can control from tests
const mockEventBusDataSource = new EventEmitter();

vi.mock('../event-consumer', () => ({
  eventConsumer: mockEventConsumer,
}));

vi.mock('../event-bus-data-source', () => ({
  getEventBusDataSource: () => mockEventBusDataSource,
}));

vi.mock('../playback-data-source', () => ({
  getPlaybackDataSource: () => new EventEmitter(),
}));

vi.mock('../playback-events', () => ({
  playbackEventEmitter: new EventEmitter(),
}));

vi.mock('../registry-events', () => ({
  registryEventEmitter: new EventEmitter(),
}));

vi.mock('../intent-events', () => ({
  intentEventEmitter: new EventEmitter(),
}));

vi.mock('../utils/case-transform', () => ({
  transformNodeIntrospectionToSnakeCase: (e: any) => e,
  transformNodeHeartbeatToSnakeCase: (e: any) => e,
  transformNodeStateChangeToSnakeCase: (e: any) => e,
  transformNodesToSnakeCase: (nodes: any) => nodes,
}));

vi.mock('../storage', () => ({
  getIntelligenceDb: () => null,
}));

// ---- Lazy import ----
let setupWebSocket: typeof import('../websocket').setupWebSocket;

beforeAll(async () => {
  const mod = await import('../websocket');
  setupWebSocket = mod.setupWebSocket;
});

// ---- Helpers ----

function makeSampleEvent() {
  return {
    event_id: `evt-${Date.now()}`,
    event_type: 'dev.onex.evt.archon.session-started.v1',
    timestamp: new Date().toISOString(),
    tenant_id: 'test-tenant',
    namespace: 'test-ns',
    source: 'archon',
    correlation_id: 'corr-1',
    causation_id: undefined,
    schema_ref: 'test-schema',
    payload: { foo: 'bar' },
    topic: 'dev.onex.evt.archon.session-started.v1',
    partition: 0,
    offset: '42',
    processed_at: new Date(),
  };
}

async function connectClient(
  port: number
): Promise<{
  ws: WebSocket;
  messages: any[];
  waitForMessages: (count: number, timeoutMs?: number) => Promise<void>;
}> {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const messages: any[] = [];

  ws.on('message', (data: WebSocket.Data) => {
    messages.push(JSON.parse(data.toString()));
  });

  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Wait for initial messages (CONNECTED + INITIAL_STATE)
  await new Promise((r) => setTimeout(r, 150));

  const waitForMessages = (count: number, timeoutMs = 2000): Promise<void> => {
    const start = messages.length;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(`Timed out waiting for ${count} messages (got ${messages.length - start})`)
          ),
        timeoutMs
      );
      const check = () => {
        if (messages.length - start >= count) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(check, 20);
        }
      };
      check();
    });
  };

  return { ws, messages, waitForMessages };
}

async function closeAll(wss: WebSocket.Server | null, httpServer: HTTPServer | null) {
  if (wss) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.terminate();
      }
    });
    await new Promise<void>((resolve) => {
      if ((wss as any)._closed || wss.address() === null) return resolve();
      wss.close(() => resolve());
    });
  }
  if (httpServer) {
    await new Promise<void>((resolve) => {
      if (!httpServer.listening) return resolve();
      httpServer.close(() => resolve());
    });
  }
}

// ---- Test Suite ----

describe('WebSocket EventBusDataSource broadcast pipeline', () => {
  let httpServer: HTTPServer | null;
  let wss: WebSocket.Server | null;
  let port: number;

  beforeEach(async () => {
    httpServer = new HTTPServer();
    await new Promise<void>((resolve) => {
      httpServer!.listen(0, () => {
        const addr = httpServer!.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
    wss = setupWebSocket(httpServer!);
  });

  afterEach(async () => {
    // Remove all listeners on mock event bus to prevent leaks between tests
    mockEventBusDataSource.removeAllListeners();
    mockEventConsumer.removeAllListeners();
    await closeAll(wss, httpServer);
    wss = null;
    httpServer = null;
  });

  // ----------------------------------------------------------------
  // Core broadcast flow
  // ----------------------------------------------------------------

  it('should broadcast EVENT_BUS_EVENT to client subscribed to "all" when EventBusDataSource emits event', async () => {
    const { ws, messages } = await connectClient(port);

    // Client gets 'all' subscription by default. Clear initial messages.
    const initialCount = messages.length;

    // Emit event from EventBusDataSource
    const event = makeSampleEvent();
    mockEventBusDataSource.emit('event', event);

    // Wait for broadcast to arrive
    await new Promise((r) => setTimeout(r, 200));

    const eventBusMessages = messages
      .slice(initialCount)
      .filter((m) => m.type === 'EVENT_BUS_EVENT');
    expect(eventBusMessages.length).toBe(1);

    const received = eventBusMessages[0];
    expect(received.data).toMatchObject({
      id: event.event_id,
      event_type: event.event_type,
      topic: event.topic,
      source: event.source,
      correlation_id: event.correlation_id,
      partition: event.partition,
      offset: event.offset,
    });
    expect(received.data.payload).toEqual(event.payload);
    expect(received.timestamp).toBeDefined();

    ws.close();
  });

  it('should broadcast EVENT_BUS_EVENT to client subscribed specifically to "event-bus"', async () => {
    const { ws, messages } = await connectClient(port);

    // Subscribe to event-bus, then unsubscribe from all
    ws.send(JSON.stringify({ action: 'subscribe', topics: ['event-bus'] }));
    await new Promise((r) => setTimeout(r, 100));
    ws.send(JSON.stringify({ action: 'unsubscribe', topics: ['all'] }));
    await new Promise((r) => setTimeout(r, 100));

    const beforeCount = messages.length;

    mockEventBusDataSource.emit('event', makeSampleEvent());
    await new Promise((r) => setTimeout(r, 200));

    const newMessages = messages.slice(beforeCount);
    const eventBusMessages = newMessages.filter((m) => m.type === 'EVENT_BUS_EVENT');
    expect(eventBusMessages.length).toBe(1);

    ws.close();
  });

  it('should NOT broadcast EVENT_BUS_EVENT to client subscribed only to "actions"', async () => {
    const { ws, messages } = await connectClient(port);

    // Subscribe to actions, unsubscribe from all
    ws.send(JSON.stringify({ action: 'subscribe', topics: ['actions'] }));
    await new Promise((r) => setTimeout(r, 100));
    ws.send(JSON.stringify({ action: 'unsubscribe', topics: ['all'] }));
    await new Promise((r) => setTimeout(r, 100));

    const beforeCount = messages.length;

    mockEventBusDataSource.emit('event', makeSampleEvent());
    await new Promise((r) => setTimeout(r, 200));

    const eventBusMessages = messages
      .slice(beforeCount)
      .filter((m) => m.type === 'EVENT_BUS_EVENT');
    expect(eventBusMessages.length).toBe(0);

    ws.close();
  });

  // ----------------------------------------------------------------
  // INITIAL_STATE
  // ----------------------------------------------------------------

  it('should include eventBusEvents in INITIAL_STATE from preloaded cache', async () => {
    // Setup preloaded events
    const preloadedEvent = makeSampleEvent();
    preloadedEvent.event_id = 'preloaded-1';
    vi.spyOn(mockEventConsumer, 'getPreloadedEventBusEvents').mockReturnValue([preloadedEvent]);

    const { ws, messages } = await connectClient(port);

    const initialState = messages.find((m) => m.type === 'INITIAL_STATE');
    expect(initialState).toBeDefined();
    expect(initialState.data.eventBusEvents).toBeDefined();
    expect(initialState.data.eventBusEvents.length).toBe(1);
    expect(initialState.data.eventBusEvents[0].event_id).toBe('preloaded-1');

    // recentActions should be populated from the preloaded events (transformed)
    expect(initialState.data.recentActions.length).toBe(1);
    expect(initialState.data.recentActions[0].id).toBe('preloaded-1');

    vi.restoreAllMocks();
    ws.close();
  });

  it('should include eventBusEvents in CURRENT_STATE response to getState action', async () => {
    const preloadedEvent = makeSampleEvent();
    preloadedEvent.event_id = 'preloaded-getstate';
    vi.spyOn(mockEventConsumer, 'getPreloadedEventBusEvents').mockReturnValue([preloadedEvent]);

    const { ws, messages } = await connectClient(port);
    const beforeCount = messages.length;

    ws.send(JSON.stringify({ action: 'getState' }));
    await new Promise((r) => setTimeout(r, 200));

    const currentState = messages.slice(beforeCount).find((m) => m.type === 'CURRENT_STATE');
    expect(currentState).toBeDefined();
    expect(currentState.data.eventBusEvents.length).toBe(1);
    expect(currentState.data.eventBusEvents[0].event_id).toBe('preloaded-getstate');

    vi.restoreAllMocks();
    ws.close();
  });

  // ----------------------------------------------------------------
  // EventBusDataSource status events
  // ----------------------------------------------------------------

  it('should broadcast EVENT_BUS_STATUS connected when EventBusDataSource emits connected', async () => {
    const { ws, messages } = await connectClient(port);
    const beforeCount = messages.length;

    mockEventBusDataSource.emit('connected');
    await new Promise((r) => setTimeout(r, 200));

    const statusMessages = messages.slice(beforeCount).filter((m) => m.type === 'EVENT_BUS_STATUS');
    expect(statusMessages.length).toBe(1);
    expect(statusMessages[0].data.status).toBe('connected');

    ws.close();
  });

  it('should broadcast EVENT_BUS_STATUS disconnected when EventBusDataSource emits disconnected', async () => {
    const { ws, messages } = await connectClient(port);
    const beforeCount = messages.length;

    mockEventBusDataSource.emit('disconnected');
    await new Promise((r) => setTimeout(r, 200));

    const statusMessages = messages.slice(beforeCount).filter((m) => m.type === 'EVENT_BUS_STATUS');
    expect(statusMessages.length).toBe(1);
    expect(statusMessages[0].data.status).toBe('disconnected');

    ws.close();
  });

  it('should broadcast EVENT_BUS_ERROR when EventBusDataSource emits error', async () => {
    const { ws, messages } = await connectClient(port);
    const beforeCount = messages.length;

    mockEventBusDataSource.emit('error', new Error('Kafka connection lost'));
    await new Promise((r) => setTimeout(r, 200));

    const errorMessages = messages.slice(beforeCount).filter((m) => m.type === 'EVENT_BUS_ERROR');
    expect(errorMessages.length).toBe(1);
    expect(errorMessages[0].data.message).toBe('Kafka connection lost');

    ws.close();
  });

  // ----------------------------------------------------------------
  // Multiple clients
  // ----------------------------------------------------------------

  it('should broadcast EVENT_BUS_EVENT to multiple connected clients', async () => {
    const client1 = await connectClient(port);
    const client2 = await connectClient(port);

    const before1 = client1.messages.length;
    const before2 = client2.messages.length;

    mockEventBusDataSource.emit('event', makeSampleEvent());
    await new Promise((r) => setTimeout(r, 200));

    const events1 = client1.messages.slice(before1).filter((m) => m.type === 'EVENT_BUS_EVENT');
    const events2 = client2.messages.slice(before2).filter((m) => m.type === 'EVENT_BUS_EVENT');

    expect(events1.length).toBe(1);
    expect(events2.length).toBe(1);

    client1.ws.close();
    client2.ws.close();
  });

  it('should only deliver EVENT_BUS_EVENT to clients with matching subscription', async () => {
    // client1 subscribes to 'all' (default), client2 subscribes only to 'actions'
    const client1 = await connectClient(port);
    const client2 = await connectClient(port);

    // client2: subscribe to 'actions', remove 'all'
    client2.ws.send(JSON.stringify({ action: 'subscribe', topics: ['actions'] }));
    await new Promise((r) => setTimeout(r, 100));
    client2.ws.send(JSON.stringify({ action: 'unsubscribe', topics: ['all'] }));
    await new Promise((r) => setTimeout(r, 100));

    const before1 = client1.messages.length;
    const before2 = client2.messages.length;

    mockEventBusDataSource.emit('event', makeSampleEvent());
    await new Promise((r) => setTimeout(r, 200));

    const events1 = client1.messages.slice(before1).filter((m) => m.type === 'EVENT_BUS_EVENT');
    const events2 = client2.messages.slice(before2).filter((m) => m.type === 'EVENT_BUS_EVENT');

    expect(events1.length).toBe(1); // 'all' matches
    expect(events2.length).toBe(0); // 'actions' doesn't match 'event-bus'

    client1.ws.close();
    client2.ws.close();
  });

  // ----------------------------------------------------------------
  // Event transformation correctness
  // ----------------------------------------------------------------

  it('should correctly transform EventBusEvent fields for WebSocket delivery', async () => {
    const { ws, messages } = await connectClient(port);
    const beforeCount = messages.length;

    const event = makeSampleEvent();
    event.event_id = 'transform-test-123';
    event.event_type = 'dev.onex.cmd.producer.my-action.v2';
    event.tenant_id = 'acme-corp';
    event.namespace = 'production';
    event.source = 'my-producer';
    event.correlation_id = 'corr-xyz';
    event.causation_id = 'cause-abc';
    event.schema_ref = 'schemas/my-action/v2';
    event.payload = { key: 'value', nested: { a: 1 } };
    event.topic = 'dev.onex.cmd.producer.my-action.v2';
    event.partition = 3;
    event.offset = '999';
    event.processed_at = new Date('2024-06-15T10:30:00Z');

    mockEventBusDataSource.emit('event', event);
    await new Promise((r) => setTimeout(r, 200));

    const received = messages.slice(beforeCount).find((m) => m.type === 'EVENT_BUS_EVENT');
    expect(received).toBeDefined();
    expect(received.data).toEqual({
      id: 'transform-test-123',
      event_type: 'dev.onex.cmd.producer.my-action.v2',
      timestamp: event.timestamp,
      tenant_id: 'acme-corp',
      namespace: 'production',
      source: 'my-producer',
      correlation_id: 'corr-xyz',
      causation_id: 'cause-abc',
      schema_ref: 'schemas/my-action/v2',
      payload: { key: 'value', nested: { a: 1 } },
      topic: 'dev.onex.cmd.producer.my-action.v2',
      partition: 3,
      offset: '999',
      processed_at: '2024-06-15T10:30:00.000Z',
    });

    ws.close();
  });

  // ----------------------------------------------------------------
  // Rapid event burst
  // ----------------------------------------------------------------

  it('should handle rapid event bursts without dropping messages', async () => {
    const { ws, messages } = await connectClient(port);
    const beforeCount = messages.length;

    const burstSize = 20;
    for (let i = 0; i < burstSize; i++) {
      const event = makeSampleEvent();
      event.event_id = `burst-${i}`;
      mockEventBusDataSource.emit('event', event);
    }

    // Allow time for all messages to arrive
    await new Promise((r) => setTimeout(r, 500));

    const eventBusMessages = messages
      .slice(beforeCount)
      .filter((m) => m.type === 'EVENT_BUS_EVENT');
    expect(eventBusMessages.length).toBe(burstSize);

    // Verify all event IDs are present
    const receivedIds = new Set(eventBusMessages.map((m) => m.data.id));
    for (let i = 0; i < burstSize; i++) {
      expect(receivedIds.has(`burst-${i}`)).toBe(true);
    }

    ws.close();
  });

  // ----------------------------------------------------------------
  // Heartbeat / flapping
  // ----------------------------------------------------------------

  it('should keep connection alive when client responds to pong (no flapping)', async () => {
    const { ws } = await connectClient(port);

    // The ws library automatically responds to server pings with pong.
    // We just need to verify the connection stays open over time.
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Wait a bit and verify still connected
    await new Promise((r) => setTimeout(r, 500));
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
  });

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------

  it('should remove EventBusDataSource listeners when server closes', async () => {
    // The eventBusDataSource had listeners added by setupWebSocket.
    // After closing, they should be cleaned up.
    const listenerCountBefore = mockEventBusDataSource.listenerCount('event');
    expect(listenerCountBefore).toBeGreaterThanOrEqual(1);

    await closeAll(wss, httpServer);

    const listenerCountAfter = mockEventBusDataSource.listenerCount('event');
    expect(listenerCountAfter).toBe(0);
    expect(mockEventBusDataSource.listenerCount('connected')).toBe(0);
    expect(mockEventBusDataSource.listenerCount('disconnected')).toBe(0);
    expect(mockEventBusDataSource.listenerCount('error')).toBe(0);

    // Prevent afterEach from double-closing
    wss = null;
    httpServer = null;
  });
});
