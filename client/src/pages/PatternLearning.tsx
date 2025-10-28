import { MetricCard } from "@/components/MetricCard";
import { PatternNetwork } from "@/components/PatternNetwork";
import { TopPatternsList } from "@/components/TopPatternsList";
import { RealtimeChart } from "@/components/RealtimeChart";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { StatusLegend } from "@/components/StatusLegend";
import { PatternFilters } from "@/components/PatternFilters";
import { ExportButton } from "@/components/ExportButton";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, TrendingUp, Award, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

// TypeScript interfaces for API responses
interface PatternSummary {
  totalPatterns: number;
  newPatternsToday: number;
  avgQualityScore: number;
  activeLearningCount: number;
}

interface PatternTrend {
  period: string;
  manifestsGenerated: number;
  avgPatternsPerManifest: number;
  avgQueryTimeMs: number;
}

interface PatternPerformance {
  generationSource: string;
  totalManifests: number;
  avgTotalMs: number;
  avgPatterns: number;
  fallbackCount: number;
  avgPatternQueryMs: number;
  avgInfraQueryMs: number;
}

interface QualityTrend {
  period: string;
  avgQuality: number;
  manifestCount: number;
}

interface Pattern {
  id: string;
  name: string;
  description: string;
  quality: number;
  usage: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number; // Actual percentage change (e.g., +15, -5)
  category: string;
  language?: string | null;
}

export default function PatternLearning() {
  const [selectedPattern, setSelectedPattern] = useState<any>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [patternType, setPatternType] = useState('all');
  const [minQuality, setMinQuality] = useState(0);
  const [minUsage, setMinUsage] = useState(0);

  // Time range state
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Fetch pattern summary metrics with 30-second polling
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery<PatternSummary>({
    queryKey: [`http://localhost:3000/api/intelligence/patterns/summary?timeWindow=${timeRange}`],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch pattern discovery trends with 60-second polling
  const { data: discoveryData, isLoading: discoveryLoading } = useQuery<PatternTrend[]>({
    queryKey: [`http://localhost:3000/api/intelligence/patterns/trends?timeWindow=${timeRange}`],
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  // Fetch pattern quality trends with 60-second polling
  const { data: qualityData, isLoading: qualityLoading } = useQuery<QualityTrend[]>({
    queryKey: [`http://localhost:3000/api/intelligence/patterns/quality-trends?timeWindow=${timeRange}`],
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  // Fetch pattern list with 30-second polling
  const { data: patterns, isLoading: patternsLoading, error: patternsError } = useQuery<Pattern[]>({
    queryKey: [`http://localhost:3000/api/intelligence/patterns/list?limit=50&timeWindow=${timeRange}`],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Filter patterns client-side based on filter criteria
  const filteredPatterns = useMemo(() => {
    if (!patterns) return [];

    return patterns.filter(pattern => {
      // Search filter - check name and description
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = pattern.name.toLowerCase().includes(query);
        const matchesDescription = pattern.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription) {
          return false;
        }
      }

      // Type filter
      if (patternType !== 'all' && pattern.category !== patternType) {
        return false;
      }

      // Quality filter (convert 0-1 to 0-100 percentage)
      if (pattern.quality * 100 < minQuality) {
        return false;
      }

      // Usage filter
      if (pattern.usage && pattern.usage < minUsage) {
        return false;
      }

      return true;
    });
  }, [patterns, searchQuery, patternType, minQuality, minUsage]);

  const handlePatternClick = (pattern: any) => {
    setSelectedPattern(pattern);
    setPanelOpen(true);
  };

  // Loading state
  if (summaryLoading || patternsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Database className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading pattern data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (summaryError || patternsError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Database className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <p className="text-destructive font-semibold mb-2">Failed to load pattern data</p>
          <p className="text-muted-foreground text-sm">
            {summaryError?.message || patternsError?.message || 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Pattern Learning</h1>
          <p className="text-muted-foreground">
            Discovery and evolution of {summary?.totalPatterns.toLocaleString() || '0'} code patterns
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          <ExportButton
            data={{ patterns: filteredPatterns, summary, discoveryData, qualityData }}
            filename={`pattern-learning-${timeRange}-${new Date().toISOString().split('T')[0]}`}
            disabled={!patterns}
          />
        </div>
      </div>

      {/* Status legend */}
      <StatusLegend />

      <div className="grid grid-cols-4 gap-6">
        <MetricCard
          label="Total Patterns"
          value={summary?.totalPatterns.toLocaleString() || '0'}
          icon={Database}
          status="healthy"
        />
        <MetricCard
          label="New Today"
          value={summary?.newPatternsToday.toLocaleString() || '0'}
          icon={TrendingUp}
          status="healthy"
        />
        <MetricCard
          label="Avg Quality"
          value={`${Math.round((summary?.avgQualityScore || 0) * 100)}%`}
          icon={Award}
          status={(summary?.avgQualityScore || 0) > 0.80 ? "healthy" : "warning"}
        />
        <MetricCard
          label="Active Learning"
          value={summary?.activeLearningCount.toLocaleString() || '0'}
          icon={Database}
          status="healthy"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <RealtimeChart
          title="Pattern Discovery Rate"
          data={(discoveryData || []).map(d => ({
            time: new Date(d.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            value: d.avgPatternsPerManifest
          }))}
          color="hsl(var(--chart-2))"
          showArea
        />
        <div className="space-y-4">
          {(() => {
            // Check if quality data is empty or missing
            const hasNoData = !qualityData || qualityData.length === 0;

            // Check if quality data is flat (all values close to 0.85)
            const isFlat = qualityData && qualityData.length > 0 &&
              qualityData.every(d => Math.abs(d.avgQuality - 0.85) < 0.01);

            return (
              <>
                {hasNoData && !qualityLoading && (
                  <Alert className="border-status-warning/50 bg-status-warning/10">
                    <AlertTriangle className="h-4 w-4 text-status-warning" />
                    <AlertDescription className="text-status-warning">
                      No quality score data available yet. Quality tracking service may not be configured or has no historical data.
                    </AlertDescription>
                  </Alert>
                )}
                {isFlat && !hasNoData && (
                  <Alert className="border-status-warning/50 bg-status-warning/10">
                    <AlertTriangle className="h-4 w-4 text-status-warning" />
                    <AlertDescription className="text-status-warning">
                      Quality tracking not yet enabled. Scores shown are defaults (0.85).
                      Backend update in progress to provide real quality metrics.
                    </AlertDescription>
                  </Alert>
                )}
                <RealtimeChart
                  title="Average Quality Score"
                  data={(qualityData || []).map(d => ({
                    time: new Date(d.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    value: d.avgQuality * 100  // Convert 0.85 to 85%
                  }))}
                  color="hsl(var(--chart-3))"
                />
              </>
            );
          })()}
        </div>
      </div>

      {/* Pattern Filters */}
      <PatternFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        patternType={patternType}
        onTypeChange={setPatternType}
        minQuality={minQuality}
        onQualityChange={setMinQuality}
        minUsage={minUsage}
        onUsageChange={setMinUsage}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <PatternNetwork patterns={filteredPatterns} height={500} onPatternClick={handlePatternClick} />
        </div>

        <TopPatternsList
          patterns={filteredPatterns.map(p => ({
            ...p,
            usageCount: p.usage,
            trend: p.trendPercentage // Use actual percentage from API
          }))}
          limit={10}
        />
      </div>

      <DrillDownPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedPattern?.name || "Pattern Details"}
        data={selectedPattern || {}}
        type="pattern"
      />
    </div>
  );
}
