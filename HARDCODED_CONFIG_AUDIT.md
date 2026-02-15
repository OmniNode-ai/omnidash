# Hardcoded Configuration Audit Report

**Generated**: 2025-11-21
**Purpose**: Identify hardcoded configuration values that should be moved to environment variables
**Scope**: Complete codebase scan (client/, server/, scripts/, shared/)

---

## Executive Summary

**Total Files Scanned**: 50+ TypeScript/JavaScript files
**Files with Hardcoded Config**: 18 files
**Total Hardcoded Values Found**: 45+ configuration values
**Critical Issues**: 0 (passwords already fixed)
**High Priority**: 15 values (service endpoints, port numbers)
**Medium Priority**: 20 values (timeouts, limits, consumer groups)
**Low Priority**: 10 values (feature defaults, retry intervals)

---

## Detailed Findings

### 1. Database Configuration

#### 🟠 High Priority

**File**: `scripts/seed-events.ts:16`
```typescript
brokers: (process.env.KAFKA_BROKERS || '192.168.86.200:29092').split(','),
```
- **Issue**: Default fallback to production IP address
- **Recommended**: `KAFKA_BROKERS_DEFAULT=192.168.86.200:29092`
- **Priority**: High (differs between dev/prod)

**File**: `scripts/check-kafka-topics.ts:15`
```typescript
brokers: (process.env.KAFKA_BROKERS || '192.168.86.200:29092').split(','),
```
- **Issue**: Same hardcoded fallback
- **Recommended**: Use centralized default from env
- **Priority**: High

**File**: `server/event-consumer.ts:126`
```typescript
process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092'
```
- **Issue**: Fallback to localhost may cause confusion
- **Recommended**: `KAFKA_BROKERS_DEFAULT=localhost:9092` for dev
- **Priority**: High

**File**: `server/event-bus-data-source.ts:152`
```typescript
process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092'
```
- **Issue**: Duplicate hardcoded fallback
- **Recommended**: Same as above
- **Priority**: High

**File**: `server/service-health.ts:70`
```typescript
const brokers = (process.env.KAFKA_BROKERS || '192.168.86.200:29092').split(',');
```
- **Issue**: Health check has different default than other services
- **Recommended**: Centralize broker configuration
- **Priority**: High

---

### 2. Service Endpoints

#### 🟠 High Priority

**File**: `server/service-health.ts:129`
```typescript
const omniarchonUrl = process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:8053';
```
- **Issue**: Hardcoded intelligence service URL
- **Recommended**: `INTELLIGENCE_SERVICE_URL_DEFAULT=http://localhost:8053`
- **Priority**: High

**File**: `server/alert-routes.ts:44`
```typescript
const omniarchonUrl = process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:8053';
```
- **Issue**: Duplicate hardcoded URL (3 occurrences across files)
- **Recommended**: Same as above
- **Priority**: High

**File**: `server/intelligence-routes.ts:1062, 1871, 2021`
```typescript
const omniarchonUrl = process.env.INTELLIGENCE_SERVICE_URL || 'http://localhost:8053';
```
- **Issue**: Same URL hardcoded in 3 places
- **Recommended**: Extract to shared constant or env default
- **Priority**: High

**File**: `client/src/lib/data-sources/knowledge-graph-source.ts:38`
```typescript
import.meta.env.VITE_INTELLIGENCE_SERVICE_URL || 'http://localhost:8053'
```
- **Issue**: Client-side hardcoded URL
- **Recommended**: `VITE_INTELLIGENCE_SERVICE_URL_DEFAULT=http://localhost:8053`
- **Priority**: High

**File**: `client/src/lib/data-sources/code-intelligence-source.ts:81`
```typescript
'http://localhost:8053'
```
- **Issue**: No fallback to env var at all!
- **Recommended**: Add env var check, then fallback
- **Priority**: Critical

**File**: `client/src/lib/data-sources/platform-health-source.ts:63, 95`
```typescript
import.meta.env.VITE_INTELLIGENCE_SERVICE_URL || 'http://localhost:8053'
'http://localhost:3000/api/intelligence/platform/services'
```
- **Issue**: Mixed hardcoded URLs
- **Recommended**: Use env vars for both
- **Priority**: High

**File**: `client/src/pages/IntelligenceOperations.tsx:190, 198, 208`
```typescript
'http://localhost:3000/api/intelligence/health/manifest-injection'
'http://localhost:3000/api/intelligence/documents/top-accessed'
```
- **Issue**: API URLs hardcoded in React components
- **Recommended**: Use relative URLs or env var for API base
- **Priority**: High

---

### 3. Port Configuration

#### 🟠 High Priority

**File**: `client/src/lib/useWebSocket.ts:19`
```typescript
url: string = `ws://${window.location.hostname}:${window.location.port || 5000}/ws`
```
- **Issue**: Hardcoded fallback to port 5000 (app runs on 3000!)
- **Recommended**: `VITE_WS_PORT=3000` or use `window.location.port`
- **Priority**: Critical (incorrect default)

**File**: `playwright.config.ts:55, 100`
```typescript
baseURL: 'http://localhost:3000'
url: 'http://localhost:3000'
```
- **Issue**: Test URLs hardcoded
- **Recommended**: `TEST_BASE_URL=http://localhost:3000`
- **Priority**: Medium (tests only)

---

### 4. Kafka Configuration

#### 🟡 Medium Priority

**File**: `server/event-consumer.ts:134`
```typescript
groupId: 'omnidash-consumers-v2'
```
- **Issue**: Consumer group ID hardcoded
- **Recommended**: `KAFKA_CONSUMER_GROUP_ID=omnidash-consumers-v2`
- **Priority**: Medium (may need different values per environment)

**File**: `scripts/check-kafka-topics.ts:26`
```typescript
const CONSUMER_GROUP = 'omnidash-consumers-v2';
```
- **Issue**: Same consumer group hardcoded in script
- **Recommended**: Use same env var
- **Priority**: Medium

**File**: `server/event-bus-data-source.ts:160`
```typescript
groupId: 'omnidash-event-bus-datasource-v1'
```
- **Issue**: Different consumer group, also hardcoded
- **Recommended**: `KAFKA_EVENT_BUS_CONSUMER_GROUP_ID=omnidash-event-bus-datasource-v1`
- **Priority**: Medium

**File**: `server/intelligence-event-adapter.ts:51`
```typescript
groupId: `omnidash-intel-${randomUUID().slice(0, 8)}`
```
- **Issue**: Partially hardcoded prefix
- **Recommended**: `KAFKA_INTEL_CONSUMER_GROUP_PREFIX=omnidash-intel`
- **Priority**: Low (dynamic suffix is correct)

#### Client IDs

**Multiple Files**: Various Kafka client IDs
```typescript
clientId: 'omnidash-seed-script'           // scripts/seed-events.ts:17
clientId: 'omnidash-topic-checker'         // scripts/check-kafka-topics.ts:16
clientId: 'omnidash-event-consumer'        // server/event-consumer.ts:130
clientId: 'omnidash-health-check'          // server/service-health.ts:76
clientId: 'omnidash-intelligence-adapter'  // server/intelligence-event-adapter.ts:42
clientId: 'omnidash-mock-generator'        // server/test/mock-event-generator.ts:170
clientId: 'omnidash-event-bus-data-source' // server/event-bus-data-source.ts:156
```
- **Issue**: Kafka client IDs hardcoded in 7+ files
- **Recommended**:
  - `KAFKA_CLIENT_ID_PREFIX=omnidash` (shared prefix)
  - Individual suffixes can remain hardcoded or use descriptive names
- **Priority**: Low (client IDs rarely change)

#### Topic Names

**File**: `server/event-consumer.ts:230-233`
```typescript
topics: [
  'agent-routing-decisions',
  'agent-transformation-events',
  'router-performance-metrics',
  'agent-actions',
]
```
- **Issue**: Topic names hardcoded in consumer subscription
- **Recommended**: `KAFKA_TOPICS_TO_CONSUME=agent-routing-decisions,agent-transformation-events,...`
- **Priority**: Medium (topics may differ per environment)

**File**: `scripts/check-kafka-topics.ts:20-23`
```typescript
const TOPICS_TO_CHECK = [
  'agent-routing-decisions',
  'agent-transformation-events',
  'router-performance-metrics',
  'agent-actions',
];
```
- **Issue**: Same topics hardcoded in script
- **Recommended**: Use same env var
- **Priority**: Medium

**File**: `scripts/seed-events.ts:100, 110`
```typescript
topic: 'agent-routing-decisions'
topic: 'agent-actions'
```
- **Issue**: Topics hardcoded in test data generator
- **Recommended**: `KAFKA_TOPIC_ROUTING=agent-routing-decisions`, etc.
- **Priority**: Low (test data)

---

### 5. Application Settings & Timeouts

#### 🟡 Medium Priority

**File**: `server/event-consumer.ts:74-75`
```typescript
private readonly DATA_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
private readonly PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
```
- **Issue**: Data retention and pruning intervals hardcoded
- **Recommended**:
  - `EVENT_DATA_RETENTION_HOURS=24`
  - `EVENT_PRUNE_INTERVAL_HOURS=1`
- **Priority**: Medium (may want different values in prod)

**File**: `server/event-consumer.ts:92, 95, 98`
```typescript
private maxActions = 100;
private maxDecisions = 100;
private maxTransformations = 100;
```
- **Issue**: In-memory buffer sizes hardcoded
- **Recommended**:
  - `EVENT_MAX_ACTIONS=100`
  - `EVENT_MAX_DECISIONS=100`
  - `EVENT_MAX_TRANSFORMATIONS=100`
- **Priority**: Medium (memory usage implications)

**File**: `server/websocket.ts:49-50`
```typescript
const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_MISSED_PINGS = 2;
```
- **Issue**: WebSocket heartbeat configuration hardcoded
- **Recommended**:
  - `WS_HEARTBEAT_INTERVAL_MS=30000`
  - `WS_MAX_MISSED_PINGS=2`
- **Priority**: Low (standard values)

**File**: `client/src/lib/useWebSocket.ts:60-62`
```typescript
reconnectTimeoutRef.current = setTimeout(() => {
  connect();
}, 5000);
```
- **Issue**: Reconnection delay hardcoded
- **Recommended**: `VITE_WS_RECONNECT_DELAY_MS=5000`
- **Priority**: Low

**File**: `server/alert-routes.ts:21`
```typescript
const HEALTH_CHECK_CACHE_TTL_MS = 30000; // 30 seconds
```
- **Issue**: Health check cache TTL hardcoded
- **Recommended**: `HEALTH_CHECK_CACHE_TTL_SECONDS=30`
- **Priority**: Low

**File**: `server/service-health.ts:77-78`
```typescript
connectionTimeout: 3000,
requestTimeout: 3000,
```
- **Issue**: Kafka health check timeouts hardcoded
- **Recommended**:
  - `KAFKA_HEALTH_CHECK_TIMEOUT_MS=3000`
- **Priority**: Low

**File**: `vitest.config.ts:14-16`
```typescript
testTimeout: 10000,
hookTimeout: 10000,
teardownTimeout: 5000,
```
- **Issue**: Test timeouts hardcoded
- **Recommended**: Use vitest defaults or env vars
- **Priority**: Low (test configuration)

**File**: `playwright.config.ts:15, 20, 102`
```typescript
timeout: 30 * 1000
timeout: 5000
timeout: 120 * 1000
```
- **Issue**: Playwright test timeouts hardcoded
- **Recommended**: Keep as-is or use Playwright env vars
- **Priority**: Low (test configuration)

---

### 6. Feature Flags

#### 🟢 Low Priority (Already Using Env Vars)

The following are **already using environment variables** but have hardcoded default values:

**File**: `server/event-consumer.ts:219`
```typescript
if (process.env.ENABLE_EVENT_PRELOAD !== 'false')
```
- **Status**: ✅ Using env var correctly
- **Default**: true (preload enabled by default)
- **Priority**: Low (working as intended)

**File**: `server/index.ts:116, 139`
```typescript
process.env.ENABLE_MOCK_EVENTS !== 'false'
```
- **Status**: ✅ Using env var correctly
- **Default**: true (mock events enabled by default)
- **Priority**: Low (working as intended)

**File**: `server/index.ts:157`
```typescript
if (process.env.ENABLE_REAL_TIME_EVENTS === 'true')
```
- **Status**: ✅ Using env var correctly
- **Default**: false (real-time events opt-in)
- **Priority**: Low (working as intended)

---

## Recommended Environment Variables

### New Variables to Add to `.env`

```bash
# ============================================
# Kafka/Redpanda Configuration
# ============================================

# Broker fallback (when KAFKA_BROKERS not set)
KAFKA_BROKERS_DEFAULT=192.168.86.200:29092

# Consumer Groups
KAFKA_CONSUMER_GROUP_ID=omnidash-consumers-v2
KAFKA_EVENT_BUS_CONSUMER_GROUP_ID=omnidash-event-bus-datasource-v1
KAFKA_INTEL_CONSUMER_GROUP_PREFIX=omnidash-intel

# Client ID Prefix (individual suffixes remain in code)
KAFKA_CLIENT_ID_PREFIX=omnidash

# Topics to Consume (comma-separated)
KAFKA_TOPICS_TO_CONSUME=agent-routing-decisions,agent-transformation-events,router-performance-metrics,agent-actions

# Kafka Health Check Timeouts
KAFKA_HEALTH_CHECK_TIMEOUT_MS=3000

# ============================================
# Service Endpoints
# ============================================

# Intelligence Service (Omniarchon)
INTELLIGENCE_SERVICE_URL=http://localhost:8053
INTELLIGENCE_SERVICE_URL_DEFAULT=http://localhost:8053

# Client-side service URL (Vite)
VITE_INTELLIGENCE_SERVICE_URL=http://localhost:8053
VITE_INTELLIGENCE_SERVICE_URL_DEFAULT=http://localhost:8053

# ============================================
# WebSocket Configuration
# ============================================

# WebSocket port (must match server port)
VITE_WS_PORT=3000

# WebSocket reconnection delay (milliseconds)
VITE_WS_RECONNECT_DELAY_MS=5000

# WebSocket heartbeat settings
WS_HEARTBEAT_INTERVAL_MS=30000
WS_MAX_MISSED_PINGS=2

# ============================================
# Event Consumer Settings
# ============================================

# Data retention (hours)
EVENT_DATA_RETENTION_HOURS=24

# Prune interval (hours)
EVENT_PRUNE_INTERVAL_HOURS=1

# In-memory buffer sizes
EVENT_MAX_ACTIONS=100
EVENT_MAX_DECISIONS=100
EVENT_MAX_TRANSFORMATIONS=100

# ============================================
# Health Check Configuration
# ============================================

# Health check cache TTL (seconds)
HEALTH_CHECK_CACHE_TTL_SECONDS=30

# ============================================
# Testing Configuration
# ============================================

# Base URL for Playwright tests
TEST_BASE_URL=http://localhost:3000
```

---

## Priority-Based Action Plan

### 🔴 Critical (Fix Immediately)

1. **client/src/lib/useWebSocket.ts:19** - Wrong default port (5000 instead of 3000)
2. **client/src/lib/data-sources/code-intelligence-source.ts:81** - No env var check

### 🟠 High Priority (Fix This Sprint)

1. All Kafka broker fallback URLs (5 occurrences)
2. All intelligence service URLs (6 occurrences)
3. All hardcoded API URLs in React components (3 files)
4. Kafka topic names (2 files)
5. Consumer group IDs (3 files)

### 🟡 Medium Priority (Fix Next Sprint)

1. Data retention and pruning intervals
2. In-memory buffer sizes (maxActions, maxDecisions, maxTransformations)
3. Kafka client IDs (consider centralizing prefix)
4. WebSocket configuration (heartbeat, missed pings)

### 🟢 Low Priority (Consider for Future)

1. Test timeouts (vitest, playwright)
2. Health check cache TTL
3. Reconnection delays
4. Kafka health check timeouts

---

## Implementation Strategy

### Phase 1: Critical Fixes (Week 1)

1. Fix incorrect WebSocket port default
2. Add env var check to code-intelligence-source.ts
3. Update `.env.example` with all new variables

### Phase 2: High Priority (Week 1-2)

1. Centralize Kafka broker configuration
2. Centralize intelligence service URLs
3. Convert hardcoded API URLs to use relative paths or env vars
4. Make topics and consumer groups configurable

### Phase 3: Medium Priority (Week 2-3)

1. Make data retention and buffer sizes configurable
2. Centralize WebSocket configuration
3. Add environment-specific overrides for staging/prod

### Phase 4: Documentation (Week 3)

1. Update CLAUDE.md with new env vars
2. Add inline comments explaining env var usage
3. Create migration guide for existing deployments

---

## Notes

- **No Security Issues**: All password references already use environment variables
- **Documentation Files**: Excluded from scan (CLAUDE.md, README.md contain examples only)
- **Mock Data**: Mock data generators have some hardcoded values, but these are acceptable for testing
- **Test Files**: Test configuration files have hardcoded timeouts, which is standard practice

---

## Files Scanned

### Server Files (15 files)
- server/event-consumer.ts ✅
- server/event-bus-data-source.ts ✅
- server/websocket.ts ✅
- server/service-health.ts ✅
- server/alert-routes.ts ✅
- server/intelligence-routes.ts ✅
- server/intelligence-event-adapter.ts ✅
- server/index.ts ✅
- server/routes.ts ✅
- server/db-adapter.ts ✅
- server/storage.ts ✅
- server/test/mock-event-generator.ts ✅

### Client Files (6 files)
- client/src/lib/useWebSocket.ts ⚠️ (Wrong port)
- client/src/hooks/useWebSocket.ts ✅
- client/src/lib/data-sources/code-intelligence-source.ts ⚠️ (No env var)
- client/src/lib/data-sources/knowledge-graph-source.ts ✅
- client/src/lib/data-sources/platform-health-source.ts ✅
- client/src/pages/IntelligenceOperations.tsx ⚠️ (Hardcoded URLs)

### Scripts (3 files)
- scripts/seed-events.ts ✅
- scripts/check-kafka-topics.ts ✅
- scripts/verify-event-bus.ts ✅

### Configuration Files (3 files)
- vitest.config.ts ✅
- playwright.config.ts ✅
- drizzle.config.ts ✅ (Already uses env vars)

---

**End of Report**
