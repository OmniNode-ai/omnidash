import type { WorkflowNode, Connection, Port } from '../models/types';
import { getDefaultNodeData } from '../models/nodeRegistry';

/**
 * Export schema matching the spec:
 * - nodes with id, type, position, config, ports
 * - edges with from/to objects containing nodeId and port name
 */

export interface ExportedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  ports: {
    inputs: string[];
    outputs: string[];
  };
  /** Allow extra fields for forward compatibility */
  [key: string]: unknown;
}

export interface ExportedEdge {
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
  /** Allow extra fields for forward compatibility */
  [key: string]: unknown;
}

export interface WorkflowExport {
  version: string;
  nodes: ExportedNode[];
  edges: ExportedEdge[];
  /** Allow extra fields for forward compatibility */
  [key: string]: unknown;
}

/**
 * Exports the workflow to a JSON-serializable format matching the spec.
 * Optionally includes workflow-level metadata that was preserved from import.
 */
export function exportWorkflow(
  nodes: WorkflowNode[],
  connections: Connection[],
  workflowMeta?: Record<string, unknown>
): WorkflowExport {
  // Convert nodes to export format, preserving any extra fields
  // Sort by ID for deterministic output (stable ordering for clean diffs)
  const exportedNodes: ExportedNode[] = nodes
    .map((node) => ({
      // Spread any preserved extra fields first
      ...(node._extra || {}),
      // Then our known fields (these take precedence)
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      config: { ...node.data },
      ports: {
        inputs: node.inputPorts.map((p) => p.name),
        outputs: node.outputPorts.map((p) => p.name),
      },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // Convert connections to edges format, preserving any extra fields
  // Sort by composite key for deterministic output (stable ordering for clean diffs)
  const exportedEdges: ExportedEdge[] = connections
    .map((conn) => {
      const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
      const toNode = nodes.find((n) => n.id === conn.toNodeId);
      const fromPort = fromNode?.outputPorts.find((p) => p.id === conn.fromPortId);
      const toPort = toNode?.inputPorts.find((p) => p.id === conn.toPortId);

      return {
        // Spread any preserved extra fields first
        ...(conn._extra || {}),
        // Then our known fields (these take precedence)
        from: {
          nodeId: conn.fromNodeId,
          port: fromPort?.name ?? 'Out',
        },
        to: {
          nodeId: conn.toNodeId,
          port: toPort?.name ?? 'In',
        },
      };
    })
    .sort((a, b) => {
      // Sort by from.nodeId, then from.port, then to.nodeId, then to.port
      const keyA = `${a.from.nodeId}:${a.from.port}:${a.to.nodeId}:${a.to.port}`;
      const keyB = `${b.from.nodeId}:${b.from.port}:${b.to.nodeId}:${b.to.port}`;
      return keyA.localeCompare(keyB);
    });

  return {
    // Spread any preserved workflow-level metadata first
    ...(workflowMeta || {}),
    // Then our known fields (these take precedence)
    version: '1.0',
    nodes: exportedNodes,
    edges: exportedEdges,
  };
}

/** Known fields in ExportedNode that we handle explicitly */
const KNOWN_NODE_FIELDS = ['id', 'type', 'position', 'config', 'ports'];

/** Known fields in ExportedEdge that we handle explicitly */
const KNOWN_EDGE_FIELDS = ['from', 'to'];

/** Known fields in WorkflowExport that we handle explicitly */
const KNOWN_WORKFLOW_FIELDS = ['version', 'nodes', 'edges'];

/**
 * Extract unknown fields from an object (fields not in the known list)
 */
function extractExtraFields(
  obj: Record<string, unknown>,
  knownFields: string[]
): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  let hasExtra = false;

  for (const key of Object.keys(obj)) {
    if (!knownFields.includes(key)) {
      extra[key] = obj[key];
      hasExtra = true;
    }
  }

  return hasExtra ? extra : undefined;
}

/**
 * Converts exported workflow data back to internal format.
 * Returns nodes, connections, and any workflow-level metadata for round-trip preservation.
 */
export function importWorkflow(
  data: WorkflowExport,
  createPorts: (nodeId: string, nodeType: string) => { inputPorts: Port[]; outputPorts: Port[] }
): {
  nodes: WorkflowNode[];
  connections: Connection[];
  workflowMeta?: Record<string, unknown>;
} | null {
  try {
    // Validate basic structure
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      return null;
    }

    // Extract workflow-level extra fields (e.g., name, metadata, description)
    const workflowMeta = extractExtraFields(data as Record<string, unknown>, KNOWN_WORKFLOW_FIELDS);

    // Convert nodes, preserving any extra fields
    const nodes: WorkflowNode[] = data.nodes.map((exportedNode) => {
      const { inputPorts, outputPorts } = createPorts(exportedNode.id, exportedNode.type);

      // Merge imported config with defaults (imported config takes precedence)
      const defaultData = getDefaultNodeData(exportedNode.type);

      // Extract any extra fields from the node
      const nodeExtra = extractExtraFields(
        exportedNode as Record<string, unknown>,
        KNOWN_NODE_FIELDS
      );

      return {
        id: exportedNode.id,
        type: exportedNode.type,
        position: { x: exportedNode.position.x, y: exportedNode.position.y },
        data: { ...defaultData, ...(exportedNode.config || {}) },
        inputPorts,
        outputPorts,
        ...(nodeExtra && { _extra: nodeExtra }),
      };
    });

    // Build lookup maps for port resolution
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Convert edges to connections, preserving any extra fields
    const connections: Connection[] = [];
    for (const edge of data.edges) {
      const fromNode = nodeMap.get(edge.from.nodeId);
      const toNode = nodeMap.get(edge.to.nodeId);

      if (!fromNode || !toNode) continue;

      // Find ports by name
      const fromPort = fromNode.outputPorts.find((p) => p.name === edge.from.port);
      const toPort = toNode.inputPorts.find((p) => p.name === edge.to.port);

      if (!fromPort || !toPort) continue;

      // Extract any extra fields from the edge
      const edgeExtra = extractExtraFields(edge as Record<string, unknown>, KNOWN_EDGE_FIELDS);

      connections.push({
        id: `conn-${fromPort.id}-${toPort.id}`,
        fromPortId: fromPort.id,
        toPortId: toPort.id,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
        ...(edgeExtra && { _extra: edgeExtra }),
      });
    }

    return { nodes, connections, workflowMeta };
  } catch {
    return null;
  }
}

/**
 * Validates that data looks like a valid workflow export.
 */
export function isValidWorkflowExport(data: unknown): data is WorkflowExport {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  return typeof obj.version === 'string' && Array.isArray(obj.nodes) && Array.isArray(obj.edges);
}

/**
 * Downloads workflow as a JSON file.
 * Optionally includes workflow-level metadata for round-trip preservation.
 */
export function downloadWorkflowAsFile(
  nodes: WorkflowNode[],
  connections: Connection[],
  filename: string = 'workflow.json',
  workflowMeta?: Record<string, unknown>
): void {
  const exported = exportWorkflow(nodes, connections, workflowMeta);
  const json = JSON.stringify(exported, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Reads a workflow from a File object.
 */
export async function readWorkflowFromFile(file: File): Promise<WorkflowExport | null> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (isValidWorkflowExport(data)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}
