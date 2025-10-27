# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

**Development**:
```bash
npm run dev         # Start development server with HMR (Vite + Express)
npm run check       # TypeScript type checking across client/server/shared
npm run build       # Build frontend (Vite) and backend (esbuild) for production
npm start           # Run production build
```

**Database**:
```bash
npm run db:push     # Push Drizzle schema changes to PostgreSQL
```

**Environment**:
- Requires `DATABASE_URL` environment variable for PostgreSQL connection
- Runs on `PORT` env var (defaults to 5000) - other ports are firewalled

## Project Architecture

### Monorepo Structure

Three-directory monorepo with TypeScript path aliases:
- **`client/`** → React frontend (accessed via `@/` alias)
- **`server/`** → Express backend (minimal API surface)
- **`shared/`** → Shared types/schemas (accessed via `@shared/` alias)

### Frontend Architecture

**Router Pattern**: Wouter-based SPA with 9 dashboard routes representing different platform capabilities:

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | AgentOperations | 52 AI agents monitoring |
| `/patterns` | PatternLearning | 25,000+ code patterns |
| `/intelligence` | IntelligenceOperations | 168+ AI operations |
| `/code` | CodeIntelligence | Semantic search, quality gates |
| `/events` | EventFlow | Kafka/Redpanda event processing |
| `/knowledge` | KnowledgeGraph | Code relationship visualization |
| `/health` | PlatformHealth | System health monitoring |
| `/developer` | DeveloperExperience | Workflow metrics |
| `/chat` | Chat | AI query assistant |

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

**Minimal API Design**: Express server currently serves mostly as static file host. Dashboards use client-side mock data with `setTimeout`-based updates to simulate real-time behavior.

**Development vs Production**:
- **Dev**: Vite middleware integrated into Express for HMR (`setupVite()` in `server/vite.ts`)
- **Prod**: Static files served from `dist/public`, API routes from `dist/index.js`

**Build Process**:
1. Frontend: Vite bundles to `dist/public/`
2. Backend: esbuild bundles server to `dist/` (ESM format, platform: node, externalized packages)

**Database Layer**:
- **ORM**: Drizzle with Neon serverless PostgreSQL driver
- **Schema**: Defined in `shared/schema.ts` (currently minimal: users table only)
- **Type Safety**: Zod schemas auto-generated from Drizzle via `drizzle-zod`
- **Migrations**: Managed by Drizzle Kit, stored in `./migrations/`

**Request Logging**: Custom middleware logs API requests (`/api` paths only) with duration and truncated JSON responses (80 char limit).

### Key Architectural Patterns

**Mock Data Strategy**: Dashboards currently generate client-side mock data. Future production implementation should replace with:
- WebSocket or Server-Sent Events for real-time updates
- Actual API endpoints in `server/routes.ts`
- Backend data aggregation for metrics

**Path Alias Resolution**: Three import aliases configured in both `tsconfig.json` and `vite.config.ts`:
```typescript
@/          → client/src/
@shared/    → shared/
@assets/    → attached_assets/
```

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

## Important Constraints

**Port Binding**: Application MUST run on the port specified in `PORT` environment variable (default 5000). Other ports are firewalled in deployment environment.

**Database Requirement**: Application expects `DATABASE_URL` environment variable. Server will fail to start if not provided (validated in `drizzle.config.ts`).

**No Test Framework**: Project currently has no test files or test runner configured.

**Replit-Specific Plugins**: Development build includes Replit-specific Vite plugins (`@replit/vite-plugin-*`) only when `REPL_ID` environment variable is present. These are skipped in non-Replit environments.

## Intelligence Infrastructure Integration

**Current State**: Dashboards use client-side mock data with `setTimeout`-based updates.

**Production Target**: Replace mock data with real intelligence infrastructure providing comprehensive observability data about AI agent operations, pattern discovery, routing decisions, and execution performance.

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
- **Consumer Group**: `omnidash-consumers` (suggested)
- **Retention**: 3-7 days depending on topic

**Qdrant Vector Database** (via MCP at `http://192.168.86.101:8151/mcp`):
- **Collections**: `execution_patterns` (~50), `code_patterns` (~100), `workflow_events`
- **Purpose**: Pattern similarity search, semantic code search
- **Access**: Via archon-intelligence MCP service

### Environment Variables

Add to `.env.local` for intelligence integration:

```bash
# PostgreSQL Intelligence Database
DATABASE_URL="postgresql://postgres:omninode-bridge-postgres-dev-2024@192.168.86.200:5436/omninode_bridge"
POSTGRES_HOST=192.168.86.200
POSTGRES_PORT=5436
POSTGRES_DATABASE=omninode_bridge

# Kafka Event Streaming
KAFKA_BROKERS=192.168.86.200:9092
KAFKA_CLIENT_ID=omnidash-dashboard
KAFKA_CONSUMER_GROUP=omnidash-consumers

# Qdrant Vector Search (via MCP)
ARCHON_MCP_URL=http://192.168.86.101:8151/mcp

# Feature Flags
ENABLE_REAL_TIME_EVENTS=true
ENABLE_VECTOR_SEARCH=true
```

### Integration Patterns

**Pattern 1: Database-Backed API Endpoints** (Recommended for Phase 1)
- Create Express API endpoints in `server/routes.ts` that query PostgreSQL
- Use existing Drizzle ORM patterns
- Integrate with TanStack Query in dashboard components
- Advantages: Simple, cacheable, no WebSocket complexity

**Pattern 2: WebSocket for Real-Time Updates** (Phase 2)
- Add WebSocket server (`server/websocket.ts`) that consumes Kafka
- Broadcast events to connected clients (<100ms latency)
- Use for high-frequency dashboard updates
- Dependencies: `ws`, `kafkajs` packages

**Pattern 3: Server-Sent Events (SSE)** (Alternative to WebSocket)
- Simpler than WebSocket for one-way real-time updates
- Built-in browser reconnection
- Implement as Express route streaming Kafka events

### Database Schema for Intelligence

Add to `shared/intelligence-schema.ts`:

```typescript
// Core tables for agent observability
export const agentRoutingDecisions = pgTable('agent_routing_decisions', {
  id: uuid('id').primaryKey(),
  correlationId: uuid('correlation_id').notNull(),
  userRequest: text('user_request').notNull(),
  selectedAgent: text('selected_agent').notNull(),
  confidenceScore: numeric('confidence_score', { precision: 5, scale: 4 }).notNull(),
  routingStrategy: text('routing_strategy').notNull(),
  routingTimeMs: integer('routing_time_ms').notNull(),
  actualSuccess: boolean('actual_success'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const agentActions = pgTable('agent_actions', {
  id: uuid('id').primaryKey(),
  correlationId: uuid('correlation_id').notNull(),
  agentName: text('agent_name').notNull(),
  actionType: text('action_type').notNull(), // tool_call, decision, error, success
  actionName: text('action_name').notNull(),
  actionDetails: jsonb('action_details'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### Phased Implementation Approach

**Phase 1: Database API Integration** (Week 1)
1. Add intelligence schema tables to `shared/intelligence-schema.ts`
2. Create aggregation endpoints in `server/routes.ts` for each dashboard
3. Replace mock data with `useQuery` hooks calling real APIs
4. Test with historical data (last 24 hours)

**Phase 2: Real-Time Event Streaming** (Week 2)
1. Install dependencies: `npm install kafkajs ws`
2. Create WebSocket server in `server/websocket.ts` consuming Kafka topics
3. Add `useWebSocket` hook in dashboard components
4. Implement live metric updates with smooth animations

**Phase 3: Advanced Features** (Week 3+)
1. Qdrant integration for pattern similarity search
2. Redis caching layer for expensive queries
3. Materialized views for dashboard aggregations
4. D3.js visualizations for complex data relationships

### Dashboard-Specific Data Mappings

**AgentOperations** → `agent_routing_decisions`, `agent_actions`, topic: `agent-actions`
**PatternLearning** → `agent_manifest_injections`, Qdrant patterns
**IntelligenceOperations** → `agent_manifest_injections`, `llm_calls`
**EventFlow** → Kafka consumer lag metrics, direct topic monitoring
**CodeIntelligence** → Qdrant semantic search, `workflow_steps`
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

## Database Schema Extensions

Current schema is minimal (users table only). For intelligence infrastructure integration:
- See **Intelligence Infrastructure Integration** section above for complete schema details
- Intelligence tables should be added to `shared/intelligence-schema.ts` (separate from user auth schema)
- Use `createInsertSchema()` from `drizzle-zod` for runtime validation of insert operations
- The intelligence database is separate from the app database (different DATABASE_URL)
- Follow the phased implementation approach documented in `INTELLIGENCE_INTEGRATION.md`
