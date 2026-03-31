/**
 * Shared utility functions for domain handlers [OMN-5191]
 *
 * Extracted from event-consumer.ts to reduce file size.
 * Pure functions with no side effects — safe to import anywhere.
 */

import type { NodeType, RegistrationState, IntrospectionReason } from './types';
import { ENVIRONMENT_PREFIXES } from '@shared/topics';

// ============================================================================
// Structured Logger
// ============================================================================

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
export const currentLogLevel = LOG_LEVELS[LOG_LEVEL as keyof typeof LOG_LEVELS] ?? LOG_LEVELS.info;

export const intentLogger = {
  debug: (message: string) => {
    if (currentLogLevel <= LOG_LEVELS.debug) {
      console.log(`[EventConsumer:intent:debug] ${message}`);
    }
  },
  info: (message: string) => {
    if (currentLogLevel <= LOG_LEVELS.info) {
      console.log(`[EventConsumer:intent] ${message}`);
    }
  },
  warn: (message: string) => {
    if (currentLogLevel <= LOG_LEVELS.warn) {
      console.warn(`[EventConsumer:intent:warn] ${message}`);
    }
  },
  error: (message: string, error?: unknown) => {
    console.error(`[EventConsumer:intent:error] ${message}`, error ?? '');
  },
};

// ============================================================================
// Timestamp Validation
// ============================================================================

/**
 * Validate and sanitize a timestamp string.
 * Returns a valid Date object or the current date if the input is invalid.
 */
export function sanitizeTimestamp(timestamp: string | undefined | null, fallback?: Date): Date {
  if (!timestamp) {
    return fallback ?? new Date();
  }

  const parsed = new Date(timestamp);

  if (isNaN(parsed.getTime())) {
    intentLogger.warn(`Invalid timestamp string: "${timestamp}", using fallback`);
    return fallback ?? new Date();
  }

  const maxFuture = Date.now() + 24 * 60 * 60 * 1000;
  if (parsed.getTime() > maxFuture) {
    intentLogger.warn(`Timestamp too far in future: "${timestamp}", using fallback`);
    return fallback ?? new Date();
  }

  const minPast = new Date('2000-01-01').getTime();
  if (parsed.getTime() < minPast) {
    intentLogger.warn(`Timestamp too far in past: "${timestamp}", using fallback`);
    return fallback ?? new Date();
  }

  return parsed;
}

// ============================================================================
// Enum Validation Guards
// ============================================================================

const VALID_NODE_TYPES: readonly NodeType[] = ['EFFECT', 'COMPUTE', 'REDUCER', 'ORCHESTRATOR'];
const VALID_REGISTRATION_STATES: readonly RegistrationState[] = [
  'pending_registration',
  'accepted',
  'awaiting_ack',
  'ack_received',
  'active',
  'rejected',
  'ack_timed_out',
  'liveness_expired',
];
const VALID_INTROSPECTION_REASONS: readonly IntrospectionReason[] = [
  'STARTUP',
  'HEARTBEAT',
  'REQUESTED',
];

function isValidNodeType(value: unknown): value is NodeType {
  if (typeof value !== 'string') return false;
  const normalized = value.toUpperCase().replace(/_GENERIC$/, '') as NodeType;
  return VALID_NODE_TYPES.includes(normalized);
}

function isValidRegistrationState(value: unknown): value is RegistrationState {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase() as RegistrationState;
  return VALID_REGISTRATION_STATES.includes(normalized);
}

function isValidIntrospectionReason(value: unknown): value is IntrospectionReason {
  if (typeof value !== 'string') return false;
  const normalized = value.toUpperCase() as IntrospectionReason;
  return VALID_INTROSPECTION_REASONS.includes(normalized);
}

export function parseNodeType(value: unknown, defaultValue: NodeType = 'COMPUTE'): NodeType {
  if (isValidNodeType(value)) {
    return (value as string).toUpperCase().replace(/_GENERIC$/, '') as NodeType;
  }
  if (value !== undefined && value !== null) {
    console.warn(
      `[EventConsumer] Invalid NodeType value: "${value}", using default: "${defaultValue}"`
    );
  }
  return defaultValue;
}

export function parseRegistrationState(
  value: unknown,
  defaultValue: RegistrationState = 'pending_registration'
): RegistrationState {
  if (isValidRegistrationState(value)) {
    return (value as string).toLowerCase() as RegistrationState;
  }
  if (value !== undefined && value !== null) {
    console.warn(
      `[EventConsumer] Invalid RegistrationState value: "${value}", using default: "${defaultValue}"`
    );
  }
  return defaultValue;
}

export function parseIntrospectionReason(
  value: unknown,
  defaultValue: IntrospectionReason = 'STARTUP'
): IntrospectionReason {
  if (isValidIntrospectionReason(value)) {
    return (value as string).toUpperCase() as IntrospectionReason;
  }
  if (value !== undefined && value !== null) {
    console.warn(
      `[EventConsumer] Invalid IntrospectionReason value: "${value}", using default: "${defaultValue}"`
    );
  }
  return defaultValue;
}

// ============================================================================
// Action Field Normalization
// ============================================================================

/**
 * Normalize actionType and agentName when upstream producers set junk values.
 * Extracts meaningful segments from canonical actionName when raw fields are
 * env prefixes (e.g. "dev") or "unknown".
 */
export function normalizeActionFields(
  rawActionType: string,
  rawAgentName: string,
  actionName: string
): { actionType: string; agentName: string } {
  const isJunkType =
    !rawActionType ||
    (ENVIRONMENT_PREFIXES as readonly string[]).includes(rawActionType) ||
    /^v\d+$/.test(rawActionType) ||
    /^\d+\.\d+(\.\d+)?$/.test(rawActionType);
  const isJunkAgent = !rawAgentName || rawAgentName === 'unknown';

  let actionType = rawActionType;
  let agentName = rawAgentName;

  if (isJunkType || isJunkAgent) {
    const parts = actionName.split('.');
    const onexIdx = parts.indexOf('onex');
    if (onexIdx >= 0 && parts.length >= onexIdx + 4) {
      if (isJunkType) actionType = parts[onexIdx + 3] || rawActionType;
      if (isJunkAgent) agentName = parts[onexIdx + 2] || rawAgentName;
    } else if (onexIdx >= 0 && parts.length === onexIdx + 3) {
      if (isJunkType) actionType = parts[onexIdx + 2] || rawActionType;
    }
  }

  return { actionType, agentName };
}
