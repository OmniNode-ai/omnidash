# Pattern Learning Dashboard Validation Checklist

**Purpose**: Validate Pattern Learning dashboard displays real pattern data correctly after implementing quality and usage tracking.

**Version**: 1.0
**Last Updated**: 2025-10-28

---

## Pre-Validation Setup

### Environment Checklist

- [ ] Backend server running (`npm run dev`)
- [ ] Database accessible (PostgreSQL at 192.168.86.200:5436)
- [ ] Intelligence service running (Archon at http://localhost:8053)
- [ ] `pattern_lineage_nodes` table has data (>0 records)
- [ ] Browser DevTools open (Console + Network tabs)

### Quick Health Check

```bash
# 1. Check database connectivity
psql -h 192.168.86.200 -p 5436 -U postgres -d omnidash_analytics -c "SELECT COUNT(*) FROM pattern_lineage_nodes;"

# 2. Check API endpoints
curl http://localhost:3000/api/intelligence/patterns/summary | jq
curl http://localhost:3000/api/intelligence/patterns/list?limit=5 | jq

# 3. Check intelligence service
curl http://localhost:8053/health
```

---

## Section 1: Data Quality Validation

### 1.1 Pattern Names

**Test**: Verify pattern names are descriptive, not filenames

- [ ] **NO filenames** in pattern list (`__init__.py`, `index.ts`, etc.)
- [ ] **Pattern names include context**: "Async DB Transaction", "State Manager Pattern"
- [ ] **Pattern names NOT like**: "file.py", "module.ts", "component.tsx"
- [ ] **Language identifiers present** for most patterns

**How to verify**:

1. Open dashboard: http://localhost:3000/pattern-learning
2. Inspect Top Patterns List (right panel)
3. Check first 10 pattern names
4. Confirm no filenames visible

**Expected**: All pattern names are descriptive (e.g., "Error Handling with Retry Logic")
**Fail if**: Any pattern shows filename (e.g., "**init**.py", "utils.py")

---

### 1.2 Quality Scores Variation

**Test**: Quality scores show real variation, not hardcoded values

- [ ] **Quality scores vary** (not all 0.85, 0.87, or 0.82)
- [ ] **Minimum quality score < 0.70** (some low-quality patterns exist)
- [ ] **Maximum quality score > 0.90** (some high-quality patterns exist)
- [ ] **Quality distribution realistic** (bell curve, most 0.75-0.90)
- [ ] **Python patterns NOT always 0.87** (language-agnostic scoring)
- [ ] **Non-Python patterns NOT always 0.82** (language-agnostic scoring)

**How to verify**:

1. Open browser DevTools → Network tab
2. Find request: `GET /api/intelligence/patterns/list`
3. Check response JSON quality values
4. Calculate statistics:
   ```javascript
   // In browser console
   const patterns = await fetch('/api/intelligence/patterns/list?limit=50').then((r) => r.json());
   const qualities = patterns.map((p) => p.quality);
   console.log('Min:', Math.min(...qualities));
   console.log('Max:', Math.max(...qualities));
   console.log('Avg:', qualities.reduce((a, b) => a + b) / qualities.length);
   console.log('Unique values:', new Set(qualities).size);
   ```

**Expected**:

- Unique values: >10
- Min quality: 0.50-0.70
- Max quality: 0.90-1.00
- Avg quality: 0.75-0.85

**Fail if**:

- All values are 0.85 ± 0.02 (hardcoded)
- Only 2 unique values: 0.87 and 0.82 (language-based hardcoding)
- Unique values < 5 (insufficient variation)

---

### 1.3 Usage Counts Variation

**Test**: Usage counts show real variation, not all = 1

- [ ] **Usage counts vary** (not all = 1)
- [ ] **Some popular patterns exist** (usage > 10)
- [ ] **Usage distribution realistic** (power law: few popular, many rare)
- [ ] **Usage count = 0** for some patterns (newly discovered, unused)
- [ ] **Top 10 patterns sorted by usage** show decreasing values

**How to verify**:

1. Check Top Patterns List in dashboard
2. Verify usage counts next to each pattern
3. Run console check:
   ```javascript
   const patterns = await fetch('/api/intelligence/patterns/list?limit=50').then((r) => r.json());
   const usages = patterns.map((p) => p.usage);
   console.log('Min:', Math.min(...usages));
   console.log('Max:', Math.max(...usages));
   console.log('Unique values:', new Set(usages).size);
   console.log('Usage > 1:', usages.filter((u) => u > 1).length);
   ```

**Expected**:

- Unique values: >15
- Min usage: 0-1
- Max usage: >10
- Patterns with usage > 1: >30%

**Fail if**:

- All values = 1 (hardcoded)
- No patterns with usage > 1 (no usage tracking)
- Max usage = 1 (usage tracking not working)

---

### 1.4 Quality Summary Metrics

**Test**: Average quality score is calculated, not hardcoded to 0.85

- [ ] **Average quality ≠ 0.85** exactly
- [ ] **Average quality changes** when time range changes
- [ ] **Summary quality ≈ list quality average** (within 0.05)

**How to verify**:

1. Check "Avg Quality" metric card (top row)
2. Change time range (24h → 7d → 30d)
3. Verify quality score changes
4. Run API check:
   ```bash
   curl http://localhost:3000/api/intelligence/patterns/summary?timeWindow=24h | jq '.avgQualityScore'
   curl http://localhost:3000/api/intelligence/patterns/summary?timeWindow=7d | jq '.avgQualityScore'
   ```

**Expected**:

- Summary quality varies by time range
- Summary quality ≠ 0.85 exactly
- Summary matches calculated average from pattern list

**Fail if**:

- Summary quality always = 0.85
- Summary quality never changes
- Summary quality disconnected from pattern list

---

## Section 2: UI Functionality Validation

### 2.1 Pattern List Loading

- [ ] **Pattern list loads** without errors (<2 seconds)
- [ ] **Loading spinner** shows while fetching
- [ ] **Patterns render** correctly in network visualization
- [ ] **Top patterns list** populates with data
- [ ] **No JavaScript errors** in console

**How to verify**:

1. Hard refresh page (Cmd+Shift+R / Ctrl+Shift+F5)
2. Watch loading spinner
3. Check console for errors
4. Verify network requests complete successfully

---

### 2.2 Pattern Details

- [ ] **Click pattern node** in network graph
- [ ] **Drill-down panel opens** (right side)
- [ ] **Pattern details display** (name, quality, usage, category)
- [ ] **Quality breakdown** shows 5 components (if available)
- [ ] **Usage statistics** show historical data
- [ ] **Close button** works correctly

**How to verify**:

1. Click any pattern node in network visualization
2. Verify drill-down panel slides in from right
3. Check all detail fields populated
4. Close and reopen with different pattern

---

### 2.3 Search & Filtering

- [ ] **Search box** filters patterns by name
- [ ] **Pattern type filter** filters by category
- [ ] **Quality slider** filters by minimum quality
- [ ] **Usage slider** filters by minimum usage
- [ ] **Filtered results** update in real-time
- [ ] **Clear filters** resets to all patterns

**How to verify**:

1. Type "async" in search box
2. Set quality slider to 80%
3. Set usage slider to 5
4. Verify only matching patterns shown
5. Clear filters and verify all patterns return

---

### 2.4 Time Range Selection

- [ ] **Time range selector** shows options (24h, 7d, 30d)
- [ ] **Changing time range** refetches data
- [ ] **Pattern counts** update based on time range
- [ ] **Quality trends chart** updates
- [ ] **Discovery rate chart** updates

**How to verify**:

1. Select "24h" time range
2. Note pattern count
3. Select "7d" time range
4. Verify pattern count increases
5. Check Network tab shows new API requests

---

## Section 3: API Integration Validation

### 3.1 Endpoint Availability

- [ ] `GET /api/intelligence/patterns/summary` - Returns 200
- [ ] `GET /api/intelligence/patterns/trends` - Returns 200
- [ ] `GET /api/intelligence/patterns/quality-trends` - Returns 200
- [ ] `GET /api/intelligence/patterns/list` - Returns 200
- [ ] `GET /api/intelligence/patterns/relationships` - Returns 200

**How to verify**:

```bash
curl -I http://localhost:3000/api/intelligence/patterns/summary
curl -I http://localhost:3000/api/intelligence/patterns/list
curl -I http://localhost:3000/api/intelligence/patterns/relationships?patterns=id1,id2
```

---

### 3.2 Error Handling

**Test**: API failures handled gracefully

- [ ] **Database down** → Shows error message, not crash
- [ ] **Network timeout** → Shows retry option
- [ ] **Invalid parameters** → Shows validation error
- [ ] **Empty dataset** → Shows "No patterns" message

**How to verify**:

1. Stop database: `docker stop archon-bridge`
2. Refresh dashboard
3. Verify error message displayed (not white screen)
4. Restart database: `docker start archon-bridge`
5. Verify dashboard recovers

---

### 3.3 Real-Time Polling

- [ ] **Pattern list** refetches every 30 seconds
- [ ] **Pattern summary** refetches every 30 seconds
- [ ] **Quality trends** refetch every 60 seconds
- [ ] **Pattern relationships** refetch every 60 seconds
- [ ] **No duplicate requests** (polling doesn't stack)

**How to verify**:

1. Open Network tab → Filter by XHR
2. Watch for repeated requests
3. Note timestamp intervals
4. Verify intervals match refetchInterval settings

---

## Section 4: Performance Validation

### 4.1 Load Time

- [ ] **Initial page load** < 2 seconds
- [ ] **Pattern list query** < 1 second
- [ ] **Pattern details** < 500ms
- [ ] **Relationship graph render** < 3 seconds
- [ ] **Search/filter** updates instantly (<100ms)

**How to verify**:

1. Open DevTools → Performance tab
2. Record page load
3. Check "Load" event timing
4. Run Lighthouse audit

**Expected**:

- First Contentful Paint (FCP): <1.5s
- Largest Contentful Paint (LCP): <2.5s
- Time to Interactive (TTI): <3.0s

---

### 4.2 Memory & Performance

- [ ] **No memory leaks** (check DevTools → Memory)
- [ ] **No console errors** during normal operation
- [ ] **No console warnings** (React warnings, prop types, etc.)
- [ ] **CPU usage** stays reasonable (<20% idle, <60% active)
- [ ] **Network bandwidth** reasonable (<5MB initial load)

**How to verify**:

1. Open DevTools → Performance Monitor
2. Use dashboard for 5 minutes
3. Check memory stays stable
4. Check CPU doesn't spike excessively

---

## Section 5: Visual Validation

### 5.1 Pattern Network Graph

- [ ] **Nodes render** at correct positions
- [ ] **Node size** correlates with usage
- [ ] **Node color** correlates with quality (green=high, red=low)
- [ ] **Edges render** between related patterns
- [ ] **Edge thickness** correlates with relationship strength
- [ ] **Labels readable** (not overlapping)
- [ ] **Hover shows** pattern details
- [ ] **Click opens** drill-down panel

---

### 5.2 Quality Trends Chart

- [ ] **Chart renders** with historical data
- [ ] **X-axis** shows time labels
- [ ] **Y-axis** shows quality percentage (0-100%)
- [ ] **Data points** connected with line
- [ ] **No flatline at 85%** (real variation)
- [ ] **Tooltip** shows details on hover

---

### 5.3 Responsive Design

- [ ] **Desktop** (1920x1080) - Full layout
- [ ] **Laptop** (1366x768) - Compact layout
- [ ] **Tablet** (768x1024) - Stacked layout
- [ ] **Mobile** (375x667) - Single column

**How to verify**:

1. Open DevTools → Device Toolbar
2. Test different viewport sizes
3. Verify no horizontal scrolling
4. Verify all content accessible

---

## Section 6: Data Integrity Validation

### 6.1 Pattern Relationships

- [ ] **Relationships exist** for related patterns
- [ ] **Relationship types** correct (modified_from, same_language, same_type)
- [ ] **Relationship weights** reasonable (0.0-1.0)
- [ ] **No circular dependencies** warnings (or handled correctly)
- [ ] **Bidirectional relationships** consistent

**How to verify**:

```bash
curl 'http://localhost:3000/api/intelligence/patterns/relationships?patterns=id1,id2,id3' | jq
```

---

### 6.2 Quality Score Breakdown

**Test**: Quality scores have component breakdown (if implemented)

- [ ] **Complexity score** (0.0-1.0)
- [ ] **Documentation score** (0.0-1.0)
- [ ] **Test coverage** (0.0-1.0)
- [ ] **Conformance** (ONEX compliance 0.0-1.0)
- [ ] **Usage success rate** (0.0-1.0)

**Note**: Skip if quality breakdown not yet implemented

---

## Section 7: Regression Testing

### 7.1 Previously Working Features

- [ ] **Export button** exports dashboard data to JSON
- [ ] **Status legend** shows color coding
- [ ] **Metric cards** show correct icons
- [ ] **Time range** persists to localStorage
- [ ] **Dark mode** (if supported) works correctly

---

## Final Validation

### Sign-off Criteria

All checks must pass before production deployment:

1. **Data Quality**: ✅ No hardcoded values detected
2. **UI Functionality**: ✅ All features working
3. **API Integration**: ✅ All endpoints returning real data
4. **Performance**: ✅ Load time <2s, no errors
5. **Visual Quality**: ✅ Charts rendering correctly

### Summary Checklist

- [ ] **All "Data Quality Validation" checks pass** (Section 1)
- [ ] **All "UI Functionality" checks pass** (Section 2)
- [ ] **All "API Integration" checks pass** (Section 3)
- [ ] **All "Performance" checks pass** (Section 4)
- [ ] **All "Visual Validation" checks pass** (Section 5)
- [ ] **All "Data Integrity" checks pass** (Section 6)
- [ ] **All "Regression Testing" checks pass** (Section 7)

**Status**: **********\_\_**********
**Tested By**: **********\_\_**********
**Date**: **********\_\_**********

---

## Troubleshooting

### Common Issues

**Issue**: All quality scores = 0.85

- **Cause**: Backend still using hardcoded values
- **Fix**: Check `/server/intelligence-routes.ts` line 315, 444

**Issue**: All usage counts = 1

- **Cause**: Usage tracking not implemented
- **Fix**: Check `/server/intelligence-routes.ts` line 447

**Issue**: Pattern list shows filenames

- **Cause**: `patternName` field contains filepath instead of descriptive name
- **Fix**: Update pattern extraction logic to use descriptive names

**Issue**: No patterns shown

- **Cause**: Database empty or connection failed
- **Fix**: Check `pattern_lineage_nodes` table has data

**Issue**: Charts not rendering

- **Cause**: Chart library not loaded or data format incorrect
- **Fix**: Check browser console for errors, verify API response format

---

## Automated Testing Script

**Location**: `omnidash/client/src/tests/pattern_learning_validation.test.ts`

```typescript
describe('Pattern Learning Dashboard Validation', () => {
  test('should display real pattern data, not filenames', async () => {
    const patterns = await fetchPatterns();

    // No filenames like __init__.py
    expect(patterns.every((p) => !p.name.includes('.py'))).toBe(true);
    expect(patterns.every((p) => !p.name.includes('.ts'))).toBe(true);

    // Has real pattern names
    expect(
      patterns.some(
        (p) =>
          p.name.includes('Pattern') || p.name.includes('Manager') || p.name.includes('Handler')
      )
    ).toBe(true);
  });

  test('should show varied quality scores', async () => {
    const patterns = await fetchPatterns();

    // Not all hardcoded to 0.85
    const uniqueScores = new Set(patterns.map((p) => p.quality));
    expect(uniqueScores.size).toBeGreaterThan(5);

    // All scores in valid range
    expect(patterns.every((p) => p.quality >= 0 && p.quality <= 1)).toBe(true);

    // Has variation (standard deviation > 0.05)
    const avg = patterns.reduce((sum, p) => sum + p.quality, 0) / patterns.length;
    const variance =
      patterns.reduce((sum, p) => sum + Math.pow(p.quality - avg, 2), 0) / patterns.length;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeGreaterThan(0.05);
  });

  test('should show varied usage counts', async () => {
    const patterns = await fetchPatterns();

    // Not all hardcoded to 1
    const usageCounts = patterns.map((p) => p.usage);
    expect(Math.max(...usageCounts)).toBeGreaterThan(1);

    // Has variation (some popular, some rare)
    expect(usageCounts.filter((u) => u > 5).length).toBeGreaterThan(0);
    expect(usageCounts.filter((u) => u <= 2).length).toBeGreaterThan(0);
  });

  test('should display pattern relationships', async () => {
    const pattern = await fetchPattern('test-pattern-id');
    const relationships = await fetchRelationships([pattern.id]);

    expect(relationships).toHaveProperty('length');
    expect(relationships.length).toBeGreaterThan(0);

    // Check relationship structure
    relationships.forEach((rel) => {
      expect(rel).toHaveProperty('source');
      expect(rel).toHaveProperty('target');
      expect(rel).toHaveProperty('type');
      expect(rel).toHaveProperty('weight');
      expect(rel.weight).toBeGreaterThanOrEqual(0);
      expect(rel.weight).toBeLessThanOrEqual(1);
    });
  });
});
```

**Run tests**:

```bash
npm test -- pattern_learning_validation
```

---

**Checklist Version**: 1.0
**Last Updated**: 2025-10-28
**Maintained By**: Frontend Development Team
