# Archived Legacy Dashboard Pages

**Archive Date**: January 2025
**Ticket**: OMN-1377
**Reason**: Migration to contract-driven dashboard architecture

## Overview

These pages represent the original Omnidash dashboard implementation that used mock data and hardcoded visualizations. They have been archived as part of the migration to a new contract-driven architecture that integrates with real-time Kafka events and the ONEX node system.

## Archived Pages

| Page | Original Route | Replacement | Notes |
|------|---------------|-------------|-------|
| `AgentOperations.tsx` | `/` | `NodeRegistry.tsx` | Replaced by ONEX node registry |
| `CodeIntelligence.tsx` | `/code` | - | Functionality moved to contract widgets |
| `DeveloperExperience.tsx` | `/developer` | - | Merged into other dashboards |
| `EventFlow.tsx` | `/events` | `EventBusMonitor.tsx` | Replaced by real Kafka integration |
| `EventBusExplorer.tsx` | `/events/explorer` | `EventBusMonitor.tsx` | Consolidated with EventFlow |
| `IntelligenceOperations.tsx` | `/intelligence` | - | Functionality moved to contract widgets |
| `KnowledgeGraph.tsx` | `/knowledge` | - | Pending redesign |
| `PatternLearning.tsx` | `/patterns` | - | Functionality moved to contract widgets |
| `PlatformHealth.tsx` | `/health` | - | Replaced by health widgets |

## Why These Were Archived

1. **Mock Data Dependency**: These pages used `client/src/lib/data-sources/` which generated fake data instead of connecting to real backend services.

2. **No Contract Integration**: The old architecture didn't support the contract-driven widget system that enables dynamic dashboard composition.

3. **No Real-Time Events**: The original implementation polled for data instead of using WebSocket/Kafka event streaming.

4. **Maintenance Burden**: Keeping both old and new systems running in parallel created confusion and increased maintenance overhead.

## New Architecture

The replacement pages use:

- **Contract-driven widgets**: Widgets defined by JSON contracts that specify data sources, refresh intervals, and visualizations
- **Real-time Kafka events**: Direct integration with the event bus (configured via environment variables; local development typically uses `192.168.86.200:29092`)
- **ONEX node system**: Integration with the 4-node architecture (Effect/Compute/Reducer/Orchestrator)
- **Type-safe data flow**: End-to-end TypeScript types from Kafka events to UI components

## Restoring Archived Pages

If you need to reference or restore any of these pages:

1. The pages are preserved with full git history via `git mv`
2. Associated data sources are in `client/src/lib/_archive/data-sources/`
3. Mock data generators are in `client/src/lib/_archive/mock-data/`

To temporarily use an archived page for reference:

```typescript
// Import from archive (not recommended for production)
import { ArchivedComponent } from '@/_archive/pages/ComponentName';
```

## Related Archives

- `client/src/lib/_archive/data-sources/` - Legacy data source implementations
- `client/src/lib/_archive/mock-data/` - Mock data generators

## Contact

For questions about this migration, see ticket OMN-1377 in Linear or contact the Omnidash team.
