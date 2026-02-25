# Contract Audit Snapshots Implementation

## Overview

This document describes the implementation plan for adding **immutable contract snapshots** to the audit logging system. This enables deterministic replay of contract state at any point in its lifecycle and supports on-demand diff computation between versions.

## Established Codebase Patterns

This implementation follows patterns already established in the omnidash codebase:

| Pattern | Reference | How We'll Use It |
|---------|-----------|------------------|
| **JSONB Snapshots** | `fullManifestSnapshot` in `agent_manifest_injections` table | Store complete contract state in `snapshot` JSONB column |
| **Audit Logging** | `logAuditEntry()` in `contract-registry-routes.ts` | Extend existing function to accept snapshot parameter |
| **Diff Library** | `ContractDiff.tsx` uses `diff` package (Myers algorithm) | Reuse same approach for server-side diff endpoint |
| **Content Hash** | `generateContentHash()` in `contract-registry-routes.ts` | Already implemented, validates snapshot integrity |
| **Non-blocking Logging** | `logAuditEntry()` catches errors, doesn't throw | Maintain same pattern - audit failures don't break operations |
| **API Error Codes** | `intelligence-routes.ts` patterns | 400 (validation), 404 (not found), 503 (unavailable) |

## Background

### Original Specification Questions

1. **Storage** - Should audit history persist client-side only (localStorage/IndexedDB) for now, or server-side from the start?
2. **Granularity** - Field-level diffs ("changed version from 1.0.0 to 1.0.1") or summary-level ("contract updated" with before/after snapshots)?
3. **Evidence links** - Manual entry, auto-detection from git, or Linear API integration?
4. **Export format** - Single YAML with metadata, ZIP bundle, or other?
5. **MVP scope** - Which are must-haves vs nice-to-haves?

### Agreed Approach (Granularity)

> **Answer:** Version-level snapshots plus derived diffs. Not field-level event spam.
>
> **Rationale:**
> - Field-level audit is expensive, noisy, and rarely useful.
> - Contracts are immutable once published. Diffs are computed between versions anyway.
> - Snapshot-based audit is deterministic and replayable.
>
> **Recommended Model:**
> - Each audit entry references:
>   - action type (create_draft, validate, publish, deprecate, archive)
>   - actor
>   - timestamp
>   - from_version (nullable)
>   - to_version (nullable)
>   - content_hash
> - Diff is computed on demand between two version hashes.
>
> **MVP Requirement:**
> - Summary-level audit entries
> - Full before and after contract snapshots stored immutably
>
> **Nice-to-Have (Later):**
> - Optional semantic diff classification (breaking vs non-breaking)

---

## Current State

### What's Already Implemented

#### Schema (`contract_audit_log` table)

```typescript
export const contractAuditLog = pgTable('contract_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').notNull(),
  action: text('action').notNull(),        // 'created' | 'validated' | 'published' | etc.
  fromStatus: text('from_status'),          // Previous status (null for 'created')
  toStatus: text('to_status').notNull(),    // New status
  fromVersion: text('from_version'),        // Previous version
  toVersion: text('to_version'),            // New version
  actor: text('actor'),                     // User/system that performed the action
  reason: text('reason'),                   // Optional reason for the transition
  evidence: jsonb('evidence').default([]),  // Links to evidence (PRs, tickets, etc.)
  contentHash: text('content_hash'),        // Hash of contract content at time of action
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});
```

#### Audit Logging on Lifecycle Actions

All lifecycle transitions currently log audit entries:
- `created` - New draft contract
- `updated` - Draft modifications
- `validated` - Validation passed
- `published` - Contract published
- `deprecated` - Contract deprecated
- `archived` - Contract archived

#### API Endpoint

- `GET /api/contracts/:id/audit` - Retrieves audit history for a contract

### What's Missing

1. **Snapshot storage** - Only `contentHash` is stored, not the full contract state
2. **On-demand diff endpoint** - No API to compute diffs between versions

---

## Implementation Plan

### Phase 1: Schema Updates

Add a `snapshot` column to store the complete contract state at each transition.

#### Schema Change

Following the established pattern from `agent_manifest_injections.fullManifestSnapshot`:

```typescript
// In shared/intelligence-schema.ts
export const contractAuditLog = pgTable('contract_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').notNull(),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  fromVersion: text('from_version'),
  toVersion: text('to_version'),
  actor: text('actor'),
  reason: text('reason'),
  evidence: jsonb('evidence').default([]),
  contentHash: text('content_hash'),

  // NEW: Full contract snapshot at time of action (follows fullManifestSnapshot pattern)
  snapshot: jsonb('snapshot'),  // Nullable - complete contract state for replay/diff

  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Pattern Alignment:**
- Uses `jsonb('snapshot')` without `.notNull()` - nullable for backward compatibility
- Follows naming convention: lowercase, descriptive (like `fullManifestSnapshot`, `contextSnapshot`)
- Position in schema: after `contentHash`, before `metadata` (logical grouping)

#### Migration Considerations

- New column is nullable (existing audit entries won't have snapshots)
- No data migration needed - new entries will include snapshots going forward
- Consider backfilling snapshots for recent entries if needed

### Phase 2: Update Audit Logging

Modify `logAuditEntry()` to capture the full contract state.

#### Current Implementation (server/contract-registry-routes.ts:83-95)

```typescript
async function logAuditEntry(
  db: ReturnType<typeof getIntelligenceDb>,
  entry: InsertContractAuditLog
): Promise<void> {
  try {
    await db.insert(contractAuditLog).values(entry);
  } catch (error) {
    console.error('Failed to log audit entry:', error);
    // Don't throw - audit logging shouldn't break the main operation (KEEP THIS PATTERN)
  }
}
```

#### Updated Implementation

Following the non-blocking pattern already established:

```typescript
/**
 * Log audit entry for contract lifecycle changes
 * Pattern: Non-blocking - audit failures don't break main operations
 */
async function logAuditEntry(
  db: ReturnType<typeof getIntelligenceDb>,
  entry: InsertContractAuditLog,
  contractSnapshot?: Contract  // Optional snapshot of contract state at time of action
): Promise<void> {
  try {
    await db.insert(contractAuditLog).values({
      ...entry,
      snapshot: contractSnapshot ? contractToSnapshot(contractSnapshot) : null,
    });
  } catch (error) {
    console.error('Failed to log audit entry:', error);
    // Don't throw - audit logging shouldn't break the main operation
  }
}

/**
 * Convert contract to snapshot format (excludes internal fields)
 * Pattern: Same approach as contractToDisplayObject() in ContractDiff.tsx
 */
function contractToSnapshot(contract: Contract): Record<string, unknown> {
  return {
    contractId: contract.contractId,
    name: contract.name,
    displayName: contract.displayName,
    type: contract.type,
    status: contract.status,
    version: contract.version,
    description: contract.description,
    schema: contract.schema,
    metadata: contract.metadata,
    createdBy: contract.createdBy,
    updatedBy: contract.updatedBy,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}
```

#### Update All Lifecycle Endpoints

Each endpoint that logs audit entries needs to pass the contract snapshot:

```typescript
// Example: POST /api/contracts (create)
await logAuditEntry(db, {
  contractId: created.id,
  action: 'created',
  fromStatus: null,
  toStatus: 'draft',
  toVersion: created.version,
  contentHash: generateContentHash(created),
  actor: req.body.createdBy || 'system',
}, created);  // Pass full contract as snapshot

// Example: PATCH /api/contracts/:id/publish
await logAuditEntry(db, {
  contractId: id,
  action: 'published',
  fromStatus: 'validated',
  toStatus: 'published',
  fromVersion: contract.version,
  toVersion: published.version,
  actor: req.body.actor || 'system',
  reason: req.body.reason,
  evidence: req.body.evidence || [],
  contentHash: generateContentHash(published),
}, published);  // Pass published contract as snapshot
```

### Phase 3: Add Diff Endpoint

New API endpoint to compute diffs between two audit entries.

#### Endpoint Design

```
GET /api/contracts/:id/diff?from=<auditId>&to=<auditId>
```

#### Response Format

Following the pattern established in `ContractDiff.tsx`:

```typescript
interface DiffLine {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
  lineNumber: number | null;
}

interface ContractDiffResponse {
  from: {
    auditId: string;
    version: string;
    timestamp: string;
    action: string;
  };
  to: {
    auditId: string;
    version: string;
    timestamp: string;
    action: string;
  };
  diff: {
    lines: DiffLine[];
    additions: number;
    deletions: number;
  };
}
```

#### Implementation

Reuse the same `diff` library (Myers algorithm) already used in `ContractDiff.tsx`:

```typescript
import { diffLines, Change } from 'diff';  // Already in package.json

/**
 * GET /:id/diff - Compute diff between two audit entries
 * Pattern: Same diff approach as ContractDiff.tsx
 */
router.get('/:id/diff', async (req, res) => {
  try {
    const db = getDb();
    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { id } = req.params;
    const { from, to } = req.query;

    // Validate required parameters (pattern from intelligence-routes.ts)
    if (!from || !to) {
      return res.status(400).json({
        error: 'Missing required query parameters: from and to (audit entry IDs)'
      });
    }

    // Fetch both audit entries
    const [fromEntry, toEntry] = await Promise.all([
      db.select().from(contractAuditLog)
        .where(and(
          eq(contractAuditLog.id, from as string),
          eq(contractAuditLog.contractId, id)
        )),
      db.select().from(contractAuditLog)
        .where(and(
          eq(contractAuditLog.id, to as string),
          eq(contractAuditLog.contractId, id)
        )),
    ]);

    if (fromEntry.length === 0 || toEntry.length === 0) {
      return res.status(404).json({ error: 'One or both audit entries not found' });
    }

    // Check snapshots exist
    if (!fromEntry[0].snapshot || !toEntry[0].snapshot) {
      return res.status(400).json({
        error: 'Snapshots not available for one or both audit entries',
        details: {
          fromHasSnapshot: !!fromEntry[0].snapshot,
          toHasSnapshot: !!toEntry[0].snapshot,
        }
      });
    }

    // Compute diff using same approach as ContractDiff.tsx
    const diff = computeDiff(
      fromEntry[0].snapshot as Record<string, unknown>,
      toEntry[0].snapshot as Record<string, unknown>
    );

    res.json({
      from: {
        auditId: fromEntry[0].id,
        version: fromEntry[0].toVersion,
        timestamp: fromEntry[0].createdAt,
        action: fromEntry[0].action,
      },
      to: {
        auditId: toEntry[0].id,
        version: toEntry[0].toVersion,
        timestamp: toEntry[0].createdAt,
        action: toEntry[0].action,
      },
      diff,
    });
  } catch (error) {
    console.error('Error computing diff:', error);
    res.status(500).json({ error: 'Failed to compute diff' });
  }
});

/**
 * Compute diff between two snapshots
 * Pattern: Extracted from ContractDiff.tsx for server-side use
 */
function computeDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>
): { lines: DiffLine[]; additions: number; deletions: number } {
  const oldJson = JSON.stringify(oldObj, null, 2);
  const newJson = JSON.stringify(newObj, null, 2);

  const changes: Change[] = diffLines(oldJson, newJson);

  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let lineNumber = 1;

  for (const change of changes) {
    const changeLines = change.value.split('\n');
    if (changeLines[changeLines.length - 1] === '') {
      changeLines.pop();
    }

    for (const text of changeLines) {
      if (change.added) {
        lines.push({ text, type: 'added', lineNumber });
        additions++;
        lineNumber++;
      } else if (change.removed) {
        lines.push({ text, type: 'removed', lineNumber: null });
        deletions++;
      } else {
        lines.push({ text, type: 'unchanged', lineNumber });
        lineNumber++;
      }
    }
  }

  return { lines, additions, deletions };
}
```

#### Pattern Alignment

- **Error codes**: 400 (missing params), 404 (not found), 503 (db unavailable), 500 (server error)
- **Diff algorithm**: Myers algorithm via `diff` library (same as client-side)
- **Response format**: Matches `DiffLine` interface from `ContractDiff.tsx`
- **Promise.all**: Parallel queries for performance (common pattern in codebase)

### Phase 4: UI Integration (Optional)

Add diff visualization to the Contract History view.

#### Components

1. **Audit Timeline** - Already exists, shows lifecycle events
2. **Diff Viewer** - New component to show side-by-side or inline diff
3. **Snapshot Viewer** - View full contract state at any point in time

---

## File Changes Summary

| File | Change |
|------|--------|
| `shared/intelligence-schema.ts` | Add `snapshot` column to `contractAuditLog` |
| `server/contract-registry-routes.ts` | Update `logAuditEntry()` to accept snapshot; update all lifecycle endpoints |
| `server/contract-registry-routes.ts` | Add `GET /:id/diff` endpoint |

---

## API Reference

### Existing Endpoints (No Changes)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contracts/:id/audit` | Get audit history for a contract |

### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contracts/:id/diff` | Compute diff between two audit entries |
| GET | `/api/contracts/:id/audit/:auditId/snapshot` | Get full snapshot for a specific audit entry |

---

## Testing Plan

### Unit Tests

1. Verify snapshots are stored correctly on all lifecycle actions
2. Verify diff computation produces correct results
3. Verify content hash matches snapshot content

### Integration Tests

1. Create contract → verify snapshot in audit log
2. Update contract → verify before/after snapshots
3. Full lifecycle → verify complete audit trail with snapshots
4. Diff endpoint → verify accurate change detection

### Edge Cases

1. Missing snapshots (legacy entries)
2. Large contracts (performance)
3. Concurrent modifications
4. Null/undefined field handling in diffs

---

## Future Enhancements (Nice-to-Have)

1. **Semantic diff classification** - Breaking vs non-breaking changes
2. **Diff visualization** - UI component for viewing changes
3. **Export with history** - Include audit trail in contract bundles
4. **Snapshot compression** - Reduce storage for large contracts
5. **Incremental snapshots** - Store only deltas for space efficiency

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2024-12-27 | Version-level snapshots, not field-level events | Less noise, deterministic replay, computed diffs on demand |
| 2024-12-27 | Store full snapshot in JSONB column | Simple, queryable, no external storage needed |
| 2024-12-27 | Diff computed on demand | Avoid storing redundant data, flexible comparison |
| 2024-12-29 | Follow existing codebase patterns | Consistency, maintainability, leverage proven approaches |

---

## Pattern References

These are the key files to reference when implementing this feature:

| Pattern | File | Lines |
|---------|------|-------|
| JSONB snapshot storage | `shared/intelligence-schema.ts` | ~104 (`fullManifestSnapshot`) |
| Audit logging function | `server/contract-registry-routes.ts` | 83-95 (`logAuditEntry`) |
| Content hash generation | `server/contract-registry-routes.ts` | 68-81 (`generateContentHash`) |
| API error handling | `server/intelligence-routes.ts` | Various (400, 404, 503, 500 patterns) |
| Diff computation | `client/src/components/contract-builder/ContractDiff.tsx` | Full file (Myers algorithm) |
| Contract display format | `client/src/components/contract-builder/ContractDiff.tsx` | `contractToDisplayObject()` |
| Version comparison UI | `client/src/components/contract-builder/ContractHistory.tsx` | Full file |

---

## Checklist Before Implementation

- [ ] Review `fullManifestSnapshot` usage in `agent_manifest_injections` table
- [ ] Review existing `logAuditEntry()` function signature
- [ ] Verify `diff` package is in dependencies (`npm ls diff`)
- [ ] Review `ContractDiff.tsx` for UI integration patterns
- [ ] Run `npm run check` after schema changes
- [ ] Run `npm run db:push` to apply migrations (when DB credentials available)
