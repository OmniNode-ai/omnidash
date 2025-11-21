import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Repeat, TrendingUp, Clock } from 'lucide-react';

interface TransformationSummary {
  totalTransformations: number;
  uniqueSourceAgents: number;
  uniqueTargetAgents: number;
  avgTransformationTimeMs: number;
  successRate: number;
  mostCommonTransformation: {
    source: string;
    target: string;
    count: number;
  } | null;
}

interface TransformationNode {
  id: string;
  label: string;
}

interface TransformationLink {
  source: string;
  target: string;
  value: number;
  avgConfidence?: number;
  avgDurationMs?: number;
}

interface TransformationData {
  summary: TransformationSummary;
  sankey: {
    nodes: TransformationNode[];
    links: TransformationLink[];
  };
}

interface TransformationFlowProps {
  timeWindow?: '24h' | '7d' | '30d';
}

export function TransformationFlow({ timeWindow = '24h' }: TransformationFlowProps) {
  const { data, isLoading, error } = useQuery<TransformationData>({
    queryKey: ['transformations', timeWindow],
    queryFn: async () => {
      const response = await fetch(
        `/api/intelligence/transformations/summary?timeWindow=${timeWindow}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch transformation data');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <h3 className="text-base font-semibold mb-4">Polymorphic Transformations</h3>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading transformation data...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <h3 className="text-base font-semibold mb-4">Polymorphic Transformations</h3>
        <div className="flex items-center justify-center h-64 text-red-400">
          Error loading transformations: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </Card>
    );
  }

  if (!data || data.summary.totalTransformations === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-base font-semibold mb-4">Polymorphic Transformations</h3>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          No transformation data available for the selected time window.
        </div>
      </Card>
    );
  }

  const { summary, sankey } = data;

  // Calculate positions for nodes (left and right columns)
  const sourceNodes = new Set(sankey.links.map((l) => l.source));
  const targetNodes = new Set(sankey.links.map((l) => l.target));

  // Calculate transformation counts for sorting
  const targetCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};

  sankey.links.forEach((link) => {
    targetCounts[link.target] = (targetCounts[link.target] || 0) + link.value;
    sourceCounts[link.source] = (sourceCounts[link.source] || 0) + link.value;
  });

  // Separate into left (sources) and right (targets) columns, sorted by count (descending)
  const leftNodes = Array.from(sourceNodes).sort(
    (a, b) => (sourceCounts[b] || 0) - (sourceCounts[a] || 0)
  );
  const rightNodes = Array.from(targetNodes)
    .filter((n) => !sourceNodes.has(n))
    .sort((a, b) => (targetCounts[b] || 0) - (targetCounts[a] || 0));

  // If a node is both source and target, it appears on both sides
  const allLeftNodes = leftNodes;
  const allRightNodes = [...leftNodes.filter((n) => targetNodes.has(n)), ...rightNodes].sort(
    (a, b) => (targetCounts[b] || 0) - (targetCounts[a] || 0)
  );

  const nodeHeight = 40;
  const nodeSpacing = 16;
  const svgHeight =
    Math.max(allLeftNodes.length, allRightNodes.length) * (nodeHeight + nodeSpacing) + 40;
  const svgWidth = 800;
  const columnWidth = 200;
  const leftX = 50;
  const rightX = svgWidth - leftX - columnWidth;

  // Create node positions
  const nodePositions: Record<string, { x: number; y: number; side: 'left' | 'right' }> = {};

  allLeftNodes.forEach((nodeId, index) => {
    nodePositions[`${nodeId}-left`] = {
      x: leftX,
      y: 40 + index * (nodeHeight + nodeSpacing),
      side: 'left',
    };
  });

  allRightNodes.forEach((nodeId, index) => {
    nodePositions[`${nodeId}-right`] = {
      x: rightX,
      y: 40 + index * (nodeHeight + nodeSpacing),
      side: 'right',
    };
  });

  // Find max value for link thickness scaling
  const maxValue = Math.max(...sankey.links.map((l) => l.value));

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Repeat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{summary.totalTransformations}</div>
              <div className="text-xs text-muted-foreground">Total Transformations</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-chart-4/10">
              <ArrowRight className="h-5 w-5" style={{ color: 'hsl(var(--chart-4))' }} />
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {summary.uniqueSourceAgents} → {summary.uniqueTargetAgents}
              </div>
              <div className="text-xs text-muted-foreground">Source → Target Agents</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-chart-3/10">
              <Clock className="h-5 w-5" style={{ color: 'hsl(var(--chart-3))' }} />
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {summary.avgTransformationTimeMs.toFixed(0)}ms
              </div>
              <div className="text-xs text-muted-foreground">Avg Transformation Time</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-status-healthy/10">
              <TrendingUp className="h-5 w-5 text-status-healthy" />
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {Math.max(
                  0,
                  Math.min(
                    100,
                    summary.successRate <= 1 ? summary.successRate * 100 : summary.successRate
                  )
                ).toFixed(1)}
                %
              </div>
              <div className="text-xs text-muted-foreground">Success Rate</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Most Common Transformation */}
      {summary.mostCommonTransformation && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="default">Most Common</Badge>
              <span className="text-sm font-medium">
                {summary.mostCommonTransformation.source.replace('agent-', '')}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {summary.mostCommonTransformation.target.replace('agent-', '')}
              </span>
            </div>
            <Badge variant="secondary">{summary.mostCommonTransformation.count} times</Badge>
          </div>
        </Card>
      )}

      {/* Sankey Diagram */}
      <Card className="p-6">
        <h3 className="text-base font-semibold mb-4">Transformation Flow Diagram</h3>
        <div className="overflow-x-auto">
          <svg width={svgWidth} height={svgHeight} className="mx-auto">
            <defs>
              {/* Gradient for flow lines */}
              <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--chart-4))" stopOpacity="0.6" />
                <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity="0.4" />
              </linearGradient>
            </defs>

            {/* Draw flow links */}
            {sankey.links.map((link, index) => {
              const sourcePos = nodePositions[`${link.source}-left`];
              const targetPos = nodePositions[`${link.target}-right`];

              if (!sourcePos || !targetPos) return null;

              const strokeWidth = Math.max(2, (link.value / maxValue) * 20);
              const sourceY = sourcePos.y + nodeHeight / 2;
              const targetY = targetPos.y + nodeHeight / 2;
              const midX = (sourcePos.x + columnWidth + targetPos.x) / 2;

              return (
                <g key={`link-${index}`}>
                  <path
                    d={`M ${sourcePos.x + columnWidth} ${sourceY}
                        C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetPos.x} ${targetY}`}
                    stroke="url(#flow-gradient)"
                    strokeWidth={strokeWidth}
                    fill="none"
                    opacity={0.5}
                    className="hover:opacity-80 transition-opacity"
                  />
                  {/* Tooltip on hover - show value */}
                  <title>
                    {link.source.replace('agent-', '')} → {link.target.replace('agent-', '')}:{' '}
                    {link.value} times
                    {link.avgConfidence &&
                      ` (${(link.avgConfidence * 100).toFixed(0)}% confidence)`}
                    {link.avgDurationMs && ` (${link.avgDurationMs.toFixed(0)}ms avg)`}
                  </title>
                </g>
              );
            })}

            {/* Draw source nodes (left) */}
            {allLeftNodes.map((nodeId, _index) => {
              const node = sankey.nodes.find((n) => n.id === nodeId);
              if (!node) return null;

              const pos = nodePositions[`${nodeId}-left`];
              const totalOutgoing = sankey.links
                .filter((l) => l.source === nodeId)
                .reduce((sum, l) => sum + l.value, 0);

              return (
                <g key={`node-left-${nodeId}`}>
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={columnWidth}
                    height={nodeHeight}
                    fill="hsl(var(--card))"
                    stroke="hsl(var(--border))"
                    strokeWidth="1"
                    rx="6"
                    className="hover-elevate"
                  />
                  <text
                    x={pos.x + columnWidth / 2}
                    y={pos.y + nodeHeight / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-sm font-medium fill-foreground"
                  >
                    {node.label.length > 20 ? node.label.substring(0, 18) + '...' : node.label}
                  </text>
                  {totalOutgoing > 0 && (
                    <text
                      x={pos.x + columnWidth - 8}
                      y={pos.y + nodeHeight - 6}
                      textAnchor="end"
                      className="text-xs fill-muted-foreground"
                    >
                      {totalOutgoing}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Draw target nodes (right) */}
            {allRightNodes.map((nodeId, _index) => {
              const node = sankey.nodes.find((n) => n.id === nodeId);
              if (!node) return null;

              const pos = nodePositions[`${nodeId}-right`];
              const totalIncoming = sankey.links
                .filter((l) => l.target === nodeId)
                .reduce((sum, l) => sum + l.value, 0);

              return (
                <g key={`node-right-${nodeId}`}>
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={columnWidth}
                    height={nodeHeight}
                    fill="hsl(var(--card))"
                    stroke="hsl(var(--border))"
                    strokeWidth="1"
                    rx="6"
                    className="hover-elevate"
                  />
                  <text
                    x={pos.x + columnWidth / 2}
                    y={pos.y + nodeHeight / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="text-sm font-medium fill-foreground"
                  >
                    {node.label.length > 20 ? node.label.substring(0, 18) + '...' : node.label}
                  </text>
                  {totalIncoming > 0 && (
                    <text
                      x={pos.x + 8}
                      y={pos.y + nodeHeight - 6}
                      textAnchor="start"
                      className="text-xs fill-muted-foreground"
                    >
                      {totalIncoming}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Labels */}
            <text
              x={leftX + columnWidth / 2}
              y={20}
              textAnchor="middle"
              className="text-xs font-semibold fill-muted-foreground"
            >
              SOURCE AGENT
            </text>
            <text
              x={rightX + columnWidth / 2}
              y={20}
              textAnchor="middle"
              className="text-xs font-semibold fill-muted-foreground"
            >
              TARGET AGENT
            </text>
          </svg>
        </div>
        <div className="mt-4 text-xs text-muted-foreground text-center">
          Flow thickness represents transformation frequency. Hover over flows for details.
        </div>
      </Card>
    </div>
  );
}
