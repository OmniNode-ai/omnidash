/** ONEX node IDs are snake_case slugs; UUIDs get truncated. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLASS_NAME_RE = /^(Node|Handler|Effect|Compute|Orchestrator|Reducer)/;

/**
 * Derive a human-readable display name from a node ID.
 *
 * This is a presentation-layer heuristic, not a canonical naming system.
 * Priority: metadata.node_name > snake_case title-case > CamelCase split > UUID truncate.
 */
export function deriveNodeName(
  nodeId: string,
  metadata?: { description?: string; node_name?: string },
): string {
  // Prefer explicit node_name from metadata if available
  if (metadata?.node_name) return metadata.node_name;

  // Snake_case slugs: node_registry_effect -> Registry Effect
  if (!UUID_RE.test(nodeId) && nodeId.includes('_')) {
    const base = nodeId.replace(/^node_/, '');
    return base
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // UUID: truncate with ellipsis
  if (UUID_RE.test(nodeId)) return nodeId.slice(0, 8) + '\u2026';

  // CamelCase class names: NodeRegistryEffect -> Node Registry Effect
  if (CLASS_NAME_RE.test(nodeId)) {
    return nodeId.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  return nodeId;
}
