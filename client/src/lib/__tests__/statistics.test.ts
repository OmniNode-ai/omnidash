/**
 * Statistical Significance Utilities Tests
 *
 * @see OMN-2049 F2 - Statistical significance on A/B page
 */

import { describe, it, expect } from 'vitest';
import { proportionTest, chiSquaredTest, welchTTest, confidenceLevel } from '@/lib/statistics';

describe('statistics', () => {
  // ===========================
  // proportionTest
  // ===========================

  describe('proportionTest()', () => {
    it('returns not enough data when samples are below threshold', () => {
      const result = proportionTest(10, 20, 8, 15);
      expect(result.hasEnoughData).toBe(false);
      expect(result.label).toBe('Not enough data');
    });

    it('detects significant difference with large sample and clear split', () => {
      // 80% success in treatment vs 60% in control with large n
      const result = proportionTest(400, 500, 300, 500);
      expect(result.hasEnoughData).toBe(true);
      expect(result.significant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
    });

    it('returns not significant for similar proportions', () => {
      // 81% vs 80% with moderate sample size
      const result = proportionTest(81, 100, 80, 100);
      expect(result.hasEnoughData).toBe(true);
      expect(result.significant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('handles equal proportions (no difference)', () => {
      const result = proportionTest(250, 500, 250, 500);
      expect(result.hasEnoughData).toBe(true);
      expect(result.significant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.5);
    });

    it('handles zero variance (all successes)', () => {
      const result = proportionTest(100, 100, 100, 100);
      expect(result.hasEnoughData).toBe(true);
      expect(result.label).toBe('No variance');
    });
  });

  // ===========================
  // chiSquaredTest
  // ===========================

  describe('chiSquaredTest()', () => {
    it('returns not enough data when samples are below threshold', () => {
      const result = chiSquaredTest(5, 5, 3, 7);
      expect(result.hasEnoughData).toBe(false);
    });

    it('detects significant difference in contingency table', () => {
      // Treatment: 430 success, 70 fail
      // Control: 350 success, 150 fail
      const result = chiSquaredTest(430, 70, 350, 150);
      expect(result.hasEnoughData).toBe(true);
      expect(result.significant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
    });

    it('returns not significant for similar distributions', () => {
      // Treatment: 82 success, 18 fail
      // Control: 80 success, 20 fail
      const result = chiSquaredTest(82, 18, 80, 20);
      expect(result.hasEnoughData).toBe(true);
      expect(result.significant).toBe(false);
    });

    it('handles zero expected values', () => {
      // All successes in both groups
      const result = chiSquaredTest(100, 0, 100, 0);
      expect(result.label).toBe('No variance');
    });
  });

  // ===========================
  // welchTTest
  // ===========================

  describe('welchTTest()', () => {
    it('returns not enough data when samples are below threshold', () => {
      const result = welchTTest(100, 95, 10, 10);
      expect(result.hasEnoughData).toBe(false);
      expect(result.label).toBe('Not enough data');
    });

    it('detects significant difference in means with known SD', () => {
      // Mean 312ms vs 195ms, large samples, known SD
      const result = welchTTest(312, 195, 843, 404, 80, 60);
      expect(result.hasEnoughData).toBe(true);
      expect(result.significant).toBe(true);
      expect(result.pValue).toBeLessThan(0.01);
    });

    it('detects significant difference with estimated SD', () => {
      // Large difference, large samples
      const result = welchTTest(300, 200, 500, 500);
      expect(result.hasEnoughData).toBe(true);
      expect(result.significant).toBe(true);
    });

    it('returns not significant for similar means', () => {
      // Very close means
      const result = welchTTest(200, 199, 100, 100, 50, 50);
      expect(result.hasEnoughData).toBe(true);
      expect(result.significant).toBe(false);
      expect(result.pValue).toBeGreaterThan(0.05);
    });

    it('handles zero variance', () => {
      const result = welchTTest(100, 100, 50, 50, 0, 0);
      expect(result.label).toBe('No variance');
    });
  });

  // ===========================
  // confidenceLevel
  // ===========================

  describe('confidenceLevel()', () => {
    it('returns insufficient data for low sample', () => {
      const result = proportionTest(5, 10, 3, 10);
      const { level } = confidenceLevel(result);
      expect(level).toBe('Insufficient data');
    });

    it('returns very high confidence for p < 0.001', () => {
      const result = proportionTest(450, 500, 250, 500);
      const { level } = confidenceLevel(result);
      expect(level).toBe('Very high confidence');
    });

    it('returns not significant for p > 0.05', () => {
      const result = proportionTest(51, 100, 50, 100);
      const { level } = confidenceLevel(result);
      expect(level).toBe('Not significant');
    });
  });
});
