# OmniDash

OmniDash is a comprehensive observability and intelligence platform for the OmniNode AI agent ecosystem. It provides real-time monitoring, pattern analysis, and actionable insights across 52+ AI agents and 168+ operations.

## Features

- **Agent Operations Dashboard**: Monitor 52 AI agents with real-time metrics and performance tracking
- **Pattern Learning**: Analyze 25,000+ code patterns with semantic search and recommendations
- **Intelligence Operations**: Track 168+ AI operations with detailed execution metrics
- **Event Flow Monitoring**: Visualize Kafka/Redpanda event streams with real-time processing
- **Code Intelligence**: Semantic code search with quality gates and compliance tracking
- **Knowledge Graph**: Interactive visualization of code relationships and dependencies
- **Platform Health**: System-wide health monitoring with alerts and diagnostics
- **Developer Experience**: Workflow metrics and productivity insights

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Kafka/Redpanda (for real-time events)

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure the following:

```bash
# Server
PORT=3000

# PostgreSQL Intelligence Database
DATABASE_URL="postgresql://user:password@192.168.86.200:5436/omninode_bridge"
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

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### Testing

Run tests:

```bash
npm run test              # Run vitest tests
npm run test:ui           # Interactive test UI
npm run test:coverage     # Generate coverage report
npm run test:snapshots    # Run Playwright tests
```

### Production Build

Build for production:

```bash
npm run build
npm start
```

## Code Quality & Git Hooks

This project uses automated quality gates to ensure code quality and consistency.

### Pre-commit Hooks

Pre-commit hooks automatically run before each commit to:
- **Lint TypeScript/TSX files**: ESLint automatically fixes code style issues
- **Format code**: Prettier ensures consistent formatting

Hooks are managed by [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/okonet/lint-staged).

### Commit Message Format

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <description>

[optional body]

[optional footer(s)]
```

**Valid commit types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes
- `build`: Build system changes
- `revert`: Revert a previous commit

**Examples:**

```bash
git commit -m "feat: add event correlation tracing"
git commit -m "fix: resolve WebSocket reconnection issue"
git commit -m "docs: update API documentation"
git commit -m "test: add unit tests for EventFlow component"
```

### Bypassing Hooks

In rare cases, you can skip hooks with `--no-verify`:

```bash
git commit --no-verify -m "emergency fix"
```

**⚠️ Use sparingly!** Bypassing hooks should only be done in emergencies.

### Manual Linting

Run linting manually:

```bash
npm run lint           # Check for issues
npm run lint:fix       # Fix issues automatically
npm run check          # TypeScript type checking
```

## Project Structure

```
omnidash/
├── client/           # React frontend
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Dashboard pages
│   │   ├── lib/          # Utilities and data sources
│   │   └── tests/        # Test utilities
├── server/           # Express backend
│   ├── index.ts          # Main server
│   ├── routes.ts         # Route registration
│   ├── websocket.ts      # WebSocket server
│   ├── event-consumer.ts # Kafka consumer
│   └── db-adapter.ts     # Database queries
├── shared/           # Shared types and schemas
│   ├── schema.ts             # Database schema
│   └── intelligence-schema.ts # Intelligence tables
├── .husky/           # Git hooks
├── .eslintrc.cjs     # ESLint configuration
├── .prettierrc.json  # Prettier configuration
└── .commitlintrc.json # Commitlint configuration
```

## Architecture

### Frontend

- **Framework**: React 18 with TypeScript
- **Router**: Wouter (lightweight SPA routing)
- **UI Components**: shadcn/ui (Radix UI primitives)
- **State Management**: TanStack Query v5
- **Styling**: Tailwind CSS with Carbon Design System principles
- **Charts**: Recharts

### Backend

- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: WebSocket + Kafka/Redpanda
- **Event Processing**: KafkaJS consumer with aggregation

### Development Tools

- **Build**: Vite (frontend) + esbuild (backend)
- **Testing**: Vitest + Playwright
- **Linting**: ESLint + Prettier
- **Git Hooks**: Husky + lint-staged
- **Type Checking**: TypeScript 5.6

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Make your changes
4. Run tests: `npm run test`
5. Commit with conventional commit format: `git commit -m "feat: add amazing feature"`
6. Push to your branch: `git push origin feat/amazing-feature`
7. Open a Pull Request

## License

MIT

## Support

For issues and questions, please open a GitHub issue.
