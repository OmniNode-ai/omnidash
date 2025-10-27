import WebSocket from 'ws';
import { Kafka } from 'kafkajs';
import { Server as HTTPServer } from 'http';
import type { IncomingMessage } from 'http';

export function setupWebSocket(httpServer: HTTPServer) {
  console.log('Initializing WebSocket server...');

  const wss = new WebSocket.Server({
    server: httpServer,
    path: '/ws'
  });

  // Initialize Kafka client
  const kafka = new Kafka({
    brokers: (process.env.KAFKA_BROKERS || '192.168.86.200:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'omnidash-websocket',
  });

  const consumer = kafka.consumer({
    groupId: process.env.KAFKA_CONSUMER_GROUP || 'omnidash-websocket-group'
  });

  // Connect to Kafka and subscribe to topics
  consumer.connect()
    .then(() => {
      console.log('Kafka consumer connected');

      return consumer.subscribe({
        topics: [
          'agent-routing-decisions',
          'agent-transformation-events',
          'router-performance-metrics',
          'agent-actions'
        ],
        fromBeginning: false
      });
    })
    .then(() => {
      console.log('Subscribed to Kafka topics');

      // Consume messages and broadcast to WebSocket clients
      consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const event = JSON.parse(message.value?.toString() || '{}');

            // Broadcast to all connected clients
            wss.clients.forEach((client: WebSocket) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  topic,
                  event,
                  timestamp: new Date().toISOString()
                }));
              }
            });
          } catch (error) {
            console.error('Error processing Kafka message:', error);
          }
        },
      });
    })
    .catch(error => {
      console.error('Kafka consumer error:', error);
      // Continue with WebSocket server even if Kafka fails
    });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    console.log('WebSocket client connected from', request.socket.remoteAddress);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to Omnidash real-time event stream'
    }));

    // Handle client messages (for subscriptions/filtering)
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.action === 'subscribe') {
          // Store client preferences for filtering (future enhancement)
          console.log('Client subscription:', message.topics);
        }
      } catch (error) {
        console.error('Error parsing client message:', error);
      }
    });

    // Handle client disconnection
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      console.error('WebSocket client error:', error);
    });
  });

  // Handle WebSocket server errors
  wss.on('error', (error: Error) => {
    console.error('WebSocket server error:', error);
  });

  console.log('WebSocket server initialized at /ws');
  return wss;
}
