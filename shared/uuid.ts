/**
 * Shared UUID Generation Utility
 *
 * Provides a single source of truth for UUID generation across the codebase.
 * Uses the native crypto.randomUUID() API available in:
 * - Node.js 14.17.0+
 * - All modern browsers (Chrome 92+, Safari 15.4+, Firefox 95+, Edge 92+)
 */

/**
 * Generate a UUID v4 using native crypto API.
 * Works in Node.js 14.17+ and modern browsers.
 *
 * @returns A randomly generated UUID v4 string
 *
 * @example
 * ```typescript
 * import { generateUUID } from '@shared/uuid';
 *
 * const id = generateUUID();
 * // Returns: "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}
