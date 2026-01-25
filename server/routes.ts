import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { intelligenceRouter } from './intelligence-routes';
import savingsRoutes from './savings-routes';
import agentRegistryRoutes from './agent-registry-routes';
import { chatRouter } from './chat-routes';
import eventBusRoutes from './event-bus-routes';
import registryRoutes from './registry-routes';
import { intentRouter } from './intent-routes';

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Mount intelligence routes for agent observability and metrics
  app.use('/api/intelligence', intelligenceRouter);

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

  // Mount intent routes for intent-based navigation and action handling
  app.use('/api/intents', intentRouter);

  const httpServer = createServer(app);

  return httpServer;
}
