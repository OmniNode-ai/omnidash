# Agent Actions vs Tool-Executed Events

**Ticket**: OMN-4966
**Date**: 2026-03-13

## Overview

Omnidash consumes two distinct event types from omniclaude that relate to agent
activity. They operate at different granularity levels and serve different
dashboard purposes. This document clarifies the distinction to prevent confusion
when the `agent_actions` table shows a handful of rows while tool-executed events
number in the tens of thousands.

## Event Types

### `agent-actions` (high-level summaries)

- **Topic**: `onex.evt.omniclaude.agent-actions.v1`
- **Table**: `agent_actions` (projected by `read-model-consumer.ts`)
- **Granularity**: One row per discrete agent action (tool call, decision, error)
- **Row count**: Typically low hundreds to low thousands
- **Key fields**: `correlation_id`, `agent_name`, `action_type`, `action_name`,
  `action_details`, `duration_ms`

Each row represents a single named action taken by an agent during a session.
Examples: "file_read", "git_commit", "test_run". The `action_details` JSON
contains action-specific metadata.

### `tool-executed` (fine-grained telemetry)

- **Topic**: `onex.evt.omniclaude.tool-executed.v1`
- **Table**: Consumed by the in-memory `EventConsumer` for real-time WebSocket
  delivery; NOT projected to a dedicated DB table
- **Granularity**: One event per individual tool invocation (including retries,
  sub-tool calls, and internal framework operations)
- **Row count**: Typically 50K-100K+ events
- **Key fields**: Varies by tool type

Tool-executed events capture every low-level tool invocation including internal
framework machinery. A single "file_read" agent action may correspond to
multiple tool-executed events (permission check, path resolution, actual read,
cache update).

## Relationship

```
1 agent_action row  <-->  N tool-executed events  (typically 1:5 to 1:50)

Session
  |
  +-- agent_action: "file_read" (1 row)
  |     |
  |     +-- tool-executed: resolve_path
  |     +-- tool-executed: check_permissions
  |     +-- tool-executed: read_file
  |     +-- tool-executed: update_cache
  |
  +-- agent_action: "git_commit" (1 row)
        |
        +-- tool-executed: stage_files
        +-- tool-executed: run_hooks
        +-- tool-executed: create_commit
```

## Dashboard Consumption

| Page | Data Source | Why |
|------|-----------|-----|
| `/events` (Event Bus Monitor) | tool-executed (WebSocket) | Real-time stream of all activity |
| `/live-events` | tool-executed (WebSocket) | Investor demo, shows live action |
| Intelligence routes (`/api/intelligence/agents/summary`) | `agent_actions` table | Aggregated metrics per agent |
| Intelligence routes (`/api/intelligence/agents/:agent/actions`) | `agent_actions` table | Per-agent action history |
| Intelligence routes (`/api/intelligence/operations/timeline`) | `agent_actions` table | Operations per minute time-series |

## Why the Row Count Difference is Expected

The `agent_actions` table shows high-level summaries (e.g., 1 row for "run
tests"), while tool-executed events capture every sub-operation (spawn process,
read stdout, parse results, etc.). A 1:50 ratio between agent_actions and
tool-executed events is normal and expected.

## Future Consideration

The `agent_actions` name can be confusing because it sounds like it should
contain all actions. A future rename to `agent_action_summaries` would better
convey the summarized nature of this table. This is tracked as a non-blocking
naming improvement.
