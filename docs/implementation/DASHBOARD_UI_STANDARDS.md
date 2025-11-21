# Dashboard UI Standards

**Reference Implementation**: `client/src/pages/preview/IntelligenceAnalytics.tsx`
**Version**: 1.0
**Last Updated**: 2025-11-10

## Overview

This document defines the mandatory UI standards for all dashboard pages in OmniDash. These standards ensure visual consistency, user experience coherence, and maintainability across the platform. All dashboard pages MUST conform to these standards.

---

## 1. Page Layout Structure

### 1.1 Container Structure

**REQUIRED**: All dashboard pages MUST use this exact structure:

```tsx
<div className="space-y-6">
  {/* Header Section */}
  <div className="flex items-center justify-between">
    {/* Title/Subtitle on left */}
    <div>
      <h1 className="text-3xl font-bold">{Page Title}</h1>
      <p className="ty-subtitle">{Description}</p>
    </div>

    {/* Toolbar on right */}
    <div className="flex items-center gap-2">
      {/* Conditional MockDataBadge */}
      {/* Action buttons */}
      {/* Time range selector with divider */}
      {/* Additional actions */}
    </div>
  </div>

  {/* Optional: Tabs Container */}
  <Tabs value={activeTab} onValueChange={setActiveTab}>
    <TabsList>...</TabsList>
    <TabsContent>...</TabsContent>
  </Tabs>

  {/* Content Sections */}
  <DashboardSection title="...">
    {/* Cards/Content */}
  </DashboardSection>
</div>
```

**Key Requirements**:

- ✅ Root container MUST use `space-y-6` for vertical spacing
- ✅ Header MUST use `flex items-center justify-between` for horizontal layout
- ✅ Title MUST be `h1` with `text-3xl font-bold`
- ✅ Subtitle MUST use `ty-subtitle` class (defined in global CSS)
- ✅ Toolbar MUST use `flex items-center gap-2`

### 1.2 Header Section

**REQUIRED Elements** (in order):

1. **Title Group** (left side):

   ```tsx
   <div>
     <h1 className="text-3xl font-bold">Dashboard Name</h1>
     <p className="ty-subtitle">Descriptive subtitle explaining dashboard purpose</p>
   </div>
   ```

2. **Toolbar Group** (right side):

   ```tsx
   <div className="flex items-center gap-2">
     {/* 1. Mock Data Badge (conditional) */}
     {usingMockData && <MockDataBadge />}

     {/* 2. Primary Action Buttons */}
     <Button variant="outline" size="sm">
       <Settings className="w-4 h-4 mr-2" />
       Configure
     </Button>
     <Button variant="outline" size="sm">
       <Eye className="w-4 h-4 mr-2" />
       Export Report
     </Button>

     {/* 3. Divider + Time Range Selector */}
     <div className="flex items-center gap-2 ml-2 pl-2 border-l">
       <Button variant={timeRange === '1h' ? 'default' : 'outline'} size="sm">
         1H
       </Button>
       <Button variant={timeRange === '24h' ? 'default' : 'outline'} size="sm">
         24H
       </Button>
       <Button variant={timeRange === '7d' ? 'default' : 'outline'} size="sm">
         7D
       </Button>
       <Button variant={timeRange === '30d' ? 'default' : 'outline'} size="sm">
         30D
       </Button>
       {/* Custom date range picker */}
     </div>

     {/* 4. Additional Actions */}
     <Button variant="outline" size="sm">
       <RefreshCw className="w-4 h-4 mr-2" />
       Refresh
     </Button>
     <Button variant="outline" size="sm">
       <Download className="w-4 h-4 mr-2" />
       Export
     </Button>
     <Button variant="outline" size="sm">
       <Filter className="w-4 h-4 mr-2" />
       Filter
     </Button>
   </div>
   ```

**Component Requirements**:

- ✅ All buttons MUST use `variant="outline"` and `size="sm"`
- ✅ All icons MUST be 16×16px (`w-4 h-4`) with `mr-2` spacing
- ✅ Time range buttons MUST use `variant="default"` when active
- ✅ Visual divider (`border-l`) MUST separate primary actions from time selector
- ✅ Gap spacing MUST be consistent (`gap-2`)

### 1.3 Prohibited Patterns

**❌ DO NOT USE**:

- `SectionHeader` component (legacy pattern, being deprecated)
- `TimeRangeSelector` component (use inline time range buttons instead)
- `ExportButton` component (use Button with icon instead)
- Separate toolbar containers (toolbar must be in header flex container)
- H2 or H3 for page title (must be H1)

---

## 2. Card Wrapper Hierarchy

### 2.1 Purpose

This section defines the **critical rules** for when and how to use Card wrapper components to ensure consistent UI hierarchy across all dashboards.

### 2.2 Two Valid Patterns

After analyzing compliant pages, we've identified **two valid patterns** for card wrapper hierarchy:

#### Pattern A: Flat Hierarchy (RECOMMENDED)

**Used by**: Intelligence Analytics, Agent Operations, Pattern Learning

```tsx
<div className="space-y-6">
  {/* Header - OUTSIDE any Card */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-3xl font-bold">Dashboard Title</h1>
      <p className="ty-subtitle">Description</p>
    </div>
    <div className="flex items-center gap-2">{/* Toolbar buttons */}</div>
  </div>

  {/* Tabs - OUTSIDE any Card (if applicable) */}
  <Tabs value={activeTab} onValueChange={setActiveTab}>
    <TabsList>...</TabsList>
    <TabsContent value="tab1" className="space-y-6">
      {/* Content sections */}
    </TabsContent>
  </Tabs>

  {/* Content Sections */}
  <DashboardSection title="Section Title">
    <div className="grid grid-cols-4 gap-4">
      <Card>...</Card>
      <Card>...</Card>
    </div>
  </DashboardSection>
</div>
```

**Characteristics**:

- ✅ Header is plain divs (no Card wrapper)
- ✅ Tabs are direct children of root (no Card wrapper)
- ✅ Content uses DashboardSection or individual Cards
- ✅ Cleaner DOM structure
- ✅ Better for dashboards with multiple distinct sections

#### Pattern B: Nested Hierarchy

**Used by**: Platform Monitoring, some composite dashboards

```tsx
<div className="space-y-6">
  {/* Everything wrapped in ONE outer Card */}
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-3xl">Dashboard Title</CardTitle>
          <CardDescription className="text-base mt-2">Description</CardDescription>
        </div>
        <div className="flex items-center gap-2">{/* Toolbar buttons */}</div>
      </div>
    </CardHeader>

    <CardContent>
      {/* Tabs INSIDE CardContent */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>...</TabsList>
        <TabsContent value="tab1" className="space-y-4">
          {/* Nested Cards */}
          <Card>...</Card>
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>
</div>
```

**Characteristics**:

- ✅ Single outer Card wraps entire page content
- ✅ Header becomes CardHeader with CardTitle
- ✅ Tabs are inside CardContent
- ✅ Additional Cards nested inside tabs
- ✅ Better for unified single-purpose views

### 2.3 Decision Matrix

**Use Pattern A (Flat) when**:

- Dashboard has multiple independent sections
- Content sections need visual separation
- Dashboard feels like a "collection of widgets"
- Examples: Intelligence Analytics, Agent Operations

**Use Pattern B (Nested) when**:

- Dashboard is a single cohesive view
- Content is tightly related
- Tabs organize different aspects of same data
- Examples: Platform Monitoring, System Health

### 2.4 CRITICAL Rules

**REQUIRED - Apply to BOTH patterns**:

1. **Header Placement**:
   - Pattern A: Header is plain divs OUTSIDE any Card
   - Pattern B: Header is CardHeader INSIDE the outer Card
   - ❌ NEVER: Header inside DashboardSection

2. **Tabs Placement**:
   - Pattern A: Tabs are direct children of root div (OUTSIDE Card)
   - Pattern B: Tabs are INSIDE CardContent
   - ❌ NEVER: Tabs inside DashboardSection

3. **Time Range Selector**:
   - ALWAYS in header toolbar (right side)
   - Pattern A: In plain div toolbar
   - Pattern B: In CardHeader toolbar
   - ❌ NEVER: In CardContent or separate from header

4. **DashboardSection Usage**:
   - Pattern A: Use DashboardSection for content sections
   - Pattern B: Use plain Card with CardHeader/CardContent
   - ✅ BOTH: Can have nested Cards inside content areas

5. **Nesting Depth**:
   - Pattern A: Maximum 2 levels (DashboardSection → Card)
   - Pattern B: Maximum 3 levels (Outer Card → TabsContent → Nested Card)
   - ❌ NEVER: More than 3 levels of Card nesting

### 2.5 Hybrid Patterns (Section-Level Cards)

**When individual sections need Card wrappers**:

```tsx
{
  /* Pattern A with section-level cards */
}
<DashboardSection title="Section Title">
  <Card>
    <CardHeader>
      <CardTitle>Subsection</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-4 gap-4">
        <Card>...</Card> {/* Nested metric cards */}
      </div>
    </CardContent>
  </Card>
</DashboardSection>;
```

**When this is acceptable**:

- Section has complex internal structure
- Subsection needs its own header/actions
- Content is hierarchically organized
- Example: Intelligence Savings "Intelligence Operations" section

### 2.6 Common Mistakes

**❌ WRONG: Header inside Card but outside CardHeader**

```tsx
<Card>
  <div className="flex items-center justify-between">
    {' '}
    {/* ❌ Wrong level */}
    <h1>Title</h1>
  </div>
  <CardContent>...</CardContent>
</Card>
```

**✅ CORRECT: Header in proper Card component**

```tsx
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      {' '}
      {/* ✅ Correct */}
      <CardTitle className="text-3xl">Title</CardTitle>
    </div>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

**❌ WRONG: Tabs inside DashboardSection**

```tsx
<DashboardSection title="Section">
  {' '}
  {/* ❌ Wrong container */}
  <Tabs>...</Tabs>
</DashboardSection>
```

**✅ CORRECT: Tabs as direct child or in CardContent**

```tsx
{
  /* Pattern A */
}
<Tabs>...</Tabs>;

{
  /* Pattern B */
}
<Card>
  <CardContent>
    <Tabs>...</Tabs>
  </CardContent>
</Card>;
```

### 2.7 Before/After Examples

#### Example 1: Inconsistent Header Placement

**BEFORE (Inconsistent)**:

```tsx
<div className="space-y-6">
  {/* Header outside Card */}
  <div className="flex items-center justify-between">
    <h1>Title</h1>
    <div>{/* Toolbar */}</div>
  </div>

  {/* Tabs inside Card */}
  <Card>
    <CardContent>
      <Tabs>...</Tabs>
    </CardContent>
  </Card>
</div>
```

**AFTER (Pattern A - Consistent Flat)**:

```tsx
<div className="space-y-6">
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-3xl font-bold">Title</h1>
      <p className="ty-subtitle">Description</p>
    </div>
    <div className="flex items-center gap-2">{/* Toolbar */}</div>
  </div>

  <Tabs value={activeTab} onValueChange={setActiveTab}>
    <TabsList>...</TabsList>
    <TabsContent>...</TabsContent>
  </Tabs>
</div>
```

**AFTER (Pattern B - Consistent Nested)**:

```tsx
<div className="space-y-6">
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-3xl">Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </div>
        <div className="flex items-center gap-2">{/* Toolbar */}</div>
      </div>
    </CardHeader>
    <CardContent>
      <Tabs>...</Tabs>
    </CardContent>
  </Card>
</div>
```

### 2.8 Reference Implementations

**Pattern A (Flat) Examples**:

- `client/src/pages/preview/IntelligenceAnalytics.tsx` (lines 214-322)
- `client/src/pages/AgentOperations.tsx` (lines 360-424)
- `client/src/pages/PatternLearning.tsx` (lines 157-192)

**Pattern B (Nested) Examples**:

- `client/src/pages/preview/PlatformMonitoring.tsx` (lines 95-421)

### 2.9 Validation Checklist

Add these to your code review checklist:

**Card Hierarchy Checks**:

- [ ] **CH1**: Chose Pattern A or Pattern B (not mixed)
- [ ] **CH2**: Header placement matches chosen pattern
- [ ] **CH3**: Tabs placement matches chosen pattern
- [ ] **CH4**: Time selector is in header (not separate)
- [ ] **CH5**: Card nesting depth ≤ 3 levels
- [ ] **CH6**: DashboardSection used correctly (Pattern A only)
- [ ] **CH7**: No Card components inside DashboardSection headers
- [ ] **CH8**: CardTitle used instead of h1 when inside CardHeader
- [ ] **CH9**: Consistent pattern throughout entire page

---

## 3. Time Range Selector

### 3.1 Standard Time Ranges

**REQUIRED**: All dashboards MUST support these time ranges:

- `1h` - Last 1 hour
- `24h` - Last 24 hours
- `7d` - Last 7 days
- `30d` - Last 30 days (default)
- `custom` - Custom date range with calendar picker

### 3.2 Implementation Pattern

```tsx
const [timeRange, setTimeRange] = useState('30d');
const [customRange, setCustomRange] = useState<DateRange | undefined>();
const [showCustomPicker, setShowCustomPicker] = useState(false);

// Time range buttons
<div className="flex items-center gap-2 ml-2 pl-2 border-l">
  <Button
    variant={timeRange === '1h' ? 'default' : 'outline'}
    size="sm"
    onClick={() => setTimeRange('1h')}
  >
    1H
  </Button>
  {/* Repeat for 24H, 7D, 30D */}

  {/* Custom date range picker */}
  <Popover open={showCustomPicker} onOpenChange={setShowCustomPicker}>
    <PopoverTrigger asChild>
      <Button variant={timeRange === 'custom' ? 'default' : 'outline'} size="sm" className="gap-2">
        <CalendarIcon className="h-4 w-4" />
        Custom
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="end">
      <Calendar
        mode="range"
        selected={customRange}
        onSelect={(range) => {
          setCustomRange(range);
          if (range?.from && range?.to) {
            setTimeRange('custom');
            setShowCustomPicker(false);
          }
        }}
        numberOfMonths={2}
        initialFocus
      />
    </PopoverContent>
  </Popover>

  {/* Show selected custom range */}
  {timeRange === 'custom' && customRange?.from && customRange?.to && (
    <span className="text-sm text-muted-foreground">
      {format(customRange.from, 'MMM d')} - {format(customRange.to, 'MMM d, yyyy')}
    </span>
  )}
</div>;
```

**Requirements**:

- ✅ Time range state MUST be in component state
- ✅ Selected time range MUST show with `variant="default"`
- ✅ Custom range MUST use Popover + Calendar components
- ✅ Selected custom range MUST be displayed after calendar
- ✅ MUST use visual divider (`border-l`) to separate from other toolbar items

### 3.3 Data Fetching Integration

**REQUIRED**: All API queries MUST respect the time range:

```tsx
const { data: metricsResult, isLoading } = useQuery({
  queryKey: ['dashboard-metrics', timeRange],
  queryFn: () => dataSource.fetchMetrics(timeRange),
  refetchInterval: 60000,
});
```

---

## 4. DashboardSection Component

### 4.1 Purpose

`DashboardSection` is the **REQUIRED** wrapper for all metric card groups. It provides:

- Consistent card header structure
- Optional status legend
- Optional mock data badge
- Proper spacing and padding

### 4.2 Usage Pattern

```tsx
import { DashboardSection } from '@/components/DashboardSection';

<DashboardSection
  title="Section Title"
  description="Optional description text"
  showStatusLegend={false}
  showMockBadge={false}
>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <Card>...</Card>
    <Card>...</Card>
  </div>
</DashboardSection>;
```

**Props**:

- `title` (required): Section heading
- `description` (optional): Subtitle/description
- `showStatusLegend` (optional, default `false`): Show color legend
- `showMockBadge` (optional, default `false`): Show mock data indicator
- `children` (required): Content (typically grid of cards)

### 4.3 Requirements

**REQUIRED**:

- ✅ All metric card groups MUST be wrapped in `DashboardSection`
- ✅ Section titles MUST be descriptive and concise
- ✅ Use `showStatusLegend={true}` when cards use status colors
- ✅ Use `showMockBadge={true}` when section uses mock data

**PROHIBITED**:

- ❌ Direct Card grids without DashboardSection wrapper
- ❌ Custom section header implementations
- ❌ Bare divs with custom titles

---

## 5. Tabs Pattern

### 5.1 When to Use Tabs

Use tabs when dashboard has multiple distinct views/categories:

- Overview/Summary tabs
- Different data perspectives (Intelligence, Savings, Analytics)
- Grouped functionality sections

### 5.2 Implementation Pattern

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const [activeTab, setActiveTab] = useState('overview');

<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
  <TabsList className="grid w-full grid-cols-4">
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
    <TabsTrigger value="savings">Cost & Savings</TabsTrigger>
    <TabsTrigger value="analytics">Advanced Analytics</TabsTrigger>
  </TabsList>

  <TabsContent value="overview" className="space-y-6">
    <DashboardSection title="...">...</DashboardSection>
  </TabsContent>

  <TabsContent value="intelligence" className="space-y-6">
    <DashboardSection title="...">...</DashboardSection>
  </TabsContent>
</Tabs>;
```

**Requirements**:

- ✅ TabsList MUST use `grid w-full` with appropriate column count
- ✅ TabsContent MUST use `space-y-6` for vertical spacing
- ✅ Tab names MUST be concise (1-3 words)
- ✅ Active tab state MUST be controlled via `useState`

### 5.3 Without Tabs

If dashboard doesn't need tabs, content sections can be direct children:

```tsx
<div className="space-y-6">
  {/* Header */}

  <DashboardSection title="...">...</DashboardSection>
  <DashboardSection title="...">...</DashboardSection>
</div>
```

---

## 6. Card Layouts

### 6.1 Standard Grid Patterns

**REQUIRED**: Use these responsive grid patterns:

#### 4-Column Grid (Metrics)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</div>
```

#### 3-Column Grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</div>
```

#### 2-Column Grid (Charts)

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <Card>...</Card>
  <Card>...</Card>
</div>
```

#### Asymmetric Grid

```tsx
<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
  <div className="xl:col-span-2">
    <Card>...</Card>
  </div>
  <Card>...</Card>
</div>
```

**Requirements**:

- ✅ Always start with `grid-cols-1` for mobile
- ✅ Use `md:` prefix for tablet breakpoint
- ✅ Use `lg:` or `xl:` prefix for desktop breakpoint
- ✅ Use `gap-4` for metric cards, `gap-6` for larger cards
- ✅ Maintain consistent gaps within a section

### 6.2 Card Structure

**Standard Metric Card**:

```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Metric Label</CardTitle>
    <Icon className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">Value</div>
    <p className="text-xs text-muted-foreground">Contextual description</p>
  </CardContent>
</Card>
```

**Requirements**:

- ✅ CardHeader MUST use horizontal flex layout for label/icon
- ✅ Icon MUST be 16×16px (`h-4 w-4`)
- ✅ Primary value MUST use `text-2xl font-bold`
- ✅ Description MUST use `text-xs text-muted-foreground`

---

## 7. Loading and Error States

### 7.1 Loading State

**REQUIRED**: Show loading state during data fetch:

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
```

### 7.2 Error State

**REQUIRED**: Show error state on fetch failure:

```tsx
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

## 8. Mock Data Handling

### 8.1 MockDataBadge Placement

**REQUIRED**: Show MockDataBadge when using mock data:

#### Global Mock Data (entire dashboard)

```tsx
<div className="flex items-center gap-2">
  {usingMockData && <MockDataBadge />}
  {/* Other toolbar buttons */}
</div>
```

#### Section-Specific Mock Data

```tsx
<DashboardSection title="Section Title" showMockBadge={usingMockData}>
  {/* Content */}
</DashboardSection>
```

### 8.2 Data Source Integration

**REQUIRED**: Use data source pattern with mock flag:

```tsx
const { data: result, isLoading } = useQuery({
  queryKey: ['metrics', timeRange],
  queryFn: () => dataSource.fetchMetrics(timeRange),
  refetchInterval: 60000,
});

const metrics = result?.data;
const usingMockData = result?.isMock || false;
```

---

## 9. Responsive Behavior

### 9.1 Breakpoint Strategy

**Mobile First**: Always design for mobile first, then scale up.

**Breakpoints**:

- **Mobile**: Base styles (no prefix)
- **Tablet**: `md:` prefix (768px+)
- **Desktop**: `lg:` prefix (1024px+)
- **Large Desktop**: `xl:` or `2xl:` prefix (1280px+, 1536px+)

### 9.2 Toolbar Responsive Behavior

**Desktop** (default):

- Full toolbar visible
- All buttons inline

**Mobile** (to be implemented):

- Consider collapsing to dropdown/menu
- Prioritize most important actions
- Time range selector may need simplification

---

## 10. Spacing and Padding Standards

### 10.1 Container Spacing

```tsx
<div className="space-y-6">  {/* Between major sections */}
<div className="space-y-4">  {/* Between related items */}
<div className="gap-4">       {/* Grid gaps for cards */}
<div className="gap-6">       {/* Grid gaps for larger cards */}
<div className="gap-2">       {/* Button groups */}
```

### 10.2 Card Padding

Standard card padding is handled by shadcn/ui Card components:

- CardHeader: default padding
- CardContent: default padding
- Custom padding only when necessary

---

## 11. Accessibility Requirements

### 11.1 Semantic HTML

**REQUIRED**:

- ✅ Use `<h1>` for page title (only one per page)
- ✅ Use proper heading hierarchy (h1 → h2 → h3)
- ✅ Use semantic buttons (`<button>` or `Button` component)
- ✅ Provide alt text for images/icons where meaningful

### 11.2 Keyboard Navigation

**REQUIRED**:

- ✅ All interactive elements must be keyboard accessible
- ✅ Tab order must be logical
- ✅ Focus indicators must be visible

### 11.3 Color Contrast

**REQUIRED**:

- ✅ Text must meet WCAG AA contrast ratios
- ✅ Status colors must be distinguishable
- ✅ Use text labels in addition to color coding

---

## 12. Validation Checklist

Use this checklist to audit any dashboard page:

### ✅ Critical (Must Pass)

#### Layout & Structure

- [ ] **C1**: Root container uses `space-y-6`
- [ ] **C2**: Header uses `flex items-center justify-between`
- [ ] **C3**: Title is `h1` with `text-3xl font-bold` (or CardTitle if Pattern B)
- [ ] **C4**: Subtitle uses `ty-subtitle` class (or CardDescription if Pattern B)
- [ ] **C5**: Toolbar is in header flex container (not separate)

#### Card Hierarchy (NEW)

- [ ] **C6**: Chose either Pattern A (Flat) or Pattern B (Nested) - not mixed
- [ ] **C7**: Header placement matches chosen pattern (plain divs for A, CardHeader for B)
- [ ] **C8**: Tabs placement matches chosen pattern (outside Card for A, inside CardContent for B)
- [ ] **C9**: Card nesting depth ≤ 3 levels maximum
- [ ] **C10**: DashboardSection used correctly (Pattern A only, not for Pattern B)

#### Time Range & Controls

- [ ] **C11**: Time range selector has all 5 options (1H, 24H, 7D, 30D, Custom)
- [ ] **C12**: Time range selector has visual divider (`border-l`)
- [ ] **C13**: Time selector is in header toolbar (not separate section)

#### Components & Styling

- [ ] **C14**: Buttons use `variant="outline"` and `size="sm"`
- [ ] **C15**: Icons are 16×16px (`w-4 h-4`)
- [ ] **C16**: Loading state is implemented
- [ ] **C17**: Error state is implemented
- [ ] **C18**: MockDataBadge shown when using mock data

### ⚠️ Important (Should Pass)

- [ ] **I1**: Subtitle is descriptive and explains dashboard purpose
- [ ] **I2**: Custom date range picker implemented
- [ ] **I3**: Tabs used if dashboard has multiple views
- [ ] **I4**: Cards use standard grid patterns (4-col, 3-col, 2-col)
- [ ] **I5**: Card gaps are consistent (`gap-4` or `gap-6`)
- [ ] **I6**: Responsive breakpoints follow mobile-first strategy
- [ ] **I7**: Status colors used consistently
- [ ] **I8**: Data fetching respects time range

### 🎨 Nice-to-Have (Recommended)

- [ ] **N1**: Configure button present
- [ ] **N2**: Export Report button present
- [ ] **N3**: Refresh button with loading animation
- [ ] **N4**: Export button for data download
- [ ] **N5**: Filter button for data filtering
- [ ] **N6**: Smooth transitions for time range changes
- [ ] **N7**: Tooltips for icons/actions

---

## 13. Anti-Patterns to Avoid

### ❌ DO NOT USE

1. **Legacy Components**:
   - ❌ `SectionHeader` component
   - ❌ `TimeRangeSelector` component
   - ❌ `ExportButton` component

2. **Improper Structure**:
   - ❌ H2/H3 for page title (must be H1)
   - ❌ Separate toolbar div outside header
   - ❌ Custom header implementations
   - ❌ Direct card grids without DashboardSection

3. **Inconsistent Styling**:
   - ❌ Custom button sizes
   - ❌ Inconsistent icon sizes
   - ❌ Mixed spacing patterns
   - ❌ Non-standard grid patterns

4. **Poor UX**:
   - ❌ No loading states
   - ❌ No error handling
   - ❌ No mock data indicators
   - ❌ No time range selector

---

## 14. Migration Guide

### Converting Non-Compliant Pages

**Step 1: Update Header Structure**

BEFORE (non-compliant):

```tsx
<SectionHeader
  title="Page Title"
  description="Description"
/>
<div className="flex items-center justify-between">
  <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
  <ExportButton data={data} />
</div>
```

AFTER (compliant):

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold">Page Title</h1>
    <p className="ty-subtitle">Description</p>
  </div>
  <div className="flex items-center gap-2">
    {usingMockData && <MockDataBadge />}
    <Button variant="outline" size="sm">
      <Settings className="w-4 h-4 mr-2" />
      Configure
    </Button>
    <Button variant="outline" size="sm">
      <Eye className="w-4 h-4 mr-2" />
      Export Report
    </Button>
    <div className="flex items-center gap-2 ml-2 pl-2 border-l">{/* Time range buttons */}</div>
    <Button variant="outline" size="sm">
      <RefreshCw className="w-4 h-4 mr-2" />
      Refresh
    </Button>
  </div>
</div>
```

**Step 2: Wrap Cards in DashboardSection**

BEFORE:

```tsx
<div className="grid grid-cols-4 gap-6">
  <MetricCard ... />
</div>
```

AFTER:

```tsx
<DashboardSection title="Metrics">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <Card>...</Card>
  </div>
</DashboardSection>
```

**Step 3: Add Time Range Support**

```tsx
// Add state
const [timeRange, setTimeRange] = useState('30d');

// Update queries
const { data: result } = useQuery({
  queryKey: ['metrics', timeRange],
  queryFn: () => dataSource.fetchMetrics(timeRange),
});
```

---

## 15. Reference Examples

### Complete Compliant Example

See `client/src/pages/preview/IntelligenceAnalytics.tsx` for full implementation.

### Key Sections to Review

1. **Header** (lines 215-314): Complete toolbar implementation
2. **Tabs** (lines 316-322): Tab structure
3. **DashboardSection** (lines 326, 380+): Section wrapping pattern
4. **Cards** (lines 328+): Card layouts and grids
5. **Loading State** (lines 202-211): Loading implementation

---

## 16. Questions & Clarifications

### When should I use Pattern A vs Pattern B?

**Use Pattern A (Flat Hierarchy)**:

- Your dashboard is a collection of independent widgets/sections
- Content sections feel modular and could be rearranged
- Multiple distinct data sources or concerns
- Example: Intelligence Analytics with distinct Intelligence/Savings/Analytics tabs

**Use Pattern B (Nested Hierarchy)**:

- Your dashboard is a single unified view
- All content relates to one primary concern
- Tabs are different perspectives on the same data
- Example: Platform Monitoring showing different aspects of system health

**When in doubt**: Choose Pattern A - it's more flexible and easier to extend.

### When should I use tabs?

Use tabs when your dashboard has 2+ distinct views or categories. Single-view dashboards don't need tabs.

### Can I customize the toolbar buttons?

Yes, but maintain:

- `variant="outline"` and `size="sm"`
- 16×16px icons (`w-4 h-4`)
- Consistent gap spacing (`gap-2`)
- Visual divider before time range selector

### What if I need a different time range?

The 5 standard time ranges (1H, 24H, 7D, 30D, Custom) should cover most use cases. For specialized needs, consult the team before adding custom ranges.

### Can I add additional toolbar actions?

Yes! Place them after the time range selector and maintain consistent styling.

---

## 17. Enforcement

**All new dashboard pages MUST**:

1. Pass all Critical checklist items (C1-C18) including NEW Card Hierarchy checks (C6-C10)
2. Pass at least 75% of Important items (I1-I8)
3. Be reviewed against this standard before merging
4. Choose and consistently apply either Pattern A or Pattern B

**All existing dashboard pages SHOULD**:

1. Be migrated to this standard during feature work
2. Be audited quarterly for compliance
3. Have migration tracked in technical debt backlog
4. Prioritize Card Hierarchy consistency (C6-C10) in next refactor

---

## Change Log

### 2025-11-10 - v1.1

- **MAJOR**: Added comprehensive Card Wrapper Hierarchy section (Section 2)
- Documented two valid patterns: Pattern A (Flat) and Pattern B (Nested)
- Added decision matrix for choosing between patterns
- Added 9 new critical checklist items for card hierarchy (C6-C10, CH1-CH9)
- Added before/after examples for common card hierarchy mistakes
- Updated enforcement section to require card hierarchy compliance
- Reference implementations: IntelligenceAnalytics.tsx (Pattern A), PlatformMonitoring.tsx (Pattern B)

### 2025-11-10 - v1.0

- Initial standards document
- Based on Intelligence Analytics reference implementation
- Defined critical, important, and nice-to-have requirements
