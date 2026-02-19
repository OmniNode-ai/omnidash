# API Endpoint Catalog

Complete catalog of all server route files and their endpoints. All routes are
mounted under the `/api` prefix by `server/routes.ts`.

For each domain, the entry includes the route file, its mount prefix, all
endpoints, and which client-side data source file consumes it.

---

## Table of Contents

- [Intelligence](#intelligence---apintelligence)
- [Savings / ROI](#savings--roi---apisavings)
- [Agent Registry](#agent-registry---apiagents)
- [Validation](#validation---apivalidation)
- [Extraction Pipeline](#extraction-pipeline---apiextraction)
- [Injection Effectiveness](#injection-effectiveness---apieffectiveness)
- [Cost Trends](#cost-trends---apicosts)
- [Baselines](#baselines---apibaselines)
- [Context Enrichment](#context-enrichment---apienrichment)
- [Pattern Enforcement](#pattern-enforcement---apienforcement)
- [LLM Routing](#llm-routing---apillm-routing)
- [Patterns (Learned)](#patterns-learned---apipatterns)
- [Insights (Learned)](#insights-learned---apiinsights)
- [Intents](#intents---apiintents)
- [Node Registry](#node-registry---apiregistry)
- [Event Bus](#event-bus---apievent-bus)
- [Projections (Generic)](#projections-generic---apiprojections)
- [Execution Graphs](#execution-graphs---apiexecutions)
- [Topic Catalog](#topic-catalog---apicatalog)
- [Health / Data Source Audit](#health--data-source-audit---apihealth)
- [Demo Playback](#demo-playback---apidemo)
- [Chat](#chat---apichat)
- [Test Routes (conditional)](#test-routes-conditional---apitestgolden-path)

---

## Intelligence — `/api/intelligence`

**Route file**: `server/intelligence-routes.ts`
**Mount**: `app.use('/api/intelligence', intelligenceRouter)`
**Consumer**: no dedicated data source file; consumed via direct `useQuery` calls

This is the largest route file (~100+ endpoints). It covers agent observability,
pattern discovery, routing metrics, and the system health check. Only key
endpoint groups are listed here; see the source file for the full list.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/intelligence/events/test/patterns` | Smoke-test: trigger pattern discovery via Kafka event adapter |
| GET | `/api/intelligence/db/test/count` | Smoke-test: count rows in a table via DB adapter |
| GET | `/api/intelligence/analysis/patterns` | Discover patterns via intelligence service (path, lang, timeout params) |
| GET | `/api/intelligence/patterns/summary` | Pattern summary stats (status, confidence, utilization) |
| GET | `/api/intelligence/agents/summary` | Agent routing summary (selections, confidence, top agents) |
| GET | `/api/intelligence/events/recent` | Recent agent events from Kafka consumer |
| GET | `/api/intelligence/routing/metrics` | Routing performance metrics |
| GET | `/api/intelligence/quality/summary` | Quality scoring summary |
| GET | `/api/intelligence/health` | System service health check (`checkAllServices()`) |
| GET | `/api/intelligence/alerts/active` | Active critical/warning alerts (mounted via `alertRouter`) |
| GET | `/api/intelligence/runtime/identity` | Runtime identity metadata |

---

## Savings / ROI — `/api/savings`

**Route file**: `server/savings-routes.ts`
**Mount**: `app.use('/api/savings', savingsRoutes)`
**Consumer**: no dedicated data source (consumed by effectiveness/cost dashboards)

Data is computed from the in-memory `AgentRunTracker` (not a database). The
`/runs` POST endpoint is the ingestion point.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/savings/metrics` | Aggregate savings metrics (totalSavings, efficiencyGain, etc.) with `?timeRange=30d` |
| GET | `/api/savings/agents` | Per-agent comparison table |
| GET | `/api/savings/timeseries` | Daily time-series savings data for the selected range |
| GET | `/api/savings/providers` | Savings grouped by LLM provider |
| GET | `/api/savings/breakdown` | Cost breakdown by category (tokens, compute, storage, network) |
| POST | `/api/savings/runs` | Record an agent run (used for data ingestion) |

---

## Agent Registry — `/api/agents`

**Route file**: `server/agent-registry-routes.ts`
**Mount**: `app.use('/api/agents', agentRegistryRoutes)`
**Consumer**: no dedicated data source file; consumed by the Node Registry page

Reads from the YAML agent registry file (`AGENT_DEFINITIONS_PATH` env var).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/agents` | List all agents with optional `?category=`, `?search=`, `?status=`, `?priority=` filters |
| GET | `/api/agents/agents/:agentId` | Single agent detail by ID |
| GET | `/api/agents/categories` | List agent categories with counts |
| GET | `/api/agents/capabilities` | Unique capabilities across all agents, with optional `?category=` filter |

---

## Validation — `/api/validation`

**Route file**: `server/validation-routes.ts`
**Mount**: `app.use('/api/validation', validationRoutes)`
**Consumer**: `client/src/lib/data-sources/validation-source.ts`

Backed by `validation_runs`, `validation_violations`, and
`validation_candidates` tables in `omnidash_analytics`. Kafka events are
ingested via exported handler functions (`handleValidationRunStarted`, etc.).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/validation/runs` | Paginated list of runs; `?status=`, `?repo=`, `?limit=`, `?offset=` |
| GET | `/api/validation/runs/:runId` | Single run with violations; `?vlimit=` for violation count cap |
| GET | `/api/validation/repos/:repoId/trends` | Violation trend for a specific repo; `?days=30` |
| GET | `/api/validation/summary` | Aggregate counts across all runs |
| GET | `/api/validation/lifecycle/summary` | Lifecycle candidate tier metrics; `?limit=`, `?tier=`, `?status=` |

---

## Extraction Pipeline — `/api/extraction`

**Route file**: `server/extraction-routes.ts`
**Mount**: `app.use('/api/extraction', extractionRoutes)`
**Consumer**: `client/src/lib/data-sources/extraction-source.ts`

All data access goes through the `ExtractionMetricsProjection` view (OMN-2325
projection-only read path). Returns empty-but-valid responses when the
projection is not bootstrapped.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/extraction/summary` | High-level stats for metric cards (total_injections, success_rate, etc.) |
| GET | `/api/extraction/health/pipeline` | Pipeline health grouped by cohort |
| GET | `/api/extraction/latency/heatmap` | Latency percentiles by time bucket; `?window=24h` |
| GET | `/api/extraction/patterns/volume` | Pattern match / injection counts over time; `?window=24h` |
| GET | `/api/extraction/errors/summary` | Error rates by cohort with recent error samples |

---

## Injection Effectiveness — `/api/effectiveness`

**Route file**: `server/effectiveness-routes.ts`
**Mount**: `app.use('/api/effectiveness', effectivenessRoutes)`
**Consumer**: `client/src/lib/data-sources/effectiveness-source.ts`

All data access goes through the `EffectivenessMetricsProjection` view.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/effectiveness/summary` | Executive summary: injection_rate, median_utilization, session counts |
| GET | `/api/effectiveness/throttle` | Auto-throttle status (active, reason, latency deltas) |
| GET | `/api/effectiveness/latency` | Latency breakdowns and trend |
| GET | `/api/effectiveness/utilization` | Utilization analytics: histogram, by_method, pattern_rates |
| GET | `/api/effectiveness/ab` | A/B comparison cohorts |
| GET | `/api/effectiveness/trend` | Multi-metric trend time series |

---

## Cost Trends — `/api/costs`

**Route file**: `server/cost-routes.ts`
**Mount**: `app.use('/api/costs', costRoutes)`
**Consumer**: `client/src/lib/data-sources/cost-source.ts`

All data access goes through the `CostMetricsProjection` view. Three
distribution endpoints (`by-model`, `by-repo`, `by-pattern`) always use a
fixed 30-day window regardless of the `?window=` parameter; they respond with
`X-Window-Ignored: true` when a window param is sent. Degraded responses
include `X-Degraded: true` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/costs/summary` | Aggregate cost summary; `?window=7d` (24h, 7d, 30d) |
| GET | `/api/costs/trend` | Daily cost trend time series; `?window=7d` |
| GET | `/api/costs/by-model` | Cost breakdown by LLM model (always 30d window) |
| GET | `/api/costs/by-repo` | Cost breakdown by repository (always 30d window) |
| GET | `/api/costs/by-pattern` | Cost breakdown by pattern (always 30d window) |
| GET | `/api/costs/token-usage` | Token usage trend; `?window=7d` |
| GET | `/api/costs/alerts` | Budget alerts (stub — returns `[]` until OMN-2240) |

---

## Baselines — `/api/baselines`

**Route file**: `server/baselines-routes.ts`
**Mount**: `app.use('/api/baselines', baselinesRoutes)`
**Consumer**: `client/src/lib/data-sources/baselines-source.ts`

Backed by the `BaselinesProjection` view, which reads from `baselines_snapshots`
in `omnidash_analytics` (projected from Kafka events).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/baselines/summary` | Latest baselines summary (ROI, cost per call, etc.) |
| GET | `/api/baselines/comparisons` | Comparison table across baseline entries |
| GET | `/api/baselines/trend` | Historical trend; `?days=14` (clamped 1–90) |
| GET | `/api/baselines/breakdown` | Recommendation breakdown by category |

---

## Context Enrichment — `/api/enrichment`

**Route file**: `server/enrichment-routes.ts`
**Mount**: `app.use('/api/enrichment', enrichmentRoutes)`
**Consumer**: `client/src/lib/data-sources/enrichment-source.ts`

**Status: stub** — all endpoints return empty-but-valid responses. Pending
OMN-2280 wiring to the enrichment projection. Accepts `?window=` (24h, 7d,
30d); returns 400 for invalid values.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/enrichment/summary` | Aggregate enrichment metrics (hit_rate, tokens saved, etc.) |
| GET | `/api/enrichment/by-channel` | Hit rate broken down by enrichment channel |
| GET | `/api/enrichment/latency-distribution` | Latency percentiles per model |
| GET | `/api/enrichment/token-savings` | Token savings trend over time |
| GET | `/api/enrichment/similarity-quality` | Similarity search quality trend |
| GET | `/api/enrichment/inflation-alerts` | Recent context inflation alerts |

---

## Pattern Enforcement — `/api/enforcement`

**Route file**: `server/enforcement-routes.ts`
**Mount**: `app.use('/api/enforcement', enforcementRoutes)`
**Consumer**: `client/src/lib/data-sources/enforcement-source.ts`

**Status: stub** — all endpoints return empty-but-valid responses. Pending
OMN-2275 wiring to the enforcement projection. Accepts `?window=` (24h, 7d,
30d); returns 400 for invalid values.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/enforcement/summary` | Aggregate enforcement metrics (hit_rate, correction_rate, etc.) |
| GET | `/api/enforcement/by-language` | Enforcement breakdown by programming language |
| GET | `/api/enforcement/by-domain` | Enforcement breakdown by domain |
| GET | `/api/enforcement/violated-patterns` | Top violated patterns table |
| GET | `/api/enforcement/trend` | Time-series trend data |

---

## LLM Routing — `/api/llm-routing`

**Route file**: `server/llm-routing-routes.ts`
**Mount**: `app.use('/api/llm-routing', llmRoutingRoutes)`
**Consumer**: `client/src/lib/data-sources/llm-routing-source.ts`

**Status: stub** — all endpoints return empty-but-valid responses. Pending
OMN-2279 wiring to the llm-routing projection. Accepts `?window=` (24h, 7d,
30d); returns 400 for invalid values.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/llm-routing/summary` | Aggregate routing summary (agreement_rate, fallback_rate, latencies) |
| GET | `/api/llm-routing/latency` | Latency distribution per routing method |
| GET | `/api/llm-routing/by-version` | Agreement rate comparison by prompt version |
| GET | `/api/llm-routing/disagreements` | Top LLM-vs-fuzzy disagreement pairs |
| GET | `/api/llm-routing/trend` | Multi-metric routing trend over time |

---

## Patterns (Learned) — `/api/patterns`

**Route file**: `server/patterns-routes.ts`
**Mount**: `app.use('/api/patterns', patternsRoutes)`
**Consumer**: `client/src/lib/data-sources/pattern-learning-source.ts`

Backed by the `agent_manifest_injections` and `patternLearningArtifacts` tables
via `queryPatterns()`. Returns empty response (with `_demo: true` flag) when
the database is not configured.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patterns` | Paginated list of learned patterns; `?status=`, `?min_confidence=`, `?limit=`, `?offset=` |

---

## Insights (Learned) — `/api/insights`

**Route file**: `server/insights-routes.ts`
**Mount**: `app.use('/api/insights', insightsRoutes)`
**Consumer**: `client/src/lib/data-sources/insights-source.ts`

Backed by the `learned_patterns` table via `queryInsightsSummary()` and
`queryInsightsTrend()`. Returns empty response when database is not configured.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/insights/summary` | Insight summary with confidence scores, type breakdown |
| GET | `/api/insights/trend` | Insight discovery trend; `?days=14` (clamped 1–90) |

---

## Intents — `/api/intents`

**Route file**: `server/intent-routes.ts`
**Mount**: `app.use('/api/intents', intentRoutes)`
**Consumer**: no dedicated data source file; consumed directly by the Intent Dashboard

Data is stored in an in-memory circular buffer (max 1000 records, configurable
via `MAX_STORED_INTENTS` env var). All endpoints enforce per-IP rate limiting
(default: 100 req/min per IP, configurable via env vars).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/intents` | Store a new intent record in the circular buffer |
| GET | `/api/intents/recent` | Most recent intents; `?limit=50` (max 500) |
| GET | `/api/intents/distribution` | Category counts for a time range; `?time_range_hours=24` |
| GET | `/api/intents/session/:sessionId` | Intents for a specific session; `?limit=`, `?min_confidence=` |

---

## Node Registry — `/api/registry`

**Route file**: `server/registry-routes.ts`
**Mount**: `app.use('/api/registry', registryRoutes)`
**Consumer**: `client/src/lib/data-sources/node-registry-projection-source.ts`

Backed by the `NodeRegistryProjection` view. When `DEMO_MODE=true` and the
projection has no nodes, falls back to `MockDataStore` from
`server/registry-mock-data.ts`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/registry/discovery` | Full dashboard payload with nodes and summary stats; supports `?state=`, `?type=`, `?capability=`, `?namespace=`, `?search=`, `?limit=`, `?offset=` |
| GET | `/api/registry/nodes` | Paginated node list with same filter params |
| GET | `/api/registry/nodes/:id` | Single node detail |
| GET | `/api/registry/widgets/mapping` | Capability-to-widget mapping for contract-driven UI |
| GET | `/api/registry/health` | Service health check for the registry projection |

---

## Event Bus — `/api/event-bus`

**Route file**: `server/event-bus-routes.ts`
**Mount**: `app.use('/api/event-bus', eventBusRoutes)`
**Consumer**: `client/src/lib/data-sources/event-bus-projection-source.ts`
  (snapshot endpoint), plus direct usage in Event Bus Monitor page

Backed by `EventBusDataSource` which queries `event_bus_events` table.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/event-bus/events` | Query events with filters; `?event_types=`, `?tenant_id=`, `?namespace=`, `?correlation_id=`, `?source=`, `?start_time=`, `?end_time=`, `?limit=100` (max 1000), `?offset=`, `?order_by=`, `?order_direction=` |
| GET | `/api/event-bus/statistics` | Event statistics for a time range; `?start=`, `?end=` |
| GET | `/api/event-bus/status` | Data source active/connected status |

---

## Projections (Generic) — `/api/projections`

**Route file**: `server/projection-routes.ts`
**Mount**: `app.use('/api/projections', createProjectionRoutes(projectionService))`
**Consumer**: `client/src/lib/data-sources/event-bus-projection-source.ts`,
  `node-registry-projection-source.ts`, and projection-backed hooks

Generic projection snapshot/events API. Every registered `ProjectionView`
automatically gets these endpoints.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projections` | List registered projection view IDs |
| GET | `/api/projections/:viewId/snapshot` | Latest snapshot for a view; `?limit=100` (max 5000) |
| GET | `/api/projections/:viewId/events` | Incremental events since a cursor; `?cursor=0`, `?limit=50` (max 500) |

**Registered view IDs** (as of current codebase):
- `event-bus` — Event bus event projections
- `node-registry` — ONEX node registry state
- `extraction-metrics` — Pattern extraction pipeline metrics
- `effectiveness-metrics` — Injection effectiveness metrics
- `cost-metrics` — LLM cost and token usage
- `baselines` — Baselines ROI snapshots
- `intent` — Intent classification records
- `validation` — Validation run state

---

## Execution Graphs — `/api/executions`

**Route file**: `server/execution-routes.ts`
**Mount**: `app.use('/api/executions', executionRoutes)`
**Consumer**: consumed directly by the Execution Graph page hooks

Queries `event_bus_events` grouped by `correlation_id` to reconstruct recent
execution graphs. Returns `{ executions: [] }` when DB is not configured.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/executions/recent` | 10 most recent execution graphs (events grouped by correlation_id) |

---

## Topic Catalog — `/api/catalog`

**Route file**: `server/topic-catalog-routes.ts`
**Mount**: `app.use('/api/catalog', topicCatalogRoutes)`
**Consumer**: consumed by the Event Bus Monitor page

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/catalog/status` | Active subscription topics, warnings, source (`catalog`\|`fallback`), instance UUID |

---

## Health / Data Source Audit — `/api/health`

**Route file**: `server/health-data-sources-routes.ts`
**Mount**: `app.use('/api/health', healthDataSourcesRoutes)`
**Consumer**: consumed by the pre-demo readiness check UI

Probes each backing projection/API to determine live vs mock status across all
dashboards.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health/data-sources` | Status of all data sources (`live`\|`mock`\|`error`), summary counts, timestamp |

---

## Demo Playback — `/api/demo`

**Route file**: `server/playback-routes.ts`
**Mount**: `app.use('/api/demo', playbackRoutes)`
**Consumer**: consumed by the Demo Playback control panel

Broadcasts playback lifecycle events to WebSocket clients via
`playbackEventEmitter`. State changes (`playback:start`, `playback:pause`,
`playback:progress`, etc.) are emitted to all connected WS clients.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/demo/status` | Current playback status |
| POST | `/api/demo/start` | Start playback from a recording file |
| POST | `/api/demo/pause` | Pause active playback |
| POST | `/api/demo/resume` | Resume paused playback |
| POST | `/api/demo/stop` | Stop playback |
| POST | `/api/demo/speed` | Set playback speed multiplier |

---

## Chat — `/api/chat`

**Route file**: `server/chat-routes.ts`
**Mount**: `app.use('/api/chat', chatRouter)`
**Consumer**: consumed by the AI assistant chat panel

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Submit a message to the AI assistant; returns streamed response |

---

## Test Routes (conditional) — `/api/test/golden-path`

**Route file**: `server/golden-path-routes.ts`
**Mount**: `app.use('/api/test/golden-path', goldenPathRoutes)` (conditional)

Only mounted when `ENABLE_TEST_ROUTES=true` AND (`NODE_ENV=test` OR
`OMNIDASH_TEST_MODE=true`). Used for automated golden-path testing (OMN-2079).
Not available in production.

---

## Response Headers Reference

| Header | Route(s) | Meaning |
|--------|----------|---------|
| `X-Degraded: true` | `/api/costs/*` | Projection query failed; response contains zeroed/empty data |
| `X-Degraded-Window` | `/api/costs/*` | The window that failed to load |
| `X-Window-Ignored: true` | `/api/costs/by-model`, `/by-repo`, `/by-pattern` | The `?window=` param was received but ignored (always uses 30d) |
| `X-RateLimit-Limit` | `/api/intents/*` | Max requests per window |
| `X-RateLimit-Remaining` | `/api/intents/*` | Requests remaining in current window |
| `X-RateLimit-Reset` | `/api/intents/*` | Seconds until rate limit resets |

---

## Data Source — Endpoint Mapping

Quick reference: which client data source file maps to which API prefix.

| Data source file | API prefix |
|------------------|-----------|
| `enrichment-source.ts` | `/api/enrichment` |
| `enforcement-source.ts` | `/api/enforcement` |
| `llm-routing-source.ts` | `/api/llm-routing` |
| `cost-source.ts` | `/api/costs` |
| `baselines-source.ts` | `/api/baselines` |
| `effectiveness-source.ts` | `/api/effectiveness` |
| `extraction-source.ts` | `/api/extraction` |
| `pattern-learning-source.ts` | `/api/patterns` |
| `insights-source.ts` | `/api/insights` |
| `validation-source.ts` | `/api/validation` |
| `node-registry-projection-source.ts` | `/api/projections/node-registry/snapshot` |
| `event-bus-projection-source.ts` | `/api/projections/event-bus/snapshot` |
