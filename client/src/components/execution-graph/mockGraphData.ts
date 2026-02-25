/**
 * Mock Graph Data (OMN-1406)
 *
 * Mock data generators for the Node Execution Graph visualization.
 * Demonstrates the ONEX four-node architecture for investor demos.
 *
 * Sample workflow: Document Analysis Pipeline
 * - corpus-loader (EFFECT): Load documents from storage
 * - inference-engine (COMPUTE): Run ML inference on documents
 * - evidence-reducer (REDUCER): Aggregate evidence from inference
 * - workflow-orchestrator (ORCHESTRATOR): Coordinate the pipeline
 */

import type {
  GraphEvent,
  ExecutionGraph,
  ExecutionNodeState,
  ExecutionEdge,
  NodeKind,
  NodeStatus,
} from './executionGraphTypes';
import { createInitialGraph, applyEventsToGraph } from './normalizeGraphEvents';

// ─────────────────────────────────────────────────────────────────────────────
// Demo Node Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Demo nodes representing the ONEX four-node architecture.
 */
export const DEMO_NODES = {
  corpusLoader: {
    nodeName: 'corpus-loader',
    nodeKind: 'EFFECT' as NodeKind,
    description: 'Loads documents from external storage',
    typicalDurationMs: 45,
  },
  inferenceEngine: {
    nodeName: 'inference-engine',
    nodeKind: 'COMPUTE' as NodeKind,
    description: 'Runs ML inference on documents',
    typicalDurationMs: 234,
  },
  evidenceReducer: {
    nodeName: 'evidence-reducer',
    nodeKind: 'REDUCER' as NodeKind,
    description: 'Aggregates evidence from inference results',
    typicalDurationMs: 12,
  },
  workflowOrchestrator: {
    nodeName: 'workflow-orchestrator',
    nodeKind: 'ORCHESTRATOR' as NodeKind,
    description: 'Coordinates the document analysis pipeline',
    typicalDurationMs: 8,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Mock Event Stream Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a mock event stream simulating a successful document analysis workflow.
 *
 * @param correlationId - Correlation ID for the workflow (optional)
 * @returns Array of GraphEvents in chronological order
 */
export function generateMockEventStream(correlationId?: string): GraphEvent[] {
  const corrId = correlationId || `demo-${Date.now()}`;
  const baseTime = Date.now();
  const events: GraphEvent[] = [];

  // Helper to create ISO timestamp with offset
  const ts = (offsetMs: number) => new Date(baseTime + offsetMs).toISOString();

  // 1. Orchestrator starts (coordinates the workflow)
  events.push({
    correlationId: corrId,
    timestamp: ts(0),
    eventType: 'node_started',
    nodeName: DEMO_NODES.workflowOrchestrator.nodeName,
    nodeKind: DEMO_NODES.workflowOrchestrator.nodeKind,
    inputPayload: {
      workflowType: 'document-analysis',
      documentCount: 42,
      priority: 'high',
    },
  });

  // 2. Orchestrator triggers corpus loader
  events.push({
    correlationId: corrId,
    timestamp: ts(5),
    eventType: 'edge_emitted',
    nodeName: DEMO_NODES.corpusLoader.nodeName,
    nodeKind: DEMO_NODES.corpusLoader.nodeKind,
    parentNodeName: DEMO_NODES.workflowOrchestrator.nodeName,
  });

  events.push({
    correlationId: corrId,
    timestamp: ts(8),
    eventType: 'node_started',
    nodeName: DEMO_NODES.corpusLoader.nodeName,
    nodeKind: DEMO_NODES.corpusLoader.nodeKind,
    parentNodeName: DEMO_NODES.workflowOrchestrator.nodeName,
    inputPayload: {
      source: 's3://omninode-documents/batch-2024-01',
      filePattern: '*.pdf',
      maxFiles: 100,
    },
  });

  // 3. Corpus loader completes
  events.push({
    correlationId: corrId,
    timestamp: ts(53),
    eventType: 'node_finished',
    nodeName: DEMO_NODES.corpusLoader.nodeName,
    nodeKind: DEMO_NODES.corpusLoader.nodeKind,
    durationMs: DEMO_NODES.corpusLoader.typicalDurationMs,
    outputPayload: {
      documentsLoaded: 42,
      totalSizeBytes: 15728640,
      formatDistribution: { pdf: 38, docx: 4 },
    },
  });

  // 4. Inference engine starts
  events.push({
    correlationId: corrId,
    timestamp: ts(55),
    eventType: 'edge_emitted',
    nodeName: DEMO_NODES.inferenceEngine.nodeName,
    nodeKind: DEMO_NODES.inferenceEngine.nodeKind,
    parentNodeName: DEMO_NODES.corpusLoader.nodeName,
  });

  events.push({
    correlationId: corrId,
    timestamp: ts(58),
    eventType: 'node_started',
    nodeName: DEMO_NODES.inferenceEngine.nodeName,
    nodeKind: DEMO_NODES.inferenceEngine.nodeKind,
    parentNodeName: DEMO_NODES.corpusLoader.nodeName,
    inputPayload: {
      model: 'omninode-qa-v3',
      batchSize: 8,
      confidenceThreshold: 0.85,
    },
  });

  // 5. Inference engine completes
  events.push({
    correlationId: corrId,
    timestamp: ts(292),
    eventType: 'node_finished',
    nodeName: DEMO_NODES.inferenceEngine.nodeName,
    nodeKind: DEMO_NODES.inferenceEngine.nodeKind,
    durationMs: DEMO_NODES.inferenceEngine.typicalDurationMs,
    outputPayload: {
      inferenceCount: 42,
      averageConfidence: 0.92,
      highConfidenceCount: 38,
      lowConfidenceCount: 4,
    },
  });

  // 6. Evidence reducer starts
  events.push({
    correlationId: corrId,
    timestamp: ts(295),
    eventType: 'edge_emitted',
    nodeName: DEMO_NODES.evidenceReducer.nodeName,
    nodeKind: DEMO_NODES.evidenceReducer.nodeKind,
    parentNodeName: DEMO_NODES.inferenceEngine.nodeName,
  });

  events.push({
    correlationId: corrId,
    timestamp: ts(298),
    eventType: 'node_started',
    nodeName: DEMO_NODES.evidenceReducer.nodeName,
    nodeKind: DEMO_NODES.evidenceReducer.nodeKind,
    parentNodeName: DEMO_NODES.inferenceEngine.nodeName,
    inputPayload: {
      aggregationStrategy: 'weighted-consensus',
      minEvidenceThreshold: 3,
    },
  });

  // 7. Evidence reducer completes
  events.push({
    correlationId: corrId,
    timestamp: ts(310),
    eventType: 'node_finished',
    nodeName: DEMO_NODES.evidenceReducer.nodeName,
    nodeKind: DEMO_NODES.evidenceReducer.nodeKind,
    durationMs: DEMO_NODES.evidenceReducer.typicalDurationMs,
    outputPayload: {
      evidenceItems: 156,
      uniqueClaims: 23,
      averageSupport: 6.8,
      consensusReached: true,
    },
  });

  // 8. Orchestrator completes (receives final results)
  events.push({
    correlationId: corrId,
    timestamp: ts(315),
    eventType: 'edge_emitted',
    nodeName: DEMO_NODES.workflowOrchestrator.nodeName,
    nodeKind: DEMO_NODES.workflowOrchestrator.nodeKind,
    parentNodeName: DEMO_NODES.evidenceReducer.nodeName,
  });

  events.push({
    correlationId: corrId,
    timestamp: ts(318),
    eventType: 'node_finished',
    nodeName: DEMO_NODES.workflowOrchestrator.nodeName,
    nodeKind: DEMO_NODES.workflowOrchestrator.nodeKind,
    durationMs: 318,
    outputPayload: {
      status: 'completed',
      totalDurationMs: 318,
      nodesExecuted: 4,
      result: 'success',
    },
  });

  return events;
}

/**
 * Generate a mock event stream simulating a failed workflow.
 *
 * @param correlationId - Correlation ID for the workflow (optional)
 * @returns Array of GraphEvents including a failure
 */
export function generateMockFailureEventStream(correlationId?: string): GraphEvent[] {
  const corrId = correlationId || `demo-fail-${Date.now()}`;
  const baseTime = Date.now();
  const events: GraphEvent[] = [];

  const ts = (offsetMs: number) => new Date(baseTime + offsetMs).toISOString();

  // 1. Orchestrator starts
  events.push({
    correlationId: corrId,
    timestamp: ts(0),
    eventType: 'node_started',
    nodeName: DEMO_NODES.workflowOrchestrator.nodeName,
    nodeKind: DEMO_NODES.workflowOrchestrator.nodeKind,
    inputPayload: { workflowType: 'document-analysis' },
  });

  // 2. Corpus loader starts and completes
  events.push({
    correlationId: corrId,
    timestamp: ts(8),
    eventType: 'node_started',
    nodeName: DEMO_NODES.corpusLoader.nodeName,
    nodeKind: DEMO_NODES.corpusLoader.nodeKind,
    parentNodeName: DEMO_NODES.workflowOrchestrator.nodeName,
  });

  events.push({
    correlationId: corrId,
    timestamp: ts(53),
    eventType: 'node_finished',
    nodeName: DEMO_NODES.corpusLoader.nodeName,
    nodeKind: DEMO_NODES.corpusLoader.nodeKind,
    durationMs: 45,
    outputPayload: { documentsLoaded: 42 },
  });

  // 3. Inference engine starts but fails
  events.push({
    correlationId: corrId,
    timestamp: ts(58),
    eventType: 'node_started',
    nodeName: DEMO_NODES.inferenceEngine.nodeName,
    nodeKind: DEMO_NODES.inferenceEngine.nodeKind,
    parentNodeName: DEMO_NODES.corpusLoader.nodeName,
  });

  events.push({
    correlationId: corrId,
    timestamp: ts(142),
    eventType: 'node_failed',
    nodeName: DEMO_NODES.inferenceEngine.nodeName,
    nodeKind: DEMO_NODES.inferenceEngine.nodeKind,
    durationMs: 84,
    errorMessage: 'CUDA out of memory: Tried to allocate 2.5 GiB',
    outputPayload: {
      processedBeforeFailure: 12,
      failedDocument: 'large-report-2024.pdf',
    },
  });

  // 4. Evidence reducer is skipped (pending)
  events.push({
    correlationId: corrId,
    timestamp: ts(145),
    eventType: 'node_started',
    nodeName: DEMO_NODES.evidenceReducer.nodeName,
    nodeKind: DEMO_NODES.evidenceReducer.nodeKind,
  });

  // 5. Orchestrator fails due to upstream failure
  events.push({
    correlationId: corrId,
    timestamp: ts(150),
    eventType: 'node_failed',
    nodeName: DEMO_NODES.workflowOrchestrator.nodeName,
    nodeKind: DEMO_NODES.workflowOrchestrator.nodeKind,
    durationMs: 150,
    errorMessage: 'Workflow failed: inference-engine node failed',
    outputPayload: {
      failedNode: 'inference-engine',
      partialResults: true,
    },
  });

  return events;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Execution Graph Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a complete mock execution graph representing the four-node demo.
 *
 * @param scenario - 'success' | 'failure' | 'running'
 * @returns Complete ExecutionGraph
 */
export function generateMockExecutionGraph(
  scenario: 'success' | 'failure' | 'running' = 'success'
): ExecutionGraph {
  const correlationId = `demo-${scenario}-${Date.now()}`;

  if (scenario === 'running') {
    return generateRunningGraph(correlationId);
  }

  const events =
    scenario === 'failure'
      ? generateMockFailureEventStream(correlationId)
      : generateMockEventStream(correlationId);

  return applyEventsToGraph(createInitialGraph(correlationId), events);
}

/**
 * Generate a graph showing a workflow in progress.
 */
function generateRunningGraph(correlationId: string): ExecutionGraph {
  const baseTime = Date.now();
  const ts = (offsetMs: number) => new Date(baseTime + offsetMs).toISOString();

  const nodes: Record<string, ExecutionNodeState> = {
    [DEMO_NODES.workflowOrchestrator.nodeName]: {
      nodeName: DEMO_NODES.workflowOrchestrator.nodeName,
      nodeKind: DEMO_NODES.workflowOrchestrator.nodeKind,
      status: 'running',
      startedAt: ts(-300),
      inputPayload: { workflowType: 'document-analysis' },
    },
    [DEMO_NODES.corpusLoader.nodeName]: {
      nodeName: DEMO_NODES.corpusLoader.nodeName,
      nodeKind: DEMO_NODES.corpusLoader.nodeKind,
      status: 'success',
      startedAt: ts(-295),
      finishedAt: ts(-250),
      durationMs: 45,
      inputPayload: { source: 's3://documents' },
      outputPayload: { documentsLoaded: 42 },
    },
    [DEMO_NODES.inferenceEngine.nodeName]: {
      nodeName: DEMO_NODES.inferenceEngine.nodeName,
      nodeKind: DEMO_NODES.inferenceEngine.nodeKind,
      status: 'running',
      startedAt: ts(-248),
      inputPayload: { model: 'omninode-qa-v3' },
    },
    [DEMO_NODES.evidenceReducer.nodeName]: {
      nodeName: DEMO_NODES.evidenceReducer.nodeName,
      nodeKind: DEMO_NODES.evidenceReducer.nodeKind,
      status: 'pending',
    },
  };

  const edges: ExecutionEdge[] = [
    {
      id: `${DEMO_NODES.workflowOrchestrator.nodeName}->${DEMO_NODES.corpusLoader.nodeName}`,
      source: DEMO_NODES.workflowOrchestrator.nodeName,
      target: DEMO_NODES.corpusLoader.nodeName,
      lastEventAt: ts(-295),
    },
    {
      id: `${DEMO_NODES.corpusLoader.nodeName}->${DEMO_NODES.inferenceEngine.nodeName}`,
      source: DEMO_NODES.corpusLoader.nodeName,
      target: DEMO_NODES.inferenceEngine.nodeName,
      lastEventAt: ts(-248),
    },
    {
      id: `${DEMO_NODES.inferenceEngine.nodeName}->${DEMO_NODES.evidenceReducer.nodeName}`,
      source: DEMO_NODES.inferenceEngine.nodeName,
      target: DEMO_NODES.evidenceReducer.nodeName,
    },
  ];

  return {
    correlationId,
    nodes,
    edges,
    lastUpdatedAt: ts(0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming Simulation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulate a streaming event source for development.
 * Yields events at realistic intervals.
 *
 * @param scenario - 'success' | 'failure'
 * @param speedMultiplier - Speed up the simulation (1 = realtime, 10 = 10x faster)
 */
export async function* simulateEventStream(
  scenario: 'success' | 'failure' = 'success',
  speedMultiplier = 10
): AsyncGenerator<GraphEvent, void, unknown> {
  const events =
    scenario === 'failure' ? generateMockFailureEventStream() : generateMockEventStream();

  let previousTimestamp: number | null = null;

  for (const event of events) {
    const eventTime = new Date(event.timestamp).getTime();

    if (previousTimestamp !== null) {
      const delay = (eventTime - previousTimestamp) / speedMultiplier;
      if (delay > 0) {
        await sleep(delay);
      }
    }

    previousTimestamp = eventTime;
    yield event;
  }
}

/**
 * Create a mock WebSocket-like event source for testing.
 *
 * @param onEvent - Callback for each event
 * @param scenario - 'success' | 'failure'
 * @param speedMultiplier - Speed multiplier
 * @returns Cleanup function to stop the simulation
 */
export function createMockEventSource(
  onEvent: (event: GraphEvent) => void,
  scenario: 'success' | 'failure' = 'success',
  speedMultiplier = 10
): () => void {
  let cancelled = false;

  (async () => {
    for await (const event of simulateEventStream(scenario, speedMultiplier)) {
      if (cancelled) break;
      onEvent(event);
    }
  })();

  return () => {
    cancelled = true;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get a summary of a mock graph for display.
 */
export function getMockGraphSummary(graph: ExecutionGraph): {
  totalNodes: number;
  nodesByStatus: Record<NodeStatus, number>;
  nodesByKind: Record<NodeKind, number>;
  totalEdges: number;
  totalDurationMs?: number;
} {
  const nodes = Object.values(graph.nodes);

  const nodesByStatus = nodes.reduce(
    (acc, node) => {
      acc[node.status] = (acc[node.status] || 0) + 1;
      return acc;
    },
    {} as Record<NodeStatus, number>
  );

  const nodesByKind = nodes.reduce(
    (acc, node) => {
      acc[node.nodeKind] = (acc[node.nodeKind] || 0) + 1;
      return acc;
    },
    {} as Record<NodeKind, number>
  );

  // Calculate total duration from first start to last finish
  const startTimes = nodes.filter((n) => n.startedAt).map((n) => new Date(n.startedAt!).getTime());
  const endTimes = nodes.filter((n) => n.finishedAt).map((n) => new Date(n.finishedAt!).getTime());

  let totalDurationMs: number | undefined;
  if (startTimes.length > 0 && endTimes.length > 0) {
    totalDurationMs = Math.max(...endTimes) - Math.min(...startTimes);
  }

  return {
    totalNodes: nodes.length,
    nodesByStatus,
    nodesByKind,
    totalEdges: graph.edges.length,
    totalDurationMs,
  };
}
