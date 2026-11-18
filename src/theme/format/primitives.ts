/**
 * OMN-23330 AC20: the number and date formatting calls the rest of src makes, by name, so they all pass through this
 * module (local/no-adhoc-format refuses them anywhere else). Each is the platform call it names, unchanged.
 */

/** OMN-24616 AC6 (decision D2): the one word every page shows for a value that is missing or not served. */
export const NOT_MEASURED = 'Not measured';
/** OMN-24616 AC6 (Lakshman 2026-11-17): the word for a missing label (model, tier, host, a time); a figure reads NOT_MEASURED. */
export const NOT_RECORDED = 'Not recorded';

/** `value.toFixed(digits)`. */
export function fixed(value: number, digits?: number): string {
  return value.toFixed(digits);
}

/** `value.toLocaleString(...args)`, for a number, a bigint or a date. */
export function localeString(value: { toLocaleString: (...args: never[]) => string }, ...args: unknown[]): string {
  return (value.toLocaleString as (...a: unknown[]) => string).apply(value, args);
}

/** `date.toLocaleDateString(...args)`. */
export function localeDate(value: Date, ...args: Parameters<Date['toLocaleDateString']>): string {
  return value.toLocaleDateString(...args);
}

/** `date.toLocaleTimeString(...args)`. */
export function localeTime(value: Date, ...args: Parameters<Date['toLocaleTimeString']>): string {
  return value.toLocaleTimeString(...args);
}
