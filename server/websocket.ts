import WebSocket, { WebSocketServer } from 'ws';
import { Server as HTTPServer } from 'http';
import type { IncomingMessage } from 'http';
import { eventConsumer } from './event-consumer';

interface ClientData {
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: Date;
  isAlive: boolean;
  missedPings: number;
}

export function setupWebSocket(httpServer: HTTPServer) {
  console.log('Initializing WebSocket server...');

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
  });

  // Track connected clients with their preferences
  const clients = new Map<WebSocket, ClientData>();

  /**
   * Memory Leak Prevention Strategy:
   *
   * EventConsumer listeners are SERVER-WIDE, not per-client. They broadcast to ALL connected clients.
   * This array tracks all listeners registered with EventConsumer so we can remove them when the server closes.
   *
   * Why we track listeners:
   * - EventEmitters keep references to all registered handlers
   * - Without cleanup, restarting the WebSocket server would accumulate handlers
   * - Each restart would add 6 more listeners (metricUpdate, actionUpdate, routingUpdate, error, connected, disconnected)
   * - Over time, this causes memory leaks and duplicate event handling
   *
   * Cleanup happens in wss.on('close') handler:
   * - All listeners are removed from EventConsumer
   * - eventListeners array is cleared
   * - All client connections are terminated
   * - clients Map is cleared
   *
   * Note: We do NOT remove listeners when individual clients disconnect because listeners are shared.
   * The broadcast() function filters events per-client based on their subscriptions.
   */
  const eventListeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  // Heartbeat interval (30 seconds) with tolerance for missed pings
  const HEARTBEAT_INTERVAL_MS = 30000;
  const MAX_MISSED_PINGS = 2; // Allow 2 missed pings before terminating (60s total)

  const heartbeatInterval = setInterval(() => {
    clients.forEach((clientData, ws) => {
      if (!clientData.isAlive) {
        clientData.missedPings++;
        console.log(`Client missed heartbeat (${clientData.missedPings}/${MAX_MISSED_PINGS})`);

        // Only terminate after multiple missed pings
        if (clientData.missedPings >= MAX_MISSED_PINGS) {
          console.log('Client failed multiple heartbeats, terminating connection');
          clients.delete(ws);
          return ws.terminate();
        }
      } else {
        // Reset missed pings if client responded
        clientData.missedPings = 0;
      }

      clientData.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  // Helper function to register EventConsumer listeners with cleanup tracking
  const registerEventListener = <T extends any[]>(event: string, handler: (...args: T) => void) => {
    eventConsumer.on(event, handler);
    eventListeners.push({ event, handler });
  };

  // Broadcast helper function with filtering
  const broadcast = (type: string, data: any, eventType?: string) => {
    const message = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString(),
    });

    clients.forEach((clientData, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        // Apply subscription filtering if event type is provided
        if (eventType && clientData.subscriptions.size > 0) {
          if (!clientData.subscriptions.has(eventType) && !clientData.subscriptions.has('all')) {
            return; // Skip this client
          }
        }

        ws.send(message);
      }
    });
  };

  // Listen to EventConsumer events with automatic cleanup tracking
  registerEventListener('metricUpdate', (metrics) => {
    broadcast('AGENT_METRIC_UPDATE', metrics, 'metrics');
  });

  registerEventListener('actionUpdate', (action) => {
    broadcast('AGENT_ACTION', action, 'actions');
  });

  registerEventListener('routingUpdate', (decision) => {
    broadcast('ROUTING_DECISION', decision, 'routing');
  });

  registerEventListener('error', (error) => {
    console.error('EventConsumer error:', error);
    broadcast(
      'ERROR',
      {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      'errors'
    );
  });

  registerEventListener('connected', () => {
    console.log('EventConsumer connected');
    broadcast('CONSUMER_STATUS', { status: 'connected' }, 'system');
  });

  registerEventListener('disconnected', () => {
    console.log('EventConsumer disconnected');
    broadcast('CONSUMER_STATUS', { status: 'disconnected' }, 'system');
  });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    console.log('WebSocket client connected from', request.socket.remoteAddress);

    // Initialize client data
    const clientData: ClientData = {
      ws,
      subscriptions: new Set(['all']), // Subscribe to all by default
      lastPing: new Date(),
      isAlive: true,
      missedPings: 0,
    };

    clients.set(ws, clientData);

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'CONNECTED',
        message: 'Connected to Omnidash real-time event stream',
        timestamp: new Date().toISOString(),
      })
    );

    // Send initial state
    ws.send(
      JSON.stringify({
        type: 'INITIAL_STATE',
        data: {
          metrics: eventConsumer.getAgentMetrics(),
          recentActions: eventConsumer.getRecentActions(),
          routingDecisions: eventConsumer.getRoutingDecisions(),
          health: eventConsumer.getHealthStatus(),
        },
        timestamp: new Date().toISOString(),
      })
    );

    // Handle pong responses
    ws.on('pong', () => {
      const client = clients.get(ws);
      if (client) {
        client.isAlive = true;
        client.lastPing = new Date();
      }
    });

    // Handle client messages (for subscriptions/filtering)
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.action) {
          case 'subscribe':
            handleSubscription(ws, message.topics);
            break;
          case 'unsubscribe':
            handleUnsubscription(ws, message.topics);
            break;
          case 'ping':
            ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
            break;
          case 'getState':
            // Send current state on demand
            ws.send(
              JSON.stringify({
                type: 'CURRENT_STATE',
                data: {
                  metrics: eventConsumer.getAgentMetrics(),
                  recentActions: eventConsumer.getRecentActions(),
                  routingDecisions: eventConsumer.getRoutingDecisions(),
                  health: eventConsumer.getHealthStatus(),
                },
                timestamp: new Date().toISOString(),
              })
            );
            break;
          default:
            console.log('Unknown action:', message.action);
        }
      } catch (error) {
        console.error('Error parsing client message:', error);
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: 'Invalid message format',
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    // Handle client disconnection
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      console.error('WebSocket client error:', error);
      clients.delete(ws);
    });
  });

  // Handle subscription updates
  function handleSubscription(ws: WebSocket, topics: string | string[]) {
    const client = clients.get(ws);
    if (!client) return;

    const topicArray = Array.isArray(topics) ? topics : [topics];

    topicArray.forEach((topic) => {
      client.subscriptions.add(topic);
    });

    ws.send(
      JSON.stringify({
        type: 'SUBSCRIPTION_UPDATED',
        subscriptions: Array.from(client.subscriptions),
        timestamp: new Date().toISOString(),
      })
    );

    console.log('Client subscriptions updated:', Array.from(client.subscriptions));
  }

  // Handle unsubscription
  function handleUnsubscription(ws: WebSocket, topics: string | string[]) {
    const client = clients.get(ws);
    if (!client) return;

    const topicArray = Array.isArray(topics) ? topics : [topics];

    topicArray.forEach((topic) => {
      client.subscriptions.delete(topic);
    });

    // If no subscriptions, default to 'all'
    if (client.subscriptions.size === 0) {
      client.subscriptions.add('all');
    }

    ws.send(
      JSON.stringify({
        type: 'SUBSCRIPTION_UPDATED',
        subscriptions: Array.from(client.subscriptions),
        timestamp: new Date().toISOString(),
      })
    );

    console.log('Client subscriptions updated:', Array.from(client.subscriptions));
  }

  // Handle WebSocket server errors
  wss.on('error', (error: Error) => {
    console.error('WebSocket server error:', error);
  });

  /**
   * Server Shutdown Cleanup Handler
   *
   * Critical for preventing memory leaks when server restarts or closes.
   * Removes all EventConsumer listeners and terminates client connections.
   *
   * Without this cleanup:
   * - EventConsumer would retain references to closed server's handlers
   * - Multiple server restarts would accumulate listeners
   * - Memory usage would grow unbounded
   * - Events would be handled multiple times by dead handlers
   */
  wss.on('close', () => {
    console.log('WebSocket server closing, cleaning up resources...');

    // Clear heartbeat interval
    clearInterval(heartbeatInterval);

    // Remove all EventConsumer listeners to prevent memory leaks
    console.log(`Removing ${eventListeners.length} EventConsumer listeners...`);
    eventListeners.forEach(({ event, handler }) => {
      eventConsumer.removeListener(event, handler);
    });
    eventListeners.length = 0; // Clear the array

    // Terminate all client connections
    console.log(`Terminating ${clients.size} client connections...`);
    clients.forEach((clientData, ws) => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
    });

    // Clear clients map
    clients.clear();

    console.log('✅ WebSocket server closed, all listeners and connections cleaned up');
  });

  console.log('WebSocket server initialized at /ws');
  return wss;
}
