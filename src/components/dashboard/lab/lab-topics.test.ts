import { describe, expect, it } from 'vitest';
import {
  ERROR_WIDGET_TOPICS,
  EVENT_TRACE_TOPICS,
  LAB_BUS_BACKED_TOPICS,
} from './lab-topics';

describe('OMN-18772 live topic allowlist — AC4', () => {
  it.each([
    ['Event Trace', EVENT_TRACE_TOPICS],
    ['Errors', ERROR_WIDGET_TOPICS],
  ])('%s resolves only bus-backed lab topics', (_name, topics) => {
    expect(topics.every((topic) => LAB_BUS_BACKED_TOPICS.has(topic))).toBe(true);
  });
});
