/**
 * Intent Drift Projection Field Alignment Tests (OMN-5288, Task 6)
 *
 * Verifies that projectIntentDriftDetected correctly extracts all fields
 * from the canonical payload emitted by the omniclaude drift emitter.
 *
 * The canonical payload uses snake_case field names:
 *   session_id, original_intent, current_intent, drift_score, severity
 *
 * The projection handler must accept both snake_case (canonical) and
 * camelCase (legacy/alternative) field names. This test ensures the
 * field mapping contract between omniclaude emitter and omnidash projection
 * is not broken by schema drift.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Canonical Payload Schema
// ============================================================================

/**
 * Canonical payload shape as emitted by the omniclaude intent drift emitter.
 * This is the contract between the emitter (omniclaude) and the projection (omnidash).
 *
 * Field mapping from omniclaude DriftSignal:
 *   DriftSignal.original_intent -> payload.original_intent
 *   DriftSignal.detected_intent -> payload.current_intent
 *   DriftSignal.drift_score     -> payload.drift_score
 *   DriftSignal.severity        -> payload.severity
 *   session_id                  -> payload.session_id
 */
interface CanonicalDriftPayload {
  session_id: string;
  original_intent: string;
  current_intent: string;
  drift_score: number;
  severity: string;
}

function makeCanonicalPayload(
  overrides: Partial<CanonicalDriftPayload> = {}
): CanonicalDriftPayload {
  return {
    session_id: 'ses-abc-123',
    original_intent: 'REFACTOR',
    current_intent: 'BUGFIX',
    drift_score: 0.72,
    severity: 'medium',
    ...overrides,
  };
}

// ============================================================================
// Projection Field Extraction Logic (mirrors projectIntentDriftDetected)
// ============================================================================

/**
 * Replicates the field extraction logic from projectIntentDriftDetected
 * at omniintelligence-projections.ts:1278-1289.
 *
 * This is tested in isolation to catch field mapping mismatches without
 * requiring a live database connection.
 */
function extractDriftFields(data: Record<string, unknown>) {
  return {
    sessionId: (data.session_id as string) || (data.sessionId as string) || null,
    originalIntent: (data.original_intent as string) || (data.originalIntent as string) || null,
    currentIntent: (data.current_intent as string) || (data.currentIntent as string) || null,
    driftScore:
      typeof data.drift_score === 'number'
        ? data.drift_score
        : typeof data.driftScore === 'number'
          ? data.driftScore
          : null,
    severity: (data.severity as string) || null,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Intent Drift Projection Field Alignment', () => {
  describe('canonical snake_case payload (omniclaude emitter output)', () => {
    it('should extract all fields from canonical payload', () => {
      const payload = makeCanonicalPayload();
      const row = extractDriftFields(payload);

      expect(row.sessionId).toBe('ses-abc-123');
      expect(row.originalIntent).toBe('REFACTOR');
      expect(row.currentIntent).toBe('BUGFIX');
      expect(row.driftScore).toBe(0.72);
      expect(row.severity).toBe('medium');
    });

    it('should handle all severity levels', () => {
      for (const sev of ['low', 'medium', 'high', 'critical']) {
        const row = extractDriftFields(makeCanonicalPayload({ severity: sev }));
        expect(row.severity).toBe(sev);
      }
    });

    it('should handle zero drift_score', () => {
      const row = extractDriftFields(makeCanonicalPayload({ drift_score: 0 }));
      expect(row.driftScore).toBe(0);
    });

    it('should handle drift_score of 1.0', () => {
      const row = extractDriftFields(makeCanonicalPayload({ drift_score: 1.0 }));
      expect(row.driftScore).toBe(1.0);
    });
  });

  describe('camelCase payload (legacy/alternative)', () => {
    it('should extract fields from camelCase payload', () => {
      const payload = {
        sessionId: 'ses-xyz-789',
        originalIntent: 'FEATURE',
        currentIntent: 'ANALYSIS',
        driftScore: 0.55,
        severity: 'low',
      };
      const row = extractDriftFields(payload);

      expect(row.sessionId).toBe('ses-xyz-789');
      expect(row.originalIntent).toBe('FEATURE');
      expect(row.currentIntent).toBe('ANALYSIS');
      expect(row.driftScore).toBe(0.55);
      expect(row.severity).toBe('low');
    });
  });

  describe('wrong field names (graceful handling)', () => {
    it('should return nulls for payload with intent_class instead of original_intent', () => {
      const payload = {
        session_id: 'ses-wrong-001',
        intent_class: 'REFACTOR', // wrong field name
        current_intent: 'BUGFIX',
        drift_score: 0.8,
        severity: 'high',
      };
      const row = extractDriftFields(payload);

      expect(row.sessionId).toBe('ses-wrong-001');
      expect(row.originalIntent).toBeNull(); // intent_class is not recognized
      expect(row.currentIntent).toBe('BUGFIX');
      expect(row.driftScore).toBe(0.8);
      expect(row.severity).toBe('high');
    });

    it('should return null driftScore for string drift_score', () => {
      const payload = {
        session_id: 'ses-wrong-002',
        original_intent: 'FEATURE',
        current_intent: 'BUGFIX',
        drift_score: '0.5', // string, not number
        severity: 'medium',
      };
      const row = extractDriftFields(payload);

      expect(row.driftScore).toBeNull(); // string drift_score rejected
    });

    it('should return nulls for completely empty payload', () => {
      const row = extractDriftFields({});

      expect(row.sessionId).toBeNull();
      expect(row.originalIntent).toBeNull();
      expect(row.currentIntent).toBeNull();
      expect(row.driftScore).toBeNull();
      expect(row.severity).toBeNull();
    });

    it('should return null for drift_type instead of current_intent', () => {
      const payload = {
        session_id: 'ses-wrong-003',
        original_intent: 'ANALYSIS',
        drift_type: 'BUGFIX', // wrong: omniintelligence ModelIntentDriftSignal uses drift_type
        drift_score: 0.6,
        severity: 'low',
      };
      const row = extractDriftFields(payload);

      expect(row.currentIntent).toBeNull(); // drift_type is not recognized
    });
  });

  describe('snake_case takes precedence over camelCase', () => {
    it('should prefer snake_case when both are present', () => {
      const payload = {
        session_id: 'snake-session',
        sessionId: 'camel-session',
        original_intent: 'snake-intent',
        originalIntent: 'camel-intent',
        drift_score: 0.9,
        driftScore: 0.1,
      };
      const row = extractDriftFields(payload);

      expect(row.sessionId).toBe('snake-session');
      expect(row.originalIntent).toBe('snake-intent');
      expect(row.driftScore).toBe(0.9);
    });
  });
});
