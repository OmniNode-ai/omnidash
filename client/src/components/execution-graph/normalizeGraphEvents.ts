/**
 * Graph Event Normalizer (OMN-1406)
 *
 * Functions to normalize WebSocket events (ROUTING_DECISION, AGENT_ACTION,
 * AGENT_TRANSFORMATION) into a common GraphEvent format, and build/update
 * the ExecutionGraph from a stream of events.
 */

import type {
  GraphEvent,
  GraphEventType,
  NodeKind,
  NodeStatus,
  ExecutionGraph,
  ExecutionNodeState,
  ExecutionEdge,
} from './executionGraphTypes';

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket Event Types (input shapes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw WebSocket message wrapper.
 */
interface WsMessage {
  type: string;
  data?: unknown;
  timestamp: string;
}

/**
 * ROUTING_DECISION event data shape.
 */
interface RoutingDecisionData {
  correlationId?: string;
  selectedAgent?: string;
  confidenceScore?: number;
  routingTimeMs?: number;
  routingStrategy?: string;
  userRequest?: string;
  reasoning?: string;
  [key: string]: unknown;
}

/**
 * AGENT_ACTION event data shape.
 */
interface AgentActionData {
  correlationId?: string;
  agentName?: string;
  actionType?: string;
  actionName?: string;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  inputPayload?: unknown;
  outputPayload?: unknown;
  parentAction?: string;
  [key: string]: unknown;
}

/**
 * AGENT_TRANSFORMATION event data shape.
 */
interface AgentTransformationData {
  correlationId?: string;
  sourceAgent?: string;
  targetAgent?: string;
  transformationDurationMs?: number;
  success?: boolean;
  confidenceScore?: number;
  reason?: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node Kind Inference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infer NodeKind from agent/action name using naming conventions.
 *
 * Heuristics:
 * - Names containing "loader", "fetcher", "api", "db", "file" -> EFFECT
 * - Names containing "compute", "engine", "processor", "analyzer" -> COMPUTE
 * - Names containing "reducer", "aggregator", "collector" -> REDUCER
 * - Names containing "orchestrator", "coordinator", "workflow" -> ORCHESTRATOR
 * - Default: COMPUTE (most common)
 */
export function inferNodeKind(nodeName: string): NodeKind {
  const name = nodeName.toLowerCase();

  // EFFECT patterns - external I/O
  if (
    name.includes('loader') ||
    name.includes('fetcher') ||
    name.includes('api') ||
    name.includes('db') ||
    name.includes('file') ||
    name.includes('corpus') ||
    name.includes('reader') ||
    name.includes('writer') ||
    name.includes('effect')
  ) {
    return 'EFFECT';
  }

  // REDUCER patterns - aggregation
  if (
    name.includes('reducer') ||
    name.includes('aggregator') ||
    name.includes('collector') ||
    name.includes('merger') ||
    name.includes('combiner') ||
    name.includes('evidence')
  ) {
    return 'REDUCER';
  }

  // ORCHESTRATOR patterns - coordination
  if (
    name.includes('orchestrator') ||
    name.includes('coordinator') ||
    name.includes('workflow') ||
    name.includes('pipeline') ||
    name.includes('router')
  ) {
    return 'ORCHESTRATOR';
  }

  // COMPUTE patterns (or default)
  // Includes: engine, processor, analyzer, compute, transformer, etc.
  return 'COMPUTE';
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a ROUTING_DECISION event to GraphEvent format.
 */
function normalizeRoutingDecision(data: RoutingDecisionData, timestamp: string): GraphEvent | null {
  if (!data.selectedAgent) return null;

  return {
    correlationId: data.correlationId || generateCorrelationId(),
    timestamp,
    eventType: 'node_started',
    nodeName: data.selectedAgent,
    nodeKind: inferNodeKind(data.selectedAgent),
    durationMs: data.routingTimeMs,
    inputPayload: {
      userRequest: data.userRequest,
      routingStrategy: data.routingStrategy,
      confidenceScore: data.confidenceScore,
    },
    outputPayload: {
      reasoning: data.reasoning,
    },
  };
}

/**
 * Normalize an AGENT_ACTION event to GraphEvent format.
 */
function normalizeAgentAction(data: AgentActionData, timestamp: string): GraphEvent | null {
  const nodeName = data.actionName || data.agentName;
  if (!nodeName) return null;

  // Determine event type based on action state
  let eventType: GraphEventType = 'node_started';
  if (data.success === true) {
    eventType = 'node_finished';
  } else if (data.success === false) {
    eventType = 'node_failed';
  } else if (data.durationMs !== undefined) {
    // Has duration, likely finished
    eventType = 'node_finished';
  }

  return {
    correlationId: data.correlationId || generateCorrelationId(),
    timestamp,
    eventType,
    nodeName,
    nodeKind: inferNodeKind(nodeName),
    parentNodeName: data.parentAction,
    durationMs: data.durationMs,
    inputPayload: data.inputPayload,
    outputPayload: data.outputPayload,
    errorMessage: data.errorMessage,
  };
}

/**
 * Normalize an AGENT_TRANSFORMATION event to GraphEvent format.
 * Transformations create two events: one for source (finished) and one for target (started).
 */
function normalizeAgentTransformation(
  data: AgentTransformationData,
  timestamp: string
): GraphEvent[] {
  const events: GraphEvent[] = [];
  const correlationId = data.correlationId || generateCorrelationId();

  // Source agent finished
  if (data.sourceAgent) {
    events.push({
      correlationId,
      timestamp,
      eventType: data.success === false ? 'node_failed' : 'node_finished',
      nodeName: data.sourceAgent,
      nodeKind: inferNodeKind(data.sourceAgent),
      durationMs: data.transformationDurationMs,
      outputPayload: {
        confidenceScore: data.confidenceScore,
        reason: data.reason,
      },
    });
  }

  // Target agent started (if transformation was successful)
  if (data.targetAgent && data.success !== false) {
    events.push({
      correlationId,
      timestamp,
      eventType: 'node_started',
      nodeName: data.targetAgent,
      nodeKind: inferNodeKind(data.targetAgent),
      parentNodeName: data.sourceAgent,
      inputPayload: {
        transformedFrom: data.sourceAgent,
        confidenceScore: data.confidenceScore,
      },
    });

    // Also emit an edge event
    if (data.sourceAgent) {
      events.push({
        correlationId,
        timestamp,
        eventType: 'edge_emitted',
        nodeName: data.targetAgent,
        nodeKind: inferNodeKind(data.targetAgent),
        parentNodeName: data.sourceAgent,
      });
    }
  }

  return events;
}

/**
 * Normalize a raw WebSocket event to GraphEvent format.
 *
 * @param wsEvent - Raw WebSocket message
 * @returns Normalized GraphEvent(s), or null if event cannot be normalized
 */
export function normalizeWsEvent(wsEvent: unknown): GraphEvent[] | null {
  if (!wsEvent || typeof wsEvent !== 'object') return null;

  const message = wsEvent as WsMessage;
  const timestamp = message.timestamp || new Date().toISOString();

  switch (message.type) {
    case 'ROUTING_DECISION': {
      const event = normalizeRoutingDecision(message.data as RoutingDecisionData, timestamp);
      return event ? [event] : null;
    }

    case 'AGENT_ACTION': {
      const event = normalizeAgentAction(message.data as AgentActionData, timestamp);
      return event ? [event] : null;
    }

    case 'AGENT_TRANSFORMATION': {
      const events = normalizeAgentTransformation(
        message.data as AgentTransformationData,
        timestamp
      );
      return events.length > 0 ? events : null;
    }

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph State Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an initial empty execution graph.
 *
 * @param correlationId - Correlation ID for the workflow
 * @returns New empty ExecutionGraph
 */
export function createInitialGraph(correlationId: string): ExecutionGraph {
  return {
    correlationId,
    nodes: {},
    edges: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Apply a GraphEvent to update the ExecutionGraph state.
 * Handles node creation, status updates, and edge inference.
 *
 * @param graph - Current graph state
 * @param event - Event to apply
 * @returns Updated graph state (new object, immutable)
 */
export function applyEventToGraph(graph: ExecutionGraph, event: GraphEvent): ExecutionGraph {
  const newGraph: ExecutionGraph = {
    ...graph,
    nodes: { ...graph.nodes },
    edges: [...graph.edges],
    lastUpdatedAt: event.timestamp,
  };

  // Handle edge_emitted separately
  if (event.eventType === 'edge_emitted') {
    if (event.parentNodeName) {
      const edgeId = `${event.parentNodeName}->${event.nodeName}`;
      const existingEdgeIndex = newGraph.edges.findIndex((e) => e.id === edgeId);

      if (existingEdgeIndex === -1) {
        newGraph.edges.push({
          id: edgeId,
          source: event.parentNodeName,
          target: event.nodeName,
          lastEventAt: event.timestamp,
        });
      } else {
        newGraph.edges[existingEdgeIndex] = {
          ...newGraph.edges[existingEdgeIndex],
          lastEventAt: event.timestamp,
        };
      }
    }
    return newGraph;
  }

  // Get or create node
  const existingNode = newGraph.nodes[event.nodeName];
  const node: ExecutionNodeState = existingNode
    ? { ...existingNode }
    : {
        nodeName: event.nodeName,
        nodeKind: event.nodeKind,
        status: 'pending',
      };

  // Update node based on event type
  switch (event.eventType) {
    case 'node_started':
      node.status = 'running';
      node.startedAt = event.timestamp;
      if (event.inputPayload) {
        node.inputPayload = event.inputPayload;
      }
      break;

    case 'node_finished':
      node.status = 'success';
      node.finishedAt = event.timestamp;
      if (event.durationMs !== undefined) {
        node.durationMs = event.durationMs;
      } else if (node.startedAt) {
        // Calculate duration if not provided
        node.durationMs = new Date(event.timestamp).getTime() - new Date(node.startedAt).getTime();
      }
      if (event.outputPayload) {
        node.outputPayload = event.outputPayload;
      }
      break;

    case 'node_failed':
      node.status = 'failed';
      node.finishedAt = event.timestamp;
      node.errorMessage = event.errorMessage;
      if (event.durationMs !== undefined) {
        node.durationMs = event.durationMs;
      } else if (node.startedAt) {
        node.durationMs = new Date(event.timestamp).getTime() - new Date(node.startedAt).getTime();
      }
      break;
  }

  newGraph.nodes[event.nodeName] = node;

  // Infer edge from parent if not already present
  if (event.parentNodeName && event.eventType === 'node_started') {
    const edgeId = `${event.parentNodeName}->${event.nodeName}`;
    const hasEdge = newGraph.edges.some((e) => e.id === edgeId);

    if (!hasEdge) {
      newGraph.edges.push({
        id: edgeId,
        source: event.parentNodeName,
        target: event.nodeName,
        lastEventAt: event.timestamp,
      });
    }
  }

  return newGraph;
}

/**
 * Apply multiple events to a graph in sequence.
 *
 * @param graph - Initial graph state
 * @param events - Events to apply
 * @returns Updated graph state
 */
export function applyEventsToGraph(graph: ExecutionGraph, events: GraphEvent[]): ExecutionGraph {
  return events.reduce((g, event) => applyEventToGraph(g, event), graph);
}

/**
 * Infer edges from sequential node ordering when parentNodeName is missing.
 * This is useful for reconstructing a linear workflow from ordered events.
 *
 * @param graph - Graph with nodes but potentially missing edges
 * @returns Graph with inferred edges added
 */
export function inferSequentialEdges(graph: ExecutionGraph): ExecutionGraph {
  // Sort nodes by startedAt time
  const sortedNodes = Object.values(graph.nodes)
    .filter((n) => n.startedAt)
    .sort((a, b) => {
      const timeA = new Date(a.startedAt!).getTime();
      const timeB = new Date(b.startedAt!).getTime();
      return timeA - timeB;
    });

  if (sortedNodes.length < 2) return graph;

  const newEdges: ExecutionEdge[] = [...graph.edges];
  const existingEdgeIds = new Set(graph.edges.map((e) => e.id));

  // Create edges between sequential nodes
  for (let i = 0; i < sortedNodes.length - 1; i++) {
    const source = sortedNodes[i];
    const target = sortedNodes[i + 1];
    const edgeId = `${source.nodeName}->${target.nodeName}`;

    if (!existingEdgeIds.has(edgeId)) {
      newEdges.push({
        id: edgeId,
        source: source.nodeName,
        target: target.nodeName,
        lastEventAt: target.startedAt,
      });
      existingEdgeIds.add(edgeId);
    }
  }

  return {
    ...graph,
    edges: newEdges,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a random correlation ID.
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get the overall status of the graph based on node statuses.
 */
export function getGraphStatus(graph: ExecutionGraph): NodeStatus {
  const nodes = Object.values(graph.nodes);

  if (nodes.length === 0) return 'pending';
  if (nodes.some((n) => n.status === 'failed')) return 'failed';
  if (nodes.some((n) => n.status === 'running')) return 'running';
  if (nodes.every((n) => n.status === 'success' || n.status === 'skipped')) return 'success';
  if (nodes.some((n) => n.status === 'pending')) return 'pending';

  return 'success';
}

/**
 * Calculate total execution time for the graph.
 */
export function getGraphDuration(graph: ExecutionGraph): number | undefined {
  const nodes = Object.values(graph.nodes);
  const startTimes = nodes.filter((n) => n.startedAt).map((n) => new Date(n.startedAt!).getTime());
  const endTimes = nodes.filter((n) => n.finishedAt).map((n) => new Date(n.finishedAt!).getTime());

  if (startTimes.length === 0) return undefined;

  const minStart = Math.min(...startTimes);
  const maxEnd = endTimes.length > 0 ? Math.max(...endTimes) : Date.now();

  return maxEnd - minStart;
}

/**
 * Convert ExecutionNodeState to SelectedNodeDetails for the inspector.
 */
export function nodeToSelectedDetails(
  node: ExecutionNodeState
): import('./executionGraphTypes').SelectedNodeDetails {
  return {
    id: node.nodeName,
    name: node.nodeName,
    kind: node.nodeKind,
    status: node.status,
    startedAt: node.startedAt || null,
    finishedAt: node.finishedAt || null,
    durationMs: node.durationMs || null,
    inputPayload: node.inputPayload,
    outputPayload: node.outputPayload,
    errorMessage: node.errorMessage || null,
  };
}
