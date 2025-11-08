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
  /**
   * Node radius in pixels
   * Recommended range: 25-70px for optimal text readability
   * - Small nodes (25-35px): Shows abbreviated text (1-3 chars)
   * - Medium nodes (35-50px): Shows short labels (4-8 chars)
   * - Large nodes (50-70px): Shows full labels (8-12 chars)
   * Default: 30px if not specified
   */
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
 * Constants for text rendering in nodes
 */
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 14;
const NODE_PADDING = 6; // Minimum padding between text and circle edge (reduced for more text space)
const CHAR_WIDTH_RATIO = 0.55; // Approximate character width to font size ratio (more optimistic)
const LINE_HEIGHT_RATIO = 1.15; // Line height multiplier (tighter spacing)

/**
 * Helper to split text into multiple lines that fit within a circle
 * Returns array of lines with word wrapping
 */
function wrapTextForCircle(
  text: string,
  radius: number,
  fontSize: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  const charWidth = fontSize * CHAR_WIDTH_RATIO;

  // Calculate available width for text (accounting for padding on both sides)
  const availableWidth = (radius - NODE_PADDING) * 2;
  const maxCharsPerLine = Math.floor(availableWidth / charWidth);

  if (maxCharsPerLine < 3) {
    // For very small nodes, just show abbreviated text
    return [text.substring(0, 2)];
  }

  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      // Current line is full, push it and start new line
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }

      // For individual words, only truncate if they're EXTREMELY long (>20 chars)
      // This allows normal words like "Authentication" (14 chars) to display fully
      if (word.length > 20) {
        // Word is unreasonably long, truncate it
        lines.push(word.substring(0, Math.max(8, maxCharsPerLine - 1)) + '…');
      } else {
        // Word gets its own line, regardless of maxCharsPerLine
        // The text may overflow slightly but will be readable
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // Limit to 3 lines maximum to fit in the circle
  if (lines.length > 3) {
    // Truncate last visible line and add ellipsis
    const lastLine = lines[2];
    if (lastLine.length > maxCharsPerLine) {
      lines[2] = lastLine.substring(0, maxCharsPerLine - 1) + '…';
    }
    return lines.slice(0, 3);
  }

  return lines;
}

/**
 * Helper to calculate optimal text display for a node with dynamic font sizing
 * Uses iOS-style dynamic sizing: longer text gets smaller font to fit
 */
function calculateTextDisplay(
  text: string,
  radius: number,
  fontFamily: string = 'IBM Plex Sans, sans-serif'
): { fontSize: number; lines: string[]; needsEllipsis: boolean } {
  // Start with maximum font size for this radius
  let fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, radius * 0.24));

  // For very small nodes, reduce font size more aggressively
  if (radius < 35) {
    fontSize = Math.max(8, radius * 0.22);
  }

  // Try to fit text with current font size
  let lines = wrapTextForCircle(text, radius, fontSize);
  let needsEllipsis = lines.some(line => line.includes('…'));

  // Dynamic font sizing (iOS-style): Aggressively reduce font size until text fits
  let attempts = 0;
  const maxAttempts = 8;  // More attempts for better fitting

  while (needsEllipsis && fontSize > MIN_FONT_SIZE && attempts < maxAttempts) {
    // Reduce font size by 15% (more aggressive than before)
    fontSize = Math.max(MIN_FONT_SIZE, fontSize * 0.85);

    // Recalculate with smaller font
    lines = wrapTextForCircle(text, radius, fontSize);
    needsEllipsis = lines.some(line => line.includes('…'));

    attempts++;
  }

  return { fontSize, lines, needsEllipsis };
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
 * Helper to calculate hierarchy layout positions with improved spacing
 */
function calculateHierarchyLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  // Add padding around the edges for better visual appearance
  const HORIZONTAL_PADDING = Math.max(80, width * 0.08);
  const VERTICAL_PADDING = Math.max(60, height * 0.1);
  const MIN_NODE_SPACING = 150; // Minimum horizontal spacing between nodes

  const usableWidth = width - (HORIZONTAL_PADDING * 2);
  const usableHeight = height - (VERTICAL_PADDING * 2);

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

  // Assign levels with cycle detection
  const levels: Record<string, number> = {};
  const visited = new Set<string>();
  const queue: Array<{ id: string; level: number }> = roots.map((node) => ({
    id: node.id,
    level: 0,
  }));

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;

    // Skip if already visited (prevents infinite loops with cycles)
    if (visited.has(id)) continue;
    visited.add(id);

    levels[id] = level;
    const nodeChildren = children[id] || [];
    nodeChildren.forEach((childId) => {
      if (!visited.has(childId)) {
        queue.push({ id: childId, level: level + 1 });
      }
    });
  }

  // Handle orphaned nodes (nodes not reachable from any root due to cycles)
  nodes.forEach((node) => {
    if (levels[node.id] === undefined) {
      levels[node.id] = 0;
    }
  });

  // Calculate positions with better spacing
  const maxLevel = Math.max(...Object.values(levels), 0);
  const levelHeight = usableHeight / (maxLevel + 1);

  // Group nodes by level
  const nodesByLevel: Record<number, string[]> = {};
  Object.entries(levels).forEach(([id, level]) => {
    if (!nodesByLevel[level]) nodesByLevel[level] = [];
    nodesByLevel[level].push(id);
  });

  // Position nodes with improved horizontal spacing
  Object.entries(nodesByLevel).forEach(([levelStr, nodeIds]) => {
    const level = parseInt(levelStr);
    const nodeCount = nodeIds.length;

    // Calculate spacing based on node count and available width
    const totalMinSpacing = (nodeCount - 1) * MIN_NODE_SPACING;
    const actualSpacing = Math.max(MIN_NODE_SPACING, usableWidth / (nodeCount + 1));

    // Center the nodes horizontally
    const totalWidth = (nodeCount - 1) * actualSpacing;
    const startX = HORIZONTAL_PADDING + (usableWidth - totalWidth) / 2;

    nodeIds.forEach((id, i) => {
      positions[id] = {
        x: nodeCount === 1 ? width / 2 : startX + (i * actualSpacing),
        y: VERTICAL_PADDING + (level + 0.5) * levelHeight,
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

  // Calculate layout positions and handle window resizing
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const w = typeof width === 'number' ? width : rect.width || 800;
      const h = typeof height === 'number' ? height :
               (typeof height === 'string' && height.includes('vh')) ?
               window.innerHeight * 0.7 : 600; // Default to 70vh or 600px

      setDimensions({ width: w, height: h });
    };

    // Initial calculation
    updateDimensions();

    // Set up ResizeObserver to handle container resizing
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    resizeObserver.observe(containerRef.current);

    // Also listen for window resize events
    window.addEventListener('resize', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [width, height]);

  // Recalculate node positions when dimensions change
  useEffect(() => {
    if (!containerRef.current || dimensions.width === 0) return;

    const w = dimensions.width;
    const h = dimensions.height;

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
  }, [nodes, edges, layout, dimensions]);

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

      const radius = node.size || 30; // Default to 30px for better readability
      const color = node.color || colorScheme[node.type || ''] || '#3b82f6';

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw label inside circle using helper function with multi-line support
      const { fontSize, lines } = calculateTextDisplay(node.label, radius);

      ctx.fillStyle = '#ffffff';
      ctx.font = `${fontSize}px IBM Plex Sans, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Calculate line spacing
      const lineHeight = fontSize * LINE_HEIGHT_RATIO;
      const totalHeight = lines.length * lineHeight;
      const startY = pos.y - totalHeight / 2 + lineHeight / 2;

      // Draw each line
      lines.forEach((line, i) => {
        ctx.fillText(line, pos.x, startY + i * lineHeight);
      });
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

      const radius = node.size || 30;
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

      const radius = node.size || 30;
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
            {/* Define arrow markers for directed edges */}
            <defs>
              {Object.entries(defaultColorScheme).map(([type, color]) => (
                <marker
                  key={`arrow-${type}`}
                  id={`arrow-${type}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={color} opacity="0.8" />
                </marker>
              ))}
              {/* Default arrow marker */}
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" opacity="0.8" />
              </marker>
            </defs>

            {/* Draw edges */}
            {edges.map((edge, idx) => {
              const sourcePos = nodePositions[edge.source];
              const targetPos = nodePositions[edge.target];

              if (!sourcePos || !targetPos) return null;

              const color = (edge.type && defaultColorScheme[edge.type as keyof typeof defaultColorScheme]) || '#94a3b8';
              const strokeWidth = edge.weight ? 1 + edge.weight * 2 : 1;

              // Calculate target node radius to adjust line endpoint
              const targetNode = nodes.find(n => n.id === edge.target);
              const targetRadius = targetNode?.size ?? 30;

              // Calculate edge angle and adjust endpoint to stop at node edge
              const dx = targetPos.x - sourcePos.x;
              const dy = targetPos.y - sourcePos.y;
              const angle = Math.atan2(dy, dx);
              const adjustedTargetX = targetPos.x - (targetRadius + 6) * Math.cos(angle);
              const adjustedTargetY = targetPos.y - (targetRadius + 6) * Math.sin(angle);

              // Calculate midpoint for label (slightly offset from center)
              const midX = (sourcePos.x + adjustedTargetX) / 2;
              const midY = (sourcePos.y + adjustedTargetY) / 2;

              // Calculate perpendicular offset for label to avoid overlap with line
              const perpAngle = angle + Math.PI / 2;
              const labelOffsetX = 8 * Math.cos(perpAngle);
              const labelOffsetY = 8 * Math.sin(perpAngle);

              const markerId = edge.type ? `arrow-${edge.type}` : 'arrow-default';

              return (
                <g key={`edge-${idx}`}>
                  <line
                    x1={sourcePos.x}
                    y1={sourcePos.y}
                    x2={adjustedTargetX}
                    y2={adjustedTargetY}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    opacity={0.6}
                    markerEnd={!edge.bidirectional ? `url(#${markerId})` : undefined}
                    className="hover:opacity-90 transition-opacity cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdgeClick?.(edge);
                    }}
                  />
                  {edge.bidirectional && (
                    <>
                      <marker
                        id={`arrow-start-${idx}`}
                        viewBox="0 0 10 10"
                        refX="1"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto"
                      >
                        <path d="M 10 0 L 0 5 L 10 10 z" fill={color} opacity="0.8" />
                      </marker>
                      <line
                        x1={sourcePos.x}
                        y1={sourcePos.y}
                        x2={adjustedTargetX}
                        y2={adjustedTargetY}
                        stroke={color}
                        strokeWidth={strokeWidth}
                        opacity={0.6}
                        markerStart={`url(#arrow-start-${idx})`}
                        markerEnd={`url(#${markerId})`}
                        className="hover:opacity-90 transition-opacity cursor-pointer"
                      />
                    </>
                  )}
                  {edge.label && (
                    <g>
                      {/* Background rectangle for better readability */}
                      <rect
                        x={midX + labelOffsetX - edge.label.length * 2.5}
                        y={midY + labelOffsetY - 8}
                        width={edge.label.length * 5}
                        height={16}
                        fill="hsl(var(--background))"
                        opacity="0.9"
                        rx="3"
                      />
                      <text
                        x={midX + labelOffsetX}
                        y={midY + labelOffsetY}
                        className="text-xs fill-foreground font-medium pointer-events-none"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Draw nodes */}
            {nodes.map((node) => {
              const pos = nodePositions[node.id];
              if (!pos) return null;

              const radius = node.size || 30; // Default to 30px for better readability
              const color = node.color || (node.type && defaultColorScheme[node.type as keyof typeof defaultColorScheme]) || '#3b82f6';

              // Calculate optimal text display using helper function with multi-line support
              const { fontSize, lines, needsEllipsis } = calculateTextDisplay(node.label, radius);

              // Calculate line spacing
              const lineHeight = fontSize * LINE_HEIGHT_RATIO;
              const totalHeight = lines.length * lineHeight;
              const startY = pos.y - totalHeight / 2 + lineHeight / 2;

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
                  {/* Multi-line text inside circle */}
                  <text
                    x={pos.x}
                    y={startY}
                    className="fill-white font-semibold pointer-events-none select-none"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize}
                  >
                    {lines.map((line, i) => (
                      <tspan
                        key={i}
                        x={pos.x}
                        dy={i === 0 ? 0 : lineHeight}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {/* Optional: Full label on hover below node */}
                  {hoveredNode?.id === node.id && needsEllipsis && (
                    <text
                      x={pos.x}
                      y={pos.y + radius + 14}
                      className="text-xs fill-foreground font-medium pointer-events-none"
                      textAnchor="middle"
                    >
                      {node.label}
                    </text>
                  )}
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
