/**
 * Event Detail Panel Utilities
 *
 * Utility functions, constants, and types for the EventDetailPanel component.
 * Extracted for better separation of concerns and testability.
 */

import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Parsed payload details extracted from event data
 */
export interface ParsedDetails {
  prompt?: string;
  promptLength?: number;
  /** First 100 chars of prompt content — from EventEnrichment.promptPreview (prompt_event only) */
  promptPreview?: string;
  toolName?: string;
  toolResult?: string;
  toolInput?: unknown;
  filePath?: string;
  durationMs?: number;
  agentName?: string;
  selectedAgent?: string;
  confidence?: number;
  actionType?: string;
  actionName?: string;
  sessionId?: string;
  nodeId?: string;
  status?: string;
  healthStatus?: string;
  error?: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Topic styling configuration
 */
export interface TopicConfig {
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * Priority styling configuration
 */
export interface PriorityConfig {
  icon: typeof AlertCircle;
  label: string;
  color: string;
  bgColor: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Topic color configuration based on domain
 */
export const TOPIC_CONFIG: Record<string, TopicConfig> = {
  intelligence: {
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  agent: {
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  code: {
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  metadata: {
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  database: {
    color: 'text-teal-500',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
  },
  router: {
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
  },
  workflow: {
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
  },
  default: {
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/30',
  },
};

/**
 * Timing constant for copy feedback duration
 */
export const COPY_FEEDBACK_TIMEOUT_MS = 2000;

/**
 * Priority configuration with icons and styling
 */
export const PRIORITY_CONFIG: Record<string, PriorityConfig> = {
  critical: {
    icon: AlertCircle,
    label: 'Critical',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  high: {
    icon: AlertTriangle,
    label: 'High',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  normal: {
    icon: Info,
    label: 'Normal',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  low: {
    icon: CheckCircle2,
    label: 'Low',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract domain from topic name for color coding
 */
export function getTopicDomain(topic: string): string {
  const lowerTopic = topic.toLowerCase();
  for (const domain of Object.keys(TOPIC_CONFIG)) {
    if (domain !== 'default' && lowerTopic.includes(domain)) {
      return domain;
    }
  }
  return 'default';
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string): string {
  if (!timestamp) return timestamp;
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return timestamp; // Return original if invalid
  }
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Format JSON payload for display
 */
export function formatPayload(payload: string | undefined): string {
  if (!payload) return 'No payload data';

  try {
    const parsed = JSON.parse(payload);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // If not valid JSON, return as-is
    return payload;
  }
}

/**
 * Recursively search for a key in an object (handles nested payloads)
 */
export function findValue(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  // Search one level deep in common wrapper fields
  for (const wrapper of [
    'payload',
    'data',
    'body',
    'content',
    'details',
    'actionDetails',
    'action_details',
  ]) {
    if (obj[wrapper] && typeof obj[wrapper] === 'object') {
      const nested = obj[wrapper] as Record<string, unknown>;
      for (const key of keys) {
        if (nested[key] !== undefined) return nested[key];
      }
    }
  }
  return undefined;
}

/**
 * Parse payload and extract meaningful fields based on event type
 */
export function extractParsedDetails(
  payload: string | undefined,
  eventType: string
): ParsedDetails | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const details: ParsedDetails = {};

    // Extract prompt with deep search
    const prompt = findValue(parsed, [
      'prompt',
      'prompt_preview',
      'promptPreview',
      'user_prompt',
      'userPrompt',
      'input',
      'query',
      'message',
    ]);
    if (prompt && typeof prompt === 'string') {
      details.prompt = prompt;
    }

    // Prompt length
    const promptLength = findValue(parsed, ['prompt_length', 'promptLength', 'length']);
    if (typeof promptLength === 'number') {
      details.promptLength = promptLength;
    }

    // Tool information
    const toolName = findValue(parsed, [
      'tool_name',
      'toolName',
      'tool',
      'function_name',
      'functionName',
    ]);
    if (toolName && typeof toolName === 'string') {
      details.toolName = toolName;
    }

    const toolInput = findValue(parsed, [
      'tool_input',
      'toolInput',
      'input',
      'parameters',
      'args',
      'arguments',
    ]);
    if (toolInput !== undefined) {
      details.toolInput = toolInput;
    }

    const toolResult = findValue(parsed, ['tool_result', 'toolResult', 'output', 'response']);
    if (toolResult !== undefined) {
      details.toolResult =
        typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);
    }

    // File path
    const filePath = findValue(parsed, ['file_path', 'filePath', 'path', 'file']);
    if (filePath && typeof filePath === 'string') {
      details.filePath = filePath;
    }

    // Duration
    const duration = findValue(parsed, [
      'duration_ms',
      'durationMs',
      'duration',
      'elapsed_ms',
      'latency_ms',
    ]);
    if (typeof duration === 'number') {
      details.durationMs = duration;
    }

    // Agent info
    const agentName = findValue(parsed, ['agent_name', 'agentName', 'agent']);
    if (agentName && typeof agentName === 'string') {
      details.agentName = agentName;
    }

    const selectedAgent = findValue(parsed, ['selected_agent', 'selectedAgent']);
    if (selectedAgent && typeof selectedAgent === 'string') {
      details.selectedAgent = selectedAgent;
    }

    const confidence = findValue(parsed, ['confidence', 'confidence_score', 'score']);
    if (typeof confidence === 'number') {
      details.confidence = confidence;
    }

    // Action info
    const actionType = findValue(parsed, ['action_type', 'actionType', 'type']);
    if (actionType && typeof actionType === 'string') {
      details.actionType = actionType;
    }

    const actionName = findValue(parsed, ['action_name', 'actionName', 'name', 'action']);
    if (actionName && typeof actionName === 'string') {
      details.actionName = actionName;
    }

    // Session/Node info
    const sessionId = findValue(parsed, ['session_id', 'sessionId']);
    if (sessionId && typeof sessionId === 'string') {
      details.sessionId = sessionId;
    }

    const nodeId = findValue(parsed, ['node_id', 'nodeId']);
    if (nodeId && typeof nodeId === 'string') {
      details.nodeId = nodeId;
    }

    // Status/Errors
    const status = findValue(parsed, ['status', 'state']);
    if (status && typeof status === 'string') {
      details.status = status;
    }

    // Health status (for heartbeat events)
    const healthStatus = findValue(parsed, ['health_status', 'healthStatus', 'health']);
    if (healthStatus && typeof healthStatus === 'string') {
      details.healthStatus = healthStatus;
    }

    const error = findValue(parsed, ['error', 'error_message', 'errorMessage', 'message']);
    if (
      error &&
      typeof error === 'string' &&
      (parsed.status === 'error' ||
        parsed.error ||
        eventType.includes('error') ||
        eventType.includes('fail'))
    ) {
      details.error = error;
    }

    // Generic result
    const result = findValue(parsed, ['result', 'data', 'response']);
    if (result !== undefined && !details.toolResult) {
      details.result = result;
    }

    return Object.keys(details).length > 0 ? details : null;
  } catch {
    return null;
  }
}

/**
 * Extract only the meaningful payload content, stripping wrapper metadata
 */
export function getCleanPayload(payload: string | undefined): Record<string, unknown> | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;

    // Fields that are already shown in the header/metadata section
    const metadataFields = new Set([
      'id',
      'eventId',
      'event_id',
      'correlationId',
      'correlation_id',
      'timestamp',
      'created_at',
      'createdAt',
      'source',
      'topic',
      'topicRaw',
      'priority',
      'version',
      'schemaVersion',
    ]);

    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!metadataFields.has(key)) {
        clean[key] = value;
      }
    }

    return Object.keys(clean).length > 0 ? clean : null;
  } catch {
    return null;
  }
}

/**
 * Safely stringify JSON, handling circular references and other edge cases
 */
export function safeJsonStringify(value: unknown, indent: number = 2): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) {
            return '[Circular Reference]';
          }
          seen.add(val);
        }
        // Handle special values
        if (typeof val === 'bigint') {
          return val.toString();
        }
        if (val === undefined) {
          return null;
        }
        return val;
      },
      indent
    );
  } catch (error) {
    return `[Unable to stringify: ${error instanceof Error ? error.message : 'Unknown error'}]`;
  }
}

/**
 * Safely convert a confidence value to a percentage string
 */
export function safePercentage(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'N/A';
  }
  return `${(value * 100).toFixed(0)}%`;
}
