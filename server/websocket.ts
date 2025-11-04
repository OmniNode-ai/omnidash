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
    path: '/ws'
  });

  // Track connected clients with their preferences
  const clients = new Map<WebSocket, ClientData>();

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

  // Broadcast helper function with filtering
  const broadcast = (type: string, data: any, eventType?: string) => {
    const message = JSON.stringify({
      type,
      data,
      timestamp: new Date().toISOString()
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

  // Listen to EventConsumer events
  eventConsumer.on('metricUpdate', (metrics) => {
    broadcast('AGENT_METRIC_UPDATE', metrics, 'metrics');
  });

  eventConsumer.on('actionUpdate', (action) => {
    broadcast('AGENT_ACTION', action, 'actions');
  });

  eventConsumer.on('routingUpdate', (decision) => {
    broadcast('ROUTING_DECISION', decision, 'routing');
  });

  eventConsumer.on('error', (error) => {
    console.error('EventConsumer error:', error);
    broadcast('ERROR', {
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, 'errors');
  });

  eventConsumer.on('connected', () => {
    console.log('EventConsumer connected');
    broadcast('CONSUMER_STATUS', { status: 'connected' }, 'system');
  });

  eventConsumer.on('disconnected', () => {
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
      missedPings: 0
    };

    clients.set(ws, clientData);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: 'Connected to Omnidash real-time event stream',
      timestamp: new Date().toISOString()
    }));

    // Send initial state
    ws.send(JSON.stringify({
      type: 'INITIAL_STATE',
      data: {
        metrics: eventConsumer.getAgentMetrics(),
        recentActions: eventConsumer.getRecentActions(),
        routingDecisions: eventConsumer.getRoutingDecisions(),
        health: eventConsumer.getHealthStatus()
      },
      timestamp: new Date().toISOString()
    }));

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
            ws.send(JSON.stringify({
              type: 'CURRENT_STATE',
              data: {
                metrics: eventConsumer.getAgentMetrics(),
                recentActions: eventConsumer.getRecentActions(),
                routingDecisions: eventConsumer.getRoutingDecisions(),
                health: eventConsumer.getHealthStatus()
              },
              timestamp: new Date().toISOString()
            }));
            break;
          default:
            console.log('Unknown action:', message.action);
        }
      } catch (error) {
        console.error('Error parsing client message:', error);
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: 'Invalid message format',
          timestamp: new Date().toISOString()
        }));
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

    topicArray.forEach(topic => {
      client.subscriptions.add(topic);
    });

    ws.send(JSON.stringify({
      type: 'SUBSCRIPTION_UPDATED',
      subscriptions: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    }));

    console.log('Client subscriptions updated:', Array.from(client.subscriptions));
  }

  // Handle unsubscription
  function handleUnsubscription(ws: WebSocket, topics: string | string[]) {
    const client = clients.get(ws);
    if (!client) return;

    const topicArray = Array.isArray(topics) ? topics : [topics];

    topicArray.forEach(topic => {
      client.subscriptions.delete(topic);
    });

    // If no subscriptions, default to 'all'
    if (client.subscriptions.size === 0) {
      client.subscriptions.add('all');
    }

    ws.send(JSON.stringify({
      type: 'SUBSCRIPTION_UPDATED',
      subscriptions: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    }));

    console.log('Client subscriptions updated:', Array.from(client.subscriptions));
  }

  // Handle WebSocket server errors
  wss.on('error', (error: Error) => {
    console.error('WebSocket server error:', error);
  });

  // Cleanup on server shutdown
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    clients.clear();
    console.log('WebSocket server closed');
  });

  console.log('WebSocket server initialized at /ws');
  return wss;
}
