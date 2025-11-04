# OmniArchon Intelligence Adapter Integration Report

**Date**: 2025-10-31  
**Status**: ✅ Ready for Integration  
**Priority**: Medium

## Executive Summary

Omnidash now has a fully functional `IntelligenceEventAdapter` that publishes code analysis requests via Kafka. The handler (`IntelligenceAdapterHandler`) already exists in OmniArchon and processes these requests. This report documents the integration status and required changes to ensure end-to-end functionality.

## Current Status

### ✅ Omnidash Adapter (Complete)
- **File**: `server/intelligence-event-adapter.ts`
- **Status**: Fully implemented and tested
- **Format**: Matches OmniClaude's ONEX event envelope format
- **Topics**:
  - Request: `dev.archon-intelligence.intelligence.code-analysis-requested.v1`
  - Completed: `dev.archon-intelligence.intelligence.code-analysis-completed.v1`
  - Failed: `dev.archon-intelligence.intelligence.code-analysis-failed.v1`

### ✅ OmniArchon Handler (Already Exists)
- **File**: `services/intelligence/src/handlers/intelligence_adapter_handler.py`
- **Status**: Fully implemented
- **Capabilities**:
  - Handles `CODE_ANALYSIS_REQUESTED` events
  - Supports multiple operation types (PATTERN_EXTRACTION, QUALITY_ASSESSMENT, etc.)
  - Publishes `CODE_ANALYSIS_COMPLETED` / `CODE_ANALYSIS_FAILED` responses
  - Proper error handling and retry logic

### ⚠️ Integration Gap
The handler exists but may not be registered/active in the Kafka consumer. Verification needed.

## Required Changes in OmniArchon

### 1. Verify Handler Registration

**File**: `services/intelligence/src/kafka_consumer.py`

**Action**: Confirm `IntelligenceAdapterHandler` is registered in the handler registry.

**Expected Code** (should already exist):
```python
from src.handlers.intelligence_adapter_handler import IntelligenceAdapterHandler

# In __init__ or register_handlers method:
intelligence_handler = IntelligenceAdapterHandler()
self.register_handler(intelligence_handler)
```

**Verification Command**:
```bash
grep -n "IntelligenceAdapterHandler\|intelligence.*adapter" services/intelligence/src/kafka_consumer.py
```

**If Missing**: Add handler registration following the pattern used for other handlers.

### 2. Verify Topic Subscription

**File**: `services/intelligence/src/kafka_consumer.py`

**Action**: Confirm the request topic is included in subscribed topics list.

**Expected Topic**:
```
dev.archon-intelligence.intelligence.code-analysis-requested.v1
```

**Verification**:
```bash
grep -n "code-analysis-requested\|topics\|subscribe" services/intelligence/src/kafka_consumer.py | head -20
```

**Expected Behavior**: The consumer should subscribe to all `dev.archon-intelligence.*` topics by default, or explicitly list the code-analysis topic.

### 3. Handler Event Type Matching (Already Correct)

**File**: `services/intelligence/src/handlers/intelligence_adapter_handler.py`

**Status**: ✅ Handler's `can_handle()` method accepts:
- `"CODE_ANALYSIS_REQUESTED"`
- `"omninode.intelligence.event.code_analysis_requested.v1"`
- `"intelligence.code-analysis-requested"`

**Action**: No changes needed - handler is compatible with our adapter's event format.

### 4. Response Envelope Format (Already Correct)

**File**: `services/intelligence/src/handlers/intelligence_adapter_handler.py`

**Status**: ✅ Handler publishes ONEX-compliant envelopes:
- Uses `ModelEventEnvelope` with proper metadata
- Includes `correlation_id` at top level
- Uses `payload` key for response data

**Omnidash Adapter**: Updated to extract `payload` from response envelopes.

## Event Format Compatibility

### Request Format (Omnidash → OmniArchon)
```json
{
  "event_id": "uuid",
  "event_type": "CODE_ANALYSIS_REQUESTED",
  "correlation_id": "CORR-ID-UPPERCASE",
  "timestamp": "2025-10-31T12:00:00Z",
  "service": "omnidash",
  "payload": {
    "source_path": "node_*_effect.py",
    "content": null,
    "language": "python",
    "operation_type": "PATTERN_EXTRACTION",
    "options": {},
    "project_id": "omnidash",
    "user_id": "system"
  }
}
```

### Response Format (OmniArchon → Omnidash)
```json
{
  "correlation_id": "CORR-ID-UPPERCASE",
  "payload": {
    "source_path": "...",
    "patterns": [...],
    "quality_score": 0.85,
    ...
  },
  "metadata": {
    "event_type": "omninode.intelligence.event.code_analysis_completed.v1",
    ...
  }
}
```

**Status**: ✅ Formats are compatible

## Testing Checklist

### Pre-Integration
- [ ] Verify `IntelligenceAdapterHandler` is imported in `kafka_consumer.py`
- [ ] Verify handler is registered in consumer's handler registry
- [ ] Verify topic `dev.archon-intelligence.intelligence.code-analysis-requested.v1` is subscribed
- [ ] Check logs for handler registration: `docker logs archon-intelligence | grep -i "intelligence.*adapter"`

### Integration Test
1. **Publish Test Event** (from Omnidash):
   ```bash
   curl "http://localhost:3000/api/intelligence/events/test/patterns?path=node_*_effect.py&lang=python"
   ```

2. **Monitor OmniArchon Logs**:
   ```bash
   docker logs -f archon-intelligence | grep -E "(CODE_ANALYSIS|intelligence.*adapter|Processing.*request)"
   ```

3. **Expected Logs**:
   ```
   INFO: Processing CODE_ANALYSIS_REQUESTED | correlation_id=... | source_path=...
   INFO: CODE_ANALYSIS_COMPLETED published | correlation_id=...
   ```

4. **Check Response Topic**:
   ```bash
   # Using kcat or rpk
   kcat -C -b localhost:19092 -t dev.archon-intelligence.intelligence.code-analysis-completed.v1 -o end -c 1
   ```

### Success Criteria
- ✅ Omnidash receives response within timeout (default 5s)
- ✅ Response contains expected payload structure
- ✅ OmniArchon logs show successful processing
- ✅ No errors in either service

## Troubleshooting

### Issue: Timeout (No Response)
**Symptoms**: Omnidash adapter times out waiting for response

**Possible Causes**:
1. Handler not registered in consumer
2. Topic not subscribed
3. Handler throwing exception during processing
4. Response publishing failing

**Debug Steps**:
```bash
# 1. Check handler registration
docker exec archon-intelligence python3 -c "
from src.handlers.intelligence_adapter_handler import IntelligenceAdapterHandler
print('Handler imported successfully')
handler = IntelligenceAdapterHandler()
print(f'Handler can_handle CODE_ANALYSIS_REQUESTED: {handler.can_handle(\"CODE_ANALYSIS_REQUESTED\")}')
"

# 2. Check subscribed topics
docker logs archon-intelligence | grep -i "subscribed.*topics"

# 3. Monitor for incoming events
docker logs -f archon-intelligence | grep -i "code.*analysis.*requested"

# 4. Check for errors
docker logs archon-intelligence | grep -i "error.*intelligence.*adapter"
```

### Issue: Invalid Event Format
**Symptoms**: Handler logs "cannot handle event" or validation errors

**Fix**: Already addressed - Omnidash adapter now sends correct format matching OmniClaude pattern.

### Issue: Correlation ID Mismatch
**Symptoms**: Response received but not matched to pending request

**Fix**: Ensure correlation_id is UPPERCASE and matches exactly between request and response.

## Implementation Notes

### Omnidash Adapter Updates
1. ✅ Event envelope format matches OmniClaude pattern
2. ✅ Response parsing extracts `payload` from ONEX envelope
3. ✅ Correlation ID handling matches (UPPERCASE)
4. ✅ Error extraction from failed responses

### OmniArchon Handler (No Changes Needed)
- Handler already supports the event format we're sending
- Handler already publishes correct response format
- Handler already handles all required operation types

## Next Steps

1. **Verify Handler Registration** in OmniArchon
   - Check `services/intelligence/src/kafka_consumer.py`
   - Confirm handler is registered
   - Restart `archon-intelligence` service if needed

2. **Test End-to-End**
   - Run test endpoint: `/api/intelligence/events/test/patterns`
   - Monitor logs on both sides
   - Verify response received

3. **Integrate into Production Routes**
   - Replace mock data in `IntelligenceAnalytics.tsx` with live adapter calls
   - Add error handling and fallback to direct DB queries

## References

- **OmniClaude Pattern**: `/Volumes/PRO-G40/Code/omniclaude/agents/lib/intelligence_event_client.py`
- **OmniArchon Handler**: `/Volumes/PRO-G40/Code/omniarchon/services/intelligence/src/handlers/intelligence_adapter_handler.py`
- **Omnidash Adapter**: `/Volumes/PRO-G40/Code/omnidash/server/intelligence-event-adapter.ts`
- **Event Schemas**: `/Volumes/PRO-G40/Code/omniarchon/services/intelligence/src/events/models/intelligence_adapter_events.py`

