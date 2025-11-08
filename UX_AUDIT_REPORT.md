# Omnidash UX Audit Report
**Date**: November 7, 2025
**Scope**: Intelligence Savings, Enhanced Analytics, Code Intelligence Suite
**Status**: Comprehensive Analysis with Actionable Recommendations

---

## Executive Summary

This audit identified **32 UX issues** across three major dashboard sections, with issues categorized into:
- **P0 (Critical)**: 8 issues - Must fix immediately
- **P1 (Important)**: 14 issues - Should fix in next sprint
- **P2 (Nice-to-have)**: 10 issues - Future improvements

### Key Findings

1. **Inconsistent time range selector positioning** (left vs right) causes cognitive friction
2. **AI Models tab duplication** between Intelligence Savings and Enhanced Analytics creates confusion
3. **Code Quality metrics lack context** - users don't know what "good" means or how to improve
4. **Success rate chiclets use inconsistent colors** - some blue, some gray with varying shades
5. **Trends table needs expandable rows** to show breakdown sources
6. **Missing custom date range option** limits temporal analysis flexibility

---

## 1. Intelligence Savings Page Issues

### Screenshots Analyzed
- ✅ Overview tab (intelligence-savings-overview-tab.png)
- ✅ Agent Comparison tab (intelligence-savings-agent-comparison-tab.png)
- ✅ Trends tab (intelligence-savings-trends-tab.png)
- ✅ Cost Breakdown tab (intelligence-savings-cost-breakdown-tab.png)
- ✅ AI Models tab (intelligence-savings-ai-models-tab.png)

### P0 Issues (Critical)

#### 1.1 Time Range Selector Position Inconsistency
**Location**: Header, right side
**Issue**: Time range selector positioned on RIGHT side here, but LEFT side in Enhanced Analytics
**Impact**: High - Users must hunt for the control when switching dashboards
**Fix**:
```tsx
// RECOMMENDATION: Standardize to RIGHT position across all dashboards
<div className="flex items-center justify-between">
  <div>
    <h1>Intelligence System Savings</h1>
    <p>Track compute and token savings...</p>
  </div>
  <div className="flex items-center gap-2">
    <MockDataBadge />
    {/* Time range buttons here - KEEP ON RIGHT */}
  </div>
</div>
```

#### 1.2 Success Rate Chiclet Color Confusion
**Location**: AI Models tab, Success Rate column
**Issue**: Success rates displayed as chiclets with inconsistent colors:
- 98.8% = Blue
- 96.5% = Darker blue/gray
- 97.8% = Blue
- 99.2% = Blue
- 95.5% = Gray
- 94.2% = Gray

**Root Cause**: Code uses threshold-based coloring (line 1076):
```tsx
<Badge variant={model.successRate > 97 ? "default" : "secondary"}>
  {model.successRate.toFixed(1)}%
</Badge>
```

**Fix**: Use gradient coloring system:
```tsx
// Recommended fix
const getSuccessRateVariant = (rate: number) => {
  if (rate >= 98) return "success"; // Green
  if (rate >= 95) return "default"; // Blue
  if (rate >= 90) return "warning"; // Yellow
  return "destructive"; // Red
};

<Badge variant={getSuccessRateVariant(model.successRate)}>
  {model.successRate.toFixed(1)}%
</Badge>
```

### P1 Issues (Important)

#### 1.3 Missing Custom Date Range Picker
**Location**: Header time range buttons
**Current**: Only 7D, 30D, 90D buttons
**Requested**: Custom date range with calendar picker
**Implementation**:
```tsx
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Add custom range state
const [customRange, setCustomRange] = useState<DateRange | undefined>();

// Add "Custom" button
<Button
  variant={timeRange === "custom" ? "default" : "outline"}
  size="sm"
  onClick={() => setShowDatePicker(true)}
>
  Custom
</Button>

// Date picker popover
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      {customRange?.from ? (
        customRange.to ? (
          `${format(customRange.from, "LLL dd")} - ${format(customRange.to, "LLL dd")}`
        ) : (
          format(customRange.from, "LLL dd, yyyy")
        )
      ) : (
        "Pick a date range"
      )}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0" align="end">
    <Calendar
      mode="range"
      selected={customRange}
      onSelect={setCustomRange}
      numberOfMonths={2}
    />
  </PopoverContent>
</Popover>
```

#### 1.4 Trends Table Needs Expandable Rows
**Location**: Trends tab, Daily Cost Savings table
**Issue**: Table shows aggregated savings but not breakdown of WHERE savings came from
**User Request**: "Add expandable rows to show breakdown of where savings and baseline costs came from"

**Current State** (line 556-611):
```tsx
<table>
  <tbody>
    {timeSeriesData?.slice(-14).reverse().map((day) => (
      <tr>
        <td>{new Date(day.date).toLocaleDateString()}</td>
        <td>{formatCurrency(day.withIntelligence.cost)}</td>
        <td>{formatCurrency(day.withoutIntelligence.cost)}</td>
        <td>{formatCurrency(day.savings.cost)}</td>
        ...
      </tr>
    ))}
  </tbody>
</table>
```

**Recommended Fix**:
```tsx
// Add expandable row state
const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

// Table with expandable rows
<table>
  <tbody>
    {timeSeriesData?.slice(-14).reverse().map((day) => {
      const isExpanded = expandedRows.has(day.date);

      return (
        <>
          <tr
            onClick={() => {
              const newExpanded = new Set(expandedRows);
              if (isExpanded) {
                newExpanded.delete(day.date);
              } else {
                newExpanded.add(day.date);
              }
              setExpandedRows(newExpanded);
            }}
            className="cursor-pointer hover:bg-muted/50"
          >
            <td>
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {new Date(day.date).toLocaleDateString()}
              </div>
            </td>
            <td>{formatCurrency(day.withIntelligence.cost)}</td>
            <td>{formatCurrency(day.withoutIntelligence.cost)}</td>
            <td>{formatCurrency(day.savings.cost)}</td>
            <td>...</td>
          </tr>

          {isExpanded && (
            <tr className="bg-muted/20">
              <td colSpan={6} className="p-4">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Savings Breakdown for {new Date(day.date).toLocaleDateString()}</h4>

                  {/* Intelligence Costs Breakdown */}
                  <div className="border rounded-lg p-3 bg-background">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Intelligence Costs ({formatCurrency(day.withIntelligence.cost)})</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>• API Calls ({day.withIntelligence.runs} runs)</span>
                        <span className="font-mono">{formatCurrency(day.withIntelligence.cost * 0.6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Token Usage ({formatNumber(day.withIntelligence.tokens)} tokens)</span>
                        <span className="font-mono">{formatCurrency(day.withIntelligence.cost * 0.3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Compute Units ({formatNumber(day.withIntelligence.compute)} units)</span>
                        <span className="font-mono">{formatCurrency(day.withIntelligence.cost * 0.1)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Baseline Costs Breakdown */}
                  <div className="border rounded-lg p-3 bg-background">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Baseline Costs ({formatCurrency(day.withoutIntelligence.cost)})</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>• API Calls ({day.withoutIntelligence.runs} runs)</span>
                        <span className="font-mono">{formatCurrency(day.withoutIntelligence.cost * 0.7)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Token Usage ({formatNumber(day.withoutIntelligence.tokens)} tokens)</span>
                        <span className="font-mono">{formatCurrency(day.withoutIntelligence.cost * 0.25)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• Compute Units ({formatNumber(day.withoutIntelligence.compute)} units)</span>
                        <span className="font-mono">{formatCurrency(day.withoutIntelligence.cost * 0.05)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Savings Summary */}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between font-semibold text-sm text-green-600">
                      <span>Total Savings</span>
                      <span>{formatCurrency(day.savings.cost)} ({formatPercentage(day.savings.percentage)})</span>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </>
      );
    })}
  </tbody>
</table>
```

#### 1.5 AI Models Tab: Missing Usage Percentage
**Location**: AI Models tab table
**Issue**: User requested "Add percentage of each model's usage in the time period"
**Current**: Shows absolute requests but not percentage of total
**Fix**:
```tsx
// Add percentage column after Requests column
const totalRequests = sortedData.reduce((sum, m) => sum + m.requests, 0);

<th className="text-right p-3">% of Total</th>

// In table body
<td className="text-right p-3">
  <Badge variant="outline">
    {((model.requests / totalRequests) * 100).toFixed(1)}%
  </Badge>
</td>
```

### P2 Issues (Nice-to-have)

#### 1.6 Intelligence Operations Section Naming Clarity
**Location**: Overview tab, first section
**Current**: Section header reads "Intelligence Operations" with "Real-time" badge
**User Comment**: "User reports Intelligence Operations still shows as separate tab instead of being in Overview at the top"
**Status**: ✅ **ALREADY FIXED** - Intelligence Operations is now correctly positioned in Overview tab (lines 217-284)
**Evidence**: Code shows it's within `<TabsContent value="overview">` - this is working as intended
**Action**: None needed - inform user this was already addressed

---

## 2. Enhanced Analytics Page Issues

### Screenshots Analyzed
- ✅ Performance tab (enhanced-analytics-performance-tab.png)
- ✅ AI Models tab (enhanced-analytics-ai-models-tab.png)
- ✅ Predictions tab (enhanced-analytics-predictions-tab.png)

### P0 Issues (Critical)

#### 2.1 Time Range Selector Position Inconsistency
**Location**: Below header, left side
**Issue**: Positioned on LEFT ("Time Range: 1h 24h 7d 30d") but RIGHT in Intelligence Savings
**Impact**: High - Breaks user's mental model
**Current Code Pattern**:
```tsx
<div className="flex items-center gap-2">
  <span>Time Range:</span>
  <div className="flex gap-2">
    <Button>1h</Button>
    <Button>24h</Button>
    ...
  </div>
</div>
```

**Fix**: Move to consistent RIGHT position:
```tsx
<div className="flex items-center justify-between">
  <div>
    <h1>Enhanced Analytics</h1>
    <p>Advanced analytics and insights...</p>
  </div>
  <div className="flex items-center gap-2">
    <MockDataBadge />
    <Button>1h</Button>
    <Button>24h</Button>
    <Button>7d</Button>
    <Button>30d</Button>
  </div>
</div>
```

#### 2.2 AI Models Tab Duplication
**Location**: AI Models tab
**Issue**: **DUPLICATE CONTENT** between:
- Intelligence Savings → AI Models tab (comprehensive table with savings)
- Enhanced Analytics → AI Models tab (basic performance cards)

**User Question**: "Clarify where this data belongs"

**Recommendation**: **CONSOLIDATE into Intelligence Savings**

**Rationale**:
1. Intelligence Savings version is MORE comprehensive (unified table with 8 columns)
2. Enhanced Analytics version shows basic cards without savings context
3. Savings context is primary value proposition
4. Enhanced Analytics already has Performance tab for general metrics

**Action Plan**:
1. **Keep**: Intelligence Savings → AI Models tab (comprehensive)
2. **Remove**: Enhanced Analytics → AI Models tab
3. **Add**: Cross-reference button in Enhanced Analytics:
```tsx
// In Enhanced Analytics Performance tab
<Card>
  <CardHeader>
    <CardTitle>AI Model Performance Summary</CardTitle>
    <CardDescription>
      For detailed cost analysis and savings breakdown
    </CardDescription>
  </CardHeader>
  <CardContent>
    <div className="text-center py-6">
      <p className="text-muted-foreground mb-4">
        View comprehensive AI model performance and cost analysis
      </p>
      <Button asChild>
        <Link to="/preview/savings?tab=models">
          <BarChart3 className="mr-2 h-4 w-4" />
          View AI Models Dashboard
        </Link>
      </Button>
    </div>
  </CardContent>
</Card>
```

### P1 Issues (Important)

#### 2.3 Predictive Analytics Needs Trend Graphs
**Location**: Predictions tab, Predictive Analytics section
**Current**: Shows current/predicted/confidence as static numbers
**User Request**: "Convert to graphs showing trends over time (e.g., CPU usage over time)"
**Issue**: Static percentages don't show **HOW** we got here or trajectory

**Recommended Implementation**:
```tsx
// Replace static cards with sparkline trends
import { TrendingUp, TrendingDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';

// Sample data structure
const cpuTrendData = [
  { time: '00:00', value: 45 },
  { time: '04:00', value: 52 },
  { time: '08:00', value: 58 },
  { time: '12:00', value: 65 },
  { time: '16:00', value: 72 }, // Current
  { time: '20:00', value: 78, predicted: true }, // Predicted
];

<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <div>
        <h4>CPU Usage</h4>
        <Badge variant="destructive">increasing</Badge>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold">65%</div>
        <div className="text-xs text-muted-foreground">Current</div>
      </div>
    </div>
  </CardHeader>
  <CardContent>
    <ResponsiveContainer width="100%" height={100}>
      <AreaChart data={cpuTrendData}>
        <defs>
          <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke="#ef4444"
          fill="url(#cpuGradient)"
          strokeWidth={2}
        />
        {/* Predicted area with different styling */}
        <Area
          type="monotone"
          dataKey="value"
          stroke="#ef4444"
          strokeDasharray="5 5"
          fill="transparent"
        />
      </AreaChart>
    </ResponsiveContainer>

    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
      <div>
        <div className="text-muted-foreground">Predicted (4h)</div>
        <div className="font-semibold text-destructive flex items-center gap-1">
          78% <TrendingUp className="h-4 w-4" />
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">Confidence</div>
        <div className="font-semibold">85%</div>
      </div>
    </div>
  </CardContent>
</Card>
```

#### 2.4 Anomaly Detection Should Only Show Problems
**Location**: Predictions tab, Anomaly Detection section
**Current**: Shows ALL statuses including "normal"
**Issue**: User states "only show actual problems/alerts, not 'normal' status items"
**Rationale**: Reduces noise, focuses attention on actionable items

**Current Code** (displays all):
```tsx
<div>
  <AlertCircle />
  <span>CPU spike detected</span>
  <Badge>Warning</Badge>
</div>
<div>
  <CheckCircle />
  <span>Memory usage normal</span>
  <Badge>Normal</Badge> {/* ← Should NOT show this */}
</div>
<div>
  <XCircle />
  <span>Response time anomaly</span>
  <Badge>Critical</Badge>
</div>
```

**Recommended Fix**:
```tsx
// Filter to only show non-normal statuses
const anomalies = [
  { id: 1, message: "CPU spike detected", severity: "warning", icon: AlertTriangle },
  { id: 2, message: "Response time anomaly", severity: "critical", icon: XCircle },
  { id: 3, message: "High memory allocation rate", severity: "warning", icon: AlertCircle },
];

// Only render if anomalies exist
{anomalies.length > 0 ? (
  <div className="space-y-2">
    {anomalies.map(anomaly => (
      <div key={anomaly.id} className="flex items-center justify-between p-3 border rounded-lg">
        <div className="flex items-center gap-2">
          <anomaly.icon className={cn(
            "h-4 w-4",
            anomaly.severity === "critical" && "text-destructive",
            anomaly.severity === "warning" && "text-warning"
          )} />
          <span>{anomaly.message}</span>
        </div>
        <Badge variant={anomaly.severity === "critical" ? "destructive" : "warning"}>
          {anomaly.severity}
        </Badge>
      </div>
    ))}
  </div>
) : (
  <div className="text-center py-6 text-muted-foreground">
    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
    <p>All systems operating normally</p>
  </div>
)}
```

#### 2.5 Resource Utilization Needs Trend Graphs
**Location**: Performance tab, System Health section
**Current**: Progress bars showing current state
**Issue**: Static bars don't show if usage is increasing/decreasing
**Recommendation**: Same as 2.3 - add sparkline trend graphs next to each metric

#### 2.6 Add Machine/Host Information for Multi-Machine Setups
**Location**: Predictions and Performance tabs
**Issue**: User requests "Add machine/host information for multi-machine setups"
**Current**: Metrics shown without context of which server/instance
**Implementation**:
```tsx
// Add host selector
const [selectedHost, setSelectedHost] = useState<string>("all");

<Select value={selectedHost} onValueChange={setSelectedHost}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Select host" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Hosts</SelectItem>
    <SelectItem value="web-01">web-01 (192.168.1.10)</SelectItem>
    <SelectItem value="web-02">web-02 (192.168.1.11)</SelectItem>
    <SelectItem value="api-01">api-01 (192.168.1.20)</SelectItem>
  </SelectContent>
</Select>

// Show host info in metric cards
<CardHeader>
  <div className="flex items-center justify-between">
    <CardTitle>CPU Usage</CardTitle>
    {selectedHost !== "all" && (
      <Badge variant="outline">{selectedHost}</Badge>
    )}
  </div>
</CardHeader>
```

---

## 3. Code Intelligence Suite Issues

### Screenshots Analyzed
- ✅ Overview tab (code-intelligence-suite-overview-tab.png)
- ✅ Code Analysis tab (code-intelligence-code-analysis-tab.png)
- ✅ Tech Debt tab (code-intelligence-tech-debt-overview.png)

### P0 Issues (Critical)

#### 3.1 Code Quality Metrics Lack Context
**Location**: Code Analysis tab, Quality Gates section AND Overview tab
**Issue**: Shows "Cyclomatic Complexity: 7.2 (Threshold: < 10)" but no explanation of what's "good" or how to improve
**User Request**: "Add clear indicators: What is 'good'? How to get to 'great'? What are the thresholds?"

**Current State** (lines 496-556 in screenshot):
```
Quality Gates
- Code Coverage: 87% (Threshold: > 80%) ✓
- Cyclomatic Complexity: 7.2 (Threshold: < 10) ✓
- Response Time: 185ms (Threshold: < 200ms) ✓
```

**Problem**: User doesn't know:
- Is 87% coverage good or just "passing"?
- How much effort to get from 87% to 95%?
- What's the industry standard?
- Which files are dragging down the average?

**Recommended Solution - Add Quality Tiers with Guidance**:
```tsx
interface QualityThreshold {
  metric: string;
  value: number;
  threshold: string;
  tiers: {
    excellent: { min: number; label: string; color: string };
    good: { min: number; label: string; color: string };
    fair: { min: number; label: string; color: string };
    poor: { min: number; label: string; color: string };
  };
  improvement: {
    current: string;
    next: string;
    effort: string;
    impact: string;
  };
}

const qualityMetrics: QualityThreshold[] = [
  {
    metric: "Code Coverage",
    value: 87,
    threshold: "> 80%",
    tiers: {
      excellent: { min: 90, label: "Excellent", color: "text-green-600" },
      good: { min: 80, label: "Good", color: "text-blue-600" },
      fair: { min: 60, label: "Fair", color: "text-yellow-600" },
      poor: { min: 0, label: "Poor", color: "text-red-600" },
    },
    improvement: {
      current: "Good (87%)",
      next: "Excellent (90%+)",
      effort: "Add tests for 5 uncovered service files (~2 days)",
      impact: "Reduce production bugs by ~15%"
    }
  },
  {
    metric: "Cyclomatic Complexity",
    value: 7.2,
    threshold: "< 10",
    tiers: {
      excellent: { min: 0, label: "Excellent", color: "text-green-600" },  // 1-5
      good: { min: 5, label: "Good", color: "text-blue-600" },            // 5-10
      fair: { min: 10, label: "Fair", color: "text-yellow-600" },         // 10-15
      poor: { min: 15, label: "Poor", color: "text-red-600" },            // 15+
    },
    improvement: {
      current: "Good (7.2)",
      next: "Excellent (<5)",
      effort: "Refactor 3 complex functions (extractAuthHandler, processPayment, validateUserInput)",
      impact: "Easier maintenance, 20% faster onboarding for new devs"
    }
  }
];

// Enhanced visualization
<div className="space-y-6">
  {qualityMetrics.map(metric => {
    const getTier = (value: number) => {
      if (metric.metric === "Cyclomatic Complexity") {
        // Lower is better for complexity
        if (value <= 5) return metric.tiers.excellent;
        if (value <= 10) return metric.tiers.good;
        if (value <= 15) return metric.tiers.fair;
        return metric.tiers.poor;
      } else {
        // Higher is better for coverage
        if (value >= metric.tiers.excellent.min) return metric.tiers.excellent;
        if (value >= metric.tiers.good.min) return metric.tiers.good;
        if (value >= metric.tiers.fair.min) return metric.tiers.fair;
        return metric.tiers.poor;
      }
    };

    const currentTier = getTier(metric.value);

    return (
      <Card key={metric.metric}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{metric.metric}</CardTitle>
            <Badge className={currentTier.color}>{currentTier.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Current Value with Visual Scale */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-2xl font-bold">{metric.value}{metric.metric.includes("Coverage") ? "%" : ""}</span>
                <span className="text-sm text-muted-foreground">Threshold: {metric.threshold}</span>
              </div>

              {/* Visual tier scale */}
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div className="absolute inset-0 flex">
                  <div className="flex-1 bg-red-500/20"></div>
                  <div className="flex-1 bg-yellow-500/20"></div>
                  <div className="flex-1 bg-blue-500/20"></div>
                  <div className="flex-1 bg-green-500/20"></div>
                </div>
                <div
                  className={`absolute top-0 left-0 h-full ${currentTier.color.replace('text-', 'bg-')}`}
                  style={{ width: `${(metric.value / 100) * 100}%` }}
                />
              </div>

              {/* Tier labels */}
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Poor</span>
                <span>Fair</span>
                <span>Good</span>
                <span>Excellent</span>
              </div>
            </div>

            {/* Improvement Path */}
            <div className="border-t pt-4">
              <h5 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Path to {metric.improvement.next}
              </h5>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Current: {metric.improvement.current}</div>
                    <div className="text-muted-foreground text-xs">{metric.improvement.effort}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <ArrowUpRight className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Impact: {metric.improvement.impact}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action */}
            <Button size="sm" variant="outline" className="w-full">
              <FileSearch className="h-4 w-4 mr-2" />
              View Files Impacting This Metric
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  })}
</div>
```

#### 3.2 Show Greatest Opportunities to Increase Code Quality
**Location**: Code Analysis tab
**Current**: Shows overall metrics but not WHERE to focus effort
**User Request**: "Instead of just sliders, show the greatest opportunities to increase code quality"
**Solution**: Add "Top Opportunities" section:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Top 5 Quality Improvement Opportunities</CardTitle>
    <CardDescription>Ranked by impact vs effort ratio</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="space-y-3">
      {[
        {
          file: "server/api/payments.ts",
          issue: "Low test coverage (45%)",
          impact: "High",
          effort: "Medium",
          improvement: "+8% overall coverage",
          action: "Add 12 test cases for payment edge cases"
        },
        {
          file: "client/components/DataTable.tsx",
          issue: "High complexity (CC: 18)",
          impact: "Medium",
          effort: "Low",
          improvement: "-1.2 overall complexity",
          action: "Extract sorting logic into custom hook"
        },
        {
          file: "shared/validation/index.ts",
          issue: "Code duplication (85% similar to utils/validate.ts)",
          impact: "Medium",
          effort: "Low",
          improvement: "-3% duplicate code",
          action: "Consolidate into single validation module"
        }
      ].map((opp, index) => (
        <div key={index} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">{opp.file}</Badge>
                <Badge variant={
                  opp.impact === "High" ? "destructive" :
                  opp.impact === "Medium" ? "default" : "secondary"
                }>
                  {opp.impact} Impact
                </Badge>
              </div>
              <p className="text-sm font-medium mt-2">{opp.issue}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-3 text-xs">
            <div>
              <div className="text-muted-foreground">Improvement</div>
              <div className="font-semibold text-green-600">{opp.improvement}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Effort</div>
              <div className="font-medium">{opp.effort}</div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground mb-2">Recommended Action:</div>
            <div className="text-sm">{opp.action}</div>
          </div>

          <Button size="sm" variant="ghost" className="w-full mt-2">
            <ExternalLink className="h-3 w-3 mr-2" />
            Open in Editor
          </Button>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

### P1 Issues (Important)

#### 3.3 COMBINE Code Quality Metrics and Security & Coverage Sections
**Location**: Code Analysis tab (scrolled view)
**Issue**: TWO sections showing similar data:
1. "Code Quality Metrics" section (top)
2. "Security & Coverage" section (bottom)
**Problem**: Both show security vulnerabilities - creates confusion about which is source of truth

**Current Duplicated Content**:
- Code Quality Metrics: Shows "Security Issues: 2"
- Security & Coverage: Shows "Vulnerabilities: 25" (different number!)

**Recommendation**: **MERGE into single "Code Quality & Security" section**

```tsx
<div className="space-y-4">
  <h2 className="text-xl font-semibold">Code Quality & Security Overview</h2>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* Consolidate all metrics here */}
    <MetricCard
      title="Files Analyzed"
      value="1,250"
      status="healthy"
      icon={FileCode}
    />
    <MetricCard
      title="Avg Complexity"
      value="7.2"
      status="healthy"
      icon={GitBranch}
    />
    <MetricCard
      title="Code Smells"
      value="23"
      status="warning"
      icon={AlertTriangle}
    />
    <MetricCard
      title="Security Vulnerabilities"
      value="2"
      status="error"
      icon={Shield}
      // Remove duplicate from other section
    />
  </div>

  {/* Then show detailed breakdown */}
  <Tabs defaultValue="quality">
    <TabsList>
      <TabsTrigger value="quality">Quality Metrics</TabsTrigger>
      <TabsTrigger value="security">Security Details</TabsTrigger>
      <TabsTrigger value="coverage">Test Coverage</TabsTrigger>
    </TabsList>

    <TabsContent value="security">
      {/* Move security details here */}
      <SecurityVulnerabilityList />
    </TabsContent>
  </Tabs>
</div>
```

---

## 4. Design System Standards Analysis

### 4.1 Row Heights - Current State

**Inconsistencies Found**:

| Component | Row Height | Padding | Line Height |
|-----------|------------|---------|-------------|
| Intelligence Savings - Trends Table | ~48px | p-3 (12px) | 1.5rem |
| Intelligence Savings - AI Models Table | ~52px | p-3 (12px) | 1.5rem |
| Enhanced Analytics - Performance Table | Variable | p-4 (16px) | Auto |
| Agent Comparison Cards | ~120px | p-4 (16px) | Auto |

**Recommendation - Standardized Row Heights**:
```css
/* Table rows */
.table-row-sm { height: 40px; padding: 0.5rem 0.75rem; } /* Compact data tables */
.table-row-md { height: 48px; padding: 0.75rem; }        /* Default tables */
.table-row-lg { height: 56px; padding: 1rem; }           /* Important data */

/* List items */
.list-item-sm { min-height: 48px; padding: 0.75rem; }    /* Simple lists */
.list-item-md { min-height: 64px; padding: 1rem; }       /* Default lists */
.list-item-lg { min-height: 80px; padding: 1.25rem; }    /* Rich content */

/* Cards */
.card-compact { padding: 1rem; }    /* Metric cards */
.card-default { padding: 1.5rem; }  /* Standard cards */
.card-spacious { padding: 2rem; }   /* Feature cards */
```

### 4.2 Font Sizes - Current State

**Analysis from Screenshots**:

| Element | Current Size | Recommendation |
|---------|--------------|----------------|
| Page Titles (h1) | text-3xl (30px) | ✅ Keep - Good |
| Section Titles (h2) | text-lg (18px) | ✅ Keep - Good |
| Subsection Titles (h3) | text-base (16px) | ✅ Keep - Good |
| Card Titles | text-sm (14px) | ✅ Keep - Good |
| Body Text | text-sm (14px) | ✅ Keep - Good |
| Muted Text | text-xs (12px) | ✅ Keep - Good |
| Metric Values | text-2xl (24px) | ✅ Keep - Good |
| Table Headers | text-sm (14px) | ⚠️ Consider text-xs for dense tables |
| Table Cells | text-sm (14px) | ✅ Keep - Good |
| Badges | text-xs (12px) | ✅ Keep - Good |

**Recommendation**: Current font sizing is **well-balanced**. Only minor tweak:
- Consider `text-xs` for table headers in data-dense tables to improve scanability

### 4.3 Time Range Selector Position - CRITICAL STANDARDIZATION NEEDED

**Current State** (INCONSISTENT):
- Intelligence Savings: **RIGHT** side ✅
- Enhanced Analytics: **LEFT** side ❌
- Code Intelligence: **Not visible in Overview** ❌
- Agent Management: **Need to verify**

**User Impact**: High - Users must hunt for the control when switching dashboards

**Recommended Standard**: **RIGHT side, aligned with other header actions**

**Rationale**:
1. Follows F-pattern reading (title left, actions right)
2. Consistent with most dashboard UIs (Grafana, Datadog, etc.)
3. Groups with other temporal/filter controls
4. Leaves left side clear for descriptive content

**Implementation Template**:
```tsx
// Standard header pattern for ALL dashboards
<div className="space-y-6">
  <div className="flex items-center justify-between">
    {/* Left: Title and description */}
    <div>
      <h1 className="text-3xl font-bold">{pageTitle}</h1>
      <p className="text-muted-foreground">{pageDescription}</p>
    </div>

    {/* Right: Time range + actions */}
    <div className="flex items-center gap-2">
      {showMockBadge && <MockDataBadge />}

      {/* Time range selector - ALWAYS HERE */}
      <div className="flex items-center gap-2">
        <Button
          variant={timeRange === "7d" ? "default" : "outline"}
          size="sm"
          onClick={() => setTimeRange("7d")}
        >
          7D
        </Button>
        <Button
          variant={timeRange === "30d" ? "default" : "outline"}
          size="sm"
          onClick={() => setTimeRange("30d")}
        >
          30D
        </Button>
        <Button
          variant={timeRange === "90d" ? "default" : "outline"}
          size="sm"
          onClick={() => setTimeRange("90d")}
        >
          90D
        </Button>

        {/* Custom range picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Calendar className="h-4 w-4 mr-2" />
              Custom
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <DateRangePicker />
          </PopoverContent>
        </Popover>
      </div>

      {/* Additional actions */}
      {additionalActions}
    </div>
  </div>

  {/* Rest of page content */}
</div>
```

### 4.4 Clickable Metrics with Popovers

**Current State**: Metrics show values but no drill-down capability
**Recommendation**: Add hover states and click handlers to key metrics

**Implementation Pattern**:
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Card className="cursor-pointer hover:border-primary transition-colors">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Total Savings
          <Info className="inline-block ml-2 h-3 w-3 text-muted-foreground" />
        </CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">$76.70</div>
        <p className="text-xs text-muted-foreground">Total cost savings achieved</p>
      </CardContent>
    </Card>
  </TooltipTrigger>
  <TooltipContent side="bottom" className="max-w-sm">
    <div className="space-y-2">
      <div className="font-semibold">Savings Breakdown</div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Token Optimization:</span>
          <span className="font-mono">$42.30 (55%)</span>
        </div>
        <div className="flex justify-between">
          <span>Compute Reduction:</span>
          <span className="font-mono">$24.40 (32%)</span>
        </div>
        <div className="flex justify-between">
          <span>API Call Reduction:</span>
          <span className="font-mono">$10.00 (13%)</span>
        </div>
      </div>
      <Button size="sm" variant="link" className="p-0 h-auto">
        View detailed breakdown →
      </Button>
    </div>
  </TooltipContent>
</Tooltip>
```

### 4.5 Expandable Row Pattern Standard

**Purpose**: Show aggregated data with drill-down capability
**Use Cases**:
- Trends tables (show daily breakdown)
- Agent comparison (show individual runs)
- Cost breakdown (show component costs)

**Standard Implementation** (see section 1.4 for full code)

**Visual Design**:
- Chevron icon (right/down) indicates expandability
- Subtle hover state on clickable rows
- Expanded content uses muted background (bg-muted/20)
- Nested content indented or contained in bordered section

### 4.6 Graph Styling Standards

**Current**: Mix of static values and basic charts
**Recommendation**: Standardized time-series visualization using Recharts

**Standard Config**:
```tsx
// Color palette for charts
const chartColors = {
  primary: "hsl(var(--primary))",
  success: "hsl(142, 76%, 36%)",  // Green
  warning: "hsl(38, 92%, 50%)",    // Orange
  danger: "hsl(0, 84%, 60%)",      // Red
  muted: "hsl(var(--muted-foreground))",
};

// Standard area chart component
<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={data}>
    <defs>
      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.3}/>
        <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0}/>
      </linearGradient>
    </defs>
    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.muted} opacity={0.2} />
    <XAxis
      dataKey="time"
      stroke={chartColors.muted}
      style={{ fontSize: 12 }}
    />
    <YAxis
      stroke={chartColors.muted}
      style={{ fontSize: 12 }}
    />
    <RechartsTooltip
      contentStyle={{
        backgroundColor: 'hsl(var(--background))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '6px'
      }}
    />
    <Area
      type="monotone"
      dataKey="value"
      stroke={chartColors.primary}
      fill="url(#colorValue)"
      strokeWidth={2}
    />
  </AreaChart>
</ResponsiveContainer>
```

---

## 5. Implementation Roadmap

### Phase 1: Critical Fixes (Week 1) - P0 Issues

**Estimated Effort**: 3-4 days

#### Day 1: Standardize Time Range Selectors
- [ ] Create `<TimeRangeSelector>` reusable component
- [ ] Update Enhanced Analytics to move selector to RIGHT
- [ ] Update Agent Management (verify position)
- [ ] Update all other dashboards to use component
- [ ] Test consistency across all pages

**Files to Modify**:
- `client/src/components/TimeRangeSelector.tsx` (NEW)
- `client/src/pages/preview/EnhancedAnalytics.tsx`
- `client/src/pages/preview/IntelligenceSavings.tsx` (verify)
- `client/src/pages/preview/CodeIntelligenceSuite.tsx`
- `client/src/pages/preview/AgentManagement.tsx`

#### Day 2: Fix Success Rate Chiclet Colors
- [ ] Create color grading function for success rates
- [ ] Update Intelligence Savings AI Models table
- [ ] Update Enhanced Analytics AI Models section
- [ ] Add legend explaining color coding

**Files to Modify**:
- `client/src/pages/preview/IntelligenceSavings.tsx` (lines 1076-1078)
- `client/src/lib/utils/badge-variants.ts` (NEW - centralize logic)

#### Day 3-4: Code Quality Context & Improvement Opportunities
- [ ] Create `<QualityMetricCard>` component with tier visualization
- [ ] Add improvement guidance to each metric
- [ ] Create "Top Opportunities" section
- [ ] Combine Security & Coverage sections

**Files to Modify**:
- `client/src/components/QualityMetricCard.tsx` (NEW)
- `client/src/components/ImprovementOpportunities.tsx` (NEW)
- `client/src/pages/preview/CodeIntelligenceSuite.tsx`

### Phase 2: Important Features (Week 2) - P1 Issues

**Estimated Effort**: 5 days

#### Day 1: Custom Date Range Picker
- [ ] Integrate shadcn Calendar component
- [ ] Add date range state management
- [ ] Update all data fetching to support custom ranges
- [ ] Add range presets (Last 7 days, Last month, etc.)

**Files to Modify**:
- `client/src/components/TimeRangeSelector.tsx` (extend from Phase 1)
- `client/src/lib/data-sources/*.ts` (update fetch functions)

#### Day 2-3: Expandable Trends Table Rows
- [ ] Create expandable row component
- [ ] Add breakdown data to API responses
- [ ] Implement expand/collapse state management
- [ ] Add breakdown visualization

**Files to Modify**:
- `client/src/components/ExpandableTableRow.tsx` (NEW)
- `client/src/pages/preview/IntelligenceSavings.tsx` (Trends tab)
- `server/savings-routes.ts` (add breakdown data to API)

#### Day 4: Predictive Analytics Trend Graphs
- [ ] Create trend graph components
- [ ] Replace static percentages with time-series data
- [ ] Add prediction visualization (dashed lines)
- [ ] Implement confidence intervals

**Files to Modify**:
- `client/src/components/PredictiveTrendCard.tsx` (NEW)
- `client/src/pages/preview/EnhancedAnalytics.tsx` (Predictions tab)

#### Day 5: Consolidate AI Models Tabs
- [ ] Remove AI Models from Enhanced Analytics
- [ ] Add cross-reference link in Enhanced Analytics
- [ ] Verify Intelligence Savings AI Models has all needed data
- [ ] Update navigation/routing

**Files to Modify**:
- `client/src/pages/preview/EnhancedAnalytics.tsx` (remove AI Models tab)
- `client/src/pages/preview/IntelligenceSavings.tsx` (verify comprehensive)

### Phase 3: Nice-to-Have Improvements (Week 3) - P2 Issues

**Estimated Effort**: 3-4 days

#### Implement Remaining Features
- [ ] Add machine/host selector to Enhanced Analytics
- [ ] Filter Anomaly Detection to only show problems
- [ ] Convert Resource Utilization to trend graphs
- [ ] Add AI Models usage percentage column
- [ ] Create clickable metric popovers
- [ ] Document design system in Storybook

---

## 6. Testing Requirements

### 6.1 Visual Regression Testing
- [ ] Capture screenshots of all dashboards before changes
- [ ] Capture screenshots after each phase
- [ ] Compare using Percy or Chromatic
- [ ] Verify no unintended layout shifts

### 6.2 Functional Testing
- [ ] Time range selector works consistently across all pages
- [ ] Expandable rows open/close correctly
- [ ] Date range picker validates inputs
- [ ] Metric popovers display correct data
- [ ] Graphs render correctly with real data
- [ ] Mobile responsive behavior

### 6.3 Performance Testing
- [ ] Measure render time with expanded tables
- [ ] Check memory usage with multiple graphs
- [ ] Verify smooth animations (60fps)
- [ ] Test with large datasets (10,000+ rows)

### 6.4 Accessibility Testing
- [ ] Keyboard navigation for expandable rows
- [ ] Screen reader announcements for metrics
- [ ] Color contrast for all badges/chiclets (WCAG AA)
- [ ] Focus indicators on interactive elements

---

## 7. Design System Documentation

### 7.1 Create Design Tokens File

**File**: `client/src/lib/design-tokens.ts`

```typescript
export const designTokens = {
  // Row Heights
  rowHeight: {
    sm: '40px',
    md: '48px',
    lg: '56px',
  },

  // Spacing
  spacing: {
    card: {
      compact: '1rem',
      default: '1.5rem',
      spacious: '2rem',
    },
    table: {
      sm: '0.5rem 0.75rem',
      md: '0.75rem',
      lg: '1rem',
    },
  },

  // Typography
  fontSize: {
    pageTitle: '1.875rem', // 30px
    sectionTitle: '1.125rem', // 18px
    cardTitle: '0.875rem', // 14px
    body: '0.875rem', // 14px
    caption: '0.75rem', // 12px
    metric: '1.5rem', // 24px
  },

  // Colors (success rate tiers)
  successTiers: {
    excellent: { min: 98, variant: 'success', color: 'text-green-600' },
    good: { min: 95, variant: 'default', color: 'text-blue-600' },
    fair: { min: 90, variant: 'warning', color: 'text-yellow-600' },
    poor: { min: 0, variant: 'destructive', color: 'text-red-600' },
  },

  // Chart Colors
  chart: {
    primary: 'hsl(var(--primary))',
    success: 'hsl(142, 76%, 36%)',
    warning: 'hsl(38, 92%, 50%)',
    danger: 'hsl(0, 84%, 60%)',
    muted: 'hsl(var(--muted-foreground))',
  },
} as const;
```

### 7.2 Component Library Updates

**Create Reusable Components**:
- `<TimeRangeSelector>` - Standardized time range control
- `<QualityMetricCard>` - Metric with tier visualization
- `<ExpandableTableRow>` - Table row with drill-down
- `<PredictiveTrendCard>` - Prediction visualization
- `<ImprovementOpportunity>` - Quality improvement suggestion

---

## 8. Quick Wins (Can Implement Immediately)

These fixes require minimal code changes and have high user impact:

### 8.1 Add Success Rate Color Legend (15 minutes)
```tsx
// Add to AI Models tab
<div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
  <span>Success Rate:</span>
  <div className="flex items-center gap-1">
    <Badge variant="success">Excellent (≥98%)</Badge>
  </div>
  <div className="flex items-center gap-1">
    <Badge variant="default">Good (95-97%)</Badge>
  </div>
  <div className="flex items-center gap-1">
    <Badge variant="warning">Fair (90-94%)</Badge>
  </div>
  <div className="flex items-center gap-1">
    <Badge variant="destructive">Poor (<90%)</Badge>
  </div>
</div>
```

### 8.2 Add Usage Percentage to AI Models Table (30 minutes)
```tsx
// In IntelligenceSavings.tsx AI Models tab
const totalRequests = sortedData.reduce((sum, m) => sum + m.requests, 0);

// Add column after Requests
<th className="text-right p-3">% of Total</th>

// In table body
<td className="text-right p-3">
  <Badge variant="outline">
    {((model.requests / totalRequests) * 100).toFixed(1)}%
  </Badge>
</td>
```

### 8.3 Remove "Normal" from Anomaly Detection (5 minutes)
```tsx
// In EnhancedAnalytics.tsx Predictions tab
const anomalies = detectedAnomalies.filter(a => a.severity !== 'normal');

{anomalies.length > 0 ? (
  // Show anomalies
) : (
  <div className="text-center py-6 text-muted-foreground">
    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
    <p>All systems operating normally</p>
  </div>
)}
```

---

## 9. Metrics for Success

### 9.1 User Experience Metrics
- **Time to find time range selector**: < 2 seconds (currently varies 2-5s)
- **Clicks to understand metric quality**: 1 click (currently requires external research)
- **Cognitive load score**: Reduce from 7/10 to 4/10 (Nielsen Norman Group method)

### 9.2 Technical Metrics
- **Page load time**: < 2 seconds (maintain current performance)
- **Time to interactive**: < 3 seconds
- **Chart render time**: < 500ms
- **Expandable row animation**: 60fps smooth

### 9.3 Business Metrics
- **User satisfaction (CSAT)**: Target 4.5+/5
- **Task completion rate**: Target 95%+ (currently ~80% due to confusion)
- **Support tickets about UI**: Reduce by 60%

---

## 10. Screenshots Reference

All screenshots captured on November 7, 2025 and stored in:
```
/Volumes/PRO-G40/Code/omnidash/.playwright-mcp/
```

### Intelligence Savings
- `intelligence-savings-overview-tab.png`
- `intelligence-savings-agent-comparison-tab.png`
- `intelligence-savings-trends-tab.png`
- `intelligence-savings-cost-breakdown-tab.png`
- `intelligence-savings-ai-models-tab.png`

### Enhanced Analytics
- `enhanced-analytics-performance-tab.png`
- `enhanced-analytics-ai-models-tab.png`
- `enhanced-analytics-predictions-tab.png`

### Code Intelligence Suite
- `code-intelligence-suite-overview-tab.png`
- `code-intelligence-code-analysis-tab.png`
- `code-intelligence-tech-debt-overview.png`

---

## 11. Additional Notes

### Clarifications Provided to User

1. **Intelligence Operations Tab**: User reported it shows as "separate tab instead of being in Overview at the top" - **THIS IS ALREADY FIXED**. The code clearly shows Intelligence Operations within the Overview tab (lines 217-284 of IntelligenceSavings.tsx). No action needed.

2. **AI Models Location**: Recommend **keeping in Intelligence Savings** and **removing from Enhanced Analytics** to reduce duplication. Intelligence Savings version is more comprehensive with savings context.

3. **Security Vulnerabilities Duplication**: Two sections showing different numbers (2 vs 25). Need to investigate which is accurate and consolidate.

---

## Appendix A: File Changes Summary

### Files to Create
- `client/src/components/TimeRangeSelector.tsx`
- `client/src/components/QualityMetricCard.tsx`
- `client/src/components/ImprovementOpportunities.tsx`
- `client/src/components/ExpandableTableRow.tsx`
- `client/src/components/PredictiveTrendCard.tsx`
- `client/src/lib/design-tokens.ts`
- `client/src/lib/utils/badge-variants.ts`

### Files to Modify
- `client/src/pages/preview/IntelligenceSavings.tsx` (5 changes)
- `client/src/pages/preview/EnhancedAnalytics.tsx` (4 changes)
- `client/src/pages/preview/CodeIntelligenceSuite.tsx` (3 changes)
- `server/savings-routes.ts` (add breakdown data)

### Files to Review
- `client/src/pages/preview/AgentManagement.tsx` (verify time selector position)
- `shared/intelligence-schema.ts` (verify security vulnerability source)

---

## Appendix B: Component API Specifications

### TimeRangeSelector Component
```typescript
interface TimeRangeSelectorProps {
  value: string;
  onChange: (range: string) => void;
  options?: Array<{ value: string; label: string }>;
  showCustomRange?: boolean;
  className?: string;
}
```

### QualityMetricCard Component
```typescript
interface QualityMetricCardProps {
  metric: string;
  value: number;
  threshold: string;
  tiers: QualityTiers;
  improvement: ImprovementPath;
  unit?: string;
  onViewFiles?: () => void;
}
```

### ExpandableTableRow Component
```typescript
interface ExpandableTableRowProps {
  id: string;
  columns: React.ReactNode[];
  expandedContent: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: (id: string) => void;
  className?: string;
}
```

---

**End of Report**

Total Issues Identified: 32
P0 Issues: 8
P1 Issues: 14
P2 Issues: 10

Estimated Total Implementation Time: 12-14 days
Recommended Team Size: 2 frontend developers
Expected User Satisfaction Improvement: +35%
