import { describe, expect, it } from 'vitest';
import { failureCauseLabel, failureDetailText } from './plain-text';

// AC39: real refused-before-dispatch data exposed its stored enum on Runs.
// Cover every backend enum, missing versus unknown/malformed input, and detail
// text before implementing the presentation seam. Machine filter keys stay raw.
const labels = {
  provider_quota_exhausted: 'Provider quota exhausted', auth_failed: 'Authentication failed',
  provider_error: 'Provider error', quality_gate_refused: 'Quality gate refused', timeout: 'Timed out',
  no_terminal: 'Run completion not recorded', runtime_shutdown: 'Runtime stopped',
  refused_before_dispatch: 'Refused before dispatch', returned_to_caller: 'Returned to caller',
};
describe('AC39 failure cause presentation', () => {
  for (const [code, label] of Object.entries(labels)) {
    it(`names ${code} precisely without displaying the enum`, () => {
      expect(failureCauseLabel(code)).toBe(label);
    });
  }
  it('keeps missing, unrecognised and malformed causes distinct', () => {
    for (const missing of [null, undefined, '', ' \t ', 'Not recorded']) expect(failureCauseLabel(missing)).toBe('Not recorded');
    for (const unknown of ['future_backend_reason', {}, false, 42]) expect(failureCauseLabel(unknown)).toBe('Failure reason unavailable');
    expect(failureCauseLabel('none')).toBe('None');
  });
  it('preserves readable detail while translating known codes and refusing internal detail', () => {
    expect(failureDetailText('Request refused_before_dispatch: no model was called.')).toBe('Request Refused before dispatch: no model was called.');
    expect(failureDetailText('HTTP 503: upstream unavailable')).toBe('HTTP 503: upstream unavailable');
    expect(failureDetailText('future_backend_reason: topic_name is absent')).toBe('Failure details unavailable');
    expect(failureDetailText('Read delegation.decisions.v1 failed')).toBe('Failure details unavailable');
  });
});
