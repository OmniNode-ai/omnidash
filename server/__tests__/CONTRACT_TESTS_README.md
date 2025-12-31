# Contract Registry Test Suite

Comprehensive test coverage for the Contract Registry system in OmniDash, covering database operations, API endpoints, lifecycle management, and data integrity.

## Test Files Overview

### 1. `contract-database-operations.test.ts` - Unit Tests (40 tests)

**Purpose**: Tests core database operations and business logic without HTTP layer.

**Coverage Areas**:

#### Content Hash Generation (4 tests)
- Deterministic SHA-256 hash generation
- Hash consistency for identical contracts
- Hash uniqueness for different content
- Selective field hashing (excludes database metadata)

#### Semantic Version Bumping (12 tests)
- Patch version increments (0.1.0 → 0.1.1)
- Minor version increments (1.0.0 → 1.1.0)
- Major version increments (1.0.0 → 2.0.0)
- Edge cases (single/double digit versions)
- Default behavior (patch by default)

#### Contract Snapshot Generation (2 tests)
- Snapshot creation excluding internal database IDs
- Preservation of all business logic fields

#### Contract Lifecycle Validation (10 tests)
- Valid lifecycle transitions:
  - draft → validated
  - validated → published
  - published → deprecated
  - deprecated → archived
- Invalid transitions (e.g., draft → published)
- Draft contract mutability rules
- Immutability of non-draft contracts

#### Contract Validation Rules (6 tests)
- Name validation (lowercase, alphanumeric, hyphens, min 3 chars)
- Version validation (semver format: X.Y.Z)
- Description validation (minimum 10 characters)

#### Audit Log Entry Creation (6 tests)
- Creation events
- Validation events
- Publishing events with evidence
- Deprecation events with reason
- Archiving events
- Update events with snapshots

#### Version ID Generation (2 tests)
- Unique ID generation from contract ID and version
- ID uniqueness across versions

**Run Command**:
```bash
npm test -- server/__tests__/contract-database-operations.test.ts --run
```

---

### 2. `contract-registry-routes.test.ts` - API Endpoint Tests (40 tests)

**Purpose**: Tests all REST API endpoints with proper mocking of database layer.

**Coverage Areas**:

#### GET /types (1 test)
- Returns all available contract types (orchestrator, effect, reducer, compute)

#### GET /schema/:type (2 tests)
- Returns JSON schema and UI schema for valid contract types
- Returns 400 for invalid contract types

#### GET / - List Contracts (4 tests)
- Lists all contracts without filters
- Filters by contract type
- Filters by status (draft, validated, published, etc.)
- Searches by contract name

#### GET /:id - Get Contract (2 tests)
- Returns specific contract by ID
- Returns 404 for non-existent contracts

#### POST / - Create Contract (4 tests)
- Creates new draft contract
- Creates new version from existing contract with version bump
- Returns 400 for missing required fields
- Returns 400 for invalid contract type
- Returns 404 when source contract not found

#### PUT /:id - Update Contract (3 tests)
- Updates draft contract successfully
- Returns 404 for non-existent contract
- Returns 400 when trying to update non-draft contract

#### POST /:id/validate - Validate Contract (3 tests)
- Validates contract and updates to validated status
- Returns validation errors for invalid contracts
- Returns 404 for non-existent contracts

#### POST /:id/publish - Publish Contract (3 tests)
- Publishes validated contract with evidence
- Returns 400 when trying to publish non-validated contract
- Returns 404 for non-existent contracts

#### POST /:id/deprecate - Deprecate Contract (2 tests)
- Deprecates published contract with reason
- Returns 400 when trying to deprecate non-published contract

#### POST /:id/archive - Archive Contract (2 tests)
- Archives deprecated contract
- Returns 400 when trying to archive non-deprecated contract

#### GET /:id/audit - Audit History (1 test)
- Returns complete audit history for a contract

#### GET /:id/audit/:auditId/snapshot - Snapshot Retrieval (2 tests)
- Returns snapshot for specific audit entry
- Returns 404 when snapshot not available

#### GET /:id/diff - Diff Computation (3 tests)
- Computes diff between two audit snapshots
- Returns 400 when query parameters missing
- Returns 400 when snapshots not available

#### GET /:id/export - Contract Export (2 tests)
- Exports contract as JSON bundle
- Returns 404 for non-existent contracts

#### Content Hash & Version Bumping (6 tests)
- Hash consistency for identical content
- Hash uniqueness for different content
- Patch, minor, and major version bumps

**Run Command**:
```bash
npm test -- server/__tests__/contract-registry-routes.test.ts --run
```

---

### 3. `contract-lifecycle-integration.test.ts` - Integration Tests (9 tests)

**Purpose**: Tests complete end-to-end workflows across multiple API calls.

**Coverage Areas**:

#### Complete Lifecycle Workflow (1 test)
Full journey from draft to archived:
1. Create draft contract
2. Validate contract
3. Publish contract with evidence
4. Deprecate contract with reason
5. Archive contract

#### Draft Iteration Workflow (1 test)
Multiple updates to draft before validation:
1. Create initial draft
2. Update schema
3. Update metadata
4. Validate after iterations

#### Version Evolution Workflow (1 test)
Creating and publishing new versions:
1. Start with published v1.0.0
2. Create v1.1.0 draft from v1.0.0
3. Validate and publish v1.1.0

#### Audit Trail Verification (1 test)
Comprehensive audit trail including:
- Creation event
- Multiple update events
- Validation event
- Publishing event with evidence
- Deprecation event with reason
- Snapshot preservation for key transitions

#### Error Handling and Validation (3 tests)
- Prevents skipping lifecycle stages (draft → published)
- Prevents archiving non-deprecated contracts
- Prevents updates to non-draft contracts

#### Snapshot and Diff Functionality (2 tests)
- Retrieves snapshots for specific audit entries
- Computes diffs between audit snapshots

**Run Command**:
```bash
npm test -- server/__tests__/contract-lifecycle-integration.test.ts --run
```

---

## Test Coverage Summary

### Total Tests: 89
- **Unit Tests**: 40
- **API Endpoint Tests**: 40
- **Integration Tests**: 9

### Database Operations Tested
- ✅ CRUD operations (Create, Read, Update)
- ✅ Lifecycle state transitions
- ✅ Audit log creation
- ✅ Content hash generation
- ✅ Version bumping logic
- ✅ Snapshot generation
- ✅ Diff computation

### API Endpoints Tested
- ✅ GET /types
- ✅ GET /schema/:type
- ✅ GET / (list with filters)
- ✅ GET /:id
- ✅ POST / (create)
- ✅ PUT /:id (update)
- ✅ POST /:id/validate
- ✅ POST /:id/publish
- ✅ POST /:id/deprecate
- ✅ POST /:id/archive
- ✅ GET /:id/audit
- ✅ GET /:id/audit/:auditId/snapshot
- ✅ GET /:id/diff
- ✅ GET /:id/export

### Lifecycle Stages Tested
- ✅ draft → validated
- ✅ validated → published
- ✅ published → deprecated
- ✅ deprecated → archived

### Validation Rules Tested
- ✅ Contract name format (lowercase, alphanumeric, hyphens)
- ✅ Contract name length (minimum 3 characters)
- ✅ Version format (semver: X.Y.Z)
- ✅ Description length (minimum 10 characters)
- ✅ Lifecycle transition rules
- ✅ Draft-only mutability

---

## Running All Contract Tests

Run all contract-related tests:
```bash
npm test -- server/__tests__/contract --run
```

Run with coverage:
```bash
npm test -- server/__tests__/contract --coverage
```

Run specific test file:
```bash
npm test -- server/__tests__/contract-registry-routes.test.ts --run
```

Run in watch mode (for development):
```bash
npm test -- server/__tests__/contract-registry-routes.test.ts
```

---

## Test Architecture

### Mocking Strategy

The tests use a **comprehensive database mocking** approach:

1. **Mock Database Factory**: Creates a properly chaining mock database instance
2. **Method Chaining**: All Drizzle ORM methods return the mock object for chaining
3. **State Isolation**: Each test gets a fresh mock instance via `beforeEach()`
4. **No Real Database**: Tests run entirely in-memory with no external dependencies

Example mock setup:
```typescript
const createMockDb = () => {
  const mockDb: any = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  };

  // Set up method chaining
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  // ... etc

  return mockDb;
};
```

### Test Data Patterns

Tests use **realistic contract data** that matches production schema:

```typescript
const mockContract: Contract = {
  id: 'contract-1',
  contractId: 'user-auth-orchestrator',
  name: 'user-auth-orchestrator',
  displayName: 'User Authentication Orchestrator',
  type: 'orchestrator',
  status: 'published',
  version: '1.0.0',
  description: 'Handles user authentication flows',
  schema: {
    inputs: ['username', 'password'],
    outputs: ['authToken', 'userId'],
  },
  metadata: { team: 'platform-security' },
  createdBy: 'john.doe',
  updatedBy: 'john.doe',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};
```

---

## Test Patterns and Conventions

### 1. Database Operation Tests
- Test pure functions without HTTP layer
- Focus on business logic correctness
- Use inline helper functions that mirror implementation

### 2. API Endpoint Tests
- Use `supertest` for HTTP request simulation
- Mock database at the storage layer
- Test both success and error paths
- Verify HTTP status codes and response structure

### 3. Integration Tests
- Test complete workflows across multiple endpoints
- Verify state transitions across API calls
- Ensure audit trail consistency
- Test error handling and validation

### 4. Naming Conventions
- Describe tests from user/system perspective
- Use "should" statements for clarity
- Group related tests with `describe` blocks
- Test files end with `.test.ts`

---

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

- **Fast Execution**: All tests complete in < 20 seconds
- **No External Dependencies**: Fully mocked database
- **Deterministic**: No flaky tests or timing issues
- **Parallel Safe**: Tests don't share state

---

## Future Enhancements

Potential areas for test expansion:

1. **Performance Tests**: Test handling of large contract collections
2. **Concurrency Tests**: Test race conditions in lifecycle transitions
3. **Schema Validation Tests**: Test JSON schema validation for contract types
4. **Export Format Tests**: Test ZIP bundle generation
5. **Provenance Tests**: Test evidence chain validation
6. **Security Tests**: Test access control and authorization
7. **Database Integration Tests**: Real PostgreSQL tests (opt-in)

---

## Troubleshooting

### Tests Failing After Code Changes

1. **Check mock return values**: Ensure mocks return expected data shape
2. **Verify method chaining**: Check that all Drizzle methods are mocked
3. **Review error messages**: Tests provide detailed error output
4. **Run single test**: Isolate failing test with `it.only()`

### Mock Database Issues

If you see "Cannot read properties of undefined (reading 'from')":
- Ensure `createMockDb()` is called in `beforeEach()`
- Verify all Drizzle methods are included in mock
- Check that method chaining is properly set up

### Type Errors

The tests use `any` for mock database to avoid TypeScript conflicts with Drizzle types. This is intentional and safe within test context.

---

## Contributing

When adding new contract registry features:

1. **Add unit tests** for business logic
2. **Add API endpoint tests** for new routes
3. **Add integration tests** for workflows
4. **Update this README** with new test coverage
5. **Ensure all tests pass** before submitting PR

---

## Related Documentation

- [Contract Registry API Documentation](../contract-registry-routes.ts)
- [Database Schema](../../shared/intelligence-schema.ts)
- [Vitest Configuration](../../vitest.config.ts)
- [Project Test Guidelines](../../CLAUDE.md#testing)
