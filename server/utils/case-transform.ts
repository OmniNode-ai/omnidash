/**
 * Case transformation utilities for converting between snake_case and camelCase
 *
 * These utilities are used for transforming Kafka event payloads (snake_case)
 * to TypeScript-friendly camelCase, and vice versa for client responses.
 */

/**
 * Transform snake_case object keys to camelCase
 *
 * @example
 * snakeToCamel({ user_name: 'john', created_at: '2024-01-01' })
 * // Returns: { userName: 'john', createdAt: '2024-01-01' }
 */
export function snakeToCamel<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

/**
 * Transform camelCase object keys to snake_case
 *
 * @example
 * camelToSnake({ userName: 'john', createdAt: '2024-01-01' })
 * // Returns: { user_name: 'john', created_at: '2024-01-01' }
 */
export function camelToSnake<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

/**
 * Type-safe transformation from snake_case Kafka event to camelCase
 * with explicit input and output types
 */
export function transformKafkaEvent<TInput extends Record<string, unknown>, TOutput>(
  event: TInput,
  transform: (event: TInput) => TOutput
): TOutput {
  return transform(event);
}

/**
 * Transform a RegisteredNode (camelCase) to snake_case for client responses
 *
 * This is used when sending node registry data over WebSocket
 */
export interface RegisteredNodeSnakeCase {
  node_id: string;
  node_type: string;
  state: string;
  version: string;
  uptime_seconds: number;
  last_seen: string | Date;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
  endpoints?: Record<string, string>;
}

export interface RegisteredNodeCamelCase {
  nodeId: string;
  nodeType: string;
  state: string;
  version: string;
  uptimeSeconds: number;
  lastSeen: string | Date;
  memoryUsageMb?: number;
  cpuUsagePercent?: number;
  endpoints?: Record<string, string>;
}

/**
 * Transform a RegisteredNode from camelCase to snake_case
 */
export function transformNodeToSnakeCase(node: RegisteredNodeCamelCase): RegisteredNodeSnakeCase {
  return {
    node_id: node.nodeId,
    node_type: node.nodeType,
    state: node.state,
    version: node.version,
    uptime_seconds: node.uptimeSeconds,
    last_seen: node.lastSeen,
    memory_usage_mb: node.memoryUsageMb,
    cpu_usage_percent: node.cpuUsagePercent,
    endpoints: node.endpoints,
  };
}

/**
 * Transform node introspection event to snake_case for WebSocket broadcast
 */
export interface NodeIntrospectionSnakeCase {
  node_id: string;
  node_type: string;
  node_version: string;
  endpoints: Record<string, string>;
  current_state: string;
  reason: string;
  correlation_id: string;
}

export interface NodeIntrospectionCamelCase {
  nodeId: string;
  nodeType: string;
  nodeVersion: string;
  endpoints: Record<string, string>;
  currentState: string;
  reason: string;
  correlationId: string;
}

export function transformNodeIntrospectionToSnakeCase(
  event: NodeIntrospectionCamelCase
): NodeIntrospectionSnakeCase {
  return {
    node_id: event.nodeId,
    node_type: event.nodeType,
    node_version: event.nodeVersion,
    endpoints: event.endpoints,
    current_state: event.currentState,
    reason: event.reason,
    correlation_id: event.correlationId,
  };
}

/**
 * Transform node heartbeat event to snake_case for WebSocket broadcast
 */
export interface NodeHeartbeatSnakeCase {
  node_id: string;
  uptime_seconds: number;
  active_operations_count: number;
  memory_usage_mb: number;
  cpu_usage_percent: number;
}

export interface NodeHeartbeatCamelCase {
  nodeId: string;
  uptimeSeconds: number;
  activeOperationsCount: number;
  memoryUsageMb: number;
  cpuUsagePercent: number;
}

export function transformNodeHeartbeatToSnakeCase(
  event: NodeHeartbeatCamelCase
): NodeHeartbeatSnakeCase {
  return {
    node_id: event.nodeId,
    uptime_seconds: event.uptimeSeconds,
    active_operations_count: event.activeOperationsCount,
    memory_usage_mb: event.memoryUsageMb,
    cpu_usage_percent: event.cpuUsagePercent,
  };
}

/**
 * Transform node state change event to snake_case for WebSocket broadcast
 */
export interface NodeStateChangeSnakeCase {
  node_id: string;
  previous_state: string;
  new_state: string;
  reason?: string;
}

export interface NodeStateChangeCamelCase {
  nodeId: string;
  previousState: string;
  newState: string;
  reason?: string;
}

export function transformNodeStateChangeToSnakeCase(
  event: NodeStateChangeCamelCase
): NodeStateChangeSnakeCase {
  return {
    node_id: event.nodeId,
    previous_state: event.previousState,
    new_state: event.newState,
    reason: event.reason,
  };
}

/**
 * Transform an array of RegisteredNodes to snake_case
 */
export function transformNodesToSnakeCase(
  nodes: RegisteredNodeCamelCase[]
): RegisteredNodeSnakeCase[] {
  return nodes.map(transformNodeToSnakeCase);
}
