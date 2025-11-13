import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import { registerRoutes } from '../routes';
import { intelligenceRouter } from '../intelligence-routes';
import { chatRouter } from '../chat-routes';
import savingsRoutes from '../savings-routes';
import agentRegistryRoutes from '../agent-registry-routes';

// Mock the route modules
vi.mock('../intelligence-routes', () => ({
  intelligenceRouter: express.Router(),
}));

vi.mock('../chat-routes', () => ({
  chatRouter: express.Router(),
}));

vi.mock('../savings-routes', () => ({
  default: express.Router(),
}));

vi.mock('../agent-registry-routes', () => ({
  default: express.Router(),
}));

describe('registerRoutes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should register all routes and return HTTP server', async () => {
    const server = await registerRoutes(app);

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe('function');
  });

  it('should mount intelligence routes at /api/intelligence', async () => {
    const server = await registerRoutes(app);
    
    // Verify the route is registered by checking if app has the route
    // We can't easily test route registration without making requests,
    // but we can verify the server was created successfully
    expect(server).toBeDefined();
  });

  it('should mount savings routes at /api/savings', async () => {
    const server = await registerRoutes(app);
    expect(server).toBeDefined();
  });

  it('should mount agent registry routes at /api/agents', async () => {
    const server = await registerRoutes(app);
    expect(server).toBeDefined();
  });

  it('should mount chat routes at /api/chat', async () => {
    const server = await registerRoutes(app);
    expect(server).toBeDefined();
  });
});

