import React, { useRef, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Unified Graph Component
 *
 * A consistent interface for rendering different types of network visualizations
 * across the dashboard. Supports force-directed, hierarchy, and custom layouts.
 */

export interface GraphNode {
  id: string;
  label: string;
  type?: string;
  size?: number;
  color?: string;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
  type?: string;
  label?: string;
  bidirectional?: boolean;
}

export interface GraphLayout {
  type: 'force' | 'hierarchy' | 'circular' | 'grid' | 'custom';
  nodePositions?: Record<string, { x: number; y: number }>;
}

export interface UnifiedGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: GraphLayout;
  width?: number | string;
  height?: number | string;
  interactive?: boolean;
  zoomable?: boolean;
  title?: string;
  subtitle?: string;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
  renderMode?: 'canvas' | 'svg';
  showLegend?: boolean;
  colorScheme?: Record<string, string>;
}

/**
 * Helper to calculate force-directed layout positions
 */
function calculateForceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): Record<string, { x: number; y: number }> {
  // Simple grid-based layout as fallback
  // In production, this could use d3-force or similar
  const positions: Record<string, { x: number; y: number }> = {};
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const cellWidth = width / cols;
  const cellHeight = height / Math.ceil(nodes.length / cols);

  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[node.id] = {
      x: col * cellWidth + cellWidth / 2,
      y: row * cellHeight + cellHeight / 2,
    };
  });

  return positions;
}

/**
 * Helper to calculate hierarchy layout positions
 */
function calculateHierarchyLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  // Build adjacency list
  const children: Record<string, string[]> = {};
  const parents: Record<string, string> = {};

  edges.forEach((edge) => {
    if (!children[edge.source]) children[edge.source] = [];
    children[edge.source].push(edge.target);
    parents[edge.target] = edge.source;
  });

  // Find root nodes (nodes with no parents)
  const roots = nodes.filter((node) => !parents[node.id]);

  // Assign levels
  const levels: Record<string, number> = {};
  const queue: Array<{ id: string; level: number }> = roots.map((node) => ({
    id: node.id,
    level: 0,
  }));

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    levels[id] = level;
    const nodeChildren = children[id] || [];
    nodeChildren.forEach((childId) => {
      queue.push({ id: childId, level: level + 1 });
    });
  }

  // Calculate positions
  const maxLevel = Math.max(...Object.values(levels), 0);
  const levelHeight = height / (maxLevel + 1);

  // Group nodes by level
  const nodesByLevel: Record<number, string[]> = {};
  Object.entries(levels).forEach(([id, level]) => {
    if (!nodesByLevel[level]) nodesByLevel[level] = [];
    nodesByLevel[level].push(id);
  });

  // Position nodes
  Object.entries(nodesByLevel).forEach(([levelStr, nodeIds]) => {
    const level = parseInt(levelStr);
    const levelWidth = width / (nodeIds.length + 1);
    nodeIds.forEach((id, i) => {
      positions[id] = {
        x: (i + 1) * levelWidth,
        y: (level + 0.5) * levelHeight,
      };
    });
  });

  return positions;
}

export function UnifiedGraph({
  nodes,
  edges,
  layout = { type: 'force' },
  width = '100%',
  height = 500,
  interactive = true,
  zoomable = false,
  title,
  subtitle,
  onNodeClick,
  onEdgeClick,
  renderMode = 'svg',
  showLegend = true,
  colorScheme = {},
}: UnifiedGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Calculate layout positions
  useEffect(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const w = typeof width === 'number' ? width : rect.width;
    const h = typeof height === 'number' ? height : dimensions.height;

    setDimensions({ width: w, height: h });

    let positions: Record<string, { x: number; y: number }>;

    if (layout.nodePositions) {
      // Use custom positions if provided
      positions = layout.nodePositions;
    } else {
      // Calculate positions based on layout type
      switch (layout.type) {
        case 'hierarchy':
          positions = calculateHierarchyLayout(nodes, edges, w, h);
          break;
        case 'circular':
          positions = {};
          const centerX = w / 2;
          const centerY = h / 2;
          const radius = Math.min(w, h) * 0.35;
          nodes.forEach((node, i) => {
            const angle = (2 * Math.PI * i) / nodes.length;
            positions[node.id] = {
              x: centerX + radius * Math.cos(angle),
              y: centerY + radius * Math.sin(angle),
            };
          });
          break;
        case 'grid':
          positions = {};
          const cols = Math.ceil(Math.sqrt(nodes.length));
          const cellW = w / cols;
          const cellH = h / Math.ceil(nodes.length / cols);
          nodes.forEach((node, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            positions[node.id] = {
              x: col * cellW + cellW / 2,
              y: row * cellH + cellH / 2,
            };
          });
          break;
        case 'force':
        default:
          positions = calculateForceLayout(nodes, edges, w, h);
          break;
      }
    }

    setNodePositions(positions);
  }, [nodes, edges, layout, width, height]);

  // Canvas rendering
  useEffect(() => {
    if (renderMode !== 'canvas' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = dimensions.width * window.devicePixelRatio;
    canvas.height = dimensions.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Draw edges
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    edges.forEach((edge) => {
      const sourcePos = nodePositions[edge.source];
      const targetPos = nodePositions[edge.target];

      if (sourcePos && targetPos) {
        const color = colorScheme[edge.type || ''] || '#94a3b8';
        ctx.strokeStyle = color;
        ctx.lineWidth = edge.weight ? 1 + edge.weight * 2 : 1;

        ctx.beginPath();
        ctx.moveTo(sourcePos.x, sourcePos.y);
        ctx.lineTo(targetPos.x, targetPos.y);
        ctx.stroke();
      }
    });

    ctx.globalAlpha = 1;

    // Draw nodes
    nodes.forEach((node) => {
      const pos = nodePositions[node.id];
      if (!pos) return;

      const radius = node.size || 8;
      const color = node.color || colorScheme[node.type || ''] || '#3b82f6';

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw label
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, pos.x, pos.y + radius + 12);
    });
  }, [nodes, edges, nodePositions, dimensions, renderMode, colorScheme]);

  // Handle click events
  const handleClick = (e: React.MouseEvent) => {
    if (!interactive || !onNodeClick) return;

    const rect = (renderMode === 'canvas' ? canvasRef.current : svgRef.current)?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find clicked node
    const clickedNode = nodes.find((node) => {
      const pos = nodePositions[node.id];
      if (!pos) return false;

      const radius = node.size || 8;
      const dx = x - pos.x;
      const dy = y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });

    if (clickedNode) {
      onNodeClick(clickedNode);
    }
  };

  // Handle hover events
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!interactive) return;

    const rect = (renderMode === 'canvas' ? canvasRef.current : svgRef.current)?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hoveredNode = nodes.find((node) => {
      const pos = nodePositions[node.id];
      if (!pos) return false;

      const radius = node.size || 8;
      const dx = x - pos.x;
      const dy = y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });

    setHoveredNode(hoveredNode || null);
  };

  const defaultColorScheme = {
    dependency: '#3b82f6',
    inheritance: '#10b981',
    composition: '#8b5cf6',
    usage: '#f59e0b',
    ...colorScheme,
  };

  return (
    <Card className="p-6">
      {(title || subtitle) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h3 className="text-base font-semibold">{title}</h3>}
            {subtitle && (
              <p className="text-sm text-muted-foreground">
                {hoveredNode ? (
                  <>
                    <span className="font-medium">{hoveredNode.label}</span>
                    {hoveredNode.type && (
                      <span className="text-xs ml-2">({hoveredNode.type})</span>
                    )}
                  </>
                ) : (
                  subtitle
                )}
              </p>
            )}
          </div>
          {showLegend && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">{nodes.length} nodes</Badge>
              <Badge variant="outline">{edges.length} edges</Badge>
            </div>
          )}
        </div>
      )}

      <div ref={containerRef} className="relative">
        {renderMode === 'canvas' ? (
          <canvas
            ref={canvasRef}
            className="w-full rounded-lg border border-card-border bg-card cursor-pointer"
            style={{ height: typeof height === 'number' ? `${height}px` : height }}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
          />
        ) : (
          <svg
            ref={svgRef}
            className="w-full rounded-lg border border-card-border bg-card"
            style={{ height: typeof height === 'number' ? `${height}px` : height }}
            width={dimensions.width}
            height={dimensions.height}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
          >
            {/* Draw edges */}
            {edges.map((edge, idx) => {
              const sourcePos = nodePositions[edge.source];
              const targetPos = nodePositions[edge.target];

              if (!sourcePos || !targetPos) return null;

              const color = defaultColorScheme[edge.type || ''] || '#94a3b8';
              const strokeWidth = edge.weight ? 1 + edge.weight * 2 : 1;

              // Calculate midpoint for label
              const midX = (sourcePos.x + targetPos.x) / 2;
              const midY = (sourcePos.y + targetPos.y) / 2;

              return (
                <g key={`edge-${idx}`}>
                  <line
                    x1={sourcePos.x}
                    y1={sourcePos.y}
                    x2={targetPos.x}
                    y2={targetPos.y}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    opacity={0.5}
                    className="hover:opacity-80 transition-opacity cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdgeClick?.(edge);
                    }}
                  />
                  {edge.label && (
                    <text
                      x={midX}
                      y={midY}
                      className="text-xs fill-muted-foreground"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {edge.label}
                    </text>
                  )}
                  {/* Arrow indicator for directed edges */}
                  {!edge.bidirectional && (
                    <polygon
                      points="0,-5 8,0 0,5"
                      fill={color}
                      opacity={0.7}
                      transform={`translate(${targetPos.x}, ${targetPos.y}) rotate(${
                        (Math.atan2(targetPos.y - sourcePos.y, targetPos.x - sourcePos.x) * 180) / Math.PI
                      }) translate(-8, 0)`}
                    />
                  )}
                </g>
              );
            })}

            {/* Draw nodes */}
            {nodes.map((node) => {
              const pos = nodePositions[node.id];
              if (!pos) return null;

              const radius = node.size || 8;
              const color = node.color || defaultColorScheme[node.type || ''] || '#3b82f6';

              return (
                <g
                  key={node.id}
                  className="cursor-pointer hover-elevate transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNodeClick?.(node);
                  }}
                >
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius}
                    fill={color}
                    stroke="hsl(var(--foreground))"
                    strokeWidth={2}
                    opacity={hoveredNode?.id === node.id ? 1 : 0.9}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + radius + 12}
                    className="text-xs fill-foreground font-medium"
                    textAnchor="middle"
                  >
                    {node.label.length > 15 ? node.label.substring(0, 12) + '...' : node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Legend for edge types */}
      {showLegend && Object.keys(defaultColorScheme).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {Object.entries(defaultColorScheme).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground capitalize">{type}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
