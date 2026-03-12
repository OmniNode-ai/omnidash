# OMN-4818: agent_routing_decisions schema investigation

## Schema Location

**Migration file**: `migrations/0001_omnidash_analytics_read_model.sql` (line 17-46)

**Drizzle schema**: `shared/intelligence-schema.ts` (line 26-93)
`agentRoutingDecisions` table, `sessionId` column defined as:
```ts
sessionId: uuid('session_id'),
```

## Current Column Type

`session_id uuid` — nullable, no default.

PostgreSQL enforces that any value written to a `uuid` column must be a valid UUID string
(e.g. `"550e8400-e29b-41d4-a716-446655440000"`). Non-UUID text values like `"session-abc123"`
or empty string `""` cause a PostgreSQL cast failure at INSERT time.

## All INSERT Sites for session_id

### 1. `server/read-model-consumer.ts` — `projectRoutingDecision()` (line 877-933)

The primary INSERT site for `agent_routing_decisions`. Pulls `session_id` from raw Kafka
event payload and writes it directly as a string:

```ts
sessionId: (data.session_id as string) || (data.sessionId as string) || undefined,
```

**Problem**: The Kafka event `session_id` field contains application-level session identifiers
like `"session-abc123"` or `""` (empty string). These are not valid UUIDs. Writing them
directly to the `uuid` column causes PostgreSQL `invalid input syntax for type uuid` errors.

The `|| undefined` fallback means empty string becomes `undefined` (null in DB), which avoids
one failure path. But non-empty non-UUID strings (e.g. `"session-abc123"`) still fail.

## Findings Summary

| Finding | Detail |
|---------|--------|
| Schema file | `migrations/0001_omnidash_analytics_read_model.sql:20` |
| Drizzle schema | `shared/intelligence-schema.ts:31` — `uuid('session_id')` |
| Column type | `uuid` (nullable) |
| INSERT site | `server/read-model-consumer.ts:887` — `projectRoutingDecision()` |
| Root cause | Raw text session IDs inserted into uuid-typed column |
| Fix required | Migrate column to `text`, sanitize at INSERT boundary |

## Input for T2 (OMN-4820) and T3 (OMN-4821)

- **T3 migration target**: `migrations/0019_agent_routing_decisions_session_id_text.sql`
  — ALTER `agent_routing_decisions.session_id` from `uuid` to `text`
- **T3 Drizzle schema change**: `shared/intelligence-schema.ts:31`
  — change `uuid('session_id')` to `text('session_id')`
- **T2 test target**: The `projectRoutingDecision()` INSERT path in `read-model-consumer.ts`
  — write a test that passes `session_id: "session-abc123"` and asserts INSERT succeeds
- **T4 sanitization target**: `server/read-model-consumer.ts:887`
  — add helper to sanitize session_id before writing
