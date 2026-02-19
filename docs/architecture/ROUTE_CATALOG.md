# Route Catalog

Complete reference for all frontend routes in omnidash. Routes are defined in `client/src/App.tsx` using Wouter's `<Switch>` / `<Route>` pattern.

## Category Dashboards (Primary Navigation)

These are the four top-level dashboards shown in the default sidebar navigation.

| Route | Component | Data Source File(s) | Primary API Endpoint(s) |
|---|---|---|---|
| `/category/speed` | `SpeedCategory` | (composite) | `/api/intelligence/*`, `/api/extraction/*` |
| `/category/success` | `SuccessCategory` | (composite) | `/api/effectiveness/*`, `/api/baselines/*` |
| `/category/intelligence` | `IntelligenceCategory` | (composite) | `/api/patterns/*`, `/api/intents/*`, `/api/enforcement/*` |
| `/category/health` | `SystemHealthCategory` | (composite) | `/api/validation/*`, `/api/registry/*`, `/api/health/*` |

## Advanced: Monitoring

| Route | Component | Data Source File(s) | Primary API Endpoint(s) |
|---|---|---|---|
| `/` (default) | `EventBusMonitor` | `event-bus-projection-source.ts` | `/api/event-bus/*`, `/api/projections/event-bus` |
| `/events` | `EventBusMonitor` | `event-bus-projection-source.ts` | `/api/event-bus/*`, `/api/projections/event-bus` |
| `/live-events` | `LiveEventStream` | WebSocket (`/ws`) | WebSocket subscription |
| `/extraction` | `ExtractionDashboard` | `extraction-source.ts` | `/api/extraction/*` |
| `/effectiveness` | `EffectivenessSummary` | `effectiveness-source.ts` | `/api/effectiveness/*` |
| `/effectiveness/latency` | `EffectivenessLatency` | `effectiveness-source.ts` | `/api/effectiveness/latency` |
| `/effectiveness/utilization` | `EffectivenessUtilization` | `effectiveness-source.ts` | `/api/effectiveness/utilization` |
| `/effectiveness/ab` | `EffectivenessAB` | `effectiveness-source.ts` | `/api/effectiveness/ab` |
| `/cost-trends` | `CostTrendDashboard` | `cost-source.ts` | `/api/costs/*` |
| `/graph` | `ExecutionGraph` | WebSocket (`/ws`) | WebSocket subscription (`/api/executions/*`) |

## Advanced: Intelligence

| Route | Component | Data Source File(s) | Primary API Endpoint(s) |
|---|---|---|---|
| `/intents` | `IntentDashboard` | (WebSocket + API) | `/api/intents/*`, WebSocket |
| `/patterns` | `PatternLearning` | `pattern-learning-source.ts` | `/api/patterns/*` |
| `/enforcement` | `PatternEnforcement` | `enforcement-source.ts` | `/api/enforcement/*` |
| `/enrichment` | `ContextEnrichmentDashboard` | `enrichment-source.ts` | `/api/enrichment/*` |
| `/llm-routing` | `LlmRoutingDashboard` | `llm-routing-source.ts` | `/api/llm-routing/*` |

## Advanced: System

| Route | Component | Data Source File(s) | Primary API Endpoint(s) |
|---|---|---|---|
| `/registry` | `NodeRegistry` | `node-registry-projection-source.ts` | `/api/registry/*`, `/api/projections/registry` |
| `/discovery` | `RegistryDiscovery` | (inline) | `/api/registry/*` |
| `/validation` | `ValidationDashboard` | `validation-source.ts` | `/api/validation/*` |

## Advanced: Tools

| Route | Component | Data Source File(s) | Primary API Endpoint(s) |
|---|---|---|---|
| `/trace` | `CorrelationTrace` | (inline query) | `/api/intelligence/*` |
| `/insights` | `LearnedInsights` | `insights-source.ts` | `/api/insights/*` |
| `/baselines` | `BaselinesROI` | `baselines-source.ts` | `/api/baselines/*` |
| `/chat` | `Chat` | (inline) | `/api/chat/*` |

## Advanced: Preview / Showcase

| Route | Component | Data Source File(s) | Primary API Endpoint(s) |
|---|---|---|---|
| `/showcase` | `WidgetShowcase` | (static demo data) | None |
| `/demo` | `DashboardDemo` | (static demo data) | None |
| `/preview/analytics` | `EnhancedAnalytics` | (preview mock) | None |
| `/preview/health` | `SystemHealth` | (preview mock) | None |
| `/preview/settings` | `AdvancedSettings` | (preview mock) | None |
| `/preview/showcase` | `FeatureShowcase` | (preview mock) | None |
| `/preview/contracts` | `ContractBuilder` | (preview mock) | None |
| `/preview/tech-debt` | `TechDebtAnalysis` | (preview mock) | None |
| `/preview/pattern-lineage` | `PatternLineage` | (preview mock) | None |
| `/preview/composer` | `NodeNetworkComposer` | (preview mock) | None |
| `/preview/savings` | `IntelligenceSavings` | (preview mock) | None |
| `/preview/agent-registry` | `AgentRegistry` | (preview mock) | None |
| `/preview/agent-network` | `AgentNetwork` | (preview mock) | None |
| `/preview/intelligence-analytics` | `IntelligenceAnalytics` | (preview mock) | None |
| `/preview/platform-monitoring` | `PlatformMonitoring` | (preview mock) | None |
| `/preview/agent-management` | `AgentManagement` | (preview mock) | None |
| `/preview/code-intelligence-suite` | `CodeIntelligenceSuite` | (preview mock) | None |
| `/preview/architecture-networks` | `ArchitectureNetworks` | (preview mock) | None |
| `/preview/developer-tools` | `DeveloperTools` | (preview mock) | None |

## Archived (Legacy) Routes

These routes remain accessible but are not in the active sidebar navigation. They were archived as part of OMN-1377.

| Route | Component | Notes |
|---|---|---|
| `/intelligence` | `IntelligenceOperations` | Archived legacy page |
| `/code` | `CodeIntelligence` | Archived legacy page |
| `/events-legacy` | `EventFlow` | Archived legacy page (render function pattern required) |
| `/event-bus` | `EventBusExplorer` | Archived legacy page |
| `/knowledge` | `KnowledgeGraph` | Archived legacy page |
| `/health` | `PlatformHealth` | Archived legacy page |
| `/developer` | `DeveloperExperience` | Archived legacy page |

## Data Source File Inventory

All data source files live in `client/src/lib/data-sources/`. Each implements an API-first pattern with transparent mock fallback. See `docs/conventions/DATA_SOURCE_CONTRACTS.md` or `DEMO_MODE_ARCHITECTURE.md` for the pattern details.

| File | Dashboard(s) |
|---|---|
| `api-base.ts` | Shared utility (`buildApiUrl`) |
| `baselines-source.ts` | `/baselines` |
| `cost-source.ts` | `/cost-trends` |
| `effectiveness-source.ts` | `/effectiveness/*` |
| `enforcement-source.ts` | `/enforcement` |
| `enrichment-source.ts` | `/enrichment` |
| `event-bus-projection-source.ts` | `/`, `/events` |
| `extraction-source.ts` | `/extraction` |
| `insights-source.ts` | `/insights` |
| `llm-routing-source.ts` | `/llm-routing` |
| `node-registry-projection-source.ts` | `/registry` |
| `pattern-learning-source.ts` | `/patterns` |
| `validation-source.ts` | `/validation` |
| `index.ts` | Re-exports all sources |
