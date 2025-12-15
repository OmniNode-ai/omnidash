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
}

export interface ExportedEdge {
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

export interface WorkflowExport {
  version: string;
  nodes: ExportedNode[];
  edges: ExportedEdge[];
}

/**
 * Exports the workflow to a JSON-serializable format matching the spec.
 */
export function exportWorkflow(nodes: WorkflowNode[], connections: Connection[]): WorkflowExport {
  // Convert nodes to export format
  const exportedNodes: ExportedNode[] = nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    config: { ...node.data },
    ports: {
      inputs: node.inputPorts.map((p) => p.name),
      outputs: node.outputPorts.map((p) => p.name),
    },
  }));

  // Convert connections to edges format
  const exportedEdges: ExportedEdge[] = connections.map((conn) => {
    const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
    const toNode = nodes.find((n) => n.id === conn.toNodeId);
    const fromPort = fromNode?.outputPorts.find((p) => p.id === conn.fromPortId);
    const toPort = toNode?.inputPorts.find((p) => p.id === conn.toPortId);

    return {
      from: {
        nodeId: conn.fromNodeId,
        port: fromPort?.name ?? 'Out',
      },
      to: {
        nodeId: conn.toNodeId,
        port: toPort?.name ?? 'In',
      },
    };
  });

  return {
    version: '1.0',
    nodes: exportedNodes,
    edges: exportedEdges,
  };
}

/**
 * Converts exported workflow data back to internal format.
 * Returns nodes and connections ready to be loaded into state.
 */
export function importWorkflow(
  data: WorkflowExport,
  createPorts: (nodeId: string, nodeType: string) => { inputPorts: Port[]; outputPorts: Port[] }
): { nodes: WorkflowNode[]; connections: Connection[] } | null {
  try {
    // Validate basic structure
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      return null;
    }

    // Convert nodes
    const nodes: WorkflowNode[] = data.nodes.map((exportedNode) => {
      const { inputPorts, outputPorts } = createPorts(exportedNode.id, exportedNode.type);

      // Merge imported config with defaults (imported config takes precedence)
      const defaultData = getDefaultNodeData(exportedNode.type);

      return {
        id: exportedNode.id,
        type: exportedNode.type,
        position: { x: exportedNode.position.x, y: exportedNode.position.y },
        data: { ...defaultData, ...(exportedNode.config || {}) },
        inputPorts,
        outputPorts,
      };
    });

    // Build lookup maps for port resolution
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Convert edges to connections
    const connections: Connection[] = [];
    for (const edge of data.edges) {
      const fromNode = nodeMap.get(edge.from.nodeId);
      const toNode = nodeMap.get(edge.to.nodeId);

      if (!fromNode || !toNode) continue;

      // Find ports by name
      const fromPort = fromNode.outputPorts.find((p) => p.name === edge.from.port);
      const toPort = toNode.inputPorts.find((p) => p.name === edge.to.port);

      if (!fromPort || !toPort) continue;

      connections.push({
        id: `conn-${fromPort.id}-${toPort.id}`,
        fromPortId: fromPort.id,
        toPortId: toPort.id,
        fromNodeId: fromNode.id,
        toNodeId: toNode.id,
      });
    }

    return { nodes, connections };
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
 */
export function downloadWorkflowAsFile(
  nodes: WorkflowNode[],
  connections: Connection[],
  filename: string = 'workflow.json'
): void {
  const exported = exportWorkflow(nodes, connections);
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
