/**
 * ExecutionGraphCanvas - React Flow Canvas Component (OMN-1406)
 *
 * Renders the ONEX node execution graph using React Flow.
 * Converts ExecutionGraph domain model to React Flow nodes/edges
 * with hierarchical layout based on node kinds.
 *
 * Layout Strategy:
 * - ORCHESTRATOR nodes at top (y=0)
 * - EFFECT nodes at y=150
 * - COMPUTE nodes at y=300
 * - REDUCER nodes at y=450
 */

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { executionNodeTypes, statusStyles } from './ExecutionGraphNodes';
import type {
  ExecutionGraph,
  ExecutionNodeState,
  NodeKind,
  GraphNodeData,
  ExecutionNode,
} from './executionGraphTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Layout Constants
// ─────────────────────────────────────────────────────────────────────────────

const NODE_WIDTH = 192; // w-48 = 12rem = 192px
const NODE_HEIGHT = 100; // Approximate height of node
const HORIZONTAL_SPACING = 100; // Gap between nodes horizontally
const VERTICAL_SPACING = 50; // Small vertical offset for visual interest

// ─────────────────────────────────────────────────────────────────────────────
// Layout Algorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate node positions for a LEFT-TO-RIGHT horizontal flow.
 * Nodes are arranged in execution order with clear spacing.
 */
function calculateNodePositions(
  nodes: Record<string, ExecutionNodeState>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const nodeList = Object.values(nodes);

  // Sort nodes by kind to get execution order: ORCHESTRATOR -> EFFECT -> COMPUTE -> REDUCER
  const kindOrder: Record<NodeKind, number> = {
    ORCHESTRATOR: 0,
    EFFECT: 1,
    COMPUTE: 2,
    REDUCER: 3,
  };

  nodeList.sort((a, b) => kindOrder[a.nodeKind] - kindOrder[b.nodeKind]);

  // Position nodes left-to-right with slight vertical stagger
  nodeList.forEach((node, index) => {
    const x = index * (NODE_WIDTH + HORIZONTAL_SPACING);
    // Stagger vertically for visual interest
    const y = (index % 2) * VERTICAL_SPACING;
    positions.set(node.nodeName, { x, y });
  });

  return positions;
}

/**
 * Convert ExecutionNodeState to React Flow ExecutionNode.
 */
function toReactFlowNode(
  node: ExecutionNodeState,
  position: { x: number; y: number },
  isSelected: boolean
): ExecutionNode {
  const data: GraphNodeData = {
    id: node.nodeName,
    label: node.nodeName,
    nodeKind: node.nodeKind,
    status: node.status,
    durationMs: node.durationMs,
    errorMessage: node.errorMessage,
    startedAt: node.startedAt,
    completedAt: node.finishedAt,
    inputData: node.inputPayload as Record<string, unknown> | undefined,
    outputData: node.outputPayload as Record<string, unknown> | undefined,
  };

  return {
    id: node.nodeName,
    type: 'executionNode',
    position,
    data,
    selected: isSelected,
  };
}

/**
 * Edge color configuration.
 * Uses neutral colors that CONTRAST with node border colors (green/blue/red/yellow).
 * - Node borders: green (success), blue (running), red (failed), yellow (skipped), gray (pending)
 * - Edge colors: slate gray (neutral) - clearly different from status colors
 */
const EDGE_COLORS = {
  default: '#64748b', // slate-500 - neutral gray that contrasts with all status colors
  animated: '#a78bfa', // violet-400 - distinct from blue (running) for visibility
} as const;

/**
 * Determine if an edge is a "backward" edge (target appears before source in layout).
 * Backward edges need special routing to avoid intersecting nodes.
 */
function isBackwardEdge(
  sourceNode: ExecutionNodeState | undefined,
  targetNode: ExecutionNodeState | undefined
): boolean {
  if (!sourceNode || !targetNode) return false;

  const kindOrder: Record<NodeKind, number> = {
    ORCHESTRATOR: 0,
    EFFECT: 1,
    COMPUTE: 2,
    REDUCER: 3,
  };

  // Edge goes backward if target has lower order than source
  return kindOrder[targetNode.nodeKind] < kindOrder[sourceNode.nodeKind];
}

/**
 * Convert ExecutionEdge to React Flow Edge with styling.
 * - Uses neutral colors that contrast with node borders
 * - Routes backward edges below nodes to avoid intersections
 */
function toReactFlowEdge(
  edge: { id: string; source: string; target: string },
  sourceNode: ExecutionNodeState | undefined,
  targetNode: ExecutionNodeState | undefined
): Edge {
  const isAnimated = sourceNode?.status === 'running';
  const isBackward = isBackwardEdge(sourceNode, targetNode);

  // Use neutral colors that contrast with node border colors
  const strokeColor = isAnimated ? EDGE_COLORS.animated : EDGE_COLORS.default;

  // For backward edges (e.g., reducer -> orchestrator), route below nodes
  // by using bottom/top handles instead of right/left
  const sourceHandle = isBackward ? 'source-bottom' : 'source-right';
  const targetHandle = isBackward ? 'target-top' : 'target-left';

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: isAnimated,
    style: {
      stroke: strokeColor,
      strokeWidth: 2,
    },
    // Arrow marker to show data flow direction
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: strokeColor,
      width: 20,
      height: 20,
    },
    sourceHandle,
    targetHandle,
    // For backward edges, add offset to route below the graph
    ...(isBackward && {
      pathOptions: {
        offset: 80, // Route the edge further away from nodes
      },
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ExecutionGraphCanvasProps {
  graph: ExecutionGraph;
  onNodeClick?: (nodeName: string) => void;
  selectedNodeName?: string | null;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ExecutionGraphCanvas({
  graph,
  onNodeClick,
  selectedNodeName,
  className,
}: ExecutionGraphCanvasProps) {
  // Convert ExecutionGraph to React Flow nodes
  const nodes = useMemo((): Node[] => {
    const positions = calculateNodePositions(graph.nodes);

    return Object.values(graph.nodes).map((node) => {
      const position = positions.get(node.nodeName) || { x: 0, y: 0 };
      const isSelected = selectedNodeName === node.nodeName;
      return toReactFlowNode(node, position, isSelected);
    });
  }, [graph.nodes, selectedNodeName]);

  // Convert ExecutionGraph edges to React Flow edges
  const edges = useMemo((): Edge[] => {
    return graph.edges.map((edge) => {
      const sourceNode = graph.nodes[edge.source];
      const targetNode = graph.nodes[edge.target];
      return toReactFlowEdge(edge, sourceNode, targetNode);
    });
  }, [graph.edges, graph.nodes]);

  // Handle node click
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick]
  );

  // MiniMap node color based on status
  const nodeColor = useCallback((node: Node) => {
    const data = node.data as GraphNodeData;
    switch (data.status) {
      case 'running':
        return '#3b82f6'; // blue-500
      case 'success':
        return '#22c55e'; // green-500
      case 'failed':
        return '#ef4444'; // red-500
      case 'skipped':
        return '#eab308'; // yellow-500
      default:
        return '#6b7280'; // gray-500
    }
  }, []);

  return (
    <div className={className}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={executionNodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls
          showZoom
          showFitView
          showInteractive={false}
          className="bg-background border border-border rounded-lg"
        />
        <MiniMap
          nodeColor={nodeColor}
          maskColor="rgba(0, 0, 0, 0.6)"
          className="bg-background border border-border rounded-lg"
          pannable
          zoomable
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="hsl(var(--muted-foreground) / 0.2)"
        />
      </ReactFlow>
    </div>
  );
}

export default ExecutionGraphCanvas;
