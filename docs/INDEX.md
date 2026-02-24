> **Navigation**: Home (You are here)

# Omnidash Documentation

Welcome to the Omnidash (`omnidash`) documentation. Omnidash is a real-time monitoring and observability dashboard for the OmniNode AI agent system.

## Documentation Authority Model

| Source | Contains | Does NOT Contain |
|--------|----------|------------------|
| **[CLAUDE.md](../CLAUDE.md)** | Project rules, invariants, port/database config, architectural constraints, development commands | Tutorials, architecture deep dives, API reference, code examples |
| **[README.md](../README.md)** | Project overview, quick start, setup steps | Rules, detailed architecture, reference material |
| **[docs/architecture/](architecture/)** | System design, data flows, component architecture, route catalog | Rules, how-to guides, API specs |
| **[docs/conventions/](conventions/)** | Coding patterns, data source contracts, error handling standards | Architecture diagrams, API listings |
| **[docs/reference/](reference/)** | API endpoint catalog, shared types, configuration reference | Rules, tutorials |
| **[docs/decisions/](decisions/)** | Architecture Decision Records — why things work the way they do | Implementation details |
| **[docs/testing/](testing/)** | Test patterns, snapshot testing, CI configuration | Architecture, API reference |
| **[design_guidelines.md](../design_guidelines.md)** | Carbon Design System rules, typography, spacing, component patterns | Code architecture, API specs |

**When in conflict, CLAUDE.md takes precedence.** Rules live in CLAUDE.md; explanations and reference material live in docs/.

**Quick Reference:**
- Need a rule or constraint? Check [CLAUDE.md](../CLAUDE.md)
- Need to understand the system? Check [docs/architecture/](architecture/)
- Need to look up an API or endpoint? Check [docs/reference/](reference/)
- Need a decision rationale? Check [docs/decisions/](decisions/)

---

## Quick Navigation

| I want to... | Go to... |
|--------------|----------|
| Get the project running | [README.md](../README.md) |
| Add a new dashboard page | [Architecture Overview](architecture/OVERVIEW.md) + [Route Catalog](architecture/ROUTE_CATALOG.md) |
| Connect a dashboard to real data | [Intelligence Integration Guide](features/INTELLIGENCE_INTEGRATION.md) + [Integration Quick Start](features/INTEGRATION_QUICK_START.md) |
| Understand the read-model projection system | [Read-Model Projection Architecture](architecture/READ_MODEL_PROJECTION_ARCHITECTURE.md) |
| Understand Kafka topics and event schemas | [Topic Catalog Architecture](architecture/TOPIC_CATALOG_ARCHITECTURE.md) + [Event Mapping Quick Reference](EVENT_MAPPING_QUICK_REFERENCE.md) |
| Map a Kafka event to a dashboard component | [Event to Component Mapping](EVENT_TO_COMPONENT_MAPPING.md) |
| Write or fix a test | [TESTING.md](../TESTING.md) + [Snapshot Testing](testing/SNAPSHOT_TESTING.md) |
| Fix a CI timeout | [CI Timeout Fix](testing/CI_TIMEOUT_FIX.md) |
| Configure ESLint rules | [ESLint Setup](ESLINT_SETUP.md) + [ESLint Test Rules](ESLINT_TEST_RULES.md) |
| Understand icon conventions | [Icon Standardization Guide](ICON_STANDARDS.md) |
| Follow design system conventions | [design_guidelines.md](../design_guidelines.md) |
| Understand demo mode behavior | [Demo Mode Architecture](architecture/DEMO_MODE_ARCHITECTURE.md) |
| Understand error handling conventions | [Error Handling](conventions/ERROR_HANDLING.md) |
| Look up all API endpoints | [API Endpoint Catalog](reference/API_ENDPOINT_CATALOG.md) |
| Understand a past architecture decision | [docs/decisions/](decisions/) |

---

## Documentation Structure

### Root-Level Documents

Core documents at the repository root.

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview, quick start, setup instructions |
| [CLAUDE.md](../CLAUDE.md) | Project rules, invariants, development constraints, port and database config |
| [TESTING.md](../TESTING.md) | Vitest patterns, test setup, mock patterns, cleanup best practices |
| [HOOKS_SETUP.md](../HOOKS_SETUP.md) | Husky, lint-staged, ESLint, Prettier, and commitlint pre-commit gate setup |
| [design_guidelines.md](../design_guidelines.md) | Carbon Design System, IBM Plex typography, spacing primitives, component patterns |

### Architecture

How Omnidash works — system design, data flows, component structure.

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](architecture/OVERVIEW.md) | High-level system design and monorepo structure |
| [ROUTE_CATALOG.md](architecture/ROUTE_CATALOG.md) | All dashboard routes, components, and their purposes |
| [READ_MODEL_PROJECTION_ARCHITECTURE.md](architecture/READ_MODEL_PROJECTION_ARCHITECTURE.md) | How Kafka events are projected into the `omnidash_analytics` read-model database |
| [DEMO_MODE_ARCHITECTURE.md](architecture/DEMO_MODE_ARCHITECTURE.md) | Mock fallback behavior, demo mode toggles, and mock data strategy |
| [TOPIC_CATALOG_ARCHITECTURE.md](architecture/TOPIC_CATALOG_ARCHITECTURE.md) | Kafka topic inventory, consumer group configuration, event schemas |

### Conventions

Coding patterns and standards specific to Omnidash.

| Document | Description |
|----------|-------------|
| [DATA_SOURCE_CONTRACTS.md](conventions/DATA_SOURCE_CONTRACTS.md) | How dashboard data sources are structured, typed, and tested |
| [ERROR_HANDLING.md](conventions/ERROR_HANDLING.md) | Error boundary patterns, fallback states, and API error conventions |

### Reference

Look-up material: endpoints, types, configuration.

| Document | Description |
|----------|-------------|
| [API_ENDPOINT_CATALOG.md](reference/API_ENDPOINT_CATALOG.md) | Complete catalog of all `/api/*` endpoints with request/response shapes |

### Decisions (ADRs)

Architecture Decision Records explaining why things work the way they do.

| Document | Description |
|----------|-------------|
| [ADR-001-arch-guard-ci-rule.md](decisions/ADR-001-arch-guard-ci-rule.md) | Block direct upstream DB access in CI — architecture boundary enforcement |
| [ADR-002-api-first-mock-fallback-pattern.md](decisions/ADR-002-api-first-mock-fallback-pattern.md) | API-first with mock fallback for all data sources — resilient dashboard behavior |
| [ADR-003-projection-decoupled-routes.md](decisions/ADR-003-projection-decoupled-routes.md) | Decouple dashboard routes from shared projection state — independent route flexibility |

### Features and Integration

Integration guides and feature documentation.

| Document | Description |
|----------|-------------|
| [INTELLIGENCE_INTEGRATION.md](features/INTELLIGENCE_INTEGRATION.md) | Complete guide: database schema, Kafka event schemas, SQL queries, API examples |
| [INTEGRATION_QUICK_REFERENCE.md](features/INTEGRATION_QUICK_REFERENCE.md) | Dashboard data source status at a glance — quick lookup table |
| [INTEGRATION_QUICK_START.md](features/INTEGRATION_QUICK_START.md) | Fastest path to connecting a dashboard to live OmniClaude data |
| [INTELLIGENCE_SAVINGS_PATTERNS.md](features/INTELLIGENCE_SAVINGS_PATTERNS.md) | Currency formatting and display patterns for the IntelligenceSavings component |
| [INTERACTIVE_DESIGN_SYSTEM.md](features/INTERACTIVE_DESIGN_SYSTEM.md) | Interactive component quick reference — clickable UI patterns |
| [PREVIEW_FEATURES_README.md](features/PREVIEW_FEATURES_README.md) | Preview and experimental features index |
| [COMPREHENSIVE_PLATFORM_ENHANCEMENT_PLAN.md](features/COMPREHENSIVE_PLATFORM_ENHANCEMENT_PLAN.md) | Planned platform enhancements and roadmap |
| [EXECUTIVE_SUMMARY.md](features/EXECUTIVE_SUMMARY.md) | Executive summary of the intelligence platform |

### Event System Reference

Event bus, Kafka topic mappings, and mock generation.

| Document | Description |
|----------|-------------|
| [EVENT_MAPPING_QUICK_REFERENCE.md](EVENT_MAPPING_QUICK_REFERENCE.md) | Quick lookup: event → data source → component |
| [EVENT_TO_COMPONENT_MAPPING.md](EVENT_TO_COMPONENT_MAPPING.md) | Full catalog mapping event bus events to dashboard components |
| [EVENT_BUS_MOCK_GENERATOR.md](EVENT_BUS_MOCK_GENERATOR.md) | Mock event generator for simulating Kafka event chains in development |
| [EVENT_BUS_DATA_SOURCE_IMPLEMENTATION.md](EVENT_BUS_DATA_SOURCE_IMPLEMENTATION.md) | Event bus data source implementation details |

### ESLint and Code Quality

Linting configuration and enforcement rules.

| Document | Description |
|----------|-------------|
| [ESLINT_SETUP.md](ESLINT_SETUP.md) | ESLint configuration overview for test cleanup enforcement |
| [ESLINT_TEST_RULES.md](ESLINT_TEST_RULES.md) | ESLint rules for test files: memory leaks, cleanup enforcement, test quality |
| [ESLINT_IMPLEMENTATION_SUMMARY.md](ESLINT_IMPLEMENTATION_SUMMARY.md) | Summary of custom ESLint rule implementation |

### UI Standards

Visual conventions and component standards.

| Document | Description |
|----------|-------------|
| [ICON_STANDARDS.md](ICON_STANDARDS.md) | Centralized icon vocabulary, `standardIcons.ts` usage, visual consistency rules |

### Testing

Test patterns, CI configuration, and visual regression testing.

| Document | Description |
|----------|-------------|
| [TESTING.md](../TESTING.md) | Vitest patterns, mock cleanup, preventing test hangs and memory leaks |
| [testing/SNAPSHOT_TESTING.md](testing/SNAPSHOT_TESTING.md) | Visual regression testing with Playwright |
| [testing/SNAPSHOT_TESTING_QUICK_START.md](testing/SNAPSHOT_TESTING_QUICK_START.md) | Quick start guide for Playwright snapshot tests |
| [testing/CI_TIMEOUT_FIX.md](testing/CI_TIMEOUT_FIX.md) | Fixing Vitest hangs in CI environments |
| [testing/INFRASTRUCTURE_TEST_COVERAGE.md](testing/INFRASTRUCTURE_TEST_COVERAGE.md) | Infrastructure test coverage report (generated 2025-11-12) |

### Changelog

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](../CHANGELOG.md) | Release history and notable changes |

---

## Document Status Summary

| Document | Status | Notes |
|----------|--------|-------|
| [README.md](../README.md) | Current | Project onboarding entry point |
| [CLAUDE.md](../CLAUDE.md) | Current | Authoritative rules file |
| [TESTING.md](../TESTING.md) | Current | Vitest patterns and cleanup best practices |
| [HOOKS_SETUP.md](../HOOKS_SETUP.md) | Current | Pre-commit gate configuration |
| [design_guidelines.md](../design_guidelines.md) | Current | Carbon Design System reference |
| [docs/ESLINT_SETUP.md](ESLINT_SETUP.md) | Current | ESLint config overview |
| [docs/ESLINT_TEST_RULES.md](ESLINT_TEST_RULES.md) | Current | ESLint test enforcement rules |
| [docs/ESLINT_IMPLEMENTATION_SUMMARY.md](ESLINT_IMPLEMENTATION_SUMMARY.md) | Current | Custom rule implementation summary |
| [docs/EVENT_BUS_MOCK_GENERATOR.md](EVENT_BUS_MOCK_GENERATOR.md) | Current | Mock event generator |
| [docs/EVENT_BUS_DATA_SOURCE_IMPLEMENTATION.md](EVENT_BUS_DATA_SOURCE_IMPLEMENTATION.md) | Current | Event bus data source implementation |
| [docs/EVENT_MAPPING_QUICK_REFERENCE.md](EVENT_MAPPING_QUICK_REFERENCE.md) | Current | Event → component quick reference |
| [docs/EVENT_TO_COMPONENT_MAPPING.md](EVENT_TO_COMPONENT_MAPPING.md) | Needs Update | Written November 2025; route catalog has grown since |
| [docs/ICON_STANDARDS.md](ICON_STANDARDS.md) | Current | Icon vocabulary and usage |
| [docs/features/INTELLIGENCE_INTEGRATION.md](features/INTELLIGENCE_INTEGRATION.md) | Needs Update | Written October 2025; schema has grown |
| [docs/features/INTEGRATION_QUICK_REFERENCE.md](features/INTEGRATION_QUICK_REFERENCE.md) | Needs Update | Written October 2025; new dashboards added |
| [docs/features/INTEGRATION_QUICK_START.md](features/INTEGRATION_QUICK_START.md) | Current | Quickest path to live data integration |
| [docs/features/INTELLIGENCE_SAVINGS_PATTERNS.md](features/INTELLIGENCE_SAVINGS_PATTERNS.md) | Current | Currency formatting patterns |
| [docs/features/INTERACTIVE_DESIGN_SYSTEM.md](features/INTERACTIVE_DESIGN_SYSTEM.md) | Current | Interactive component reference |
| [docs/features/PREVIEW_FEATURES_README.md](features/PREVIEW_FEATURES_README.md) | Needs Update | May not reflect current preview feature set |
| [docs/features/COMPREHENSIVE_PLATFORM_ENHANCEMENT_PLAN.md](features/COMPREHENSIVE_PLATFORM_ENHANCEMENT_PLAN.md) | Stale | Planning document; partially implemented |
| [docs/features/EXECUTIVE_SUMMARY.md](features/EXECUTIVE_SUMMARY.md) | Stale | Point-in-time summary |
| [docs/testing/SNAPSHOT_TESTING.md](testing/SNAPSHOT_TESTING.md) | Current | Playwright visual regression guide |
| [docs/testing/SNAPSHOT_TESTING_QUICK_START.md](testing/SNAPSHOT_TESTING_QUICK_START.md) | Current | Playwright quick start |
| [docs/testing/CI_TIMEOUT_FIX.md](testing/CI_TIMEOUT_FIX.md) | Current | CI hang resolution |
| [docs/testing/INFRASTRUCTURE_TEST_COVERAGE.md](testing/INFRASTRUCTURE_TEST_COVERAGE.md) | Stale | Coverage report from 2025-11-12 |
| [docs/architecture/OVERVIEW.md](architecture/OVERVIEW.md) | Current | High-level system design and monorepo structure |
| [docs/architecture/ROUTE_CATALOG.md](architecture/ROUTE_CATALOG.md) | Current | All dashboard routes, components, and their purposes |
| [docs/architecture/READ_MODEL_PROJECTION_ARCHITECTURE.md](architecture/READ_MODEL_PROJECTION_ARCHITECTURE.md) | Current | Kafka-to-read-model projection architecture |
| [docs/architecture/DEMO_MODE_ARCHITECTURE.md](architecture/DEMO_MODE_ARCHITECTURE.md) | Current | Mock fallback and demo mode behavior |
| [docs/architecture/TOPIC_CATALOG_ARCHITECTURE.md](architecture/TOPIC_CATALOG_ARCHITECTURE.md) | Current | Kafka topic inventory and event schemas |
| [docs/conventions/DATA_SOURCE_CONTRACTS.md](conventions/DATA_SOURCE_CONTRACTS.md) | Current | Data source structure, typing, and testing conventions |
| [docs/conventions/ERROR_HANDLING.md](conventions/ERROR_HANDLING.md) | Current | Error boundary patterns and API error conventions |
| [docs/reference/API_ENDPOINT_CATALOG.md](reference/API_ENDPOINT_CATALOG.md) | Current | Complete `/api/*` endpoint catalog |
| docs/decisions/ | Current | 3 ADRs: arch-guard CI rule, API-first mock fallback pattern, projection-decoupled routes |
| [CHANGELOG.md](../CHANGELOG.md) | Current | Release history and notable changes |
