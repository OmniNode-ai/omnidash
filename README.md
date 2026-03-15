# OmniDash

Real-time monitoring and observability dashboard for the OmniNode platform.

## Quick Start

```bash
npm install
cp .env.example .env   # fill in database and Kafka credentials
PORT=3000 npm run dev
```

Required environment variables:

```bash
PORT=3000
OMNIDASH_ANALYTICS_DB_URL="postgresql://postgres:<password>@localhost:5436/omnidash_analytics"
KAFKA_BROKERS=localhost:29092   # cloud bus; use localhost:19092 for local Docker bus
KAFKA_CLIENT_ID=omnidash-dashboard
KAFKA_CONSUMER_GROUP=omnidash-consumers-v2
ENABLE_REAL_TIME_EVENTS=true
```

## Key Pages

| Page | Route | Data Source |
|------|-------|-------------|
| Epic Pipeline | `/epic-pipeline` | `onex.evt.omniclaude.epic-run-updated.v1` |
| PR Watch | `/pr-watch` | `onex.evt.omniclaude.pr-watch-updated.v1` |
| Gate Decisions | `/gate-decisions` | `onex.evt.omniclaude.gate-decision.v1` |
| Events (live) | `/live-events` | All topics (WebSocket) |
| Execution Graph | `/graph` | Node execution events |
| Patterns | `/patterns` | `onex.evt.omniintelligence.pattern-*.v1` |

## Key Features

- **Kafka projections**: Events consumed into local PostgreSQL read-model
- **Real-time WebSocket**: Live event streaming to browser
- **Multi-page dashboard**: Epic pipeline, PR watch, patterns, LLM routing, and more
- **React 18 + Vite**: Fast dev server with HMR
- **Express backend**: API routes + Kafka consumer process

## Documentation

- [Architecture overview](docs/architecture/OVERVIEW.md)
- [Route catalog](docs/architecture/ROUTE_CATALOG.md)
- [Event-to-component mapping](docs/EVENT_TO_COMPONENT_MAPPING.md)
- [Full index](docs/INDEX.md)
- [CLAUDE.md](CLAUDE.md) -- developer context and conventions
- [AGENT.md](AGENT.md) -- LLM navigation guide

## License

[MIT](LICENSE)
