/**
 * Tests for EventEnvelope compat helpers (OMN-3250)
 *
 * Verifies that getEnvelopeId / getEnvelopeTimestamp:
 *   1. Return the value and emit a warn log when only the legacy alias is present
 *   2. Return the value and emit no warn when only the canonical field is present
 *   3. Prefer the canonical field (no warn) when both fields are present
 *
 * Follow-up: OMN-3553 removes the legacy aliases once telemetry confirms zero
 * usage for 7 consecutive days.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEnvelopeId, getEnvelopeTimestamp } from '../event-envelope';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CANONICAL_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const LEGACY_ID = '11111111-2222-3333-4444-555555555555';
const CANONICAL_TS = '2026-01-01T00:00:00.000Z';
const LEGACY_TS = '2025-06-15T12:30:00.000Z';

// ---------------------------------------------------------------------------
// getEnvelopeId
// ---------------------------------------------------------------------------

describe('getEnvelopeId', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns entity_id and emits a structured warn when only the legacy alias is present', () => {
    const result = getEnvelopeId({ entity_id: LEGACY_ID });

    expect(result).toBe(LEGACY_ID);
    expect(warnSpy).toHaveBeenCalledOnce();

    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(logged.level).toBe('warn');
    expect(logged.event).toBe('legacy_envelope_field_used');
    expect(logged.field).toBe('entity_id');
  });

  it('returns envelope_id and emits no warn when only the canonical field is present', () => {
    const result = getEnvelopeId({ envelope_id: CANONICAL_ID });

    expect(result).toBe(CANONICAL_ID);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns envelope_id without a warn when both fields are present', () => {
    const result = getEnvelopeId({ envelope_id: CANONICAL_ID, entity_id: LEGACY_ID });

    expect(result).toBe(CANONICAL_ID);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns undefined when neither field is present', () => {
    expect(getEnvelopeId({})).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getEnvelopeTimestamp
// ---------------------------------------------------------------------------

describe('getEnvelopeTimestamp', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns emitted_at and emits a structured warn when only the legacy alias is present', () => {
    const result = getEnvelopeTimestamp({ emitted_at: LEGACY_TS });

    expect(result).toBe(LEGACY_TS);
    expect(warnSpy).toHaveBeenCalledOnce();

    const logged = JSON.parse(warnSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(logged.level).toBe('warn');
    expect(logged.event).toBe('legacy_envelope_field_used');
    expect(logged.field).toBe('emitted_at');
  });

  it('returns envelope_timestamp and emits no warn when only the canonical field is present', () => {
    const result = getEnvelopeTimestamp({ envelope_timestamp: CANONICAL_TS });

    expect(result).toBe(CANONICAL_TS);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns envelope_timestamp without a warn when both fields are present', () => {
    const result = getEnvelopeTimestamp({
      envelope_timestamp: CANONICAL_TS,
      emitted_at: LEGACY_TS,
    });

    expect(result).toBe(CANONICAL_TS);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns undefined when neither field is present', () => {
    expect(getEnvelopeTimestamp({})).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
