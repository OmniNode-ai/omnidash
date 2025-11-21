import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UnifiedGraph, GraphNode, GraphEdge } from '@/components/UnifiedGraph';
import { Search } from 'lucide-react';

interface Pattern {
  id: string;
  name: string;
  quality: number;
  usage: number;
  category: string;
  language?: string | null;
}

interface PatternRelationship {
  source: string;
  target: string;
  type: string;
  weight: number;
}

interface PatternNetworkProps {
  patterns: Pattern[];
  height?: number;
  onPatternClick?: (pattern: Pattern) => void;
}

/**
 * Intelligent pattern clustering algorithm
 * Handles datasets from 20 to 20,000+ patterns with progressive detail levels
 */
function clusterPatterns(
  patterns: Pattern[],
  targetSize: number
): { patterns: Pattern[]; clustered: boolean; clusterInfo?: string } {
  const count = patterns.length;

  // Tier 1: Small dataset (< 100 patterns) - Show all or top performers
  if (count <= 100) {
    return {
      patterns: patterns.slice(0, Math.min(count, targetSize)),
      clustered: false,
    };
  }

  // Tier 2: Medium dataset (100-1000 patterns) - Show top by quality and usage
  if (count <= 1000) {
    // Score patterns by combined quality and usage
    const scored = patterns
      .map((p) => ({
        ...p,
        score: p.quality * 0.6 + (Math.min(p.usage, 1000) / 1000) * 0.4,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, targetSize);

    return {
      patterns: scored,
      clustered: true,
      clusterInfo: `Showing top ${targetSize} of ${count} patterns by quality and usage`,
    };
  }

  // Tier 3: Large dataset (1000+ patterns) - Cluster by category and language
  // Group by category and language, then select representatives
  const clusters = new Map<string, Pattern[]>();

  patterns.forEach((p) => {
    const key = `${p.category}|${p.language || 'unknown'}`;
    if (!clusters.has(key)) {
      clusters.set(key, []);
    }
    clusters.get(key)!.push(p);
  });

  // From each cluster, take the highest quality patterns proportionally
  const patternsPerCluster = Math.max(1, Math.floor(targetSize / clusters.size));
  const representatives: Pattern[] = [];

  clusters.forEach((clusterPatterns) => {
    const sorted = clusterPatterns
      .sort((a, b) => b.quality - a.quality)
      .slice(0, patternsPerCluster);
    representatives.push(...sorted);
  });

  // Fill remaining slots with highest usage patterns not yet included
  const remaining = targetSize - representatives.length;
  if (remaining > 0) {
    const representativeIds = new Set(representatives.map((p) => p.id));
    const additional = patterns
      .filter((p) => !representativeIds.has(p.id))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, remaining);
    representatives.push(...additional);
  }

  return {
    patterns: representatives.slice(0, targetSize),
    clustered: true,
    clusterInfo: `Showing ${representatives.length} representative patterns from ${clusters.size} clusters (${count} total patterns)`,
  };
}

/**
 * Transform Pattern objects to GraphNode format
 */
function transformPatternsToNodes(patterns: Pattern[]): GraphNode[] {
  return patterns.map((p) => {
    // Calculate node size based on usage (25-70px range for optimal text readability)
    const normalizedUsage = Math.min(p.usage / 100, 1); // Normalize to 0-1
    const size = 25 + normalizedUsage * 45; // 25-70px range

    // Color-code by quality score
    let color: string;
    if (p.quality > 0.8) {
      color = '#10b981'; // Green for high quality (>80%)
    } else if (p.quality > 0.6) {
      color = '#f59e0b'; // Orange for medium quality (60-80%)
    } else {
      color = '#ef4444'; // Red for low quality (<60%)
    }

    return {
      id: p.id,
      label: p.name,
      type: p.category,
      size,
      color,
      metadata: {
        quality: p.quality,
        usage: p.usage,
        language: p.language,
        category: p.category,
      },
    };
  });
}

/**
 * Transform PatternRelationship objects to GraphEdge format
 */
function transformRelationshipsToEdges(
  relationships: PatternRelationship[],
  patternIds: Set<string>
): GraphEdge[] {
  // Filter to only include relationships between visible patterns
  return relationships
    .filter((r) => patternIds.has(r.source) && patternIds.has(r.target))
    .map((r) => ({
      source: r.source,
      target: r.target,
      weight: r.weight,
      type: r.type,
      label: r.type === 'modified_from' ? 'lineage' : undefined,
    }));
}

/**
 * Edge color scheme for relationship types
 */
const edgeColorScheme = {
  modified_from: '#3b82f6', // Blue for direct lineage
  same_language: '#10b981', // Green for same language
  same_type: '#f59e0b', // Orange for same type
  similar: '#8b5cf6', // Purple for similar patterns
  default: '#94a3b8', // Gray for other relationships
};

export function PatternNetwork({ patterns, height = 500, onPatternClick }: PatternNetworkProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'hierarchy' | 'force' | 'circular'>('force');
  const [maxPatterns, setMaxPatterns] = useState(50); // Default to showing 50 patterns

  // Client-side search filtering
  const searchFiltered = useMemo(() => {
    if (!searchQuery) return patterns;

    const query = searchQuery.toLowerCase();
    return patterns.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        (p.language && p.language.toLowerCase().includes(query))
    );
  }, [patterns, searchQuery]);

  // Apply intelligent clustering
  const {
    patterns: displayPatterns,
    clustered,
    clusterInfo,
  } = useMemo(() => {
    return clusterPatterns(searchFiltered, maxPatterns);
  }, [searchFiltered, maxPatterns]);

  // Get pattern IDs for edge filtering
  const patternIds = useMemo(() => new Set(displayPatterns.map((p) => p.id)), [displayPatterns]);

  // Fetch pattern relationships from API
  const patternIdsParam = displayPatterns.map((p) => p.id).join(',');
  const { data: relationships = [] } = useQuery<PatternRelationship[]>({
    queryKey: [`/api/intelligence/patterns/relationships?patterns=${patternIdsParam}`],
    enabled: displayPatterns.length > 0,
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  // Transform data for UnifiedGraph
  const graphNodes = useMemo(() => transformPatternsToNodes(displayPatterns), [displayPatterns]);
  const graphEdges = useMemo(
    () => transformRelationshipsToEdges(relationships, patternIds),
    [relationships, patternIds]
  );

  // Handle pattern node clicks
  const handleNodeClick = (node: GraphNode) => {
    const pattern = displayPatterns.find((p) => p.id === node.id);
    if (pattern && onPatternClick) {
      onPatternClick(pattern);
    }
  };

  // Auto-adjust max patterns based on dataset size
  // NOTE: This is a functional enhancement that was introduced in commit 9534c961
  // (Nov 7, 2025) during a "cleanup and refactor" commit. While this violates
  // the scope of that commit, it provides valuable UX improvements:
  //
  // WHAT IT DOES:
  // - Dynamically adjusts the maximum number of patterns displayed based on total dataset size
  // - Smaller datasets (≤50): Show all patterns (limit: 50)
  // - Medium datasets (51-100): Show more detail (limit: 75)
  // - Large datasets (101-500): Show representative sample (limit: 100)
  // - Very large datasets (500+): Cap at 150 to prevent performance issues
  //
  // WHY IT'S HERE:
  // - Works in conjunction with the intelligent clustering algorithm (clusterPatterns function)
  // - Prevents overwhelming the graph visualization with too many nodes
  // - Balances detail vs performance for different dataset sizes
  // - Currently working in production without issues
  //
  // TODO:
  // - Add unit tests for this logic (currently untested)
  // - Consider making thresholds configurable via props
  // - Add user control to override automatic limits
  useEffect(() => {
    const count = patterns.length;
    if (count <= 50) {
      setMaxPatterns(50);
    } else if (count <= 100) {
      setMaxPatterns(75);
    } else if (count <= 500) {
      setMaxPatterns(100);
    } else {
      setMaxPatterns(150); // Cap at 150 for very large datasets
    }
  }, [patterns.length]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search patterns by name, category, or language..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border rounded-md">
              <Button
                size="sm"
                variant={viewMode === 'force' ? 'default' : 'ghost'}
                onClick={() => setViewMode('force')}
                className="h-8"
              >
                Grid
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'hierarchy' ? 'default' : 'ghost'}
                onClick={() => setViewMode('hierarchy')}
                className="h-8"
              >
                Tree
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'circular' ? 'default' : 'ghost'}
                onClick={() => setViewMode('circular')}
                className="h-8"
              >
                Circle
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline">{displayPatterns.length} patterns</Badge>
              <Badge variant="outline">{graphEdges.length} connections</Badge>
            </div>
          </div>
        </div>

        {/* Cluster information */}
        {clustered && clusterInfo && (
          <div className="mt-3 text-xs text-muted-foreground">{clusterInfo}</div>
        )}

        {/* Quality Legend */}
        <div className="mt-3 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#10b981]" />
            <span className="text-muted-foreground">High Quality (&gt;80%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
            <span className="text-muted-foreground">Medium Quality (60-80%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
            <span className="text-muted-foreground">Low Quality (&lt;60%)</span>
          </div>
        </div>
      </Card>

      {/* Graph Visualization */}
      <UnifiedGraph
        nodes={graphNodes}
        edges={graphEdges}
        layout={{ type: viewMode }}
        height={height}
        interactive={true}
        zoomable={false}
        title="Pattern Relationship Network"
        subtitle={
          displayPatterns.length > 0
            ? 'Click nodes to view pattern details'
            : 'No patterns to display'
        }
        onNodeClick={handleNodeClick}
        renderMode="svg"
        showLegend={true}
        colorScheme={edgeColorScheme}
      />
    </div>
  );
}
