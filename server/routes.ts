import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { intelligenceRouter } from './intelligence-routes';
import { intentRouter } from './intent-routes';
import savingsRoutes from './savings-routes';
import agentRegistryRoutes from './agent-registry-routes';
import { chatRouter } from './chat-routes';
import eventBusRoutes from './event-bus-routes';
import registryRoutes from './registry-routes';
import playbackRoutes from './playback-routes';
import patternsRoutes from './patterns-routes';
import validationRoutes from './validation-routes';
import effectivenessRoutes from './effectiveness-routes';
import insightsRoutes from './insights-routes';

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Mount intelligence routes for agent observability and metrics
  app.use('/api/intelligence', intelligenceRouter);

  // Mount intent routes for intent classification data (demo critical path)
  app.use('/api/intents', intentRouter);

  // Mount savings routes for compute and token savings tracking
  app.use('/api/savings', savingsRoutes);

  // Mount agent registry routes for agent discovery and management
  app.use('/api/agents', agentRegistryRoutes);

  // Mount chat routes for AI assistant interactions
  app.use('/api/chat', chatRouter);

  // Mount event bus routes for event querying and statistics
  app.use('/api/event-bus', eventBusRoutes);

  // Mount registry routes for ONEX node registry discovery (contract-driven dashboards)
  app.use('/api/registry', registryRoutes);

  // Mount demo playback routes for recorded event replay
  app.use('/api/demo', playbackRoutes);

  // Mount patterns routes for learned patterns API (OMN-1797)
  app.use('/api/patterns', patternsRoutes);

  // Mount validation routes for cross-repo validation dashboard (OMN-1907)
  app.use('/api/validation', validationRoutes);

  // Mount effectiveness routes for injection effectiveness dashboard (OMN-1891)
  app.use('/api/effectiveness', effectivenessRoutes);

  // Mount insights routes for learned insights dashboard (OMN-1407)
  app.use('/api/insights', insightsRoutes);

  const httpServer = createServer(app);

  return httpServer;
}
