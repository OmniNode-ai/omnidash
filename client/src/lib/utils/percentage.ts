/**
 * Utility functions for percentage calculations and bounds checking
 */

/**
 * Clamps a percentage value between 0 and 100
 * @param value - The percentage value (can be 0-1 decimal or 0-100)
 * @param isDecimal - Whether the input is in decimal form (0-1) vs percentage (0-100)
 * @returns Clamped percentage between 0-100
 */
export function clampPercentage(value: number, isDecimal: boolean = false): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return 0;
  }
  
  // Convert decimal (0-1) to percentage (0-100) if needed
  const percentage = isDecimal ? value * 100 : value;
  
  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, percentage));
}

/**
 * Converts a decimal rate (0-1) to a clamped percentage (0-100)
 * @param rate - Decimal rate between 0 and 1
 * @returns Clamped percentage between 0-100
 */
export function rateToPercentage(rate: number): number {
  return clampPercentage(rate, true);
}

/**
 * Clamps a percentage value that might already be in percentage form (0-100)
 * @param percentage - Percentage value (0-100)
 * @returns Clamped percentage between 0-100
 */
export function clampPercentageValue(percentage: number): number {
  return clampPercentage(percentage, false);
}

/**
 * Formats a percentage value for display, ensuring it's clamped
 * @param value - The percentage value (can be 0-1 decimal or 0-100)
 * @param isDecimal - Whether the input is in decimal form (0-1) vs percentage (0-100)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "94.5%")
 */
export function formatPercentage(value: number, isDecimal: boolean = false, decimals: number = 1): string {
  const clamped = clampPercentage(value, isDecimal);
  return `${clamped.toFixed(decimals)}%`;
}



