# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **📚 Shared Infrastructure**: For common OmniNode infrastructure (PostgreSQL, Kafka/Redpanda, remote server topology, Docker networking, environment variables), see **`~/.claude/CLAUDE.md`**. This file contains Omnidash-specific frontend architecture and development only.

## ⚠️ CRITICAL: Configuration Management

**ALWAYS check `.env` file for actual configuration values before making assumptions!**

Key configuration values (see `.env` for full details):

- **Port**: 3000 (set in package.json: `PORT=3000 npm run dev`)
- **Database**: All connection details in `.env` file (never hardcode passwords!)
- **Kafka Brokers**: `192.168.86.200:9092` (see `~/.claude/CLAUDE.md` for connection patterns)

**Before running any commands that require configuration:**

1. Read `.env` file to get actual values
2. Use those exact values (don't guess or use old defaults)
3. Server runs on port **3000**, not 5000!

## Common Commands

**Development**:

```bash
PORT=3000 npm run dev  # Start development server (port 3000)
npm run check          # TypeScript type checking across client/server/shared
npm run build          # Build frontend (Vite) and backend (esbuild) for production
PORT=3000 npm start    # Run production build on port 3000
```

**Testing**:

```bash
npm run test              # Run vitest tests
npm run test:ui           # Run tests with interactive UI
npm run test:coverage     # Generate test coverage report
```

**Database**:

```bash
npm run db:push     # Push Drizzle schema changes to PostgreSQL
```

**Testing APIs**:

```bash
# Use port 3000, not 5000!
curl http://localhost:3000/api/intelligence/patterns/summary
curl http://localhost:3000/api/intelligence/agents/summary
curl http://localhost:3000/api/intelligence/events/recent
curl http://localhost:3000/api/intelligence/routing/metrics
curl http://localhost:3000/api/intelligence/quality/summary
```

**Observability & Testing**:

```bash
# Event generation and testing
npm run seed-events              # Seed test events once
npm run seed-events:continuous   # Continuous event seeding for testing
npm run check-topics             # Check Kafka topic health and consumer lag

# Manual event testing
node scripts/seed-events.ts      # Direct script execution
```

**Dashboard URLs** (always port 3000):

- Agent Operations: http://localhost:3000/
- Pattern Learning: http://localhost:3000/patterns
- Intelligence Operations: http://localhost:3000/intelligence
- Event Flow: http://localhost:3000/events
- Code Intelligence: http://localhost:3000/code
- Knowledge Graph: http://localhost:3000/knowledge
- Platform Health: http://localhost:3000/health
- Developer Experience: http://localhost:3000/developer
- Chat: http://localhost:3000/chat

**Environment**:

- **ALWAYS CHECK `.env` FILE FIRST** for actual configuration values
- Runs on `PORT=3000` (configured in package.json dev script, NOT 5000!)
- Database: All connection details in `.env` file (host, port, credentials)
- Kafka: `192.168.86.200:9092`
- All configuration values in `.env` file - never assume defaults

## Project Architecture

### Monorepo Structure

Three-directory monorepo with TypeScript path aliases:

- **`client/`** → React frontend (accessed via `@/` alias)
- **`server/`** → Express backend (minimal API surface)
- **`shared/`** → Shared types/schemas (accessed via `@shared/` alias)

### Frontend Architecture

**Router Pattern**: Wouter-based SPA with 9 dashboard routes representing different platform capabilities:

| Route           | Component              | Purpose                         |
| --------------- | ---------------------- | ------------------------------- |
| `/`             | AgentOperations        | 52 AI agents monitoring         |
| `/patterns`     | PatternLearning        | 25,000+ code patterns           |
| `/intelligence` | IntelligenceOperations | 168+ AI operations              |
| `/code`         | CodeIntelligence       | Semantic search, quality gates  |
| `/events`       | EventFlow              | Kafka/Redpanda event processing |
| `/knowledge`    | KnowledgeGraph         | Code relationship visualization |
| `/health`       | PlatformHealth         | System health monitoring        |
| `/developer`    | DeveloperExperience    | Workflow metrics                |
| `/chat`         | Chat                   | AI query assistant              |

**Component System**: Built on shadcn/ui (New York variant) with Radix UI primitives. All UI components live in `client/src/components/ui/` and follow shadcn conventions.

**Design Philosophy**: Carbon Design System principles (IBM) optimized for data-dense enterprise dashboards:

- Information density over white space
- IBM Plex Sans/Mono typography (loaded from Google Fonts)
- Scanability for real-time monitoring scenarios
- Consistent metric card patterns across dashboards

**State Management**:

- Server state: TanStack Query v5 (`queryClient` in `client/src/lib/queryClient.ts`)
- Theme state: Custom `ThemeProvider` context (supports dark/light modes, defaults to dark)
- Local state: React hooks

**Layout Pattern**: All dashboards share consistent structure:

```
<SidebarProvider>
  <AppSidebar /> (w-64, collapsible navigation)
  <Header /> (h-16, logo + system status + theme toggle)
  <Main /> (Dashboard-specific grid layouts)
```

### Backend Architecture

**API-Driven Design**: Express server provides comprehensive API endpoints for intelligence data with real-time WebSocket updates.

**Development vs Production**:

- **Dev**: Vite middleware integrated into Express for HMR (`setupVite()` in `server/vite.ts`)
- **Prod**: Static files served from `dist/public`, API routes from `dist/index.js`

**Build Process**:

1. Frontend: Vite bundles to `dist/public/`
2. Backend: esbuild bundles server to `dist/` (ESM format, platform: node, externalized packages)

**Backend Components**:

- `server/index.ts` - Main Express server with middleware setup
- `server/routes.ts` - Route registration and HTTP server creation
- `server/intelligence-routes.ts` - Intelligence API endpoints (100+ routes)
- `server/savings-routes.ts` - Compute/token savings tracking
- `server/agent-registry-routes.ts` - Agent discovery and management
- `server/alert-routes.ts` - Alert management system
- `server/websocket.ts` - WebSocket server with subscription management
- `server/event-consumer.ts` - Kafka consumer with event aggregation
- `server/db-adapter.ts` - PostgreSQL connection pooling and queries
- `server/service-health.ts` - Service health monitoring

**Database Layer**:

- **ORM**: Drizzle with Neon serverless PostgreSQL driver
- **Schemas**:
  - `shared/schema.ts` - User authentication tables
  - `shared/intelligence-schema.ts` - 30+ intelligence tracking tables
- **Type Safety**: Zod schemas auto-generated from Drizzle via `drizzle-zod`
- **Connection**: Two databases - app DB and intelligence DB (`omninode_bridge`)

**Request Logging**: Custom middleware logs API requests (`/api` paths only) with duration and truncated JSON responses (80 char limit). WebSocket connections logged separately.

### Key Architectural Patterns

**Mock Data Strategy**: Dashboards currently generate client-side mock data. Future production implementation should replace with:

- WebSocket or Server-Sent Events for real-time updates
- Actual API endpoints in `server/routes.ts`
- Backend data aggregation for metrics

**Path Alias Resolution**: Two import aliases configured in `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`:

```typescript
@/          → client/src/
@shared/    → shared/
```

Note: The `@assets/` alias exists in vite.config but is not widely used.

**Type Flow**: Database schema → Drizzle inferred types → Zod schemas → Runtime validation

```typescript
// shared/schema.ts
export const users = pgTable("users", { ... });
export type User = typeof users.$inferSelect;           // Drizzle inference
export const insertUserSchema = createInsertSchema(users); // Zod schema
```

**Component Reuse Philosophy**: MetricCard, ChartContainer, and StatusBadge are designed as reusable primitives across all 8 operational dashboards. When adding new metrics or visualizations, extend these components rather than creating new patterns.

**Responsive Grid System**: Dashboards use Tailwind's responsive grid utilities with breakpoints:

- Mobile: 1-2 columns
- Tablet (md): 2-4 columns
- Desktop (xl/2xl): 4-6 columns (depending on dashboard)

**Theme Implementation**: CSS custom properties defined in `client/src/index.css` with separate tokens for light/dark modes. ThemeProvider switches between `.light` and `.dark` class on document root.

### Real-Time Event System

**WebSocket Architecture** (`server/websocket.ts`):

- WebSocket server mounted at `/ws` endpoint
- Client subscription model: clients subscribe to specific event types
- Heartbeat monitoring with 30-second intervals and missed ping tolerance
- Graceful connection management and cleanup

**Event Consumer** (`server/event-consumer.ts`):

- Kafka consumer using `kafkajs` library
- Connects to `192.168.86.200:9092` (configured via `KAFKA_BOOTSTRAP_SERVERS`)
- Consumes from multiple topics: `agent-routing-decisions`, `agent-transformation-events`, `router-performance-metrics`, `agent-actions`
- In-memory event aggregation and caching
- Provides aggregated metrics via `getAggregatedMetrics()` method
- EventEmitter-based pub/sub for internal event distribution

**Client Integration Pattern**:

```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/ws');

// Subscribe to events
ws.send(
  JSON.stringify({
    type: 'subscribe',
    topics: ['agent-actions', 'routing-decisions'],
  })
);

// Receive events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle real-time updates
};
```

## Important Constraints

**Port Binding**: Application MUST run on the port specified in `PORT` environment variable (default 3000). Other ports are firewalled in deployment environment.

**Database Requirement**: Application expects `DATABASE_URL` environment variable. Server will fail to start if not provided (validated in `drizzle.config.ts`).

**Test Framework**: Vitest is configured with 20+ test files covering components and data sources.

**Test Configuration** (`vitest.config.ts`):

- Environment: jsdom (for DOM testing)
- Setup file: `client/src/tests/setup.ts`
- Coverage: v8 provider with text/json/html reporters
- Path aliases: Same as main tsconfig (`@/` and `@shared/`)

**Test Structure**:

- Component tests: `client/src/components/__tests__/` (12+ files)
  - MetricCard, DataTable, EventFeed, StatusLegend, etc.
- Data source tests: `client/src/lib/data-sources/__tests__/` (8+ files)
  - Tests for each dashboard's data fetching logic
- Testing tools: @testing-library/react, @testing-library/user-event, vitest

**Running Tests**:

```bash
npm run test              # Run all tests
npm run test:ui           # Interactive test UI
npm run test:coverage     # Generate coverage report
```

**Replit-Specific Plugins**: Development build includes Replit-specific Vite plugins (`@replit/vite-plugin-*`) only when `REPL_ID` environment variable is present. These are skipped in non-Replit environments.

## Intelligence Infrastructure Integration

**Current State**: Hybrid implementation with real-time capabilities already in place.

**Already Implemented**:

- **WebSocket Server**: `server/websocket.ts` provides real-time event streaming to clients
- **Kafka Consumer**: `server/event-consumer.ts` consumes events from Kafka topics
- **Database Adapter**: `server/db-adapter.ts` reads from PostgreSQL intelligence database
- **Intelligence Schema**: `shared/intelligence-schema.ts` defines 30+ tables for agent observability
- **API Routes**: Multiple route files serve intelligence data:
  - `server/intelligence-routes.ts` - Main intelligence API endpoints
  - `server/savings-routes.ts` - Compute/token savings tracking
  - `server/agent-registry-routes.ts` - Agent discovery and management
  - `server/alert-routes.ts` - Alert management

**In Progress**: Converting dashboard components from mock data to real API endpoints and WebSocket subscriptions.

### Available Data Sources

**PostgreSQL Database** (`192.168.86.200:5436`):

- **Database**: `omninode_bridge`
- **30+ tables** tracking agent execution, routing, patterns, and performance
- **Key tables**:
  - `agent_routing_decisions` - Agent selection with confidence scoring (~1K/day)
  - `agent_manifest_injections` - Complete manifest snapshots (~1K/day)
  - `agent_actions` - Tool calls, decisions, errors (~50K/day)
  - `workflow_steps` - Workflow execution steps (~10K/day)
  - `llm_calls` - LLM API calls with costs (~5K/day)
  - `error_events` / `success_events` - Error and success tracking

**Kafka Event Bus** (`192.168.86.200:9092`):

- **Real-time event streaming** with <100ms latency
- **Topics**: `agent-routing-decisions`, `agent-transformation-events`, `router-performance-metrics`, `agent-actions`
- **Consumer Group**: `omnidash-consumers-v2`
- **Retention**: 3-7 days depending on topic

### Environment Variables

Add to `.env` for intelligence integration (see `.env.example` for template):

```bash
# PostgreSQL Intelligence Database
# See .env file for actual credentials - NEVER commit passwords to git!
DATABASE_URL="postgresql://postgres:<password>@192.168.86.200:5436/omninode_bridge"
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omninode_bridge

# Kafka Event Streaming
KAFKA_BROKERS=192.168.86.200:9092
KAFKA_CLIENT_ID=omnidash-dashboard
KAFKA_CONSUMER_GROUP=omnidash-consumers-v2

# Feature Flags
ENABLE_REAL_TIME_EVENTS=true
```

### Integration Patterns

**Pattern 1: Database-Backed API Endpoints** (✅ Implemented)

- Express API endpoints in `server/intelligence-routes.ts`, `server/savings-routes.ts`, `server/agent-registry-routes.ts`
- Uses Drizzle ORM with PostgreSQL at `192.168.86.200:5436`
- Backend aggregation and caching for performance
- Integrate with TanStack Query in dashboard components

**Pattern 2: WebSocket for Real-Time Updates** (✅ Implemented)

- WebSocket server at `/ws` in `server/websocket.ts`
- Consumes Kafka topics via `server/event-consumer.ts`
- Broadcasts events to subscribed clients (<100ms latency)
- Client subscription model for targeted updates

**Pattern 3: Server-Sent Events (SSE)** (Alternative Option)

- Simpler than WebSocket for one-way real-time updates
- Built-in browser reconnection
- Can be implemented as Express route streaming Kafka events

### Database Schema for Intelligence

Intelligence schema is defined in `shared/intelligence-schema.ts` with 30+ tables including:

**Core Tables** (already implemented):

- `agent_routing_decisions` - Agent selection with confidence scoring
- `agent_actions` - Tool calls, decisions, errors, successes
- `agent_transformation_events` - Polymorphic agent transformations
- `agent_manifest_injections` - Manifest generation and pattern discovery
- `workflow_steps` - Multi-step workflow execution tracking
- `llm_calls` - LLM API calls with token usage and costs
- `error_events` / `success_events` - Execution outcomes
- `debug_intelligence_entries` - Debug information capture
- `performance_metrics` - System performance tracking

All tables use Drizzle ORM with Zod validation schemas auto-generated via `createInsertSchema()`.

### Implementation Status

**✅ Phase 1: Infrastructure (Completed)**

- Intelligence schema with 30+ tables in `shared/intelligence-schema.ts`
- Database adapter in `server/db-adapter.ts` with connection pooling
- API endpoints in `server/intelligence-routes.ts` and related route files
- KafkaJS consumer in `server/event-consumer.ts` with event aggregation

**✅ Phase 2: Real-Time Streaming (Completed)**

- WebSocket server in `server/websocket.ts` with heartbeat monitoring
- Client subscription model for targeted event delivery
- Event bus integration with <100ms latency
- Automatic reconnection and error recovery

**🚧 Phase 3: Dashboard Integration (In Progress)**

1. Convert dashboard components from mock data to real API calls
2. Add `useWebSocket` hooks for real-time updates
3. Implement live metric updates with smooth animations
4. Add error boundaries and fallback states

**📋 Phase 4: Advanced Features (Planned)**

1. Qdrant integration for pattern similarity search
2. Redis caching layer for expensive queries
3. Materialized views for dashboard aggregations
4. D3.js visualizations for complex data relationships

### Dashboard-Specific Data Mappings

**AgentOperations** → `agent_routing_decisions`, `agent_actions`, topic: `agent-actions`
**PatternLearning** → `agent_manifest_injections`, pattern data
**IntelligenceOperations** → `agent_manifest_injections`, `llm_calls`
**EventFlow** → Kafka consumer lag metrics, direct topic monitoring
**CodeIntelligence** → semantic search, `workflow_steps`
**PlatformHealth** → `error_events`, database connection pool stats
**DeveloperExperience** → `agent_routing_decisions`, `workflow_steps`

### Complete Integration Guide

See `INTELLIGENCE_INTEGRATION.md` for comprehensive details including:

- Complete database schema documentation (30+ tables)
- Kafka event schemas with TypeScript interfaces
- Example SQL queries for each dashboard
- Full API endpoint implementations
- WebSocket/SSE code examples
- Performance optimization strategies
- Troubleshooting guide

## Design System Reference

See `design_guidelines.md` for comprehensive Carbon Design System implementation details including:

- Typography scale and IBM Plex font usage
- Spacing primitives (Tailwind units: 2, 4, 6, 8, 12, 16)
- Component patterns (metric cards, status indicators, data tables)
- Dashboard-specific layout grids
- Real-time data update animations
- Accessibility requirements

## Database Schema

**Application Schema**: `shared/schema.ts` contains basic user authentication tables.

**Intelligence Schema**: `shared/intelligence-schema.ts` (✅ already implemented) contains 30+ tables for agent observability:

- Agent routing and decision tracking
- Workflow execution and performance metrics
- Pattern learning and manifest generation
- LLM API calls with cost tracking
- Error and success event logging
- Debug intelligence capture

Both schemas use:

- Drizzle ORM for type-safe database access
- `createInsertSchema()` from `drizzle-zod` for runtime validation
- PostgreSQL with connection pooling via `@neondatabase/serverless`

The intelligence database (`omninode_bridge`) is on a separate PostgreSQL instance at `192.168.86.200:5436`.
