/**
 * Number Utility Functions
 *
 * Shared numeric validation and transformation utilities with logging.
 * Used across both client and server for consistent data handling.
 */

export interface TransformContext {
  /** Record identifier (for debugging) */
  id?: string | number;
  /** Context description (e.g., 'agent-action', 'routing-decision') */
  context: string;
  /** Additional metadata */
  [key: string]: any;
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
 *
 * @example
 * ```typescript
 * const count = ensureNumeric('count', data.count, 0, { context: 'metric-summary' });
 * const percentage = ensureNumeric('percent', value, 0, { context: 'stats' }, { min: 0, max: 100 });
 * ```
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
