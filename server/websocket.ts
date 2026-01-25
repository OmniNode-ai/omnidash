import WebSocket, { WebSocketServer } from 'ws';
import { Server as HTTPServer } from 'http';
import type { IncomingMessage } from 'http';
import { z } from 'zod';
import {
  eventConsumer,
  type NodeIntrospectionEvent,
  type NodeHeartbeatEvent,
  type NodeStateChangeEvent,
  type RegisteredNode,
} from './event-consumer';
import {
  transformNodeIntrospectionToSnakeCase,
  transformNodeHeartbeatToSnakeCase,
  transformNodeStateChangeToSnakeCase,
  transformNodesToSnakeCase,
} from './utils/case-transform';
import { registryEventEmitter, type RegistryEvent } from './registry-events';
import {
  intentEventEmitter,
  type IntentStoredEventPayload,
  type IntentDistributionEventPayload,
} from './intent-events';

// Valid subscription topics that clients can subscribe to
const VALID_TOPICS = [
  'all',
  'metrics',
  'actions',
  'routing',
  'transformations',
  'performance',
  'errors',
  'system',
  'node-introspection',
  'node-heartbeat',
  'node-state-change',
  'node-registry',
  // Registry discovery topics (Phase 4 - OMN-1278)
  'registry',
  'registry-nodes',
  'registry-instances',
  // Intent classification events (OMN-1516)
  'intent',
] as const;

type ValidTopic = (typeof VALID_TOPICS)[number];

// Zod schema for validating WebSocket client messages
const WebSocketMessageSchema = z.object({
  action: z.enum(['subscribe', 'unsubscribe', 'ping', 'getState']),
  topics: z.union([z.enum(VALID_TOPICS), z.array(z.enum(VALID_TOPICS))]).optional(),
});

type _WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

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

  registerEventListener('transformationUpdate', (transformation) => {
    broadcast('AGENT_TRANSFORMATION', transformation, 'transformations');
  });

  registerEventListener('performanceUpdate', ({ metric, stats }) => {
    broadcast('PERFORMANCE_METRIC', { metric, stats }, 'performance');
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

  // Node Registry event listeners
  registerEventListener('nodeIntrospectionUpdate', (event: NodeIntrospectionEvent) => {
    // Transform to client-expected format (snake_case for consistency with Kafka events)
    const data = transformNodeIntrospectionToSnakeCase(event);
    broadcast('NODE_INTROSPECTION', data, 'node-introspection');
  });

  registerEventListener('nodeHeartbeatUpdate', (event: NodeHeartbeatEvent) => {
    // Transform to client-expected format
    const data = transformNodeHeartbeatToSnakeCase(event);
    broadcast('NODE_HEARTBEAT', data, 'node-heartbeat');
  });

  registerEventListener('nodeStateChangeUpdate', (event: NodeStateChangeEvent) => {
    // Transform to client-expected format
    const data = transformNodeStateChangeToSnakeCase(event);
    broadcast('NODE_STATE_CHANGE', data, 'node-state-change');
  });

  registerEventListener('nodeRegistryUpdate', (nodes: RegisteredNode[]) => {
    // Transform to client-expected format (snake_case for registered nodes)
    const data = transformNodesToSnakeCase(nodes);
    broadcast('NODE_REGISTRY_UPDATE', data, 'node-registry');
  });

  // Intent classification event listeners (OMN-1516)
  // Note: Intent events are emitted from intentEventEmitter, NOT eventConsumer
  const intentStoredHandler = (payload: IntentStoredEventPayload) => {
    broadcast('INTENT_UPDATE', payload, 'intent');
  };

  const intentDistributionHandler = (payload: IntentDistributionEventPayload) => {
    broadcast('INTENT_DISTRIBUTION', payload, 'intent');
  };

  // Register listeners on intentEventEmitter (not eventConsumer)
  intentEventEmitter.on('intentStored', intentStoredHandler);
  intentEventEmitter.on('intentDistribution', intentDistributionHandler);

  // Registry Discovery event listeners (OMN-1278 Phase 4)
  // These provide granular registry events for the registry discovery dashboard
  const registryHandler = (event: RegistryEvent) => {
    // Broadcast to 'registry' topic (all registry events)
    broadcast(event.type, event, 'registry');
  };

  const registryNodesHandler = (event: RegistryEvent) => {
    // Broadcast to 'registry-nodes' topic (node-specific events)
    broadcast(event.type, event, 'registry-nodes');
  };

  const registryInstancesHandler = (event: RegistryEvent) => {
    // Broadcast to 'registry-instances' topic (instance-specific events)
    broadcast(event.type, event, 'registry-instances');
  };

  // Register registry event listeners
  registryEventEmitter.on('registry', registryHandler);
  registryEventEmitter.on('registry-nodes', registryNodesHandler);
  registryEventEmitter.on('registry-instances', registryInstancesHandler);

  // Track these listeners for cleanup (manually since they use a different emitter)
  const registryListeners = [
    { emitter: registryEventEmitter, event: 'registry', handler: registryHandler },
    { emitter: registryEventEmitter, event: 'registry-nodes', handler: registryNodesHandler },
    {
      emitter: registryEventEmitter,
      event: 'registry-instances',
      handler: registryInstancesHandler,
    },
  ];

  // Track intent event listeners for cleanup (OMN-1516)
  const intentListeners = [
    { emitter: intentEventEmitter, event: 'intentStored', handler: intentStoredHandler },
    {
      emitter: intentEventEmitter,
      event: 'intentDistribution',
      handler: intentDistributionHandler,
    },
  ];

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
          recentTransformations: eventConsumer.getRecentTransformations(),
          performanceStats: eventConsumer.getPerformanceStats(),
          health: eventConsumer.getHealthStatus(),
          // Node registry data (transform to snake_case for consistency)
          registeredNodes: transformNodesToSnakeCase(eventConsumer.getRegisteredNodes()),
          nodeRegistryStats: eventConsumer.getNodeRegistryStats(),
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
        const rawMessage = JSON.parse(data.toString());

        // Validate message against schema
        const parseResult = WebSocketMessageSchema.safeParse(rawMessage);

        if (!parseResult.success) {
          const errorMessage = parseResult.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; ');
          console.warn('Invalid WebSocket message received:', errorMessage);
          ws.send(
            JSON.stringify({
              type: 'ERROR',
              message: `Invalid message: ${errorMessage}`,
              validActions: ['subscribe', 'unsubscribe', 'ping', 'getState'],
              validTopics: VALID_TOPICS,
              timestamp: new Date().toISOString(),
            })
          );
          return;
        }

        const message = parseResult.data;

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
                  recentTransformations: eventConsumer.getRecentTransformations(),
                  performanceStats: eventConsumer.getPerformanceStats(),
                  health: eventConsumer.getHealthStatus(),
                  // Node registry data (transform to snake_case for consistency)
                  registeredNodes: transformNodesToSnakeCase(eventConsumer.getRegisteredNodes()),
                  nodeRegistryStats: eventConsumer.getNodeRegistryStats(),
                },
                timestamp: new Date().toISOString(),
              })
            );
            break;
        }
      } catch (error) {
        console.error('Error parsing client message:', error);
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            message: 'Invalid JSON format',
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
  function handleSubscription(ws: WebSocket, topics: ValidTopic | ValidTopic[] | undefined) {
    const client = clients.get(ws);
    if (!client) return;

    // If no topics provided, default to subscribing to 'all'
    if (!topics) {
      client.subscriptions.add('all');
    } else {
      const topicArray = Array.isArray(topics) ? topics : [topics];
      topicArray.forEach((topic) => {
        client.subscriptions.add(topic);
      });
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

  // Handle unsubscription
  function handleUnsubscription(ws: WebSocket, topics: ValidTopic | ValidTopic[] | undefined) {
    const client = clients.get(ws);
    if (!client) return;

    // If no topics provided, unsubscribe from all (reset to default)
    if (!topics) {
      client.subscriptions.clear();
      client.subscriptions.add('all');
    } else {
      const topicArray = Array.isArray(topics) ? topics : [topics];
      topicArray.forEach((topic) => {
        client.subscriptions.delete(topic);
      });

      // If no subscriptions remain, default to 'all'
      if (client.subscriptions.size === 0) {
        client.subscriptions.add('all');
      }
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

    // Remove registry event listeners
    console.log(`Removing ${registryListeners.length} registry event listeners...`);
    registryListeners.forEach(({ emitter, event, handler }) => {
      emitter.removeListener(event, handler);
    });
    registryListeners.length = 0;

    // Remove intent event listeners (OMN-1516)
    console.log(`Removing ${intentListeners.length} intent event listeners...`);
    intentListeners.forEach(({ emitter, event, handler }) => {
      emitter.removeListener(event, handler);
    });
    intentListeners.length = 0;

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
