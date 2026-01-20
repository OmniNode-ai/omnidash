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
const HORIZONTAL_SPACING = 64; // Gap between nodes horizontally
const VERTICAL_SPACING = 150; // Gap between node kind tiers

// Y-position for each node kind tier
const KIND_Y_POSITIONS: Record<NodeKind, number> = {
  ORCHESTRATOR: 0,
  EFFECT: VERTICAL_SPACING,
  COMPUTE: VERTICAL_SPACING * 2,
  REDUCER: VERTICAL_SPACING * 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Layout Algorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate node positions based on node kind tiers.
 * Nodes are positioned hierarchically with ORCHESTRATOR at top,
 * spreading horizontally if multiple nodes share the same kind.
 */
function calculateNodePositions(
  nodes: Record<string, ExecutionNodeState>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // Group nodes by kind
  const nodesByKind: Record<NodeKind, ExecutionNodeState[]> = {
    ORCHESTRATOR: [],
    EFFECT: [],
    COMPUTE: [],
    REDUCER: [],
  };

  Object.values(nodes).forEach((node) => {
    nodesByKind[node.nodeKind].push(node);
  });

  // Calculate positions for each tier
  Object.entries(nodesByKind).forEach(([kind, kindNodes]) => {
    const y = KIND_Y_POSITIONS[kind as NodeKind];
    const totalWidth = kindNodes.length * NODE_WIDTH + (kindNodes.length - 1) * HORIZONTAL_SPACING;
    const startX = -totalWidth / 2 + NODE_WIDTH / 2;

    kindNodes.forEach((node, index) => {
      const x = startX + index * (NODE_WIDTH + HORIZONTAL_SPACING);
      positions.set(node.nodeName, { x, y });
    });
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
 * Convert ExecutionEdge to React Flow Edge with styling.
 */
function toReactFlowEdge(
  edge: { id: string; source: string; target: string },
  sourceNode: ExecutionNodeState | undefined
): Edge {
  const isAnimated = sourceNode?.status === 'running';
  const isSuccess = sourceNode?.status === 'success';
  const isFailed = sourceNode?.status === 'failed';

  let strokeColor = '#6b7280'; // gray-500 default
  if (isAnimated)
    strokeColor = '#3b82f6'; // blue-500
  else if (isSuccess)
    strokeColor = '#22c55e'; // green-500
  else if (isFailed) strokeColor = '#ef4444'; // red-500

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
    // Use side handles so edges route around nodes instead of through center
    sourceHandle: 'source-right',
    targetHandle: 'target-right',
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
      return toReactFlowEdge(edge, sourceNode);
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
