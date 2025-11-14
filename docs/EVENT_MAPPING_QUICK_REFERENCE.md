# Event Mapping Quick Reference

**Quick lookup for event → data source → component mapping**

---

## ✅ Currently Mapped (Events → Data Sources → Components)

| Event Type | Data Source | Component | Status |
|------------|-------------|-----------|--------|
| `omninode.intelligence.query.completed.v1` | `intelligence-analytics-source` | IntelligenceAnalytics | ✅ |
| `omninode.agent.execution.completed.v1` | `intelligence-analytics-source`, `agent-operations-source`, `agent-management-source` | IntelligenceAnalytics, AgentManagement | ✅ |
| `omninode.agent.routing.completed.v1` | `agent-management-source` | AgentManagement | ✅ |
| `omninode.intelligence.pattern.discovered.v1` | `code-intelligence-source`, `pattern-learning-source` | CodeIntelligenceSuite | ✅ |
| `omninode.intelligence.compliance.validated.v1` | `code-intelligence-source` | CodeIntelligenceSuite | ✅ |
| `omninode.service.health.changed.v1` | `platform-health-source` | SystemHealth, PlatformMonitoring | ✅ |
| `omninode.service.registered.v1` | `platform-health-source`, `agent-registry-source` | SystemHealth, AgentRegistry | ✅ |
| `omninode.node.service.registered.v1` | `agent-network-source`, `agent-registry-source` | AgentNetwork, AgentRegistry | ✅ |
| `onex.node.announce.v1` | `agent-network-source`, `agent-registry-source` | AgentNetwork, AgentRegistry | ✅ |

---

## ❌ Missing Data Sources (Events Exist, No Data Source)

| Event Domain | Missing Data Source | Priority | Component Needed |
|--------------|-------------------|----------|------------------|
| Database | `database-operations-source.ts` | HIGH | Database Operations Dashboard |
| Vault | `vault-operations-source.ts` | HIGH | Vault Audit Dashboard |
| Consul | `consul-operations-source.ts` | HIGH | Service Discovery Dashboard |
| Code Generation | `code-generation-source.ts` | HIGH | Code Generation Dashboard |
| Metadata | `metadata-operations-source.ts` | HIGH | Metadata Dashboard |
| Bridge/Workflow | `bridge-operations-source.ts` | HIGH | Workflow Dashboard |
| Logging | `logging-source.ts` | HIGH | Logs Dashboard |
| Intelligence Search | Enhanced `intelligence-analytics-source` | MEDIUM | Intelligence Analytics (enhance) |
| Agent Quality Gates | Enhanced `agent-management-source` | MEDIUM | Agent Management (enhance) |

---

## ❌ Missing Events (Data Source Exists, Events Not Consumed)

| Data Source | Missing Events | Impact |
|-------------|----------------|--------|
| `intelligence-analytics-source` | `omninode.intelligence.search.*`, `omninode.intelligence.freshness.checked.v1` | Missing search metrics, freshness tracking |
| `agent-management-source` | `omninode.agent.routing.failed.v1`, `omninode.agent.quality.gate.*` | Missing routing failures, quality gate metrics |
| `code-intelligence-source` | `omninode.code.validation.*`, `omninode.code.contract.generated.v1` | Missing validation results, contract tracking |
| `platform-health-source` | `omninode.database.connection.lost.v1`, `omninode.kafka.topic.activity.v1` | Missing connection alerts, Kafka activity |
| `pattern-learning-source` | `omninode.intelligence.pattern.discovery.requested.v1` | Missing discovery request tracking |

---

## 🎯 Implementation Checklist

### Phase 1: Event Bus Integration (CRITICAL)
- [ ] Create `EventBusDataSource` class in `server/event-bus-source.ts`
- [ ] Subscribe to Kafka/Redpanda topics
- [ ] Transform events → PostgreSQL schema
- [ ] WebSocket push to React frontend
- [ ] Update existing data sources to use EventBusDataSource

### Phase 2: Core Missing Data Sources (HIGH PRIORITY)
- [ ] `database-operations-source.ts` → Database Operations Dashboard
- [ ] `vault-operations-source.ts` → Vault Audit Dashboard
- [ ] `consul-operations-source.ts` → Service Discovery Dashboard
- [ ] `code-generation-source.ts` → Code Generation Dashboard
- [ ] `metadata-operations-source.ts` → Metadata Dashboard
- [ ] `bridge-operations-source.ts` → Workflow Dashboard
- [ ] `logging-source.ts` → Logs Dashboard

### Phase 3: Enhance Existing Data Sources (MEDIUM PRIORITY)
- [ ] Add search events to `intelligence-analytics-source`
- [ ] Add quality gate events to `agent-management-source`
- [ ] Add validation events to `code-intelligence-source`
- [ ] Add connection events to `platform-health-source`
- [ ] Add discovery events to `pattern-learning-source`

### Phase 4: New Dashboards (MEDIUM PRIORITY)
- [ ] Database Operations Dashboard
- [ ] Vault Audit Dashboard
- [ ] Service Discovery Dashboard
- [ ] Code Generation Dashboard
- [ ] Metadata Dashboard
- [ ] Workflow Dashboard
- [ ] Logs Dashboard

---

## 📊 Event Coverage Summary

**Total Events in Catalog**: 123 (91 MVP + 32 Planned)

**Currently Consumed**: ~25 events (20%)
- Intelligence: 4/16 (25%)
- Agent: 4/10 (40%)
- Metadata: 1/7 (14%)
- Code Generation: 1/8 (13%)
- Database: 1/11 (9%)
- Consul: 2/9 (22%)
- Vault: 0/15 (0%)
- Bridge: 1/6 (17%)
- Service Health: 3/4 (75%)
- Logging: 0/3 (0%)
- Registry: 2/5 (40%)

**Missing**: ~98 events (80%)

---

## 🔄 Data Flow Pattern

```
Event Bus (Kafka/Redpanda)
    ↓
EventBusDataSource.subscribe()
    ↓
    ├─→ Transform to Data Source Format
    ├─→ Store in PostgreSQL (historical)
    └─→ Push via WebSocket (real-time)
            ↓
        React Component (useQuery)
            ↓
        UI Display
```

---

## 📝 Next Steps

1. **Start with EventBusDataSource** - This is the foundation for everything
2. **Prioritize by dashboard usage** - Which dashboards are most important?
3. **Incremental implementation** - Add one data source at a time
4. **Test with real events** - Use event generator to test data flow
5. **Update existing data sources** - Migrate from HTTP APIs to event bus

---

**See**: `EVENT_TO_COMPONENT_MAPPING.md` for detailed mapping

