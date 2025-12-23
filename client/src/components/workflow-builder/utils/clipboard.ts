import type { WorkflowNode, Connection, ClipboardData } from '../models/types';

/**
 * Creates clipboard data from selected nodes and their internal connections.
 * Returns null if no nodes are selected.
 */
export function createClipboardData(
  selectedNodeIds: string[],
  nodes: WorkflowNode[],
  connections: Connection[]
): ClipboardData | null {
  if (selectedNodeIds.length === 0) return null;

  // Get selected nodes
  const selectedNodes = nodes.filter((n) => selectedNodeIds.includes(n.id));

  // Calculate center of selection
  const centerX = selectedNodes.reduce((sum, n) => sum + n.position.x, 0) / selectedNodes.length;
  const centerY = selectedNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedNodes.length;

  // Create node ID to clipboard index mapping
  const idToIndex = new Map<string, number>();
  selectedNodes.forEach((node, index) => {
    idToIndex.set(node.id, index);
  });

  // Create clipboard nodes with relative positions
  const clipboardNodes = selectedNodes.map((node, index) => ({
    clipboardIndex: index,
    type: node.type,
    relativePosition: {
      x: node.position.x - centerX,
      y: node.position.y - centerY,
    },
    data: { ...node.data },
    inputPortCount: node.inputPorts.length,
    outputPortCount: node.outputPorts.length,
  }));

  // Find internal connections (both endpoints in selection)
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const internalConnections = connections.filter(
    (conn) => selectedNodeIdSet.has(conn.fromNodeId) && selectedNodeIdSet.has(conn.toNodeId)
  );

  // Convert to clipboard connections using indices
  const clipboardConnections = internalConnections.map((conn) => {
    const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
    const toNode = nodes.find((n) => n.id === conn.toNodeId);
    const fromPort = fromNode?.outputPorts.find((p) => p.id === conn.fromPortId);
    const toPort = toNode?.inputPorts.find((p) => p.id === conn.toPortId);

    return {
      fromNodeIndex: idToIndex.get(conn.fromNodeId) ?? 0,
      fromPortIndex: fromPort?.index ?? 0,
      toNodeIndex: idToIndex.get(conn.toNodeId) ?? 0,
      toPortIndex: toPort?.index ?? 0,
    };
  });

  return {
    version: '1.0',
    nodes: clipboardNodes,
    connections: clipboardConnections,
  };
}

/**
 * Writes clipboard data to the system clipboard as JSON.
 * Falls back silently if clipboard API is not available.
 */
export async function writeToSystemClipboard(data: ClipboardData): Promise<boolean> {
  try {
    const json = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(json);
    return true;
  } catch (error) {
    console.warn('Failed to write to system clipboard:', error);
    return false;
  }
}

/**
 * Reads clipboard data from the system clipboard.
 * Returns null if clipboard doesn't contain valid workflow data.
 */
export async function readFromSystemClipboard(): Promise<ClipboardData | null> {
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text);

    // Validate it looks like our clipboard format
    if (
      data &&
      typeof data.version === 'string' &&
      Array.isArray(data.nodes) &&
      Array.isArray(data.connections)
    ) {
      return data as ClipboardData;
    }
    return null;
  } catch {
    return null;
  }
}
