import { MetricCard } from "@/components/MetricCard";
import { PatternNetwork } from "@/components/PatternNetwork";
import { DrillDownModal } from "@/components/DrillDownModal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Database, Network, Link, TrendingUp, Download, CalendarIcon, AlertCircle } from "lucide-react";
import { useState } from "react";
import { MockDataBadge } from "@/components/MockDataBadge";
import { DashboardSection } from "@/components/DashboardSection";
import { useQuery } from "@tanstack/react-query";
import { knowledgeGraphSource } from "@/lib/data-sources";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";

// Graph data interfaces from omniarchon endpoint
interface GraphNode {
  id: string;
  label: string;
  type: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
}

interface KnowledgeGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Pattern type matching PatternNetwork component expectations
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

export default function KnowledgeGraph() {
  const [selectedNode, setSelectedNode] = useState<Pattern | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [timeRange, setTimeRange] = useState("24h");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // Use centralized data source
  const { data: graphDataResult, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['knowledge-graph', timeRange],
    queryFn: () => knowledgeGraphSource.fetchGraph(timeRange, 1000),
    refetchInterval: 120000,
  });

  // Transform to expected format
  const graphData: KnowledgeGraphResponse = graphDataResult ? {
    nodes: graphDataResult.nodes,
    edges: graphDataResult.edges.map(e => ({ ...e, relationship: e.type || 'related' })),
  } : { nodes: [], edges: [] };

  // Map GraphNode data to Pattern format for PatternNetwork component
  const patterns: Pattern[] = (graphData?.nodes || []).map((node) => ({
    id: node.id,
    name: node.label,
    quality: 0.85, // Default quality score for graph nodes
    usage: 0, // Not available from graph endpoint
    category: node.type,
    language: null,
    // Note: trend and trendPercentage not available from graph endpoint
    // These would need to be added to the API response for full trend support
  }));

  // Map GraphEdge data to PatternRelationship format
  const relationships: PatternRelationship[] = (graphData?.edges || []).map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.relationship,
    weight: 1.0, // Default weight
  }));

  // Calculate relationship type statistics
  const relationshipTypes = relationships.reduce((acc, rel) => {
    const existing = acc.find(r => r.type === rel.type);
    if (existing) {
      existing.count++;
    } else {
      acc.push({ id: rel.type, type: rel.type, count: 1 });
    }
    return acc;
  }, [] as Array<{ id: string; type: string; count: number }>);

  // Calculate metrics from real data
  const totalNodes = patterns.length;
  const totalRelationships = relationships.length;

  // Calculate connected components (simplified - count patterns with at least one relationship)
  const connectedNodeIds = new Set<string>();
  relationships.forEach(rel => {
    connectedNodeIds.add(rel.source);
    connectedNodeIds.add(rel.target);
  });
  const connectedComponents = connectedNodeIds.size;

  // Calculate graph density: actual edges / possible edges
  // For directed graph: density = edges / (nodes * (nodes - 1))
  const maxPossibleEdges = totalNodes * (totalNodes - 1);
  const graphDensity = maxPossibleEdges > 0
    ? (totalRelationships / maxPossibleEdges).toFixed(2)
    : '0.00';

  const handleNodeClick = (pattern: Pattern) => {
    setSelectedNode(pattern);
    setPanelOpen(true);
  };

  const handleExport = () => {
    const exportData = {
      nodes: patterns,
      edges: relationships,
      relationshipTypes,
      metrics: { totalNodes, totalRelationships, connectedComponents, graphDensity },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${timeRange}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading knowledge graph...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load knowledge graph</h3>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <Button onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const usingMockData = patterns.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Knowledge Graph</h1>
          <p className="ty-subtitle">
            Interactive exploration of {totalNodes.toLocaleString()} nodes and their relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          {usingMockData && <MockDataBadge />}

          {/* TIME RANGE CONTROLS */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l">
            <Button
              variant={timeRange === "1h" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("1h")}
            >
              1H
            </Button>
            <Button
              variant={timeRange === "24h" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeRange("24h")}
            >
              24H
            </Button>
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

            {/* Custom date range picker */}
            <Popover open={showCustomPicker} onOpenChange={setShowCustomPicker}>
              <PopoverTrigger asChild>
                <Button
                  variant={timeRange === "custom" ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                >
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
                      setTimeRange("custom");
                      setShowCustomPicker(false);
                    }
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Show selected custom range */}
            {timeRange === "custom" && customRange?.from && customRange?.to && (
              <span className="text-sm text-muted-foreground">
                {format(customRange.from, "MMM d")} - {format(customRange.to, "MMM d, yyyy")}
              </span>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={handleExport} disabled={patterns.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <DashboardSection title="Graph Metrics" description="Real-time knowledge graph statistics">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Nodes"
            value={totalNodes.toLocaleString()}
            icon={Database}
            status="healthy"
          />
          <MetricCard
            label="Total Edges"
            value={totalRelationships.toLocaleString()}
            icon={Network}
            status="healthy"
          />
          <MetricCard
            label="Connected Components"
            value={connectedComponents.toString()}
            icon={Link}
            status="healthy"
          />
          <MetricCard
            label="Graph Density"
            value={graphDensity}
            icon={TrendingUp}
            status="healthy"
          />
        </div>
      </DashboardSection>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          {patterns.length === 0 ? (
            <Card className="p-6">
              <PatternNetwork
                patterns={[
                  { id: 'p1', name: 'Event Bus Producer', quality: 0.92, usage: 12, category: 'effect', language: 'python' },
                  { id: 'p2', name: 'Semantic Cache Reducer', quality: 0.88, usage: 9, category: 'reducer', language: 'python' },
                  { id: 'p3', name: 'Pattern Similarity Scorer', quality: 0.9, usage: 14, category: 'compute', language: 'python' },
                ]}
                height={600}
                onPatternClick={handleNodeClick}
              />
            </Card>
          ) : (
            <PatternNetwork patterns={patterns} height={600} onPatternClick={handleNodeClick} />
          )}
        </div>

        <Card className="p-6">
          <h3 className="text-base font-semibold mb-4">Relationship Types</h3>
          {relationshipTypes.length === 0 ? (
            <div className="space-y-3">
              {[
                { id: 'rel_depends_on', type: 'depends_on', count: 12 },
                { id: 'rel_uses', type: 'uses', count: 7 },
                { id: 'rel_related_to', type: 'related_to', count: 4 },
              ].map((rel) => (
                <div key={rel.id} className="p-3 rounded-lg border border-card-border">
                  <div className="text-sm font-medium font-mono mb-1">
                    {rel.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                  <div className="text-2xl font-bold font-mono">{rel.count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {relationshipTypes.slice(0, 6).map((rel) => (
                <div
                  key={rel.id}
                  className="p-3 rounded-lg border border-card-border"
                >
                  <div className="text-sm font-medium font-mono mb-1">
                    {rel.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                  <div className="text-2xl font-bold font-mono">{rel.count.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
            <h4 className="text-sm font-medium mb-2">Graph Statistics</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Avg Degree:</span>
                <span className="font-mono text-foreground">
                  {totalNodes > 0 ? (totalRelationships / totalNodes).toFixed(1) : '0.0'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Nodes:</span>
                <span className="font-mono text-foreground">{totalNodes}</span>
              </div>
              <div className="flex justify-between">
                <span>Density:</span>
                <span className="font-mono text-foreground">{graphDensity}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <DrillDownModal
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedNode?.name || "Node Details"}
        data={selectedNode || {}}
        type="pattern"
        variant="modal"
      />
    </div>
  );
}
