/**
 * OMN-23330 AC20: the number and date formatting calls the rest of src makes, by name, so they all pass through this
 * module (local/no-adhoc-format refuses them anywhere else). Each is the platform call it names, unchanged.
 */

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
