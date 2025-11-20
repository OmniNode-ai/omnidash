/**
 * Defensive Transform Logger
 *
 * Provides structured logging for data transformations with fallback values.
 * Helps identify data quality issues by logging when fallback values are used.
 *
 * Log levels:
 * - DEBUG: Expected fallback (normal operation)
 * - WARN: Unexpected missing data (data quality issue)
 * - ERROR: Complete data absence (critical issue)
 *
 * Usage:
 * ```typescript
 * const value = fallbackChain(
 *   'durationMs',
 *   { id: action.id, context: 'agent-action' },
 *   [
 *     { value: action.durationMs, label: 'durationMs' },
 *     { value: action.duration, label: 'legacy duration field', level: 'warn' },
 *     { value: 0, label: 'default', level: 'error' }
 *   ]
 * );
 * ```
 */

export type LogLevel = 'debug' | 'warn' | 'error';

export interface FallbackOption<T> {
  /** The value to try */
  value: T | undefined | null;
  /** Human-readable label for this value source */
  label: string;
  /** Log level when this fallback is used (default: 'debug' for last option, 'warn' for others) */
  level?: LogLevel;
}

export interface TransformContext {
  /** Record identifier (for debugging) */
  id?: string | number;
  /** Context description (e.g., 'agent-action', 'routing-decision') */
  context: string;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * Attempts a chain of fallback values and logs when fallbacks are used.
 *
 * @param fieldName - Name of the field being transformed
 * @param context - Context information for logging
 * @param options - Array of fallback options (tried in order)
 * @returns First non-null/undefined value, or the last option's value
 *
 * @example
 * ```typescript
 * const successRate = fallbackChain(
 *   'successRate',
 *   { id: agent.id, context: 'agent-summary' },
 *   [
 *     { value: agent.successRate, label: 'successRate field' },
 *     { value: agent.avgConfidence, label: 'avgConfidence field (legacy)', level: 'warn' },
 *     { value: 0, label: 'default zero', level: 'error' }
 *   ]
 * );
 * ```
 */
export function fallbackChain<T>(
  fieldName: string,
  context: TransformContext,
  options: FallbackOption<T>[]
): T {
  // Try each option in order
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const isLastOption = i === options.length - 1;

    // Check if this value is usable (not null/undefined)
    if (option.value !== null && option.value !== undefined) {
      // If this is not the first option, log the fallback
      if (i > 0) {
        const level = option.level ?? (isLastOption ? 'error' : 'warn');
        logFallback(level, fieldName, context, option.label, i);
      }

      return option.value;
    }
  }

  // All options were null/undefined, use last option's value
  const lastOption = options[options.length - 1];
  const level = lastOption.level ?? 'error';
  logFallback(level, fieldName, context, lastOption.label, options.length - 1);

  return lastOption.value as T;
}

/**
 * Logs a fallback event with structured context
 */
function logFallback(
  level: LogLevel,
  fieldName: string,
  context: TransformContext,
  usedLabel: string,
  fallbackIndex: number
): void {
  const contextStr = context.id ? `${context.context} [id: ${context.id}]` : context.context;

  const message = `[DataTransform] Fallback used for '${fieldName}' in ${contextStr}: using ${usedLabel} (fallback #${fallbackIndex + 1})`;

  switch (level) {
    case 'error':
      console.error(message, { fieldName, context, usedLabel, fallbackIndex });
      break;
    case 'warn':
      console.warn(message, { fieldName, context, usedLabel, fallbackIndex });
      break;
    case 'debug':
    default:
      console.warn(message, { fieldName, context, usedLabel, fallbackIndex });
      break;
  }
}

/**
 * Simple two-value fallback with automatic logging
 *
 * @param fieldName - Name of the field
 * @param primary - Primary value to try
 * @param fallback - Fallback value
 * @param context - Context for logging
 * @param level - Log level when fallback is used (default: 'warn')
 * @returns Primary value if defined, otherwise fallback
 *
 * @example
 * ```typescript
 * const count = withFallback('count', data.count, 0, { context: 'metric-summary' });
 * ```
 */
export function withFallback<T>(
  fieldName: string,
  primary: T | undefined | null,
  fallback: T,
  context: TransformContext,
  level: LogLevel = 'warn'
): T {
  if (primary !== null && primary !== undefined) {
    return primary;
  }

  logFallback(level, fieldName, context, 'fallback value', 1);
  return fallback;
}

/**
 * Array fallback with logging for empty arrays
 *
 * @param fieldName - Name of the field
 * @param array - Array value to check
 * @param context - Context for logging
 * @param level - Log level for empty arrays (default: 'warn')
 * @returns Array (empty array if input is null/undefined)
 */
export function ensureArray<T>(
  fieldName: string,
  array: T[] | undefined | null,
  context: TransformContext,
  level: LogLevel = 'warn'
): T[] {
  if (Array.isArray(array)) {
    if (array.length === 0) {
      console.warn(`[DataTransform] Empty array for '${fieldName}' in ${context.context}`);
    }
    return array;
  }

  logFallback(level, fieldName, context, 'empty array', 1);
  return [];
}

/**
 * Numeric value with validation and fallback
 *
 * @param fieldName - Name of the field
 * @param value - Numeric value to validate
 * @param fallback - Fallback value (default: 0)
 * @param context - Context for logging
 * @param options - Validation options (min, max)
 * @returns Valid numeric value or fallback
 */
export function ensureNumeric(
  fieldName: string,
  value: number | string | undefined | null,
  fallback: number = 0,
  context: TransformContext,
  options: { min?: number; max?: number } = {}
): number {
  // Convert to number if needed
  const num = typeof value === 'string' ? parseFloat(value) : value;

  // Check if valid number
  if (typeof num !== 'number' || isNaN(num)) {
    console.warn(
      `[DataTransform] Invalid numeric value for '${fieldName}' in ${context.context}: ${value}, using fallback ${fallback}`
    );
    return fallback;
  }

  // Check bounds
  if (options.min !== undefined && num < options.min) {
    console.warn(
      `[DataTransform] Value for '${fieldName}' in ${context.context} below minimum: ${num} < ${options.min}, clamping to ${options.min}`
    );
    return options.min;
  }

  if (options.max !== undefined && num > options.max) {
    console.warn(
      `[DataTransform] Value for '${fieldName}' in ${context.context} above maximum: ${num} > ${options.max}, clamping to ${options.max}`
    );
    return options.max;
  }

  return num;
}

/**
 * String value with fallback
 *
 * @param fieldName - Name of the field
 * @param value - String value to check
 * @param fallback - Fallback value (default: '')
 * @param context - Context for logging
 * @param allowEmpty - Whether empty strings are valid (default: false)
 * @returns Valid string or fallback
 */
export function ensureString(
  fieldName: string,
  value: string | undefined | null,
  fallback: string = '',
  context: TransformContext,
  allowEmpty: boolean = false
): string {
  if (typeof value === 'string') {
    if (!allowEmpty && value.trim() === '') {
      console.warn(
        `[DataTransform] Empty string for '${fieldName}' in ${context.context}, using fallback "${fallback}"`
      );
      return fallback;
    }
    return value;
  }

  logFallback('warn', fieldName, context, `fallback "${fallback}"`, 1);
  return fallback;
}

/**
 * Environment variable with fallback and logging
 *
 * @param varName - Environment variable name
 * @param fallback - Fallback value
 * @param level - Log level when fallback is used (default: 'warn')
 * @returns Environment variable value or fallback
 */
export function ensureEnvVar(varName: string, fallback: string, level: LogLevel = 'warn'): string {
  const value = import.meta.env[varName];

  if (value !== undefined && value !== null && value !== '') {
    return value;
  }

  const message = `[DataTransform] Missing environment variable '${varName}', using fallback "${fallback}"`;

  switch (level) {
    case 'error':
      console.error(message);
      break;
    case 'warn':
      console.warn(message);
      break;
    case 'debug':
    default:
      console.warn(message);
      break;
  }

  return fallback;
}
