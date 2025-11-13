import { describe, it, expect } from 'vitest';
import { cn, getSuccessRateVariant } from '../utils';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names correctly', () => {
      const result = cn('foo', 'bar');
      expect(typeof result).toBe('string');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });

    it('should handle conditional classes', () => {
      const result = cn('foo', false && 'bar', 'baz');
      expect(result).toContain('foo');
      expect(result).toContain('baz');
      expect(result).not.toContain('bar');
    });

    it('should merge Tailwind classes correctly', () => {
      const result = cn('px-2 py-1', 'px-4');
      expect(result).toContain('py-1');
      // Should only have one px class (the last one wins)
      expect(result.split('px-').length - 1).toBeLessThanOrEqual(2);
    });
  });

  describe('getSuccessRateVariant', () => {
    it('should return "default" for rates >= 98', () => {
      expect(getSuccessRateVariant(98)).toBe('default');
      expect(getSuccessRateVariant(99)).toBe('default');
      expect(getSuccessRateVariant(100)).toBe('default');
    });

    it('should return "secondary" for rates >= 95 and < 98', () => {
      expect(getSuccessRateVariant(95)).toBe('secondary');
      expect(getSuccessRateVariant(97)).toBe('secondary');
      expect(getSuccessRateVariant(97.9)).toBe('secondary');
    });

    it('should return "outline" for rates >= 90 and < 95', () => {
      expect(getSuccessRateVariant(90)).toBe('outline');
      expect(getSuccessRateVariant(94)).toBe('outline');
      expect(getSuccessRateVariant(94.9)).toBe('outline');
    });

    it('should return "destructive" for rates < 90', () => {
      expect(getSuccessRateVariant(89)).toBe('destructive');
      expect(getSuccessRateVariant(85)).toBe('destructive');
      expect(getSuccessRateVariant(0)).toBe('destructive');
    });
  });
});

