/**
 * Statistical Significance Utilities
 *
 * Pure functions for computing p-values and confidence intervals
 * for A/B testing scenarios. Used by the effectiveness A/B page
 * to show statistical confidence badges.
 *
 * @see OMN-2049 F2 - Statistical significance on A/B page
 */

// ============================================================================
// Types
// ============================================================================

export interface SignificanceResult {
  /** Whether the result is statistically significant at the given alpha */
  significant: boolean;
  /** The computed p-value */
  pValue: number;
  /** Whether there is enough data to compute significance */
  hasEnoughData: boolean;
  /** Human-readable confidence label */
  label: string;
  /** Minimum sample size required for reliable results */
  minSampleSize: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum sample size per group for chi-squared / proportion test */
const minSampleProportion = 30;

/** Minimum sample size per group for t-test (continuous metrics) */
const minSampleContinuous = 30;

/** Default significance level */
const alpha = 0.05;

// ============================================================================
// Normal distribution approximation
// ============================================================================

/**
 * Approximate the cumulative distribution function of the standard normal
 * distribution using the Abramowitz and Stegun rational approximation
 * (formula 26.2.17). Accurate to ~1.5e-7.
 */
function normalCdf(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const y = 1 - (a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5) * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// ============================================================================
// Chi-squared CDF approximation
// ============================================================================

/**
 * Approximate the CDF of the chi-squared distribution with df degrees of
 * freedom using the Wilson-Hilferty normal approximation.
 * Accurate enough for df >= 1 and common test scenarios.
 */
function chiSquaredCdf(x: number, df: number): number {
  if (x <= 0) return 0;
  // Wilson-Hilferty transformation
  const z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  return normalCdf(z / denom);
}

// ============================================================================
// Statistical Tests
// ============================================================================

/**
 * Two-proportion z-test for success rates.
 *
 * Tests whether the difference in success rates between treatment and
 * control groups is statistically significant.
 *
 * @param successA - Number of successes in treatment group
 * @param nA - Total samples in treatment group
 * @param successB - Number of successes in control group
 * @param nB - Total samples in control group
 */
export function proportionTest(
  successA: number,
  nA: number,
  successB: number,
  nB: number
): SignificanceResult {
  if (nA < minSampleProportion || nB < minSampleProportion) {
    return {
      significant: false,
      pValue: 1,
      hasEnoughData: false,
      label: 'Not enough data',
      minSampleSize: minSampleProportion,
    };
  }

  const pA = successA / nA;
  const pB = successB / nB;
  const pPool = (successA + successB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));

  if (se === 0) {
    return {
      significant: false,
      pValue: 1,
      hasEnoughData: true,
      label: 'No variance',
      minSampleSize: minSampleProportion,
    };
  }

  const z = Math.abs(pA - pB) / se;
  const pValue = 2 * (1 - normalCdf(z)); // two-tailed

  return {
    significant: pValue < alpha,
    pValue,
    hasEnoughData: true,
    label: formatPValueLabel(pValue),
    minSampleSize: minSampleProportion,
  };
}

/**
 * Chi-squared test for comparing success rates between two groups.
 *
 * 2x2 contingency table test. Equivalent to the proportion test for
 * two groups but uses chi-squared distribution.
 *
 * @param successA - Successes in treatment
 * @param failA - Failures in treatment
 * @param successB - Successes in control
 * @param failB - Failures in control
 */
export function chiSquaredTest(
  successA: number,
  failA: number,
  successB: number,
  failB: number
): SignificanceResult {
  const nA = successA + failA;
  const nB = successB + failB;

  if (nA < minSampleProportion || nB < minSampleProportion) {
    return {
      significant: false,
      pValue: 1,
      hasEnoughData: false,
      label: 'Not enough data',
      minSampleSize: minSampleProportion,
    };
  }

  const n = nA + nB;
  const totalSuccess = successA + successB;
  const totalFail = failA + failB;

  // Expected values
  const eSuccessA = (nA * totalSuccess) / n;
  const eFailA = (nA * totalFail) / n;
  const eSuccessB = (nB * totalSuccess) / n;
  const eFailB = (nB * totalFail) / n;

  // Check for zero expected values
  if (eSuccessA === 0 || eFailA === 0 || eSuccessB === 0 || eFailB === 0) {
    return {
      significant: false,
      pValue: 1,
      hasEnoughData: true,
      label: 'No variance',
      minSampleSize: minSampleProportion,
    };
  }

  // Chi-squared statistic
  const chi2 =
    Math.pow(successA - eSuccessA, 2) / eSuccessA +
    Math.pow(failA - eFailA, 2) / eFailA +
    Math.pow(successB - eSuccessB, 2) / eSuccessB +
    Math.pow(failB - eFailB, 2) / eFailB;

  const pValue = 1 - chiSquaredCdf(chi2, 1);

  return {
    significant: pValue < alpha,
    pValue,
    hasEnoughData: true,
    label: formatPValueLabel(pValue),
    minSampleSize: minSampleProportion,
  };
}

/**
 * Welch's t-test approximation for continuous metrics.
 *
 * Tests whether the means of two groups are significantly different,
 * without assuming equal variance.
 *
 * @param meanA - Mean of treatment group
 * @param meanB - Mean of control group
 * @param nA - Sample count for treatment group
 * @param nB - Sample count for control group
 * @param sdA - Standard deviation of treatment group (estimated if not available)
 * @param sdB - Standard deviation of control group (estimated if not available)
 */
export function welchTTest(
  meanA: number,
  meanB: number,
  nA: number,
  nB: number,
  sdA?: number,
  sdB?: number
): SignificanceResult {
  if (nA < minSampleContinuous || nB < minSampleContinuous) {
    return {
      significant: false,
      pValue: 1,
      hasEnoughData: false,
      label: 'Not enough data',
      minSampleSize: minSampleContinuous,
    };
  }

  // If standard deviations are not provided, estimate from the means
  // using a coefficient of variation of 0.3 (typical for latency/performance data)
  const estimatedSdA = sdA ?? Math.abs(meanA) * 0.3;
  const estimatedSdB = sdB ?? Math.abs(meanB) * 0.3;

  const varA = estimatedSdA * estimatedSdA;
  const varB = estimatedSdB * estimatedSdB;
  const seA = varA / nA;
  const seB = varB / nB;
  const se = Math.sqrt(seA + seB);

  if (se === 0) {
    return {
      significant: false,
      pValue: 1,
      hasEnoughData: true,
      label: 'No variance',
      minSampleSize: minSampleContinuous,
    };
  }

  const t = Math.abs(meanA - meanB) / se;

  // Welch-Satterthwaite degrees of freedom
  const df = Math.pow(seA + seB, 2) / (Math.pow(seA, 2) / (nA - 1) + Math.pow(seB, 2) / (nB - 1));

  // Approximate p-value using normal distribution for large df
  // (for df > 30, t-distribution is very close to normal)
  const pValue =
    df > 30 ? 2 * (1 - normalCdf(t)) : 2 * (1 - normalCdf(t * Math.sqrt(df / (df + t * t))));

  return {
    significant: pValue < alpha,
    pValue,
    hasEnoughData: true,
    label: formatPValueLabel(pValue),
    minSampleSize: minSampleContinuous,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Format a p-value into a human-readable confidence label. */
function formatPValueLabel(pValue: number): string {
  if (pValue < 0.001) return 'p < 0.001';
  if (pValue < 0.01) return `p = ${pValue.toFixed(3)}`;
  if (pValue < 0.05) return `p = ${pValue.toFixed(3)}`;
  return `p = ${pValue.toFixed(2)}`;
}

export interface ConfidenceLevel {
  level: string;
  colorClass: string;
}

/**
 * Get a semantic confidence level for display.
 * Returns a tuple of [level, color class].
 */
export function confidenceLevel(result: SignificanceResult): ConfidenceLevel {
  if (!result.hasEnoughData) {
    return { level: 'Insufficient data', colorClass: 'text-muted-foreground border-muted' };
  }
  if (result.pValue < 0.001) {
    return { level: 'Very high confidence', colorClass: 'text-green-400 border-green-500/30' };
  }
  if (result.pValue < 0.01) {
    return { level: 'High confidence', colorClass: 'text-green-400 border-green-500/30' };
  }
  if (result.pValue < 0.05) {
    return { level: 'Significant', colorClass: 'text-yellow-400 border-yellow-500/30' };
  }
  return { level: 'Not significant', colorClass: 'text-muted-foreground border-muted' };
}
