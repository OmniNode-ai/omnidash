/**
 * Event Enrichment Handlers (OMN-2418)
 *
 * Single source of truth for event category classification and display-only
 * metadata derivation. All handlers implement the EnrichmentHandler interface
 * and are dispatched via EventEnrichmentPipeline (O(1) Map lookup).
 *
 * Invariant: handlers derive ONLY display metadata — no domain logic,
 * no calculated business values, no side effects.
 */

import type {
  EventCategory,
  EventEnrichment,
  EventArtifact,
} from '../../shared/projection-types.js';

// ============================================================================
// Handler interface
// ============================================================================

export interface EnrichmentHandler {
  name: string;
  category: EventCategory;
  enrich(payload: Record<string, unknown>, type: string, topic: string): EventEnrichment;
}

// ============================================================================
// Module-private utilities
// ============================================================================

const WRAPPER_KEYS = ['data', 'payload', 'body', 'event', 'message'] as const;

/** Check top-level fields, then one wrapper level deep. */
function findField(payload: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (payload[key] !== undefined) return payload[key];
  }
  for (const wk of WRAPPER_KEYS) {
    const wrapper = payload[wk];
    if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
      const inner = wrapper as Record<string, unknown>;
      for (const key of keys) {
        if (inner[key] !== undefined) return inner[key];
      }
    }
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function truncate(s: string, max = 60): string {
  return s.length <= max ? s : s.slice(0, 57) + '...';
}

function extractBashCommand(
  toolInput: unknown,
  payload: Record<string, unknown>
): string | undefined {
  if (toolInput && typeof toolInput === 'object') {
    const ti = toolInput as Record<string, unknown>;
    const cmd = str(ti['command']) ?? str(ti['cmd']) ?? str(ti['args']);
    if (cmd) return cmd;
  }
  return str(findField(payload, ['command', 'cmd', 'bash_command'])) ?? undefined;
}

// ============================================================================
// Category classifier
// ============================================================================

/**
 * Single source of truth for event category routing.
 *
 * Precedence (first match wins):
 * 1. `toolName` in payload → tool_event
 * 2. Topic/type substrings → routing, intent, heartbeat, lifecycle, error
 * 3. `selectedAgent` in payload → routing_event
 * 4. Intent-pattern fields → intent_event
 * 5. Default → unknown
 */
export function deriveEventCategory(
  payload: Record<string, unknown>,
  type: string,
  topic: string
): EventCategory {
  const lType = type.toLowerCase();
  const lTopic = topic.toLowerCase();

  // Tool event: presence of toolName field takes highest priority
  const toolName = findField(payload, ['toolName', 'tool_name', 'tool']);
  if (toolName) return 'tool_event';

  // Error event
  if (
    lType.includes('error') ||
    lTopic.includes('error') ||
    lType.includes('failed') ||
    lType.includes('failure')
  ) {
    return 'error_event';
  }

  // Routing event
  if (
    lType.includes('routing') ||
    lTopic.includes('routing') ||
    lType.includes('route') ||
    lTopic.includes('route') ||
    findField(payload, ['selectedAgent', 'selected_agent'])
  ) {
    return 'routing_event';
  }

  // Intent event
  if (
    lType.includes('intent') ||
    lTopic.includes('intent') ||
    findField(payload, ['intent_category', 'intentCategory'])
  ) {
    return 'intent_event';
  }

  // Node heartbeat
  if (lType.includes('heartbeat') || lTopic.includes('heartbeat') || lType === 'node-heartbeat') {
    return 'node_heartbeat';
  }

  // Node lifecycle
  if (
    lType.includes('registration') ||
    lType.includes('lifecycle') ||
    lTopic.includes('registration') ||
    lTopic.includes('lifecycle') ||
    lType.includes('node-') ||
    lTopic.includes('node-registry')
  ) {
    return 'node_lifecycle';
  }

  return 'unknown';
}

// ============================================================================
// Handlers
// ============================================================================

const ToolExecutedHandler: EnrichmentHandler = {
  name: 'ToolExecutedHandler',
  category: 'tool_event',
  enrich(payload, type, _topic): EventEnrichment {
    const toolName = str(findField(payload, ['toolName', 'tool_name', 'tool'])) ?? 'Tool';
    const toolInput = findField(payload, ['toolInput', 'tool_input', 'input']);
    const artifacts: EventArtifact[] = [];
    let filePath: string | undefined;
    let bashCommand: string | undefined;

    const lTool = toolName.toLowerCase();

    if (lTool === 'read' || lTool === 'readfile') {
      filePath = str(
        (toolInput as Record<string, unknown> | undefined)?.['file_path'] ??
          findField(payload, ['file_path', 'filePath', 'path'])
      );
      if (filePath) {
        const short = filePath.split('/').pop() ?? filePath;
        artifacts.push({ kind: 'file_read', value: filePath, display: short });
      }
    } else if (lTool === 'write') {
      filePath = str(
        (toolInput as Record<string, unknown> | undefined)?.['file_path'] ??
          findField(payload, ['file_path', 'filePath', 'path'])
      );
      if (filePath) {
        const short = filePath.split('/').pop() ?? filePath;
        artifacts.push({ kind: 'file_write', value: filePath, display: short });
      }
    } else if (lTool === 'edit' || lTool === 'multiedit') {
      filePath = str(
        (toolInput as Record<string, unknown> | undefined)?.['file_path'] ??
          findField(payload, ['file_path', 'filePath', 'path'])
      );
      if (filePath) {
        const short = filePath.split('/').pop() ?? filePath;
        artifacts.push({ kind: 'file_edit', value: filePath, display: short });
      }
    } else if (lTool === 'glob') {
      const pattern = str(
        (toolInput as Record<string, unknown> | undefined)?.['pattern'] ??
          findField(payload, ['pattern', 'glob'])
      );
      if (pattern) {
        artifacts.push({ kind: 'glob_pattern', value: pattern });
      }
    } else if (lTool === 'bash') {
      bashCommand = extractBashCommand(toolInput, payload);
      if (bashCommand) {
        artifacts.push({
          kind: 'bash_command',
          value: bashCommand,
          display: truncate(bashCommand, 40),
        });
      }
    }

    // Summary: "ToolName target" e.g. "Read index.ts", "Bash ls -la"
    let summaryTarget: string;
    if (filePath) {
      summaryTarget = filePath.split('/').pop() ?? filePath;
    } else if (bashCommand) {
      summaryTarget = truncate(bashCommand, 40);
    } else {
      summaryTarget = str(findField(payload, ['target', 'name'])) ?? '';
    }
    const summary = truncate(summaryTarget ? `${toolName} ${summaryTarget}` : toolName);

    return {
      enrichmentVersion: 'v1',
      handler: 'ToolExecutedHandler',
      category: 'tool_event',
      summary,
      normalizedType: type,
      artifacts,
      toolName,
      filePath,
      bashCommand,
    };
  },
};

const RoutingDecisionHandler: EnrichmentHandler = {
  name: 'RoutingDecisionHandler',
  category: 'routing_event',
  enrich(payload, type, _topic): EventEnrichment {
    const selectedAgent =
      str(
        findField(payload, ['selectedAgent', 'selected_agent', 'agent', 'agentName', 'agent_name'])
      ) ?? 'unknown';
    const confidence = num(findField(payload, ['confidence', 'score', 'probability']));

    const confPart = confidence !== undefined ? ` (${Math.round(confidence * 100)}%)` : '';
    const summary = truncate(`Selected ${selectedAgent}${confPart}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'RoutingDecisionHandler',
      category: 'routing_event',
      summary,
      normalizedType: type,
      artifacts: [],
      selectedAgent,
      confidence,
    };
  },
};

const IntentHandler: EnrichmentHandler = {
  name: 'IntentHandler',
  category: 'intent_event',
  enrich(payload, type, _topic): EventEnrichment {
    const intentType =
      str(findField(payload, ['intent_category', 'intentCategory', 'intent', 'category'])) ??
      'unknown';
    const confidence = num(findField(payload, ['confidence', 'score', 'probability']));

    const confPart = confidence !== undefined ? ` (${Math.round(confidence * 100)}%)` : '';
    const summary = truncate(`${intentType}${confPart}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'IntentHandler',
      category: 'intent_event',
      summary,
      normalizedType: type,
      artifacts: [],
      intentType,
      confidence,
    };
  },
};

const NodeHeartbeatHandler: EnrichmentHandler = {
  name: 'NodeHeartbeatHandler',
  category: 'node_heartbeat',
  enrich(payload, type, _topic): EventEnrichment {
    const nodeId = str(findField(payload, ['nodeId', 'node_id', 'id', 'name'])) ?? 'unknown';
    const healthStatus =
      str(findField(payload, ['status', 'health', 'state', 'healthStatus'])) ?? 'healthy';

    const summary = truncate(`${nodeId} — ${healthStatus}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'NodeHeartbeatHandler',
      category: 'node_heartbeat',
      summary,
      normalizedType: type,
      artifacts: [],
      nodeId,
      healthStatus,
    };
  },
};

const NodeLifecycleHandler: EnrichmentHandler = {
  name: 'NodeLifecycleHandler',
  category: 'node_lifecycle',
  enrich(payload, type, _topic): EventEnrichment {
    const nodeId = str(findField(payload, ['nodeId', 'node_id', 'id', 'name'])) ?? 'unknown';

    // Derive a human-readable lifecycle event label from the type string
    const lType = type.toLowerCase();
    let eventLabel: string;
    if (lType.includes('registr')) {
      eventLabel = 'Node Registration';
    } else if (lType.includes('shutdown') || lType.includes('offline')) {
      eventLabel = 'Node Shutdown';
    } else if (lType.includes('startup') || lType.includes('started')) {
      eventLabel = 'Node Startup';
    } else {
      eventLabel = 'Node Lifecycle';
    }

    const summary = truncate(`${eventLabel}: ${nodeId}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'NodeLifecycleHandler',
      category: 'node_lifecycle',
      summary,
      normalizedType: type,
      artifacts: [],
      nodeId,
    };
  },
};

const ErrorEventHandler: EnrichmentHandler = {
  name: 'ErrorEventHandler',
  category: 'error_event',
  enrich(payload, type, _topic): EventEnrichment {
    const actionType = str(findField(payload, ['actionType', 'action_type', 'type'])) ?? type;
    const errorMessage =
      str(findField(payload, ['error', 'message', 'errorMessage', 'error_message'])) ??
      'Unknown error';

    const summary = truncate(`${actionType}: ${errorMessage}`);

    return {
      enrichmentVersion: 'v1',
      handler: 'ErrorEventHandler',
      category: 'error_event',
      summary,
      normalizedType: type,
      artifacts: [],
      actionName: actionType,
      error: errorMessage,
    };
  },
};

const DefaultHandler: EnrichmentHandler = {
  name: 'DefaultHandler',
  category: 'unknown',
  enrich(payload, type, _topic): EventEnrichment {
    const actionName =
      str(findField(payload, ['actionName', 'action_name'])) ??
      str(findField(payload, ['actionType', 'action_type'])) ??
      type;

    const summary = truncate(actionName);

    return {
      enrichmentVersion: 'v1',
      handler: 'DefaultHandler',
      category: 'unknown',
      summary,
      normalizedType: type,
      artifacts: [],
      actionName,
    };
  },
};

// ============================================================================
// Pipeline
// ============================================================================

export class EventEnrichmentPipeline {
  private readonly handlers: Map<EventCategory, EnrichmentHandler>;
  private readonly defaultHandler: EnrichmentHandler;

  constructor() {
    this.defaultHandler = DefaultHandler;
    this.handlers = new Map<EventCategory, EnrichmentHandler>([
      ['tool_event', ToolExecutedHandler],
      ['routing_event', RoutingDecisionHandler],
      ['intent_event', IntentHandler],
      ['node_heartbeat', NodeHeartbeatHandler],
      ['node_lifecycle', NodeLifecycleHandler],
      ['error_event', ErrorEventHandler],
      ['unknown', DefaultHandler],
    ]);
  }

  /** Classify and enrich an event. Never throws — returns fallback on error. */
  run(payload: Record<string, unknown>, type: string, topic: string): EventEnrichment {
    try {
      const category = deriveEventCategory(payload, type, topic);
      const handler = this.handlers.get(category) ?? this.defaultHandler;
      return handler.enrich(payload, type, topic);
    } catch {
      return this.defaultHandler.enrich(payload, type, topic);
    }
  }
}

/** Singleton consumed by projection-bootstrap.ts (OMN-2419). */
export const enrichmentPipeline = new EventEnrichmentPipeline();
