# Changelog

All notable changes to Omnidash will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2026-02-19]

### Added

- **Topic catalog version gap detection and periodic re-query** [OMN-2316] (#97): Detects version gaps in topic catalog entries and re-queries periodically to stay in sync with the event bus
- **Global demo mode toggle for all dashboards** [OMN-2298] (#95): Single toggle switches all dashboards between live and demo data, enabling safe presentations without a live infrastructure connection
- **Topic catalog bootstrap query and dynamic subscriptions** [OMN-2315] (#94): Bootstraps topic catalog from server on load and subscribes dynamically to newly discovered topics
- **LLM routing effectiveness dashboard** [OMN-2279] (#93): New dashboard visualizing routing decision quality, model selection ratios, and confidence distributions across LLM calls
- **Data sources health endpoint and panel** [OMN-2307] (#92): Added `/api/health/data-sources` endpoint and `DataSourceHealthPanel` component showing per-source connectivity status
- **Context enrichment dashboard** [OMN-2280] (#90): New dashboard tracking hit rate per channel, token savings, and latency distribution for the context enrichment pipeline
- **Execution Graph page wired to live ONEX node events** [OMN-2302] (#91): Connects the Execution Graph visualization to real-time node events from the ONEX event bus

### Fixed

- **Normalize topic column labels and add bidirectional filter** [OMN-2198] (#96): Standardizes column header display for topic names and adds a bidirectional filter on the Event Bus Monitor table
- **Wire effectiveness WebSocket invalidation and fix test cache isolation** [OMN-2328] (#88): Effectiveness dashboard now invalidates TanStack Query cache on WebSocket events; test isolation improved to prevent cache bleed between tests

## [2026-02-18]

### Added

- **Validation lifecycle candidate table, event handler, and consumer wiring** [OMN-2333] (#85): Adds database table and Kafka consumer projection for tracking validation lifecycle candidates; event handler wired end-to-end
- **LLM cost Kafka consumer — materialize read-model for omnidash** [OMN-2300] (#83): New Kafka consumer projects LLM cost events into the `omnidash_analytics` read-model database for cost trend queries
- **Pattern enforcement dashboard** [OMN-2275] (#82): New dashboard displaying enforcement hit rate, violation counts, and correction rate for ONEX pattern rules
- **Intent dashboard projection-driven with dedup and zombie-safe dev server** (#81): Rewrites the Intent Dashboard to use server-side projections; adds correlation-ID deduplication and zombie process guard on dev server restart

### Changed

- **Wire /api/baselines/* to real tables, remove mockOnEmpty** [OMN-2331] (#87): Baselines API endpoints now read from live `omnidash_analytics` tables; removed the `mockOnEmpty` fallback shim
- **Wire cost trend API to LLM cost read-model data** [OMN-2329] (#84): Cost Trend dashboard API routes now query the materialized LLM cost read-model instead of generating mock data

### Added (CI)

- **Arch-guard: block direct upstream DB access in CI** (#86): CI workflow rejects any code path that queries the upstream `omninode_bridge` database directly, enforcing the Kafka-only data flow architectural invariant

## [2026-02-17]

### Added

- **Connect Learned Insights page to OmniMemory API** [OMN-2306] (#79): Learned Insights dashboard now fetches real session patterns and conventions from the OmniMemory API

### Changed

- **Decouple extraction/effectiveness routes from DB** [OMN-2325] (#80): Extraction and effectiveness API routes no longer hold direct DB dependencies; data is sourced through the projection layer

## [2026-02-16]

### Added

- **Connect Correlation Trace page to live data** [OMN-2301] (#77): Correlation Trace page queries the `workflow_steps` projection table for real trace data keyed by correlation ID
- **Connect Node Registry page to live projection data** [OMN-2320] (#75): Node Registry dashboard reads from the `agent_routing_decisions` and `agent_actions` projection tables instead of mock data
- **Validation lifecycle tab with tier visualization and candidate tracking** [OMN-2152] (#65): Adds a lifecycle tab to the Validation dashboard showing candidate nodes organized by tier with promotion history

### Changed

- **Cost Trend dashboard with 6 views** [OMN-2242] (#76): Cost Trend dashboard expanded to six configurable views covering daily cost, cumulative spend, model breakdown, token usage, budget utilization, and per-agent cost

### Fixed

- **Show absolute timestamp in Recent Events table** (#78): Recent Events table on the Event Bus Monitor now displays absolute wall-clock timestamps instead of relative durations
- **Show tool names instead of full topic in Event Type column** [OMN-2196] (#73): Event Bus Monitor Event Type column now renders human-readable tool names extracted from ONEX topic strings
- **Stabilize Events by Type chart bar order** [OMN-2308] (#74): Bar chart no longer reorders bars between renders; consistent sort order applied for scanability
- **Bidirectional correlation-ID dedup for cross-source events** [OMN-2197] (#71): Deduplication now applies in both directions so events arriving from multiple Kafka topics with the same correlation ID are merged correctly
- **Merge observed topics into Event Bus sidebar** [OMN-2193] (#70): Topics discovered at runtime from the Kafka consumer are merged into the sidebar topic list instead of replacing static entries

### Tests

- **Unit tests for source inference from ONEX topics** [OMN-2195] (#72): New test suite verifying that source labels are correctly inferred from canonical ONEX topic name patterns

## [2026-02-15]

### Added

- **ROI dashboard for A/B pattern comparison** [OMN-2156] (#67): Baselines section gains an ROI dashboard that compares injection hit rates and token savings across A/B experiment arms
- **Effectiveness dashboard Tier 3 interactivity enhancements** [OMN-2049] (#69): Injection Effectiveness dashboard adds drill-down filters, sortable tables, and expandable row detail for Tier 3 metrics

### Changed

- **Retire legacy views into collapsible Advanced section** [OMN-2182] (#66, #63): Granular drill-down pages moved out of main navigation into a collapsible Advanced section; top-level nav now shows the four category dashboards only
- **Extract shared CLAUDE.md rules and add reference** [OMN-2163] (#68): Omnidash-specific `CLAUDE.md` now references `~/.claude/CLAUDE.md` for shared development standards rather than duplicating them

## [2026-02-14]

### Added

- **Four category landing pages with hero metrics** [OMN-2181] (#62): Speed, Success, Intelligence, and System Health category dashboards added as the new default landing pages with large hero metric cards
- **Required status checks for main branch protection** [OMN-2187] (#64): GitHub branch protection rules updated to require all CI status checks to pass before merging to main

### Changed

- **Own read-model with Kafka consumers and omnidash_analytics DB** [OMN-2061] (#59): Omnidash now owns its `omnidash_analytics` PostgreSQL database populated by Kafka consumer projections; application no longer queries upstream databases directly
- **Rename sidebar labels and regroup into product-facing categories** [OMN-2180] (#61): Sidebar navigation labels updated to product-facing language; routes regrouped into Monitoring, Intelligence, System, and Tools categories

## [2026-02-13]

### Added

- **Architecture handshake with CI enforcement** [OMN-1984] (#43): Installs the ONEX architecture handshake document and a CI workflow that verifies the installed copy matches the canonical source on every pull request

### Changed

- **Migrate hardcoded Kafka topic strings to shared constants** [OMN-1553] (#60): All Kafka topic references replaced with typed constants from a shared module; prevents topic name drift across consumers and producers

### Fixed

- **Event Bus source inference, redundant columns, and duplicate keys** [OMN-2082] (#58): Resolves three related Event Bus Monitor bugs: incorrect source labels, duplicate column definitions, and React key collisions in the event list

### Added (Events)

- **Close 7 Kafka topic coverage gaps and fix silent 400-error storm** (#57): Seven previously unmonitored Kafka topics added to the consumer; a misconfigured error handler that was silently swallowing 400 responses is corrected

## [2026-02-12]

### Added

- **Golden path dashboard API verification** [OMN-2079] (#56): Integration test suite that exercises the full golden path through all major dashboard API endpoints, verifying response shapes and status codes
- **Pattern query service with integration tests** [OMN-1801] (#55): Extracts pattern querying into a dedicated `PatternQueryService`; adds integration tests against a local test database

### Changed

- **Remove useEventBusStream hook** [OMN-2099] (#53): Legacy `useEventBusStream` React hook removed; Event Bus Monitor now uses the unified WebSocket subscription model via `useWebSocket`

## [2026-02-11]

### Added

- **EventBusProjection and Event Bus Monitor migration** [OMN-2095] (#47): New `EventBusProjection` class materializes Kafka event counts and rates server-side; Event Bus Monitor dashboard reads from this projection
- **ProjectionService core module** [OMN-2094] (#46): Introduces `ProjectionService` as the central registry for all server-side read-model projections, with lifecycle management and update scheduling
- **Burst/spike detection and unified monitoring window** [OMN-2158] (#50): Intent projection gains burst and spike detection; all projection consumers share a unified configurable monitoring window
- **Wire ProjectionService into WebSocket and Express routes** [OMN-2098] (#52): `ProjectionService` lifecycle hooked into Express startup; WebSocket broadcasts projection updates to subscribed clients

### Changed

- **Migrate Intent Dashboard to server-side projection** [OMN-2096] (#49): Intent Dashboard data moved from client-side Kafka polling to `ProjectionService`-backed API endpoint
- **Migrate Node Registry to server-side projection** [OMN-2097] (#48): Node Registry data moved from direct Kafka consumer queries to `ProjectionService` projection

## [2026-02-10]

### Added

- **Learned insights panel with OmniClaude integration** [OMN-1407] (#45): New Learned Insights dashboard panel fetches and displays code patterns and conventions captured during OmniClaude sessions
- **Pattern extraction pipeline dashboard** [OMN-1804] (#42): New Extraction dashboard tracking pipeline stage throughput, extraction success rate, and pattern discovery latency

## [2026-02-09]

### Added

- **Injection effectiveness dashboard** [OMN-1891] (#41): New Effectiveness dashboard visualizing manifest injection hit rates, A/B comparisons, and per-agent injection performance

### Changed

- **Centralize Kafka topic naming with canonical ONEX format** [OMN-1933] (#40): Topic strings normalized to the canonical `onex.<layer>.<service>.<event>.<version>` format across all consumers and producers

## [2026-02-07]

### Added

- **Cross-repo validation dashboard** [OMN-1907] (#39): New Validation dashboard displaying cross-repository validation run results, violation counts by severity, and trend charts

## [2026-02-04]

### Changed

- **Event Bus chart labels, colors, and legend display** (#38): Improves readability of all Event Bus Monitor charts with clearer axis labels, a consistent color palette, and a visible legend

## [2026-02-03]

### Added

- **Pattern health visualization widgets with graceful degradation** [OMN-1798] (#37): Pattern Learning dashboard gains health score widgets that degrade gracefully when the patterns API is unavailable
- **PlaybackDataSource for demo/stakeholder playback** [OMN-1885] (#36): New `PlaybackDataSource` replays pre-recorded event sequences locally for stakeholder demos and offline UI review. This is a demo-only feature; Kafka/Redpanda remains required for all live operation.
- **Event Bus Monitor as default landing page** (#35): Application root redirected to the Event Bus Monitor; it becomes the canonical entry point for the dashboard
- **GET /api/patterns endpoint for learned patterns** [OMN-1797]: REST endpoint added for querying the pattern store from frontend components

### Fixed

- **Crash prevention for missing infrastructure config** (#34): Server no longer crashes at startup when Kafka or database environment variables are absent (configuration errors are logged as errors and dashboards display a degraded-state message). Kafka/Redpanda and the database remain required infrastructure — absence of these variables is a misconfiguration that must be corrected.

## [2026-02-02]

### Added

- **Event recording and playback system** [OMN-1843] (#32): Infrastructure for recording live Kafka event streams to disk and replaying them for testing and demos

## [2026-01-30]

### Added

- **Pattern Learning dashboard with client-side filtering and demo seeder** [OMN-1699] (#31, #30): Full PATLEARN dashboard with evidence-based confidence score display, client-side filter controls, and a seeder script for populating demo data

## [2026-01-29]

### Changed

- **Event Bus donut charts with toggle and UX improvements** (#29): Event Bus Monitor gains donut chart variants with a toggle to switch between bar and donut views; general UX polish applied

## [2026-01-26]

### Added

- **Real-time intent classification dashboard** [OMN-1458] (#26): Intent Dashboard displaying live intent classification signals, confidence distributions, and classification history from the Kafka event bus
- **Real-time intent event infrastructure** (#28): WebSocket infrastructure for streaming intent classification events from Kafka to the intent dashboard
- **Real-time event streaming for registry dashboard** (#27): Node Registry dashboard gains live event updates via WebSocket subscription

## [2026-01-25]

### Added

- **Intent query REST API endpoints** [OMN-1516] (#25): REST endpoints for querying historical intent classifications by time range, agent, and intent type
- **contract.yaml and runtime identity infrastructure** (#24): Adds `contract.yaml` for omnidash's ONEX contract identity and runtime self-identification support

## [2026-01-22]

### Changed

- **Node Registry VP-level redesign with health badge and dual charts** (#23): Node Registry dashboard redesigned with a health status badge, dual activity charts, and a more information-dense layout

## [2026-01-21]

### Added

- **Contract-driven registry discovery dashboard** [OMN-1278] (#22): Node Registry dashboard rebuilt on the contract-driven widget system with live discovery from the ONEX agent registry

## [2026-01-20]

### Added

- **Node execution graph visualization** [OMN-1406] (#19): Interactive execution graph showing node relationships, data flow, and real-time execution state for investor demos
- **Live event stream visualization** [OMN-1405] (#18): Real-time event stream panel visualizing Kafka events as they arrive, with source filtering and type breakdown
- **Contract-driven dashboards with real-time Kafka integration** (#16): Foundation for the contract-driven dashboard system; all five widget types (MetricCard, StatusBadge, ChartContainer, DataTable, EventFeed) wired to Kafka-backed data sources

## [2025-11-22]

### Fixed

- **Remove hardcoded credentials and migrate to environment variables** (#13): All database passwords and API keys removed from source; full migration to `.env`-backed environment variable loading

## [2025-11-21]

### Fixed

- **Resolve ESLint warnings and TypeScript errors across codebase** (#12): Sweeping fix of accumulated type errors and lint warnings; no functional changes

## [2025-11-19]

### Changed

- **Event Bus Monitor UI improvements** (#11): Visual polish pass on the Event Bus Monitor including layout adjustments and cleaner metric display

## [2025-11-18]

### Fixed

- **CI test failures: resolve TypeScript errors and test data mismatches** (#): TypeScript strict-mode errors and incorrect test fixture shapes corrected to restore green CI

## [2025-11-14]

### Added

- **Event Bus data source with mock generator** (#10): `EventBusDataSource` module with a configurable mock event generator for local development and CI

## [2025-11-13]

### Changed

- **Populate UI components with sample data** (#9): All dashboard components now render with representative sample data instead of empty states

## [2025-11-10]

### Changed

- **Dashboard UI standardization — 100% compliance** (#8): All dashboard pages audited and updated to conform to the Carbon Design System grid, spacing, and typography standards
- **Security cleanup and documentation organization** (#): Placeholder passwords strengthened; fail-fast validation added for required environment variables; documentation reorganized

## [2025-11-09]

### Fixed

- **Mock data patterns and test reliability** (#7): Addresses PR review feedback on mock data shape consistency and flaky test assertions

## [2025-11-08]

### Added

- **Comprehensive test coverage for data sources** (#): Test suite covering all data source modules with mock injection and edge-case assertions

### Fixed

- **Critical security vulnerability and data integrity issues** (#): Resolves a credential exposure path and two data integrity bugs identified in PR review

## [2025-11-07]

### Changed

- **Standardize data sources to use USE_MOCK_DATA flag consistently** (#): All data source modules respect the `USE_MOCK_DATA` environment flag; no source silently falls back to mock data without logging

### Fixed

- **12 critical and major issues from PR review** (#): Batch fix addressing issues flagged during code review including null-safety gaps, missing error boundaries, and incorrect metric aggregations

## [2025-11-04]

### Added

- **Intelligence infrastructure integration foundation** (#1): Initial wiring of the WebSocket server, Kafka consumer, database adapter, and intelligence schema supporting real-time agent observability
