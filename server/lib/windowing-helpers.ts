/**
 * Shared Windowing Helpers (OMN-2158)
 *
 * Reusable time-windowing utilities for server-side projection computations.
 * Used by EventBusProjection for burst detection and windowed metrics.
 *
 * All functions are pure (no side effects) and work with any event shape
 * via the `timeExtractor` callback pattern.
 */

/**
 * Compute the epoch-ms cutoff for a given window size.
 * Events with timestamps >= this cutoff are "in window".
 */
export function getWindowCutoff(windowMs: number, now?: number): number {
  return (now ?? Date.now()) - windowMs;
}

/**
 * Filter events to only those within a time window.
 * Returns a new array (does not mutate input).
 */
export function filterEventsInWindow<T>(
  events: T[],
  windowMs: number,
  timeExtractor: (e: T) => number,
  now?: number
): T[] {
  const cutoff = getWindowCutoff(windowMs, now);
  return events.filter((e) => timeExtractor(e) >= cutoff);
}

/**
 * Compute events-per-second rate for events within a time window.
 * Returns 0 if no events fall within the window.
 */
export function computeRate<T>(
  events: T[],
  windowMs: number,
  timeExtractor: (e: T) => number,
  now?: number
): number {
  const windowedEvents = filterEventsInWindow(events, windowMs, timeExtractor, now);
  if (windowedEvents.length === 0) return 0;
  const windowSeconds = windowMs / 1000;
  return windowedEvents.length / windowSeconds;
}

/**
 * Compute the fraction of events that are errors within a time window.
 * Returns 0 if no events fall within the window (avoids division by zero).
 *
 * @returns Error rate as a fraction (0.0 – 1.0)
 */
export function computeErrorRate<T>(
  events: T[],
  windowMs: number,
  timeExtractor: (e: T) => number,
  isError: (e: T) => boolean,
  now?: number
): number {
  const windowedEvents = filterEventsInWindow(events, windowMs, timeExtractor, now);
  if (windowedEvents.length === 0) return 0;
  const errorCount = windowedEvents.filter(isError).length;
  return errorCount / windowedEvents.length;
}

/**
 * Count events within a time window.
 */
export function countEventsInWindow<T>(
  events: T[],
  windowMs: number,
  timeExtractor: (e: T) => number,
  now?: number
): number {
  const cutoff = getWindowCutoff(windowMs, now);
  let count = 0;
  for (const e of events) {
    if (timeExtractor(e) >= cutoff) count++;
  }
  return count;
}
