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
import { escalationReason, plainUnservedReason, pricingLabel } from '@/pages/DelegationEvidencePage';
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

// OMN-21166 part 10 AC52: no typed code or credential id reaches the escalation panel, mapped or not.
describe('escalationReason plain words', () => {
  it.each([
    ['SHAPE_REFUSED: response is a bare single-word fragment', 'Response too short: response is a bare single-word fragment'],
    ['MALFORMED: response does not compile as Python: invalid syntax', 'Malformed output: response does not compile as Python: invalid syntax'],
    ['TASK_MISMATCH: missing @pytest.mark.unit', 'Task mismatch: missing @pytest.mark.unit'],
    ['WEAK_OUTPUT: provider reported finish_reason=length', 'Weak output: provider reported output limit reached'],
    ['UNGROUNDED: 2 number(s) stated', 'Ungrounded figures: 2 number(s) stated'],
    ['RATE_LIMIT: provider refused', 'Rate limit: provider refused'],
    ['fails semantic_adequacy', 'fails semantic adequacy'],
  ])('%s reads %s', (served, expected) => {
    expect(escalationReason(served).text).toBe(expected);
  });

  it('masks a credential id in the row and in the title', () => {
    const served = `Delegation refused: credential_rejected for cred_localinstall_openrouter_bca10ee66b1144d898a29ed6af4cf2f3 on backend 'h' ${'x'.repeat(120)}`;
    const shown = escalationReason(served);
    expect(shown.text).toContain('key rejected for a stored key');
    expect(shown.text).not.toMatch(/cred_|[A-Z]{3,}_[A-Z]/);
    expect(shown.title).not.toContain('cred_');
  });

  it('leaves no ALL_CAPS code with a colon in any of the served reasons', () => {
    for (const served of ['SHAPE_REFUSED: a', 'MALFORMED: b; TASK_MISMATCH: c', 'SOMETHING_NEW: d']) {
      expect(escalationReason(served).text).not.toMatch(/\b[A-Z]{2,}(?:_[A-Z0-9]+)*:/);
    }
  });
});

// OMN-21166 part 10 AC53: an unserved panel names what is missing without an HTTP status.
describe('plainUnservedReason', () => {
  it.each([
    ['HTTP 503', 'This runtime does not provide this data yet'],
    ['HTTP 404 Not Found', 'This runtime does not provide this data yet'],
    ['HTTP 500', 'The runtime could not answer'],
    ['HTTP 400', 'HTTP 400'],
    ['tenant not configured', 'tenant not configured'],
  ])('%s reads %s', (reason, expected) => {
    expect(plainUnservedReason(reason)).toBe(expected);
  });

  it('keeps a missing reason missing', () => {
    expect(plainUnservedReason(null)).toBeNull();
    expect(plainUnservedReason(undefined)).toBeUndefined();
  });
});
