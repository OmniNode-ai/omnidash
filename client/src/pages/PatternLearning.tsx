import { MetricCard } from "@/components/MetricCard";
import { PatternNetwork } from "@/components/PatternNetwork";
import { MockDataBadge } from "@/components/MockDataBadge";
import { TopPatternsList } from "@/components/TopPatternsList";
import { RealtimeChart } from "@/components/RealtimeChart";
import { DrillDownModal } from "@/components/DrillDownModal";
import { StatusLegend } from "@/components/StatusLegend";
import { PatternFilters } from "@/components/PatternFilters";
import { ExportButton } from "@/components/ExportButton";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { SectionHeader } from "@/components/SectionHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database, TrendingUp, Award, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { patternLearningSource } from "@/lib/data-sources";
import type {
  DiscoveredPattern,
  PatternSummary,
  PatternTrend,
  QualityTrend,
  Pattern,
  LanguageBreakdown,
} from "@/lib/data-sources/pattern-learning-source";

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
    queryKey: ['patterns', 'summary', timeRange],
    queryFn: () => patternLearningSource.fetchSummary(timeRange),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch pattern discovery trends with 60-second polling
  const { data: discoveryData, isLoading: discoveryLoading } = useQuery<PatternTrend[]>({
    queryKey: ['patterns', 'trends', timeRange],
    queryFn: () => patternLearningSource.fetchTrends(timeRange),
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  // Fetch pattern quality trends with 60-second polling
  const { data: qualityData, isLoading: qualityLoading } = useQuery<QualityTrend[]>({
    queryKey: ['patterns', 'quality-trends', timeRange],
    queryFn: () => patternLearningSource.fetchQualityTrends(timeRange),
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  // Fetch pattern list with 30-second polling
  const { data: patterns, isLoading: patternsLoading, error: patternsError } = useQuery<Pattern[]>({
    queryKey: ['patterns', 'list', timeRange],
    queryFn: () => patternLearningSource.fetchPatternList(50, timeRange),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Live pattern discovery via data source
  const { data: discoveryResult, isLoading: liveDiscoverLoading, error: liveDiscoverError } = useQuery({
    queryKey: ['patterns', 'discovery'],
    queryFn: () => patternLearningSource.fetchDiscovery(8),
    refetchInterval: 60000,
  });
  const liveDiscoveredPatterns = discoveryResult?.data;

  // Fetch language breakdown with 60-second polling
  const { data: languageData, isLoading: languageLoading } = useQuery<LanguageBreakdown[]>({
    queryKey: ['patterns', 'language-breakdown', timeRange],
    queryFn: () => patternLearningSource.fetchLanguageBreakdown(timeRange),
    refetchInterval: 60000, // Refetch every 60 seconds
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
      <SectionHeader
        title="Pattern Learning"
        description={`Discovery and evolution of ${summary?.totalPatterns.toLocaleString() || '0'} code patterns across your codebase.`}
        details="Pattern Learning uses machine learning and static analysis to automatically discover, track, and evolve code patterns. Monitor pattern quality scores, usage trends, and recent discoveries. The system learns from your codebase over time, identifying both successful patterns to reuse and anti-patterns to avoid."
        level="h1"
      />
      <div className="flex items-center justify-between">
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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div>
          <RealtimeChart
            title="Pattern Discovery Rate"
            data={(discoveryData || []).map(d => ({
              time: new Date(d.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              value: d.avgPatternsPerManifest
            }))}
            color="hsl(var(--chart-2))"
            showArea
          />
        </div>

        <div>
          <RealtimeChart
            title="Average Quality Score"
            data={(qualityData || []).map(d => ({
              time: new Date(d.period).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              value: d.avgQuality * 100
            }))}
            color="hsl(var(--chart-3))"
          />
        </div>

        {/* Live Pattern Discovery (from intelligence service) */}
        <div className="bg-card border rounded-lg p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Live Pattern Discovery</h3>
            {liveDiscoverLoading && (
              <span className="text-xs text-muted-foreground">Loading…</span>
            )}
          </div>
          {liveDiscoverError ? (
            <p className="text-xs text-destructive">Failed to load live patterns</p>
          ) : (
            <ul className="space-y-2 flex-1 overflow-auto">
              {(liveDiscoveredPatterns || []).slice(0, 8).map((p) => (
                <li key={`${p.file_path}-${p.name}`} className="text-sm">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.file_path}</div>
                </li>
              ))}
              {!liveDiscoverLoading && (!liveDiscoveredPatterns || liveDiscoveredPatterns.length === 0) && (
                <li className="text-xs text-muted-foreground">No patterns discovered yet</li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Language Breakdown */}
      <div className="bg-card border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Pattern Language Distribution</h3>
        {languageLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading language data...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(languageData || []).map((lang, index) => {
              // Color palette for languages
              const colors = [
                'hsl(var(--chart-1))',
                'hsl(var(--chart-2))',
                'hsl(var(--chart-3))',
                'hsl(var(--chart-4))',
                'hsl(var(--chart-5))',
              ];
              const color = colors[index % colors.length];

              return (
                <div key={lang.language} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium capitalize">{lang.language}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{lang.count.toLocaleString()} patterns</span>
                      <span className="font-semibold">{lang.percentage}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${lang.percentage}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

      <DrillDownModal
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedPattern?.name || "Pattern Details"}
        data={selectedPattern || {}}
        type="pattern"
        variant="modal"
      />
    </div>
  );
}
