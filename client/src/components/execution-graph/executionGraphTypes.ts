/**
 * Execution Graph Types (OMN-1406)
 *
 * TypeScript types for the Node Execution Graph visualization feature.
 * Supports the ONEX four-node architecture: EFFECT, COMPUTE, REDUCER, ORCHESTRATOR.
 *
 * This file contains:
 * 1. Core domain types (GraphEvent, ExecutionGraph, etc.)
 * 2. React Flow integration types (ExecutionNode for @xyflow/react)
 */

import type { Node, Edge } from '@xyflow/react';

// ─────────────────────────────────────────────────────────────────────────────
// Core Domain Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ONEX Node Kinds
 *
 * The four fundamental types of nodes in the ONEX architecture:
 * - EFFECT: External I/O operations (APIs, DB, files)
 * - COMPUTE: Pure transformations and algorithms
 * - REDUCER: Aggregation and state persistence
 * - ORCHESTRATOR: Workflow coordination
 */
export type NodeKind = 'EFFECT' | 'COMPUTE' | 'REDUCER' | 'ORCHESTRATOR';

/**
 * Node Execution Status
 *
 * Represents the current state of a node's execution:
 * - pending: Not yet started
 * - running: Currently executing
 * - success: Completed successfully
 * - failed: Encountered an error
 * - skipped: Skipped due to conditional logic or upstream failure
 */
export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/**
 * Event types that can be received from the WebSocket stream.
 */
export type GraphEventType = 'node_started' | 'node_finished' | 'node_failed' | 'edge_emitted';

/**
 * Raw event shape from WebSocket (normalized from various sources).
 * This is the common format after normalization from ROUTING_DECISION,
 * AGENT_ACTION, and AGENT_TRANSFORMATION events.
 */
export interface GraphEvent {
  /** Unique correlation ID linking all events in a workflow */
  correlationId: string;
  /** ISO-8601 timestamp of when the event occurred */
  timestamp: string;
  /** Type of execution event */
  eventType: GraphEventType;
  /** Name of the node (e.g., "corpus-loader", "inference-engine") */
  nodeName: string;
  /** ONEX node kind */
  nodeKind: NodeKind;
  /** Parent node name for edge inference (if available) */
  parentNodeName?: string;
  /** Execution duration in milliseconds (for finished/failed events) */
  durationMs?: number;
  /** Input payload passed to the node */
  inputPayload?: unknown;
  /** Output payload returned from the node */
  outputPayload?: unknown;
  /** Error message (for failed events) */
  errorMessage?: string;
}

/**
 * Edge between nodes representing data flow (domain model).
 * Used for graph state management before React Flow conversion.
 */
export interface ExecutionEdge {
  /** Unique edge identifier (typically "source->target") */
  id: string;
  /** Source node name */
  source: string;
  /** Target node name */
  target: string;
  /** ISO-8601 timestamp of last event on this edge */
  lastEventAt?: string;
}

/**
 * Domain model for execution node state.
 * This is the internal state representation before React Flow conversion.
 */
export interface ExecutionNodeState {
  /** Unique node name identifier */
  nodeName: string;
  /** ONEX node kind (EFFECT, COMPUTE, REDUCER, ORCHESTRATOR) */
  nodeKind: NodeKind;
  /** Current execution status */
  status: NodeStatus;
  /** ISO-8601 timestamp when node started */
  startedAt?: string;
  /** ISO-8601 timestamp when node finished */
  finishedAt?: string;
  /** Execution duration in milliseconds */
  durationMs?: number;
  /** Input payload passed to the node */
  inputPayload?: unknown;
  /** Output payload returned from the node */
  outputPayload?: unknown;
  /** Error message if execution failed */
  errorMessage?: string;
}

/**
 * Complete execution graph state (domain model).
 * Aggregates all nodes and edges for a single workflow execution.
 */
export interface ExecutionGraph {
  /** Correlation ID for the workflow execution */
  correlationId: string;
  /** Map of node name to node execution state */
  nodes: Record<string, ExecutionNodeState>;
  /** Edges representing data flow between nodes */
  edges: ExecutionEdge[];
  /** ISO-8601 timestamp of last graph update */
  lastUpdatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// React Flow Integration Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Data payload for execution graph nodes
 *
 * Contains all information needed to render and identify a node.
 * Includes index signature for React Flow compatibility.
 */
export interface GraphNodeData {
  /** Index signature for React Flow compatibility */
  [key: string]: unknown;
  /** Unique identifier for the node */
  id: string;
  /** Display label for the node */
  label: string;
  /** The ONEX node kind (EFFECT/COMPUTE/REDUCER/ORCHESTRATOR) */
  nodeKind: NodeKind;
  /** Current execution status */
  status: NodeStatus;
  /** Execution duration in milliseconds (undefined if not started or still running) */
  durationMs?: number;
  /** Optional error message if status is 'failed' */
  errorMessage?: string;
  /** Timestamp when execution started */
  startedAt?: string;
  /** Timestamp when execution completed */
  completedAt?: string;
  /** Input data for the node (for debugging/inspection) */
  inputData?: Record<string, unknown>;
  /** Output data from the node (for debugging/inspection) */
  outputData?: Record<string, unknown>;
}

/**
 * React Flow node type with execution graph data
 */
export type ExecutionNode = Node<GraphNodeData, 'executionNode'>;

/**
 * React Flow edge type for execution flow connections
 */
export interface ExecutionEdge extends Edge {
  /** Edge animation state - animated when data is flowing */
  animated?: boolean;
  /** Custom styling based on connection status */
  style?: React.CSSProperties;
}

/**
 * Complete execution graph state
 */
export interface ExecutionGraphState {
  /** All nodes in the graph */
  nodes: ExecutionNode[];
  /** All edges connecting nodes */
  edges: ExecutionEdge[];
  /** Overall execution status */
  executionStatus: 'idle' | 'running' | 'completed' | 'failed';
  /** Total execution time in milliseconds */
  totalDurationMs?: number;
  /** Correlation ID for the execution */
  correlationId?: string;
}

/**
 * Extended node details for the inspector drawer
 *
 * Contains all information needed to display node details including
 * input/output payloads and error messages.
 */
export interface SelectedNodeDetails {
  /** Unique identifier for the node */
  id: string;
  /** Display name for the node */
  name: string;
  /** The ONEX node kind */
  kind: NodeKind;
  /** Current execution status */
  status: NodeStatus;
  /** Timestamp when execution started */
  startedAt: string | null;
  /** Timestamp when execution completed */
  finishedAt: string | null;
  /** Execution duration in milliseconds */
  durationMs: number | null;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Input data passed to this node */
  inputPayload: unknown;
  /** Output data produced by this node */
  outputPayload: unknown;
  /** Error message if the node failed */
  errorMessage: string | null;
  /** Additional metadata specific to the node type */
  metadata?: Record<string, unknown>;
}

/**
 * Helper function to convert GraphNodeData to SelectedNodeDetails
 */
export function toSelectedNodeDetails(node: ExecutionNode): SelectedNodeDetails {
  return {
    id: node.data.id,
    name: node.data.label,
    kind: node.data.nodeKind,
    status: node.data.status,
    startedAt: node.data.startedAt || null,
    finishedAt: node.data.completedAt || null,
    durationMs: node.data.durationMs || null,
    inputPayload: node.data.inputData || null,
    outputPayload: node.data.outputData || null,
    errorMessage: node.data.errorMessage || null,
    metadata: undefined,
  };
}

/**
 * Props for the ExecutionGraph canvas component
 */
export interface ExecutionGraphProps {
  /** Graph state containing nodes and edges */
  graphState: ExecutionGraphState;
  /** Callback when a node is clicked */
  onNodeClick?: (node: ExecutionNode) => void;
  /** Callback when a node is double-clicked (e.g., for drill-down) */
  onNodeDoubleClick?: (node: ExecutionNode) => void;
  /** Whether to show minimap */
  showMinimap?: boolean;
  /** Whether to show controls */
  showControls?: boolean;
  /** Additional CSS class name */
  className?: string;
}
