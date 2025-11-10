# IntelligenceSavings.tsx Code Patterns Reference

## Currency Formatting Examples (✅ All Standardized)

```typescript
// ✅ CORRECT - Used consistently throughout (50+ instances)
formatCurrency(savingsMetrics?.totalSavings || 0)
formatCurrency(savingsMetrics?.dailySavings || 0)
formatCurrency(savingsMetrics?.weeklySavings || 0)
formatCurrency(savingsMetrics?.monthlySavings || 0)
formatCurrency(agent.withIntelligence.cost)
formatCurrency(agent.withoutIntelligence.cost)
formatCurrency(day.withIntelligence.cost)
formatCurrency(provider.savingsAmount)
formatCurrency(model.cost)

// ❌ NOT FOUND - No instances of manual formatting
`$${value.toFixed(2)}`  // Not used
"$" + value             // Not used
```

## Icon Sizing Examples (✅ All Standardized)

```typescript
// ✅ CORRECT - Primary icons (60+ instances)
<Activity className="h-4 w-4 text-muted-foreground" />
<CheckCircle2 className="h-4 w-4 text-muted-foreground" />
<Clock className="h-4 w-4 text-muted-foreground" />
<DollarSign className="h-4 w-4 text-muted-foreground" />
<TrendingUp className="h-4 w-4 text-muted-foreground" />
<Target className="h-4 w-4 text-muted-foreground" />
<Brain className="h-4 w-4 text-blue-600" />
<Cpu className="h-4 w-4 text-gray-600" />
<Zap className="h-4 w-4 text-green-600" />
<Database className="h-4 w-4 text-gray-600" />

// ✅ CORRECT - Emphasis icons
<Lightbulb className="h-5 w-5 text-blue-500" />

// ✅ CORRECT - Decorative dots
<div className="w-3 h-3 rounded-full bg-blue-500"></div>
```

## Grid Layout Examples (✅ All Standardized)

```typescript
// ✅ CORRECT - 4-column responsive grid (most common)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Intelligence Operations metrics (3 cards) */}
  {/* Cost Savings Breakdown metrics (5 cards) */}
</div>

// ✅ CORRECT - 2-column responsive grid
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  {/* Token Usage Comparison */}
  {/* Compute Usage Comparison */}
</div>

// ✅ CORRECT - 5-column summary grid
<div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
  {/* Model summary cards */}
</div>

// ✅ CORRECT - 3-column efficiency metrics
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {/* Efficiency percentages */}
</div>
```

## Section Pattern with Custom Headers (⚠️ Cannot Use DashboardSection)

### Pattern 1: Badge in Header
```typescript
// Lines 275-332
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <CardTitle>Intelligence Operations</CardTitle>
      <Badge variant="outline" className="text-xs">Real-time</Badge>
    </div>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Nested metric cards */}
    </div>
  </CardContent>
</Card>

// Why not DashboardSection?
// DashboardSection.title expects string, not ReactNode with Badge
```

### Pattern 2: Tooltip in Header
```typescript
// Lines 335-419
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <CardTitle>Cost Savings Breakdown</CardTitle>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <p className="text-xs">
            <strong>Methodology:</strong> Savings calculated by comparing...
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Nested metric cards */}
    </div>
  </CardContent>
</Card>

// Why not DashboardSection?
// DashboardSection doesn't support inline Tooltip icons in header
```

### Pattern 3: Icon in Header + Custom Background
```typescript
// Lines 528-597
<Card className="col-span-full bg-blue-500/5 border-blue-500/20">
  <CardHeader className="pb-3">
    <CardTitle className="text-base flex items-center gap-2">
      <Lightbulb className="h-5 w-5 text-blue-500" />
      How We Calculate Token Savings
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-4">
      {/* Explanation content */}
    </div>
  </CardContent>
</Card>

// Why not DashboardSection?
// DashboardSection doesn't support:
// 1. Icon in title
// 2. Custom background colors (bg-blue-500/5)
// 3. Custom border colors (border-blue-500/20)
```

## Compact Metric Card Pattern (⚠️ Intentionally Non-Standard)

```typescript
// Current pattern used 13+ times (Lines 284-329, 353-416)
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Total Savings</CardTitle>
    <DollarSign className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">
      {formatCurrency(savingsMetrics?.totalSavings || 0)}
    </div>
    <p className="text-xs text-muted-foreground">
      Total cost savings achieved
    </p>
  </CardContent>
</Card>

// Standard MetricCard would be:
<MetricCard
  label="Total Savings"
  value={formatCurrency(savingsMetrics?.totalSavings || 0)}
  icon={DollarSign}
  tooltip="Total cost savings achieved"
/>

// But this would result in:
// - Larger cards (text-4xl instead of text-2xl)
// - Description hidden in tooltip (worse for financial data)
// - Icon in colored background box (unnecessary)
// - Less information density

// Decision: Keep compact pattern for financial metrics
```

## Other Well-Structured Patterns

### Expandable Table Rows (Lines 720-804)
```typescript
<tr
  className={`cursor-pointer ${index % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/50 hover:bg-muted/70"}`}
  onClick={() => toggleRow(day.date)}
>
  <td className="p-3">
    <div className="flex items-center gap-2">
      {expandedRows.has(day.date) ? (
        <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
      <span className="font-medium">{new Date(day.date).toLocaleDateString()}</span>
    </div>
  </td>
  {/* More cells */}
</tr>

{/* Expanded detail row */}
{expandedRows.has(day.date) && (
  <tr className="bg-muted/30 border-t-2 border-muted-foreground/20">
    <td colSpan={6} className="p-6">
      {/* Detailed breakdown */}
    </td>
  </tr>
)}

// ✅ Well implemented - no changes needed
```

### Sortable Table Headers (Lines 1277-1378)
```typescript
const [sortColumn, setSortColumn] = useState<keyof UnifiedModelData | 'usagePercentage'>('cost');
const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

const handleSort = (column: keyof UnifiedModelData | 'usagePercentage') => {
  if (sortColumn === column) {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  } else {
    setSortColumn(column);
    setSortDirection('desc');
  }
};

<th
  className="text-left p-3 cursor-pointer hover:bg-muted/80"
  onClick={() => handleSort('model')}
>
  <div className="flex items-center gap-1">
    Model
    {sortColumn === 'model' && (
      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
    )}
  </div>
</th>

// ✅ Well implemented - no changes needed
```

### Progress Bars with Color Coding (Lines 1000-1016)
```typescript
{providerSavings?.map((provider, index) => {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-cyan-500',
  ];
  const color = colors[index % colors.length];

  return (
    <div key={provider.providerId} className="space-y-2">
      <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${color}`}></div>
          <span className="font-medium">{provider.providerName}</span>
        </div>
        <span className="font-bold">{formatCurrency(provider.savingsAmount)}</span>
      </div>
      <Progress value={provider.percentageOfTotal} className="h-2" />
    </div>
  );
})}

// ✅ Well implemented - no changes needed
```

## Summary

All patterns are either:
1. ✅ Already standardized (currency, icons, grids)
2. ⚠️ Intentionally custom (compact cards, custom headers)
3. ✅ Well-structured (tables, sorting, expansion)

**No refactoring required - component is production-ready.**
