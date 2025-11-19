import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';

/**
 * Mock EventConsumer for testing WebSocket integration
 */
class MockEventConsumer extends EventEmitter {
  getAgentMetrics() {
    return [
      {
        agent: 'test-agent-1',
        totalRequests: 100,
        successRate: 0.95,
        avgRoutingTime: 50,
        avgConfidence: 0.85,
        lastSeen: new Date(),
      },
    ];
  }

  getRecentActions() {
    return [
      {
        id: '1',
        correlationId: 'corr-1',
        agentName: 'test-agent-1',
        actionType: 'tool_call',
        actionName: 'read_file',
        durationMs: 100,
        createdAt: new Date(),
      },
    ];
  }

  getRoutingDecisions() {
    return [
      {
        id: '1',
        correlationId: 'corr-1',
        userRequest: 'test request',
        selectedAgent: 'test-agent-1',
        confidenceScore: 0.85,
        routingStrategy: 'semantic',
        routingTimeMs: 50,
        createdAt: new Date(),
      },
    ];
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      eventsProcessed: 100,
      recentActionsCount: 10,
      timestamp: new Date().toISOString(),
    };
  }
}

// Create a single instance of the mock that will be reused
const mockInstance = new MockEventConsumer();

// Mock the event-consumer module before imports
vi.mock('../event-consumer', () => {
  return {
    eventConsumer: mockInstance,
  };
});

// Import after mocking
const { setupWebSocket } = await import('../websocket');
const { eventConsumer: mockEventConsumer } = await import('../event-consumer');

const EVENT_CONSUMER_EVENTS = [
  'metricUpdate',
  'actionUpdate',
  'routingUpdate',
  'error',
  'connected',
  'disconnected',
] as const;

async function closeWebSocketServer(
  instance: WebSocket.Server | null | undefined,
  server?: HTTPServer | null
) {
  if (instance) {
    instance.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.terminate();
      }
    });

    await new Promise<void>((resolve) => {
      // If the server is already closed, resolve immediately
      if ((instance as any)._closed || instance.address() === null) {
        return resolve();
      }
      instance.close(() => resolve());
    });
  }

  if (server) {
    await new Promise<void>((resolve) => {
      if (!server.listening) {
        return resolve();
      }
      server.close(() => resolve());
    });
  }
}

function resetEventConsumerListeners() {
  EVENT_CONSUMER_EVENTS.forEach((event) => {
    mockEventConsumer.removeAllListeners(event);
  });
}

/**
 * Helper to wait for WebSocket connection and collect messages
 */
async function connectAndCollect(port: number): Promise<{
  ws: WebSocket;
  messages: any[];
}> {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const messages: any[] = [];

  ws.on('message', (data: WebSocket.Data) => {
    messages.push(JSON.parse(data.toString()));
  });

  await new Promise<void>((resolve) => {
    ws.on('open', resolve);
  });

  // Wait for initial messages
  await new Promise((resolve) => setTimeout(resolve, 100));

  return { ws, messages };
}

// TODO(omnidash-394): Re-enable once global test suite finishes within CI timeout.
// Full WebSocket integration suite spins up real HTTP + WS servers and still causes
// Vitest to report open handles when thousands of other tests run. Temporarily skipping
// to unblock CI until we migrate these to lighter-weight unit tests.
describe.skip('WebSocket Server', () => {
  let httpServer: HTTPServer | null;
  let wss: WebSocket.Server | null;
  let serverPort: number;

  beforeEach(async () => {
    // Create HTTP server for WebSocket to attach to
    httpServer = new HTTPServer();

    // Find available port
    await new Promise<void>((resolve) => {
      httpServer!.listen(0, () => {
        const addr = httpServer!.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });

    // Setup WebSocket server
    wss = setupWebSocket(httpServer);
  });

  afterEach(async () => {
    await closeWebSocketServer(wss, httpServer);
    resetEventConsumerListeners();
    wss = null;
    httpServer = null;
  });

  it('should accept client connections and send welcome message', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Verify welcome message
    expect(messages[0]).toMatchObject({
      type: 'CONNECTED',
      message: expect.stringContaining('Connected'),
    });

    // Verify initial state message
    expect(messages[1]).toMatchObject({
      type: 'INITIAL_STATE',
      data: expect.objectContaining({
        metrics: expect.any(Array),
        recentActions: expect.any(Array),
        routingDecisions: expect.any(Array),
        health: expect.any(Object),
      }),
    });

    ws.close();
  });

  it('should filter events by client subscriptions', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Clear initial messages
    messages.length = 0;

    // Subscribe to 'actions' FIRST (so we have a subscription)
    ws.send(JSON.stringify({
      action: 'subscribe',
      topics: ['actions'],
    }));

    await new Promise((resolve) => setTimeout(resolve, 100));
    messages.length = 0;

    // THEN unsubscribe from 'all' (so 'all' won't be re-added)
    ws.send(JSON.stringify({
      action: 'unsubscribe',
      topics: ['all'],
    }));

    // Wait for subscription confirmation
    await new Promise((resolve) => setTimeout(resolve, 100));

    const subMsg = messages.find(m => m.type === 'SUBSCRIPTION_UPDATED');
    expect(subMsg.subscriptions).toContain('actions');
    expect(subMsg.subscriptions).not.toContain('all');

    // Clear messages before emitting events
    messages.length = 0;

    // Emit various event types
    (mockEventConsumer as EventEmitter).emit('actionUpdate', {
      id: '1',
      agentName: 'test-agent',
      actionType: 'tool_call',
    });

    (mockEventConsumer as EventEmitter).emit('metricUpdate', [
      { agent: 'test-agent', totalRequests: 100 },
    ]);

    (mockEventConsumer as EventEmitter).emit('routingUpdate', {
      id: '1',
      selectedAgent: 'test-agent',
    });

    // Wait for messages to be processed
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should only receive 'actions' events (AGENT_ACTION)
    const actionMessages = messages.filter(
      (m) => m.type === 'AGENT_ACTION'
    );
    const metricMessages = messages.filter(
      (m) => m.type === 'AGENT_METRIC_UPDATE'
    );
    const routingMessages = messages.filter(
      (m) => m.type === 'ROUTING_DECISION'
    );

    expect(actionMessages.length).toBeGreaterThan(0);
    expect(metricMessages.length).toBe(0);
    expect(routingMessages.length).toBe(0);

    ws.close();
  });

  it('should handle client disconnection and cleanup', async () => {
    const { ws } = await connectAndCollect(serverPort);

    // Verify client is connected
    expect(wss.clients.size).toBe(1);

    // Close connection
    ws.close();

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify client is removed
    expect(wss.clients.size).toBe(0);
  });

  it('should handle invalid subscription requests gracefully', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Clear initial messages
    messages.length = 0;

    // Send malformed message
    ws.send('invalid json{');

    // Wait for error response
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should receive error message
    const errorMessage = messages.find(m => m.type === 'ERROR');
    expect(errorMessage).toBeDefined();
    expect(errorMessage.message).toContain('Invalid message format');

    // Connection should remain open
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
  });

  it('should respond to ping messages', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Clear initial messages
    messages.length = 0;

    // Send ping
    ws.send(JSON.stringify({ action: 'ping' }));

    // Wait for pong response
    await new Promise((resolve) => setTimeout(resolve, 200));

    const pongMessage = messages.find(m => m.type === 'PONG');
    expect(pongMessage).toBeDefined();

    ws.close();
  });

  it('should handle getState action', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Clear initial messages
    messages.length = 0;

    // Request current state
    ws.send(JSON.stringify({ action: 'getState' }));

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 200));

    const stateMessage = messages.find(m => m.type === 'CURRENT_STATE');
    expect(stateMessage).toBeDefined();
    expect(stateMessage.data).toHaveProperty('metrics');
    expect(stateMessage.data).toHaveProperty('recentActions');
    expect(stateMessage.data).toHaveProperty('routingDecisions');
    expect(stateMessage.data).toHaveProperty('health');

    ws.close();
  });

  it('should handle unsubscribe action', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Clear initial messages
    messages.length = 0;

    // Subscribe to multiple topics
    ws.send(
      JSON.stringify({
        action: 'subscribe',
        topics: ['actions', 'metrics', 'routing'],
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify subscription
    const subMsg1 = messages.find(m => m.type === 'SUBSCRIPTION_UPDATED');
    expect(subMsg1.subscriptions).toContain('actions');
    expect(subMsg1.subscriptions).toContain('metrics');
    expect(subMsg1.subscriptions).toContain('routing');

    // Clear messages
    messages.length = 0;

    // Unsubscribe from some topics
    ws.send(
      JSON.stringify({
        action: 'unsubscribe',
        topics: ['actions', 'metrics'],
      })
    );

    // Wait for unsubscribe confirmation
    await new Promise((resolve) => setTimeout(resolve, 100));

    const subMsg2 = messages.find(m => m.type === 'SUBSCRIPTION_UPDATED');
    expect(subMsg2).toBeDefined();
    expect(subMsg2.subscriptions).toContain('all');
    expect(subMsg2.subscriptions).toContain('routing');
    expect(subMsg2.subscriptions).not.toContain('actions');
    expect(subMsg2.subscriptions).not.toContain('metrics');

    ws.close();
  });

  it('should default to "all" when all subscriptions are removed', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Clear initial messages
    messages.length = 0;

    // Unsubscribe from 'all' (the default subscription)
    ws.send(JSON.stringify({ action: 'unsubscribe', topics: ['all'] }));

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 100));

    const subMsg = messages.find(m => m.type === 'SUBSCRIPTION_UPDATED');
    // Should revert to 'all' since no subscriptions remain
    expect(subMsg.subscriptions).toContain('all');
    expect(subMsg.subscriptions.length).toBe(1);

    ws.close();
  });

  it('should broadcast consumer status events', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Subscribe to system events
    ws.send(JSON.stringify({ action: 'subscribe', topics: ['system'] }));

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clear messages
    messages.length = 0;

    // Emit consumer connected event
    (mockEventConsumer as EventEmitter).emit('connected');

    // Wait for message
    await new Promise((resolve) => setTimeout(resolve, 200));

    const statusMessage = messages.find(m => m.type === 'CONSUMER_STATUS');
    expect(statusMessage).toBeDefined();
    expect(statusMessage.data.status).toBe('connected');

    ws.close();
  });

  it('should broadcast error events', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Subscribe to error events
    ws.send(JSON.stringify({ action: 'subscribe', topics: ['errors'] }));

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clear messages
    messages.length = 0;

    // Emit error from event consumer
    (mockEventConsumer as EventEmitter).emit('error', new Error('Test error'));

    // Wait for message
    await new Promise((resolve) => setTimeout(resolve, 200));

    const errorMessage = messages.find(m => m.type === 'ERROR');
    expect(errorMessage).toBeDefined();
    expect(errorMessage.data.message).toContain('Test error');

    ws.close();
  });

  it('should handle array and string subscription topics', async () => {
    const { ws, messages } = await connectAndCollect(serverPort);

    // Clear initial messages
    messages.length = 0;

    // Subscribe with string (single topic)
    ws.send(JSON.stringify({ action: 'subscribe', topics: 'actions' }));

    await new Promise((resolve) => setTimeout(resolve, 100));

    const subMsg1 = messages.find(m => m.type === 'SUBSCRIPTION_UPDATED');
    expect(subMsg1.subscriptions).toContain('actions');

    // Clear messages
    messages.length = 0;

    // Subscribe with array (multiple topics)
    ws.send(
      JSON.stringify({ action: 'subscribe', topics: ['metrics', 'routing'] })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const subMsg2 = messages.find(m => m.type === 'SUBSCRIPTION_UPDATED');
    expect(subMsg2.subscriptions).toContain('metrics');
    expect(subMsg2.subscriptions).toContain('routing');

    ws.close();
  });

  it('should send messages only to clients with open connections', async () => {
    const { ws: ws1, messages: messages1 } = await connectAndCollect(serverPort);
    const { ws: ws2, messages: messages2 } = await connectAndCollect(serverPort);

    // Wait for both connections
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clear initial messages
    messages1.length = 0;
    messages2.length = 0;

    // Close first connection
    ws1.close();

    // Wait for connection to close
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Broadcast event
    (mockEventConsumer as EventEmitter).emit('actionUpdate', { id: '1', actionType: 'test' });

    // Wait for message processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Only ws2 should receive the message
    expect(messages1.length).toBe(0);
    expect(messages2.length).toBeGreaterThan(0);

    ws2.close();
  });

  it('should support multiple concurrent clients with different subscriptions', async () => {
    const client1 = await connectAndCollect(serverPort);
    const client2 = await connectAndCollect(serverPort);
    const client3 = await connectAndCollect(serverPort);

    // Subscribe to specific topics FIRST
    client1.ws.send(JSON.stringify({ action: 'subscribe', topics: ['actions'] }));
    client2.ws.send(JSON.stringify({ action: 'subscribe', topics: ['metrics'] }));
    client3.ws.send(JSON.stringify({ action: 'subscribe', topics: ['routing'] }));

    await new Promise((resolve) => setTimeout(resolve, 100));

    // THEN unsubscribe from 'all'
    client1.ws.send(JSON.stringify({ action: 'unsubscribe', topics: ['all'] }));
    client2.ws.send(JSON.stringify({ action: 'unsubscribe', topics: ['all'] }));
    client3.ws.send(JSON.stringify({ action: 'unsubscribe', topics: ['all'] }));

    // Wait for unsubscriptions
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clear all messages
    client1.messages.length = 0;
    client2.messages.length = 0;
    client3.messages.length = 0;

    // Broadcast different event types
    (mockEventConsumer as EventEmitter).emit('actionUpdate', { id: '1', actionType: 'test' });
    (mockEventConsumer as EventEmitter).emit('metricUpdate', [{ agent: 'test' }]);
    (mockEventConsumer as EventEmitter).emit('routingUpdate', { id: '1', selectedAgent: 'test' });

    // Wait for message processing
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify each client received only subscribed events
    expect(client1.messages.some((m) => m.type === 'AGENT_ACTION')).toBe(true);
    expect(client1.messages.some((m) => m.type === 'AGENT_METRIC_UPDATE')).toBe(false);
    expect(client1.messages.some((m) => m.type === 'ROUTING_DECISION')).toBe(false);

    expect(client2.messages.some((m) => m.type === 'AGENT_ACTION')).toBe(false);
    expect(client2.messages.some((m) => m.type === 'AGENT_METRIC_UPDATE')).toBe(true);
    expect(client2.messages.some((m) => m.type === 'ROUTING_DECISION')).toBe(false);

    expect(client3.messages.some((m) => m.type === 'AGENT_ACTION')).toBe(false);
    expect(client3.messages.some((m) => m.type === 'AGENT_METRIC_UPDATE')).toBe(false);
    expect(client3.messages.some((m) => m.type === 'ROUTING_DECISION')).toBe(true);

    client1.ws.close();
    client2.ws.close();
    client3.ws.close();
  });

  it('should remove EventConsumer listeners when server closes', async () => {
    // Count listeners before closing
    const eventNames = ['metricUpdate', 'actionUpdate', 'routingUpdate', 'error', 'connected', 'disconnected'];
    const initialListenerCounts = eventNames.map(event => ({
      event,
      count: mockEventConsumer.listenerCount(event)
    }));

    // Verify listeners were added (should be exactly 1 per event)
    initialListenerCounts.forEach(({ event, count }) => {
      expect(count).toBe(1); // Each event should have exactly 1 listener from this server
    });

    // Close WebSocket server (triggers cleanup in wss.on('close'))
    await closeWebSocketServer(wss, httpServer);

    // Verify all listeners were removed (should be exactly 0)
    const finalListenerCounts = eventNames.map(event => ({
      event,
      count: mockEventConsumer.listenerCount(event)
    }));

    // Each event should have ZERO listeners (complete cleanup)
    finalListenerCounts.forEach(({ event, count }) => {
      expect(count).toBe(0); // No memory leaks - all listeners removed
    });
  });

  it('should prevent memory leaks across multiple server restarts', async () => {
    // Close the server created in beforeEach to get a clean baseline
    await closeWebSocketServer(wss, httpServer);

    // Baseline should be ZERO listeners after cleanup
    const baselineCount = mockEventConsumer.listenerCount('metricUpdate');
    expect(baselineCount).toBe(0); // Verify complete cleanup

    // Create and destroy servers sequentially to avoid race conditions
    for (let i = 0; i < 3; i++) {
      // Create new HTTP server
      const newHttpServer = new HTTPServer();
      await new Promise<void>((resolve) => {
        newHttpServer.listen(0, () => resolve());
      });

      // Setup new WebSocket server
      const newWss = setupWebSocket(newHttpServer);

      // Wait for setup to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify listeners were added (should be exactly 1)
      expect(mockEventConsumer.listenerCount('metricUpdate')).toBe(1);

      // Close WebSocket server and wait for cleanup
      await closeWebSocketServer(newWss, newHttpServer);

      // Wait for cleanup to fully complete before next iteration
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify listeners were removed after each close
      expect(mockEventConsumer.listenerCount('metricUpdate')).toBe(0);
    }

    // Final listener count should be ZERO (no accumulation)
    const finalCount = mockEventConsumer.listenerCount('metricUpdate');
    expect(finalCount).toBe(0); // No memory leaks - all listeners removed

    // Verify for all event types
    const allEvents = ['metricUpdate', 'actionUpdate', 'routingUpdate', 'error', 'connected', 'disconnected'];
    allEvents.forEach(event => {
      expect(mockEventConsumer.listenerCount(event)).toBe(0);
    });
  });

  it('should clean up all server resources when server closes', async () => {
    // Connect multiple clients
    const client1 = await connectAndCollect(serverPort);
    const client2 = await connectAndCollect(serverPort);
    const client3 = await connectAndCollect(serverPort);

    // Verify connections are open
    expect(client1.ws.readyState).toBe(WebSocket.OPEN);
    expect(client2.ws.readyState).toBe(WebSocket.OPEN);
    expect(client3.ws.readyState).toBe(WebSocket.OPEN);

    // Track how many clients are connected before close
    const initialClientCount = wss.clients.size;
    expect(initialClientCount).toBe(3);

    // Verify EventConsumer listeners are registered
    expect(mockEventConsumer.listenerCount('metricUpdate')).toBe(1);
    expect(mockEventConsumer.listenerCount('actionUpdate')).toBe(1);
    expect(mockEventConsumer.listenerCount('routingUpdate')).toBe(1);

    // Close all clients first to allow server to close properly
    client1.ws.close();
    client2.ws.close();
    client3.ws.close();

    // Wait for clients to disconnect
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Close server and wait for cleanup callback
    await closeWebSocketServer(wss, httpServer);

    // Verify server-side cleanup:
    // 1. All EventConsumer listeners should be removed
    expect(mockEventConsumer.listenerCount('metricUpdate')).toBe(0);
    expect(mockEventConsumer.listenerCount('actionUpdate')).toBe(0);
    expect(mockEventConsumer.listenerCount('routingUpdate')).toBe(0);
    expect(mockEventConsumer.listenerCount('error')).toBe(0);
    expect(mockEventConsumer.listenerCount('connected')).toBe(0);
    expect(mockEventConsumer.listenerCount('disconnected')).toBe(0);

    // 2. The server should have no active client connections
    expect(wss.clients.size).toBe(0);

    // This test verifies the PRIMARY goal: prevent memory leaks by removing EventConsumer listeners
    // when the WebSocket server closes. Client-side behavior is secondary.
  });
});
