# Contract Builder Session - December 26, 2025

## Summary

Today we completed the backend REST API for the Contract Registry and added comprehensive Playwright E2E testing. The frontend UI components already exist and are functional with mock data.

## What We Accomplished

### 1. Contract Registry REST API (NEW)

Created `server/contract-registry-routes.ts` with complete CRUD and lifecycle endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/contracts` | GET | List all contracts (with ?type= and ?status= filters) |
| `/api/contracts/:id` | GET | Get single contract by ID |
| `/api/contracts` | POST | Create new draft contract |
| `/api/contracts/:id` | PUT | Update existing draft |
| `/api/contracts/:id/validate` | POST | Validate a draft → validated |
| `/api/contracts/:id/publish` | POST | Publish validated → published |
| `/api/contracts/:id/deprecate` | POST | Deprecate published → deprecated |
| `/api/contracts/:id/archive` | POST | Archive deprecated → archived |
| `/api/contracts/types` | GET | Get list of contract types |

**Key fixes made:**
- Fixed ESM `__dirname` issue using `import { fileURLToPath } from 'url'`
- Fixed persistence bug where `getAllContracts()` wasn't filtering static contracts that had dynamic versions (state changes now properly persist)

### 2. Frontend Data Source Updates

Updated `client/src/lib/data-sources/contract-registry-source.ts` with async API methods:
- `validateContract(id)` → `ValidationResult`
- `publishContract(id)` → `LifecycleResult`
- `deprecateContract(id)` → `LifecycleResult`
- `archiveContract(id)` → `LifecycleResult`
- `createContract(contract)` → `ContractRegistryResponse<Contract>`
- `updateContract(id, updates)` → `ContractRegistryResponse<Contract>`

These methods call the real API when `VITE_USE_MOCK_DATA=false`.

### 3. Playwright E2E Testing (NEW)

Created `e2e/contract-builder.spec.ts` with 10 tests:

**API Tests (7 tests):**
- List all contracts
- Get contract types
- Filter contracts by type
- Get single contract by ID
- Return 404 for non-existent contract
- Full lifecycle test (validate → publish → deprecate → archive)
- Reject publishing without validation

**Browser UI Tests (3 tests):**
- Load contracts page
- Display page content
- Have navigation elements

**Configuration:**
- Updated `playwright.config.ts` with Firefox project (Chromium had WSL dependency issues)
- Added `e2e/screenshots/` to `.gitignore`

### 4. Environment Configuration

Set `VITE_USE_MOCK_DATA=false` in `.env` to enable real API calls.

### 5. Commit

All changes committed:
```
f0671f2 feat(contract-registry): add REST API and Playwright E2E tests
```

Branch is ahead of origin by 1 commit (not pushed yet).

---

## Current State of the Codebase

### UI Components (Already Exist)

The Contract Builder has a full set of UI components in `client/src/components/contract-builder/`:

| Component | Purpose |
|-----------|---------|
| `ContractList.tsx` | DataTable with filtering, sorting, action menu |
| `ContractEditor.tsx` | Form-based editor using react-jsonschema-form |
| `ContractViewer.tsx` | Read-only contract display |
| `ContractPublish.tsx` | Publishing workflow UI |
| `ContractHistory.tsx` | Version history display |
| `ContractDiff.tsx` | Side-by-side version comparison |
| `ContractTypeSelector.tsx` | Type selection (Orchestrator/Effect/Reducer/Compute) |
| `ContractEmptyState.tsx` | Empty state when no contracts |
| `YamlEditorModal.tsx` | Raw YAML editing modal |
| `ContractStatusBadge.tsx` | Status indicator badges |
| `ContractTypeBadge.tsx` | Type indicator badges |

**Main Page:** `client/src/pages/preview/ContractBuilderV2.tsx`
- Routes between list/editor/viewer/publish/history/diff views
- Currently uses `contractRegistrySource.getContractsSync()` (sync mock method)

### API Layer

- **Backend:** `server/contract-registry-routes.ts` - Complete REST API
- **Frontend:** `client/src/lib/data-sources/contract-registry-source.ts` - Dual-mode (mock/API)
- **Static Data:** `server/contracts/` directory with sample YAML contracts

### Testing

- **E2E Tests:** `e2e/contract-builder.spec.ts` - 10 tests passing with Firefox
- **Manual Guide:** `diary/2025-12-26-contract-builder-testing-guide.md`

---

## What's Pending

### High Priority

1. **Push commit to remote**
   ```bash
   git push
   ```

2. **Wire UI to Async API**
   - Current: `ContractBuilderV2.tsx` uses `getContractsSync()` (mock data)
   - Needed: Use `fetchContracts()` with TanStack Query for real API calls
   - Also wire up lifecycle buttons (Validate, Publish, etc.) to call the new API methods

3. **PostgreSQL Persistence**
   - Current: In-memory storage (resets on server restart)
   - Needed: Drizzle schema + migrations for contracts table
   - Reference: Existing intelligence schema in `shared/intelligence-schema.ts`

### Medium Priority

4. **Audit Logging**
   - Add `auditLog: AuditEntry[]` to contracts
   - Track create/update/validate/publish/deprecate/archive actions
   - Include timestamps, user IDs, and action details

5. **Evidence Links**
   - Add ability to attach evidence (test results, reviews) before publishing
   - Add `evidenceLinks: { type, url, description }[]` to contract schema

### Lower Priority

6. **Additional E2E Tests**
   - Test contract creation flow in browser
   - Test contract editing flow
   - Test lifecycle transitions via UI buttons

7. **Error Handling UI**
   - Toast notifications for API errors
   - Loading states during API calls
   - Optimistic updates with rollback

---

## How to Pick Up Tomorrow

### Quick Start

1. **Start the server:**
   ```bash
   cd /mnt/c/Code/omnibase_ai/omnidash
   npm run dev
   ```

2. **Verify API is working:**
   ```bash
   curl http://localhost:3000/api/contracts | jq
   curl http://localhost:3000/api/contracts/types | jq
   ```

3. **Run E2E tests:**
   ```bash
   npx playwright test e2e/contract-builder.spec.ts --project=firefox
   ```

4. **Access the UI:**
   - http://localhost:3000/contracts

### Recommended Next Steps

**Option A: Wire UI to Real API (User-Facing Results)**

1. Open `client/src/pages/preview/ContractBuilderV2.tsx`
2. Replace `getContractsSync()` with TanStack Query using `fetchContracts()`
3. Add mutation hooks for lifecycle actions
4. Test in browser at http://localhost:3000/contracts

**Option B: Add PostgreSQL Persistence (Infrastructure)**

1. Create schema in `shared/contract-schema.ts`
2. Add migration to create contracts table
3. Update `server/contract-registry-routes.ts` to use Drizzle
4. Run `npm run db:push`

---

## Key Files Reference

```
server/
  contract-registry-routes.ts   # REST API (NEW)
  contracts/                    # Static YAML contracts

client/src/
  components/contract-builder/  # UI components (9 files)
  pages/preview/
    ContractBuilderV2.tsx       # Main page
  lib/data-sources/
    contract-registry-source.ts # Data source (updated)

e2e/
  contract-builder.spec.ts      # Playwright tests (NEW)

diary/
  2025-12-26-contract-builder-testing-guide.md  # Manual testing guide
  2025-12-26-contract-builder-session.md        # This file
```

---

## Notes

- Firefox is used for E2E tests because Chromium has missing dependencies in WSL
- The lifecycle tests are configured as serial to avoid parallel execution issues
- Static contracts are loaded from YAML files; dynamic changes are stored in memory
- When a contract's state changes (validate/publish/etc.), it moves from static to dynamic storage
