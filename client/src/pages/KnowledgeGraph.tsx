import { MetricCard } from "@/components/MetricCard";
import { PatternNetwork } from "@/components/PatternNetwork";
import { DrillDownPanel } from "@/components/DrillDownPanel";
import { Card } from "@/components/ui/card";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import { ExportButton } from "@/components/ExportButton";
import { Database, Network, Link, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('dashboard-timerange') || '24h';
  });

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
    localStorage.setItem('dashboard-timerange', value);
  };

  // Fetch knowledge graph from omniarchon endpoint
  const { data: graphData, isLoading } = useQuery<KnowledgeGraphResponse>({
    queryKey: [`http://localhost:8053/api/intelligence/knowledge/graph?limit=1000&timeWindow=${timeRange}`],
    queryFn: async () => {
      const response = await fetch(`http://localhost:8053/api/intelligence/knowledge/graph?limit=1000&timeWindow=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch knowledge graph');
      return response.json();
    },
    refetchInterval: 120000, // Refetch every 2 minutes
  });

  // Map GraphNode data to Pattern format for PatternNetwork component
  const patterns: Pattern[] = (graphData?.nodes || []).map((node) => ({
    id: node.id,
    name: node.label,
    quality: 0.85, // Default quality score for graph nodes
    usage: 0, // Not available from graph endpoint
    category: node.type,
    language: null,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Knowledge Graph</h1>
          <p className="text-muted-foreground">
            {isLoading ? 'Loading...' : `Interactive exploration of ${totalNodes} nodes and their relationships`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TimeRangeSelector value={timeRange} onChange={handleTimeRangeChange} />
          <ExportButton
            data={{ nodes: patterns, edges: relationships, relationshipTypes, metrics: { totalNodes, totalRelationships, connectedComponents, graphDensity } }}
            filename={`knowledge-graph-${timeRange}-${new Date().toISOString().split('T')[0]}`}
            disabled={isLoading || patterns.length === 0}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <MetricCard
          label="Total Nodes"
          value={isLoading ? '...' : totalNodes.toLocaleString()}
          icon={Database}
          status="healthy"
        />
        <MetricCard
          label="Total Edges"
          value={isLoading ? '...' : totalRelationships.toLocaleString()}
          icon={Network}
          status="healthy"
        />
        <MetricCard
          label="Connected Components"
          value={isLoading ? '...' : connectedComponents.toString()}
          icon={Link}
          status="healthy"
        />
        <MetricCard
          label="Graph Density"
          value={isLoading ? '...' : graphDensity}
          icon={TrendingUp}
          status="healthy"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          {isLoading ? (
            <Card className="p-6">
              <div className="flex items-center justify-center h-[600px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            </Card>
          ) : patterns.length === 0 ? (
            <Card className="p-6">
              <div className="flex items-center justify-center h-[600px] text-muted-foreground">
                No graph data available from omniarchon endpoint.
              </div>
            </Card>
          ) : (
            <PatternNetwork patterns={patterns} height={600} onPatternClick={handleNodeClick} />
          )}
        </div>

        <Card className="p-6">
          <h3 className="text-base font-semibold mb-4">Relationship Types</h3>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : relationshipTypes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No relationships found</div>
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
            {isLoading ? (
              <div className="flex items-center justify-center h-20">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
              </div>
            ) : (
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
            )}
          </div>
        </Card>
      </div>

      <DrillDownPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={selectedNode?.name || "Node Details"}
        data={selectedNode || {}}
        type="pattern"
      />
    </div>
  );
}
