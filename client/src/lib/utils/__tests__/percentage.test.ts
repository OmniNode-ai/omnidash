import { describe, it, expect } from 'vitest';
import {
  clampPercentage,
  rateToPercentage,
  clampPercentageValue,
  formatPercentage,
} from '../percentage';

describe('Percentage Utilities', () => {
  describe('clampPercentage', () => {
    it('should clamp percentage values between 0 and 100', () => {
      expect(clampPercentage(50, false)).toBe(50);
      expect(clampPercentage(0, false)).toBe(0);
      expect(clampPercentage(100, false)).toBe(100);
      expect(clampPercentage(-10, false)).toBe(0);
      expect(clampPercentage(150, false)).toBe(100);
    });

    it('should convert decimal values to percentage when isDecimal is true', () => {
      expect(clampPercentage(0.5, true)).toBe(50);
      expect(clampPercentage(0.0, true)).toBe(0);
      expect(clampPercentage(1.0, true)).toBe(100);
      expect(clampPercentage(-0.1, true)).toBe(0);
      expect(clampPercentage(1.5, true)).toBe(100);
    });

    it('should handle NaN and invalid values', () => {
      expect(clampPercentage(NaN, false)).toBe(0);
      expect(clampPercentage(Infinity, false)).toBe(0);
      expect(clampPercentage(-Infinity, false)).toBe(0);
    });
  });

  describe('rateToPercentage', () => {
    it('should convert decimal rate to percentage', () => {
      expect(rateToPercentage(0.5)).toBe(50);
      expect(rateToPercentage(0.0)).toBe(0);
      expect(rateToPercentage(1.0)).toBe(100);
      expect(rateToPercentage(0.95)).toBe(95);
    });

    it('should clamp values outside 0-1 range', () => {
      expect(rateToPercentage(-0.1)).toBe(0);
      expect(rateToPercentage(1.5)).toBe(100);
    });
  });

  describe('clampPercentageValue', () => {
    it('should clamp percentage values between 0 and 100', () => {
      expect(clampPercentageValue(50)).toBe(50);
      expect(clampPercentageValue(0)).toBe(0);
      expect(clampPercentageValue(100)).toBe(100);
      expect(clampPercentageValue(-10)).toBe(0);
      expect(clampPercentageValue(150)).toBe(100);
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage values as strings', () => {
      expect(formatPercentage(50, false)).toBe('50.0%');
      expect(formatPercentage(0, false)).toBe('0.0%');
      expect(formatPercentage(100, false)).toBe('100.0%');
    });

    it('should format decimal values correctly', () => {
      expect(formatPercentage(0.5, true)).toBe('50.0%');
      expect(formatPercentage(0.95, true)).toBe('95.0%');
    });

    it('should respect decimal places parameter', () => {
      expect(formatPercentage(50.123, false, 0)).toBe('50%');
      expect(formatPercentage(50.123, false, 2)).toBe('50.12%');
      expect(formatPercentage(50.123, false, 3)).toBe('50.123%');
    });

    it('should clamp values before formatting', () => {
      expect(formatPercentage(150, false)).toBe('100.0%');
      expect(formatPercentage(-10, false)).toBe('0.0%');
    });
  });
});
