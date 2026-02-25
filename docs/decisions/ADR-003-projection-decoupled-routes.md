> **Navigation**: [Home](../INDEX.md) > [Decisions](README.md) > ADR-003

# ADR-003: Decouple Dashboard Routes from Shared Projection State

**Status**: Accepted
**Date**: 2026-02
**Deciders**: Omnidash Engineering Team
**Related**: OMN-2325, `docs/architecture/READ_MODEL_PROJECTION_ARCHITECTURE.md`

---

## Context

Omnidash projects Kafka events into `omnidash_analytics` via `server/read-model-consumer.ts`. Each topic maps to a projection method that writes rows into a dedicated table. Express routes then query those tables and serve results to dashboard components.

Early in the implementation, multiple dashboard domains (extraction, effectiveness, baselines) shared a single high-level projection scope in the read-model consumer. Routes for different dashboards imported from the same consumer instance and read the same cached aggregation structures. This was expedient during rapid prototyping but created two structural problems:

1. **Failure propagation.** A Kafka parse error or database error in one domain's projection could corrupt shared in-memory state that other domains read from. A malformed `agent-actions` event could cause the effectiveness dashboard to display stale or zeroed data even though its own projection was healthy.
2. **Schema coupling between domains.** When a new field was needed for the baselines dashboard, it required modifying shared structures that the extraction dashboard also touched. The logical separation between dashboard domains was not reflected in code structure, making independent evolution difficult.

The pattern also applied to API routes: some routes imported aggregation helpers from files in other dashboard domains, creating import-graph coupling that was not intentional and was invisible without tracing imports manually.

---

## Decision

Each major dashboard domain gets its own isolated projection scope. Concretely:

### 1. One projection method per topic, per domain

`read-model-consumer.ts` contains one dedicated `project*()` method for each Kafka topic. Each method handles its own database write, its own error boundary, and its own watermark update. No method shares mutable state with another.

```text
projectRoutingDecision()   -> agent_routing_decisions
projectAgentAction()       -> agent_actions
projectTransformationEvent() -> agent_transformation_events
projectEnforcementEvent()  -> pattern_enforcement_events
projectLlmCostEvent()      -> llm_cost_aggregates
projectBaselinesSnapshot() -> baselines_snapshots, baselines_comparisons, ...
projectEnrichmentEvent()   -> context_enrichment_events
projectLlmRoutingDecisionEvent() -> llm_routing_decisions
```

Each method is self-contained: it parses its event schema, validates the fields it needs, writes to its table(s), and returns. A panic or exception in `projectBaselinesSnapshot()` does not affect `projectEnforcementEvent()`.

### 2. Routes import only from their own domain

Express route files (e.g., `server/baselines-routes.ts`, `server/enforcement-routes.ts`) import types and helpers only from their own domain's schema file (`@shared/baselines-types`, `@shared/enforcement-types`) and from `server/storage.ts` for the database handle. Cross-domain imports between route files are not permitted.

### 3. Two separate consumer groups for two purposes

The read-model consumer (`omnidash-read-model-v1`) handles durable projection into PostgreSQL. The event consumer (`omnidash-consumers-v2`, in `server/event-consumer.ts`) handles in-memory aggregation for real-time WebSocket delivery. These are separate Kafka consumer group IDs with independent offset tracking. A restart of one does not affect the other.

### 4. Watermarks are per-projection-name

`projection_watermarks` tracks progress per `(projection_name, partition)` tuple, where `projection_name` is the Kafka topic name. This means the health of each projection stream is independently queryable. A lagging baselines projection does not mask a healthy routing-decisions projection.

---

## Consequences

### Positive

- **Failure isolation.** A projection failure in one domain (bad event schema, temporary DB timeout, missing column) is caught at the method boundary and logged. Other domains continue projecting independently. The `projection_watermarks` table makes the failure visible per-domain without requiring a full consumer restart.
- **Independent evolution.** Adding a new field to the baselines dashboard requires modifying only `projectBaselinesSnapshot()`, `@shared/baselines-types`, and `server/baselines-routes.ts`. The extraction domain is not involved. Schema migrations for one domain do not block other domains.
- **Readable ownership.** Given a bug report about the enrichment dashboard, a developer can immediately find the relevant code: `projectEnrichmentEvent()` in `read-model-consumer.ts`, `context_enrichment_events` in the schema, and `server/enrichment-routes.ts`. No cross-domain import tracing is needed.
- **WebSocket isolation.** The two-consumer-group design means real-time WebSocket delivery (`omnidash-consumers-v2`) is not affected by projection consumer lag or restarts (`omnidash-read-model-v1`).

### Neutral

- **Intentional duplication.** Each projection method repeats similar boilerplate: parse the envelope, extract fields, call `db.insert(...).onConflictDoNothing()`, call `updateWatermark()`. This duplication is intentional. Sharing a generic projection helper would couple all domains to a single abstraction that may not fit all schemas equally well. The duplication is bounded and localized.
- **More files.** Each new dashboard domain requires its own route file, its own shared type file, and its own section of `read-model-consumer.ts`. This is a small, linear cost per domain.

### Negative

- **No cross-domain aggregations at the consumer level.** If a future dashboard needs a metric that spans two projection domains (e.g., "routing decisions that led to enforcement events"), it cannot be computed inside a single projection method without reading from multiple tables. Such aggregations must be done at the query layer (SQL JOIN or materialized view), not the projection layer. This is the correct separation, but it is a constraint to be aware of.

---

## Alternatives Considered

### Alternative 1: Shared Projection State Object

**Pattern**: A single object holds aggregated state for all domains. All projection methods update it. Routes read from it.

**Rejected because**:
- Any method that updates the shared object can corrupt state for all domains.
- The object's type must accommodate all domain schemas simultaneously, creating a god-object that grows unboundedly.
- Race conditions between concurrent Kafka message processing are harder to reason about with shared mutable state.

### Alternative 2: Single Consumer Group for Both Real-Time and Durable Projection

**Pattern**: One KafkaJS consumer handles both in-memory aggregation (for WebSocket) and PostgreSQL writes.

**Rejected because**:
- A slow database write blocks real-time event delivery. The two concerns have different latency requirements: WebSocket events must arrive in <100ms; database writes are batch-tolerant.
- A consumer restart (e.g., to pick up a schema migration) drops in-flight WebSocket subscriptions for all connected clients.
- Separate consumer groups allow each to be restarted, rebalanced, or rewound independently.

### Alternative 3: One Consumer per Topic

**Pattern**: Each Kafka topic gets its own `KafkaJS.Consumer` instance.

**Rejected because**:
- Each `Consumer` maintains its own TCP connection and consumer group membership. Multiple consumers from the same process multiplies connection overhead unnecessarily.
- A single `Consumer` with multiple topic subscriptions, routing to isolated `project*()` methods, achieves the same isolation with a single connection.

---

## References

### Related Files

- `server/read-model-consumer.ts` — all `project*()` methods, two-group design, watermark logic
- `server/event-consumer.ts` — separate in-memory consumer (`omnidash-consumers-v2`)
- `shared/intelligence-schema.ts` — table definitions for all projected domains
- `docs/architecture/READ_MODEL_PROJECTION_ARCHITECTURE.md` — full projection lifecycle, topic-to-table mapping, watermark schema

### Tickets

- OMN-2325 — Projection decoupling refactor
- OMN-2061 — Original read-model consumer implementation

---

## Approval

**Implemented By**: Omnidash Engineering Team
**Date**: 2026-02
**Version**: 1.0

---

## Changelog

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02 | Initial ADR | Omnidash Team |

---

**Next Review**: 2026-08-01
