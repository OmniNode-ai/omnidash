import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fallbackChain,
  ensureNumeric,
  ensureArray,
  withFallback,
} from '../defensive-transform-logger';

describe('defensive-transform-logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fallbackChain', () => {
    it('should return first non-null value', () => {
      const result = fallbackChain('testField', { context: 'test' }, [
        { value: 'first', label: 'first option' },
        { value: 'second', label: 'second option' },
        { value: 'third', label: 'third option' },
      ]);

      expect(result).toBe('first');
    });

    it('should fall back to second option when first is null', () => {
      const result = fallbackChain('testField', { context: 'test' }, [
        { value: null, label: 'first option' },
        { value: 'second', label: 'second option' },
        { value: 'third', label: 'third option' },
      ]);

      expect(result).toBe('second');
    });

    it('should fall back to last option when all others are null', () => {
      const result = fallbackChain('testField', { context: 'test' }, [
        { value: null, label: 'first option' },
        { value: undefined, label: 'second option' },
        { value: 'default', label: 'default option' },
      ]);

      expect(result).toBe('default');
    });

    it('should handle numeric values', () => {
      const result = fallbackChain('count', { context: 'test' }, [
        { value: null, label: 'first' },
        { value: 42, label: 'second' },
      ]);

      expect(result).toBe(42);
    });
  });

  describe('ensureNumeric', () => {
    it('should return numeric value when valid', () => {
      const result = ensureNumeric('test', 42, 0, { context: 'test' });
      expect(result).toBe(42);
    });

    it('should parse string numbers', () => {
      const result = ensureNumeric('test', '42', 0, { context: 'test' });
      expect(result).toBe(42);
    });

    it('should return fallback for invalid values', () => {
      const result = ensureNumeric('test', 'invalid', 0, { context: 'test' });
      expect(result).toBe(0);
    });

    it('should return fallback for null/undefined', () => {
      expect(ensureNumeric('test', null, 0, { context: 'test' })).toBe(0);
      expect(ensureNumeric('test', undefined, 0, { context: 'test' })).toBe(0);
    });
  });

  describe('ensureArray', () => {
    it('should return array when valid', () => {
      const result = ensureArray('test', [1, 2, 3], { context: 'test' });
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty array for null/undefined', () => {
      expect(ensureArray('test', null, { context: 'test' })).toEqual([]);
      expect(ensureArray('test', undefined, { context: 'test' })).toEqual([]);
    });

    it('should return empty array for non-array values', () => {
      expect(ensureArray('test', 'not-array', { context: 'test' })).toEqual([]);
      expect(ensureArray('test', 42, { context: 'test' })).toEqual([]);
    });
  });

  describe('withFallback', () => {
    it('should return value when present', () => {
      const result = withFallback('test', 'value', 'default', { context: 'test' });
      expect(result).toBe('value');
    });

    it('should return fallback when value is null/undefined', () => {
      expect(withFallback('test', null, 'default', { context: 'test' })).toBe('default');
      expect(withFallback('test', undefined, 'default', { context: 'test' })).toBe('default');
    });

    it('should handle different log levels', () => {
      const result = withFallback('test', null, 'default', { context: 'test' }, 'warn');
      expect(result).toBe('default');
    });
  });
});
