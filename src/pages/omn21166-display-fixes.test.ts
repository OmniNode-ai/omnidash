/**
 * OMN-21166 part 3: display fixes found walking the seven pages on the lab build (2026-10-21).
 *
 * Failure modes, listed before the fixes:
 * 1. A served pricing version that is not a number ("savings-estimated") is shown as "pricing vsavings-estimated".
 * 2. A money figure of four decimals has no thousands separator ("$1039.2178" beside "$1,035.83").
 * 3. An escalation reason is a whole provider error (a 429 body with URLs) printed in full in the panel.
 * 4. Workflow's recorded cost prints the served number raw ("0.0"), unlike every other cost on the dashboard.
 * Each case below fails on 656b4416, where these helpers do not exist or format differently.
 */
import { describe, expect, it } from 'vitest';
import { fmtMoney4 } from '@/components/dashboard/event-dash/primitives';
import { escalationReason, pricingLabel } from '@/pages/DelegationEvidencePage';
import { recordedUsd } from '@/pages/local/workflow-analysis';

describe('pricingLabel', () => {
  it('names a non-numeric served version as served, with no stray v', () => {
    expect(pricingLabel('savings-estimated')).toBe('pricing savings-estimated');
  });
  it('prefixes v only to a numeric version, and never twice', () => {
    expect(pricingLabel('3')).toBe('pricing v3');
    expect(pricingLabel('2026.10.1')).toBe('pricing v2026.10.1');
    expect(pricingLabel('v3')).toBe('pricing v3');
  });
  it('shows no tag when no version is served', () => {
    expect(pricingLabel(null)).toBeNull();
    expect(pricingLabel(undefined)).toBeNull();
    expect(pricingLabel('')).toBeNull();
  });
});

describe('fmtMoney4', () => {
  it('groups thousands like the figures beside it', () => {
    expect(fmtMoney4(1039.2178)).toBe('$1,039.2178');
    expect(fmtMoney4(1035825.5)).toBe('$1,035,825.5000');
  });
  it('keeps small and zero values at four decimals', () => {
    expect(fmtMoney4(3.3923)).toBe('$3.3923');
    expect(fmtMoney4(0)).toBe('$0.0000');
  });
  it('puts the sign before the currency', () => {
    expect(fmtMoney4(-1234.5)).toBe('-$1,234.5000');
  });
  it('keeps a missing value as a dash, never $0', () => {
    expect(fmtMoney4(null)).toBe('—');
    expect(fmtMoney4(undefined)).toBe('—');
  });
});

describe('escalationReason', () => {
  const longError = 'provider HTTP 429 Too Many Requests for https://generativelanguage.googleapis.com/v1beta/openai/chat/completions: response_body=[{ "error": { "code": 429, "message": "You exceeded your current quota" } }]';
  it('shortens a long served reason and keeps the whole text for the title', () => {
    const shown = escalationReason(longError);
    expect(shown.text.length).toBeLessThanOrEqual(120);
    expect(shown.text.endsWith('…')).toBe(true);
    expect(shown.text.startsWith('provider HTTP 429 Too Many Requests')).toBe(true);
    expect(shown.title).toBe(longError);
  });
  it('folds line breaks and runs of spaces into one space', () => {
    expect(escalationReason('Timed out\n  waiting   for the broker').text).toBe('Timed out waiting for the broker');
  });
  it('leaves a short reason as served, with no title', () => {
    expect(escalationReason('Timed out waiting for Pattern B broker terminal event.')).toEqual({
      text: 'Timed out waiting for Pattern B broker terminal event.', title: undefined,
    });
  });
  it('names a missing reason rather than showing an empty row', () => {
    expect(escalationReason(null).text).toBe('Not recorded');
    expect(escalationReason('   ').text).toBe('Not recorded');
  });
});

describe('recordedUsd', () => {
  it('formats a served zero as money, not 0.0', () => {
    expect(recordedUsd(0)).toBe('$0.00');
    expect(recordedUsd('0.0')).toBe('$0.00');
  });
  it('uses the approved two-decimal money display', () => {
    expect(recordedUsd(0.012345)).toBe('$0.01');
    expect(recordedUsd('1234.5')).toBe('$1,234.50');
  });
  it('says Not recorded for a missing cost, never $0.00', () => {
    expect(recordedUsd(null)).toBe('Not recorded');
    expect(recordedUsd(undefined)).toBe('Not recorded');
    expect(recordedUsd('')).toBe('Not recorded');
  });
  it('shows a non-numeric served value as served', () => {
    expect(recordedUsd('n/a')).toBe('n/a');
  });
});
