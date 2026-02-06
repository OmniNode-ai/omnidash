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
  type IntentSessionEventPayload,
  type IntentRecentEventPayload,
} from './intent-events';
import { getEventBusDataSource, type EventBusEvent } from './event-bus-data-source';
import { getPlaybackDataSource } from './playback-data-source';
import { playbackEventEmitter, type PlaybackWSMessage } from './playback-events';

/**
 * Transform EventBusEvent from database to client-expected format
 * Maps event_type patterns to actionType/actionName for UI display
 */
interface ClientAction {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: string;
  actionName: string;
  actionDetails?: any;
  durationMs: number;
  createdAt: Date;
}

function transformEventToClientAction(event: EventBusEvent): ClientAction {
  const eventType = event.event_type || 'unknown';

  // Parse event_type to derive actionType and actionName
  // Common patterns: "UserPromptSubmit", "hook.prompt.submitted", "agent.routing.completed"
  let actionType = 'event';
  let actionName = eventType;

  if (eventType.includes('.')) {
    // Dot-notation format: "hook.prompt.submitted" -> type: "hook", name: "prompt.submitted"
    const parts = eventType.split('.');
    actionType = parts[0];
    actionName = parts.slice(1).join('.');
  } else if (/[A-Z]/.test(eventType)) {
    // PascalCase format: "UserPromptSubmit" -> type: "user", name: "prompt_submit"
    const snakeCase = eventType
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
    const parts = snakeCase.split('_');
    if (parts.length >= 2) {
      actionType = parts[0];
      actionName = parts.slice(1).join('_');
    }
  }

  // Type guard: ensure payload is an object before accessing properties
  // This handles cases where payload might be a string (malformed JSON) or other non-object type
  const payloadIsObject =
    event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload);
  const payload = payloadIsObject ? (event.payload as Record<string, unknown>) : {};

  // Extract agent name from source or payload
  const agentName =
    (payload.agent_name as string) || (payload.agentName as string) || event.source || 'system';

  // Extract duration from payload if available
  const durationMs =
    (payload.duration_ms as number) ||
    (payload.durationMs as number) ||
    (payload.latency_ms as number) ||
    0;

  return {
    id: event.event_id,
    correlationId: event.correlation_id || event.event_id,
    agentName,
    actionType,
    actionName,
    actionDetails: event.payload,
    durationMs,
    createdAt: new Date(event.timestamp),
  };
}

/**
 * Fetch real events from database for initial state
 * Returns both transformed client actions and raw events for the Event Bus Monitor
 */
async function fetchRealEventsForInitialState(): Promise<{
  recentActions: ClientAction[];
  eventBusEvents: EventBusEvent[];
}> {
  const dataSource = getEventBusDataSource();

  if (!dataSource) {
    console.log('[WebSocket] EventBusDataSource not available, using legacy data only');
    return { recentActions: [], eventBusEvents: [] };
  }

  try {
    const events = await dataSource.queryEvents({
      limit: 1000,
      order_by: 'timestamp',
      order_direction: 'desc',
    });

    console.log(`[WebSocket] Fetched ${events.length} real events from database for initial state`);

    // Transform to client format
    const recentActions = events.map(transformEventToClientAction);

    return { recentActions, eventBusEvents: events };
  } catch (error) {
    console.error('[WebSocket] Error fetching real events:', error);
    return { recentActions: [], eventBusEvents: [] };
  }
}

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
  // Event Bus Monitor events (real-time Kafka events)
  'event-bus',
  // Demo playback events (OMN-1843)
  'playback',
  // Cross-repo validation events (OMN-1907)
  'validation',
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

  // Demo mode state events - signal clients to clear/restore their local state
  registerEventListener('stateReset', () => {
    console.log('[WebSocket] Demo mode: state reset - broadcasting DEMO_STATE_RESET');
    broadcast('DEMO_STATE_RESET', { timestamp: Date.now() }, 'all');
  });

  registerEventListener('stateRestored', () => {
    console.log('[WebSocket] Demo mode: state restored - broadcasting DEMO_STATE_RESTORED');
    broadcast('DEMO_STATE_RESTORED', { timestamp: Date.now() }, 'all');

    // After notifying clients to clear their state, send fresh initial state with restored data
    // This allows the UI to immediately show the live data that was snapshotted before demo
    setTimeout(() => {
      console.log('[WebSocket] Demo mode: broadcasting restored INITIAL_STATE');
      broadcast(
        'INITIAL_STATE',
        {
          metrics: eventConsumer.getAgentMetrics(),
          recentActions: eventConsumer.getRecentActions(),
          routingDecisions: eventConsumer.getRoutingDecisions(),
          recentTransformations: eventConsumer.getRecentTransformations(),
        },
        'all'
      );
    }, 100); // Small delay to ensure DEMO_STATE_RESTORED is processed first
  });

  registerEventListener('stateSnapshotted', () => {
    console.log('[WebSocket] Demo mode: state snapshotted');
    // No broadcast needed - just logging for debugging
  });

  // Cross-repo validation event listener (OMN-1907)
  // Broadcasts validation lifecycle events (run-started, violations-batch, run-completed)
  // to clients subscribed to the 'validation' topic
  registerEventListener('validation-event', (data: { type: string; event: any }) => {
    broadcast('VALIDATION_EVENT', data, 'validation');
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

  const intentSessionHandler = (payload: IntentSessionEventPayload) => {
    broadcast('INTENT_SESSION', payload, 'intent');
  };

  const intentRecentHandler = (payload: IntentRecentEventPayload) => {
    broadcast('INTENT_RECENT', payload, 'intent');
  };

  // Register listeners on intentEventEmitter (not eventConsumer)
  intentEventEmitter.on('intentStored', intentStoredHandler);
  intentEventEmitter.on('intentDistribution', intentDistributionHandler);
  intentEventEmitter.on('intentSession', intentSessionHandler);
  intentEventEmitter.on('intentRecent', intentRecentHandler);

  // Playback event listener (OMN-1843)
  // Broadcasts playback lifecycle and progress events to clients subscribed to 'playback' topic
  const playbackHandler = (message: PlaybackWSMessage) => {
    // Broadcast with the message type (e.g., 'playback:start', 'playback:progress')
    // The full message includes status, and optionally speed/loop for change events
    broadcast(message.type, message, 'playback');
  };

  playbackEventEmitter.on('playback', playbackHandler);

  // Track playback listener for cleanup
  const playbackListeners = [
    { emitter: playbackEventEmitter, event: 'playback', handler: playbackHandler },
  ];

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
    { emitter: intentEventEmitter, event: 'intentSession', handler: intentSessionHandler },
    { emitter: intentEventEmitter, event: 'intentRecent', handler: intentRecentHandler },
  ];

  // Event Bus data source listeners (real-time Kafka events for Event Bus Monitor)
  // These events come from eventBusDataSource which consumes from Kafka topics
  const eventBusDataSource = getEventBusDataSource();
  const eventBusListeners: Array<{
    emitter: ReturnType<typeof getEventBusDataSource>;
    event: string;
    handler: (...args: any[]) => void;
  }> = [];

  if (eventBusDataSource) {
    // Handler for real-time events from Kafka
    const eventBusEventHandler = (event: EventBusEvent) => {
      // Transform EventBusEvent to client-expected format
      const transformedEvent = {
        id: event.event_id,
        event_type: event.event_type,
        timestamp: event.timestamp,
        tenant_id: event.tenant_id,
        namespace: event.namespace,
        source: event.source,
        correlation_id: event.correlation_id,
        causation_id: event.causation_id,
        schema_ref: event.schema_ref,
        payload: event.payload,
        topic: event.topic,
        partition: event.partition,
        offset: event.offset,
        processed_at: event.processed_at.toISOString(),
      };

      broadcast('EVENT_BUS_EVENT', transformedEvent, 'event-bus');
    };

    // Handler for connection status
    const eventBusConnectedHandler = () => {
      console.log('[WebSocket] EventBusDataSource connected');
      broadcast('EVENT_BUS_STATUS', { status: 'connected' }, 'event-bus');
    };

    const eventBusDisconnectedHandler = () => {
      console.log('[WebSocket] EventBusDataSource disconnected');
      broadcast('EVENT_BUS_STATUS', { status: 'disconnected' }, 'event-bus');
    };

    const eventBusErrorHandler = (error: Error) => {
      console.error('[WebSocket] EventBusDataSource error:', error);
      broadcast(
        'EVENT_BUS_ERROR',
        { message: error.message, timestamp: new Date().toISOString() },
        'event-bus'
      );
    };

    // Register listeners
    eventBusDataSource.on('event', eventBusEventHandler);
    eventBusDataSource.on('connected', eventBusConnectedHandler);
    eventBusDataSource.on('disconnected', eventBusDisconnectedHandler);
    eventBusDataSource.on('error', eventBusErrorHandler);

    // Track for cleanup
    eventBusListeners.push(
      { emitter: eventBusDataSource, event: 'event', handler: eventBusEventHandler },
      { emitter: eventBusDataSource, event: 'connected', handler: eventBusConnectedHandler },
      { emitter: eventBusDataSource, event: 'disconnected', handler: eventBusDisconnectedHandler },
      { emitter: eventBusDataSource, event: 'error', handler: eventBusErrorHandler }
    );

    console.log('[WebSocket] EventBusDataSource listeners registered for real-time events');
  } else {
    console.warn(
      '[WebSocket] EventBusDataSource not available - event-bus topic will not receive real-time events'
    );
  }

  // PlaybackDataSource listener (works without Kafka for demo playback)
  const playbackDataSource = getPlaybackDataSource();

  const playbackDataEventHandler = (event: EventBusEvent) => {
    // Transform to AGENT_ACTION format for client compatibility
    const action = {
      id: event.event_id,
      correlationId: event.correlation_id || event.event_id,
      agentName: (event.payload?.agentName as string) || event.source || 'playback',
      actionType: (event.payload?.actionType as string) || event.event_type,
      actionName: (event.payload?.actionName as string) || event.event_type,
      actionDetails: event.payload,
      durationMs: (event.payload?.durationMs as number) || 0,
      createdAt: new Date(event.timestamp),
    };
    broadcast('AGENT_ACTION', action, 'actions');
  };

  playbackDataSource.on('event', playbackDataEventHandler);

  // Track for cleanup
  const playbackDataSourceListeners = [
    { emitter: playbackDataSource, event: 'event', handler: playbackDataEventHandler },
  ];

  console.log('[WebSocket] PlaybackDataSource listener registered for demo playback');

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

    // Send initial state with real events from database
    // Use async IIFE to fetch real events without blocking connection setup
    (async () => {
      try {
        // Fetch real events from database
        const { recentActions: realActions, eventBusEvents } =
          await fetchRealEventsForInitialState();

        // Get legacy data for backward compatibility with other dashboards
        const legacyActions = eventConsumer.getRecentActions();
        const legacyRouting = eventConsumer.getRoutingDecisions();

        // Combine real actions with legacy actions (real events take priority)
        // Real events are more recent and accurate for Event Bus Monitor
        const combinedActions = realActions.length > 0 ? realActions : legacyActions; // Fallback to legacy if no real events

        // Check connection is still open before sending (async IIFE may complete after disconnect)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'INITIAL_STATE',
              data: {
                metrics: eventConsumer.getAgentMetrics(),
                // Primary actions - use real events if available
                recentActions: combinedActions,
                // Keep legacy routing for other dashboards
                routingDecisions: legacyRouting,
                recentTransformations: eventConsumer.getRecentTransformations(),
                performanceStats: eventConsumer.getPerformanceStats(),
                health: eventConsumer.getHealthStatus(),
                // Node registry data (transform to snake_case for consistency)
                registeredNodes: transformNodesToSnakeCase(eventConsumer.getRegisteredNodes()),
                nodeRegistryStats: eventConsumer.getNodeRegistryStats(),
                // NEW: Raw event bus events for Event Bus Monitor dashboard
                eventBusEvents: eventBusEvents,
              },
              timestamp: new Date().toISOString(),
            })
          );

          if (realActions.length > 0) {
            console.log(
              `[WebSocket] Sent INITIAL_STATE with ${realActions.length} real events from database`
            );
          }
        }
      } catch (error) {
        console.error('[WebSocket] Error sending initial state with real events:', error);
        // Fallback to legacy data if async fetch fails
        // Check connection is still open before sending (async IIFE may complete after disconnect)
        if (ws.readyState === WebSocket.OPEN) {
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
                registeredNodes: transformNodesToSnakeCase(eventConsumer.getRegisteredNodes()),
                nodeRegistryStats: eventConsumer.getNodeRegistryStats(),
                eventBusEvents: [],
              },
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
    })();

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
            // Send current state on demand with real events from database
            (async () => {
              try {
                const { recentActions: realActions, eventBusEvents } =
                  await fetchRealEventsForInitialState();

                const legacyActions = eventConsumer.getRecentActions();
                const combinedActions = realActions.length > 0 ? realActions : legacyActions;

                // Check connection is still open before sending (async IIFE may complete after disconnect)
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: 'CURRENT_STATE',
                      data: {
                        metrics: eventConsumer.getAgentMetrics(),
                        recentActions: combinedActions,
                        routingDecisions: eventConsumer.getRoutingDecisions(),
                        recentTransformations: eventConsumer.getRecentTransformations(),
                        performanceStats: eventConsumer.getPerformanceStats(),
                        health: eventConsumer.getHealthStatus(),
                        registeredNodes: transformNodesToSnakeCase(
                          eventConsumer.getRegisteredNodes()
                        ),
                        nodeRegistryStats: eventConsumer.getNodeRegistryStats(),
                        eventBusEvents: eventBusEvents,
                      },
                      timestamp: new Date().toISOString(),
                    })
                  );
                }
              } catch (error) {
                console.error('[WebSocket] Error fetching state:', error);
                // Fallback to legacy data
                // Check connection is still open before sending (async IIFE may complete after disconnect)
                if (ws.readyState === WebSocket.OPEN) {
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
                        registeredNodes: transformNodesToSnakeCase(
                          eventConsumer.getRegisteredNodes()
                        ),
                        nodeRegistryStats: eventConsumer.getNodeRegistryStats(),
                        eventBusEvents: [],
                      },
                      timestamp: new Date().toISOString(),
                    })
                  );
                }
              }
            })();
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

    // Remove playback event listeners (OMN-1843)
    console.log(`Removing ${playbackListeners.length} playback event listeners...`);
    playbackListeners.forEach(({ emitter, event, handler }) => {
      emitter.removeListener(event, handler);
    });
    playbackListeners.length = 0;

    // Remove event bus data source listeners
    console.log(`Removing ${eventBusListeners.length} event bus data source listeners...`);
    eventBusListeners.forEach(({ emitter, event, handler }) => {
      if (emitter) {
        emitter.removeListener(event, handler);
      }
    });
    eventBusListeners.length = 0;

    // Remove playback data source listeners (OMN-1885)
    console.log(`Removing ${playbackDataSourceListeners.length} playback data source listeners...`);
    playbackDataSourceListeners.forEach(({ emitter, event, handler }) => {
      emitter.removeListener(event, handler);
    });
    playbackDataSourceListeners.length = 0;

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
