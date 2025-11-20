# OmniNode Code Intelligence Platform

## Overview

OmniNode is a sophisticated AI-powered code intelligence platform that provides real-time observability dashboards for monitoring AI agents, pattern learning, and code analysis operations. The platform features 8 specialized dashboards showcasing 52 AI agents, 25,000+ code patterns, 168+ AI operations, and real-time event processing capabilities. Built as a full-stack TypeScript application with React frontend and Express backend, it emphasizes data-dense visualization and enterprise-grade monitoring.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework Stack**: React 18 with TypeScript, using Vite as the build tool and development server. The application follows a single-page application (SPA) architecture with client-side routing via Wouter.

**UI Framework**: Implements shadcn/ui component library (New York style variant) with Radix UI primitives for accessible, composable components. Uses Tailwind CSS for styling with a custom design system based on IBM's Carbon Design System principles.

**Design System Philosophy**: Carbon Design System approach optimized for data-dense enterprise applications with emphasis on:

- Information density over white space to maximize data visibility
- IBM Plex Sans/Mono font family for UI and monospace metrics
- Scanability and quick comprehension for monitoring scenarios
- Consistent interaction patterns across all 8 dashboard views
- Performance-optimized for real-time data updates

**State Management**: TanStack Query (React Query) v5 for server state management with custom query client configuration. Local component state managed with React hooks. Theme state managed through custom ThemeProvider context (dark/light mode support).

**Routing Structure**: Eight main dashboard routes representing different aspects of the platform:

- `/` - AI Agent Operations (52 specialized agents)
- `/patterns` - Pattern Learning (25,000+ patterns)
- `/intelligence` - Intelligence Operations (168+ operations)
- `/code` - Code Intelligence (semantic search, quality gates)
- `/events` - Event Flow (Kafka/Redpanda processing)
- `/knowledge` - Knowledge Graph (code relationships)
- `/health` - Platform Health (system monitoring)
- `/developer` - Developer Experience (workflow metrics)
- `/chat` - AI Query Assistant (natural language queries)

**Component Architecture**: Modular component design with reusable visualization components:

- MetricCard: Key performance indicators with trend indicators
- AgentStatusGrid: Real-time agent status monitoring
- RealtimeChart: Time-series data visualization (Recharts)
- EventFeed: Live event stream display
- PatternNetwork: Interactive pattern visualization with canvas
- QualityGatePanel: Quality threshold monitoring
- ServiceStatusGrid: Service health indicators
- DrillDownPanel: Detailed data exploration via side sheets

**Visualization Libraries**: Recharts for charts/graphs, custom canvas rendering for network visualizations. All charts support real-time data updates with automatic re-rendering.

### Backend Architecture

**Server Framework**: Express.js running on Node.js with TypeScript. Minimal API surface as dashboards currently use mock data for demonstration.

**Development Setup**: Vite middleware integration for hot module replacement in development. Custom logging middleware for API request tracking. Static file serving for production builds.

**Storage Interface**: Abstract storage interface (IStorage) with in-memory implementation (MemStorage) for user management. Designed to be swappable with database-backed implementations.

**Build Process**:

- Frontend: Vite builds to `dist/public`
- Backend: esbuild bundles server code to `dist` with ESM format
- Production: Serves static frontend files and API routes from single Express server

### Data Storage

**ORM**: Drizzle ORM configured for PostgreSQL via `@neondatabase/serverless` connector. Schema definitions in TypeScript with type inference.

**Database Design**: Currently minimal schema with users table (id, username, password). Prepared for expansion to support agent metrics, pattern data, events, and knowledge graph relationships.

**Migration Strategy**: Drizzle Kit for schema migrations with `db:push` command. Migrations stored in `./migrations` directory.

**Connection**: PostgreSQL connection via DATABASE_URL environment variable, validated at application startup.

### Authentication & Authorization

**Session Management**: Prepared for PostgreSQL-backed sessions via `connect-pg-simple` package. Currently not actively implemented in routes.

**User Model**: Basic user schema with unique username constraint and password storage. Ready for integration with authentication middleware.

### External Dependencies

**UI Component Libraries**:

- @radix-ui/\* - 20+ primitive components for accessible UI
- shadcn/ui - Component system built on Radix primitives
- class-variance-authority - Type-safe component variants
- tailwindcss - Utility-first CSS framework

**Data Visualization**:

- recharts - Composable charting library for React
- embla-carousel-react - Carousel/slider component

**Forms & Validation**:

- react-hook-form - Form state management
- @hookform/resolvers - Form validation resolvers
- zod - TypeScript-first schema validation
- drizzle-zod - Drizzle schema to Zod conversion

**Styling & Utilities**:

- clsx & tailwind-merge - Conditional class merging
- date-fns - Date manipulation and formatting
- lucide-react - Icon library

**Database & ORM**:

- @neondatabase/serverless - Neon PostgreSQL serverless driver
- drizzle-orm - TypeScript ORM
- drizzle-kit - Schema migration toolkit

**Development Tools**:

- @replit/vite-plugin-\* - Replit-specific development plugins
- tsx - TypeScript execution for Node.js
- esbuild - JavaScript bundler for production

**Routing & Navigation**:

- wouter - Minimalist routing for React
- TanStack Query - Server state management

**Design Assets**: IBM Plex Sans and IBM Plex Mono fonts loaded from Google Fonts CDN for typography consistency.

### Key Architectural Decisions

**Mock Data Strategy**: Dashboards currently use client-side generated mock data with setTimeout-based updates to simulate real-time behavior. This allows frontend development and testing without backend implementation. Production implementation would replace with WebSocket or Server-Sent Events for real-time updates.

**Monorepo Structure**: Single repository with clear separation:

- `client/` - React frontend application
- `server/` - Express backend API
- `shared/` - Shared TypeScript types and schemas
- Path aliases (@/, @shared/) for clean imports

**Type Safety**: Full TypeScript coverage with strict mode enabled. Database schema types automatically inferred via Drizzle. Zod schemas for runtime validation.

**Responsive Design**: Mobile-first approach with Tailwind breakpoints (md, lg, xl, 2xl). Sidebar collapses on mobile devices. Dashboard grids adapt from 2-6 columns based on viewport.

**Theme System**: CSS custom properties for theming with automatic dark/light mode support. Separate color tokens for light and dark modes defined in index.css.

**Performance Considerations**:

- Chart data limited to recent time windows (typically 20 data points)
- Virtual scrolling for large lists (ScrollArea component)
- Lazy loading considerations for dashboard components
- Incremental TypeScript compilation via tsBuildInfoFile
