# Dashboard UI Audit Checklist

**Quick Reference**: Use this checklist to audit any dashboard page against UI standards.
**Full Documentation**: See `DASHBOARD_UI_STANDARDS.md` for detailed requirements.

---

## Page: **************\_\_\_**************

**Auditor**: ******\_\_\_****** | **Date**: ******\_\_\_****** | **Status**: ⬜ Pass | ⬜ Fail | ⬜ Partial

---

## ✅ CRITICAL (Must Pass - 13 items)

These items are **mandatory** and must be fixed before deployment.

### Structure

- [ ] **C1** - Root container uses `space-y-6` className
- [ ] **C2** - Header uses `flex items-center justify-between` layout
- [ ] **C5** - Toolbar is inside header flex container (not separate)

### Typography

- [ ] **C3** - Page title is `<h1>` with `text-3xl font-bold`
- [ ] **C4** - Subtitle uses `ty-subtitle` class

### Time Range Selector

- [ ] **C6** - Has all 5 time ranges: 1H, 24H, 7D, 30D, Custom
- [ ] **C7** - Time range selector has visual divider (`border-l ml-2 pl-2`)

### Components

- [ ] **C8** - All metric card groups wrapped in `DashboardSection`
- [ ] **C9** - All buttons use `variant="outline"` and `size="sm"`
- [ ] **C10** - All icons are 16×16px (`w-4 h-4` classes)

### Data Handling

- [ ] **C11** - Loading state implemented and displayed
- [ ] **C12** - Error state implemented with proper styling
- [ ] **C13** - MockDataBadge shown when using mock data

**Critical Score**: **\_** / 13 | **Must be 13/13 to pass**

---

## ⚠️ IMPORTANT (Should Pass - 8 items)

These items significantly impact UX and should be addressed.

### Content Quality

- [ ] **I1** - Subtitle is descriptive and explains dashboard purpose

### Time Range

- [ ] **I2** - Custom date range picker with calendar implemented
- [ ] **I8** - Data fetching respects selected time range

### Layout

- [ ] **I3** - Tabs used if dashboard has multiple distinct views
- [ ] **I4** - Cards use standard grid patterns (4-col, 3-col, 2-col)
- [ ] **I5** - Card gaps are consistent (`gap-4` for metrics, `gap-6` for larger cards)

### Responsive Design

- [ ] **I6** - Responsive breakpoints follow mobile-first strategy
  - Base styles for mobile
  - `md:` for tablet (768px+)
  - `lg:` or `xl:` for desktop (1024px+)

### Visual Consistency

- [ ] **I7** - Status colors used consistently across the page

**Important Score**: **\_** / 8 | **Target: 6/8 (75%)**

---

## 🎨 NICE-TO-HAVE (Recommended - 7 items)

These items enhance the user experience but are not critical.

### Toolbar Actions

- [ ] **N1** - Configure button present in toolbar
- [ ] **N2** - Export Report button present in toolbar
- [ ] **N3** - Refresh button with loading animation
- [ ] **N4** - Export button for data download
- [ ] **N5** - Filter button for data filtering

### Polish

- [ ] **N6** - Smooth transitions for time range changes
- [ ] **N7** - Tooltips for icons/actions where helpful

**Nice-to-Have Score**: **\_** / 7 | **Target: 4/7 (57%)**

---

## ❌ ANTI-PATTERNS DETECTED

Check any anti-patterns found on the page:

### Legacy Components (must remove)

- [ ] Uses `SectionHeader` component
- [ ] Uses `TimeRangeSelector` component
- [ ] Uses `ExportButton` component

### Structure Issues (must fix)

- [ ] Page title is H2 or H3 instead of H1
- [ ] Toolbar is in separate container outside header
- [ ] Custom header implementation instead of standard pattern
- [ ] Card grids without DashboardSection wrapper

### Styling Issues (must fix)

- [ ] Custom button sizes (not using `size="sm"`)
- [ ] Inconsistent icon sizes (not 16×16px)
- [ ] Mixed spacing patterns
- [ ] Non-standard grid patterns

### UX Issues (must fix)

- [ ] No loading state shown during data fetch
- [ ] No error handling/display
- [ ] Mock data not indicated with badge
- [ ] No time range selector

**Anti-Patterns Found**: **\_** | **Must be 0 to pass**

---

## 📊 OVERALL ASSESSMENT

### Scores Summary

- **Critical**: **\_** / 13 (Must be 13/13)
- **Important**: **\_** / 8 (Target: 6/8)
- **Nice-to-Have**: **\_** / 7 (Target: 4/7)
- **Anti-Patterns**: **\_** (Must be 0)

### Status

- ⬜ **PASS** - All critical items pass, 75%+ important items pass, no anti-patterns
- ⬜ **PARTIAL** - Critical items pass but improvements needed
- ⬜ **FAIL** - Critical items failing or anti-patterns present

### Priority Issues (Top 3)

1. ***
   - Impact: ⬜ High | ⬜ Medium | ⬜ Low
   - Effort: ⬜ High | ⬜ Medium | ⬜ Low

2. ***
   - Impact: ⬜ High | ⬜ Medium | ⬜ Low
   - Effort: ⬜ High | ⬜ Medium | ⬜ Low

3. ***
   - Impact: ⬜ High | ⬜ Medium | ⬜ Low
   - Effort: ⬜ High | ⬜ Medium | ⬜ Low

### Notes

---

---

---

---

---

## 🔧 QUICK FIXES REFERENCE

### Fix: Legacy SectionHeader → Standard Header

```diff
- <SectionHeader title="Page Title" description="Description" />
+ <div className="flex items-center justify-between">
+   <div>
+     <h1 className="text-3xl font-bold">Page Title</h1>
+     <p className="ty-subtitle">Description</p>
+   </div>
+   <div className="flex items-center gap-2">
+     {/* Toolbar buttons */}
+   </div>
+ </div>
```

### Fix: Add Time Range Selector

```tsx
<div className="flex items-center gap-2 ml-2 pl-2 border-l">
  <Button
    variant={timeRange === '1h' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('1h')}
  >
    1H
  </Button>
  <Button
    variant={timeRange === '24h' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('24h')}
  >
    24H
  </Button>
  <Button
    variant={timeRange === '7d' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('7d')}
  >
    7D
  </Button>
  <Button
    variant={timeRange === '30d' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('30d')}
  >
    30D
  </Button>
  {/* Custom picker */}
</div>
```

### Fix: Wrap Cards in DashboardSection

```diff
- <div className="grid grid-cols-4 gap-6">
+ <DashboardSection title="Section Title">
+   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>...</Card>
+   </div>
+ </DashboardSection>
```

### Fix: Add Loading/Error States

```tsx
if (isLoading) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading dashboard data...</p>
      </div>
    </div>
  );
}

if (error) {
  return (
    <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-destructive">
      <strong>Error loading data:</strong>{' '}
      {error instanceof Error ? error.message : 'Unknown error'}
    </div>
  );
}
```

---

## 📚 Additional Resources

- **Full Standards**: `DASHBOARD_UI_STANDARDS.md`
- **Reference Implementation**: `client/src/pages/preview/IntelligenceAnalytics.tsx`
- **DashboardSection Docs**: `client/src/components/DashboardSection.tsx` (lines 40-61)

---

**Audit Complete** | Next Steps: **************\_\_\_**************
