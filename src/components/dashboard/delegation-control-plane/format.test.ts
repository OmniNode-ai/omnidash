import { describe, expect, it } from 'vitest';
import { usdFractionDigits } from '@/lib/currency';
import { fmtUsd } from './format';

describe('fmtUsd', () => {
  it('preserves a small nonzero token cost instead of displaying zero', () => {
    expect(fmtUsd(0.000216)).toBe('$0.000216');
  });

  it('keeps conventional precision for zero and cent-scale amounts', () => {
    expect(fmtUsd(0)).toBe('$0.00');
    expect(fmtUsd(1.42)).toBe('$1.42');
  });

  it('gives the animated cost KPI enough precision for the live value', () => {
    expect(usdFractionDigits(0.000216)).toBe(6);
    expect(usdFractionDigits(0)).toBe(2);
    expect(usdFractionDigits(1.42)).toBe(2);
  });
});
