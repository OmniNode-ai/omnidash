// Load environment variables from .env file FIRST before any other imports
import { config } from 'dotenv';
config();

// Suppress KafkaJS partitioner warning
if (!process.env.KAFKAJS_NO_PARTITIONER_WARNING) {
  process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
}

import express, { type Request, Response, NextFunction } from 'express';
import { registerRoutes } from './routes';
import { setupVite, serveStatic, log } from './vite';
import { setupWebSocket } from './websocket';
import { eventConsumer } from './event-consumer';
import { eventBusDataSource } from './event-bus-data-source';
import { eventBusMockGenerator } from './event-bus-mock-generator';
import { startMockRegistryEvents, stopMockRegistryEvents } from './registry-events';
import { runtimeIdentity } from './runtime-identity';
import { ProjectionService } from './projection-service';
import { NodeRegistryProjection } from './projections/node-registry-projection';
import { setProjectionService } from './projection-routes';

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown;
  }
}
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

// Disable caching for all API routes to ensure fresh data
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  // Remove any existing ETag headers to prevent 304 responses
  res.removeHeader('ETag');
  // Disable Express ETag generation
  res.setHeader('ETag', '');
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + '…';
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Log runtime identity on startup (identity loaded from shared module)
  if (runtimeIdentity.supervised) {
    log(`Running under ONEX runtime: node_id=${runtimeIdentity.nodeId}`);
  } else {
    log(`Running in standalone mode (no runtime supervision)`);
  }

  const server = await registerRoutes(app);

  // Validate and start Kafka event consumer
  try {
    // First validate that Kafka broker is reachable
    const isKafkaAvailable = await eventConsumer.validateConnection();

    if (isKafkaAvailable) {
      await eventConsumer.start();
      log('✅ Event consumer started successfully - real-time events enabled');
    } else {
      log('⚠️  Kafka broker validation failed - continuing without real-time events');
      log('   Dashboard will use database queries only (slower, no live updates)');
    }
  } catch (error) {
    console.error('❌ Failed to start event consumer:', error);
    console.error('   Intelligence endpoints will not receive real-time data');
    console.error('   Application will continue with limited functionality');
  }

  // Validate and start Event Bus Data Source
  try {
    const isEventBusAvailable = await eventBusDataSource.validateConnection();

    if (isEventBusAvailable) {
      await eventBusDataSource.start();
      log('✅ Event Bus Data Source started successfully - event storage enabled');
    } else {
      log('⚠️  Event Bus Data Source validation failed - continuing without event storage');
      log('   Event querying will be limited to database queries');
    }
  } catch (error) {
    console.error('❌ Failed to start Event Bus Data Source:', error);
    console.error('   Event querying endpoints will not be available');
    console.error('   Application will continue with limited functionality');
  }

  // --------------------------------------------------------------------------
  // Projection Service (OMN-2097)
  // --------------------------------------------------------------------------
  const projectionService = new ProjectionService();
  const nodeRegistryView = new NodeRegistryProjection();
  projectionService.registerView(nodeRegistryView);
  setProjectionService(projectionService);

  // Bridge EventConsumer node events → ProjectionService
  eventConsumer.on('nodeIntrospectionUpdate', (event) => {
    projectionService.ingest({
      type: 'node-introspection',
      source: 'event-consumer',
      eventTimeMs: event.createdAt ? new Date(event.createdAt).getTime() : undefined,
      payload: event,
    });
  });

  eventConsumer.on('nodeHeartbeatUpdate', (event) => {
    projectionService.ingest({
      type: 'node-heartbeat',
      source: 'event-consumer',
      eventTimeMs: event.createdAt ? new Date(event.createdAt).getTime() : undefined,
      payload: event,
    });
  });

  eventConsumer.on('nodeStateChangeUpdate', (event) => {
    projectionService.ingest({
      type: 'node-state-change',
      source: 'event-consumer',
      eventTimeMs: event.createdAt ? new Date(event.createdAt).getTime() : undefined,
      payload: event,
    });
  });

  // Seed projection with existing nodes from EventConsumer (survives server restart).
  // Seed has no eventTimeMs — represents current EventConsumer snapshot, not a
  // timestamped Kafka event. ProjectionService assigns sentinel (epoch 0), so
  // MonotonicMergeTracker accepts any future event with a real timestamp.
  const existingNodes = eventConsumer.getRegisteredNodes();
  if (existingNodes.length > 0) {
    projectionService.ingest({
      type: 'node-registry-seed',
      source: 'event-consumer',
      payload: { nodes: existingNodes },
    });
    log(`Seeded node-registry projection with ${existingNodes.length} existing nodes`);
  }

  // Setup WebSocket for real-time events
  if (process.env.ENABLE_REAL_TIME_EVENTS === 'true') {
    setupWebSocket(server, { projectionService });
  }

  // Demo mode: start ALL mock data generators (fake heartbeats, events, registry)
  // ONLY runs when DEMO_MODE=true is explicitly set — no fake data by default
  const isDemoMode =
    process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'test' && !process.env.VITEST;

  if (isDemoMode) {
    log('🎭 DEMO MODE enabled — starting mock data generators');

    // Mock event bus generator (fake Kafka event chains)
    try {
      await eventBusDataSource.initializeSchema();
      await eventBusMockGenerator.start({
        continuous: true,
        interval_ms: 5000,
        initialChains: 20,
      });
      log('✅ Mock event generator started');
    } catch (mockError) {
      console.error('❌ Failed to start mock event generator:', mockError);
    }

    // Mock registry events (fake heartbeats, state changes)
    if (process.env.ENABLE_REAL_TIME_EVENTS === 'true') {
      const parsedInterval = parseInt(process.env.MOCK_REGISTRY_EVENT_INTERVAL || '5000', 10);
      const mockInterval =
        !Number.isFinite(parsedInterval) || parsedInterval < 1000 ? 5000 : parsedInterval;
      startMockRegistryEvents(mockInterval);
      log(`✅ Mock registry events started (interval: ${mockInterval}ms)`);
    }
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get('env') === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 3000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, '0.0.0.0', () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    log('SIGTERM received, shutting down gracefully');
    await eventConsumer.stop();
    await eventBusDataSource.stop();
    eventBusMockGenerator.stop();
    stopMockRegistryEvents();
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    log('SIGINT received, shutting down gracefully');
    await eventConsumer.stop();
    await eventBusDataSource.stop();
    eventBusMockGenerator.stop();
    stopMockRegistryEvents();
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
  });
})();
