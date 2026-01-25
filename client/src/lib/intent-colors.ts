/**
 * Shared Intent Color Utilities
 *
 * Unified color mappings and utility functions for intent categories.
 * Used by IntentDistribution, RecentIntents, and SessionTimeline components.
 *
 * @module lib/intent-colors
 * @see OMN-1458 - Real-time Intent Dashboard Panel
 */

// ============================================================================
// Color Constants
// ============================================================================

/**
 * Primary intent category hex colors.
 * These are the canonical colors for each intent category.
 */
export const INTENT_COLORS: Record<string, string> = {
  debugging: '#f97316', // orange
  code_generation: '#3b82f6', // blue
  refactoring: '#a855f7', // purple
  testing: '#22c55e', // green
  documentation: '#6b7280', // gray
  analysis: '#06b6d4', // cyan
  pattern_learning: '#eab308', // yellow
  quality_assessment: '#ec4899', // pink
  semantic_analysis: '#6366f1', // indigo
  deployment: '#f59e0b', // amber
  configuration: '#8b5cf6', // violet
  question: '#ec4899', // pink
  unknown: '#9ca3af', // gray
};

/**
 * Alias mappings for partial category matches.
 * Maps shorthand or alternative names to canonical categories.
 */
export const INTENT_CATEGORY_ALIASES: Record<string, string> = {
  debug: 'debugging',
  fix: 'debugging',
  code: 'code_generation',
  generate: 'code_generation',
  test: 'testing',
  refactor: 'refactoring',
  improve: 'refactoring',
  doc: 'documentation',
  explain: 'documentation',
  review: 'analysis',
  analyze: 'analysis',
};

/**
 * Default hex color for unrecognized categories.
 */
export const DEFAULT_INTENT_COLOR = '#6b7280';

/**
 * Tailwind badge classes for each intent category.
 * Format: background/text/border colors with opacity.
 */
export const INTENT_BADGE_CLASSES: Record<string, string> = {
  debugging: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  code_generation: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  refactoring: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  testing: 'bg-green-500/10 text-green-600 border-green-500/20',
  documentation: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  analysis: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  pattern_learning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  quality_assessment: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  semantic_analysis: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  deployment: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  configuration: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  question: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  unknown: 'bg-muted text-muted-foreground border-border',
};

/**
 * Default Tailwind badge classes for unrecognized categories.
 */
export const DEFAULT_BADGE_CLASSES = 'bg-muted text-muted-foreground border-border';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalizes a category string to lowercase with only alphanumeric and underscore.
 */
function normalizeCategory(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/**
 * Resolves a category to its canonical form using aliases.
 */
function resolveCategory(category: string): string {
  const normalized = normalizeCategory(category);

  // Check for exact match
  if (INTENT_COLORS[normalized]) {
    return normalized;
  }

  // Check aliases
  if (INTENT_CATEGORY_ALIASES[normalized]) {
    return INTENT_CATEGORY_ALIASES[normalized];
  }

  // Check for partial matches in aliases
  for (const [alias, canonical] of Object.entries(INTENT_CATEGORY_ALIASES)) {
    if (normalized.includes(alias)) {
      return canonical;
    }
  }

  return 'unknown';
}

/**
 * Gets the hex color for an intent category.
 *
 * @param category - The intent category name
 * @returns Hex color string (e.g., '#f97316')
 *
 * @example
 * getIntentColor('debugging') // '#f97316'
 * getIntentColor('code_generation') // '#3b82f6'
 * getIntentColor('unknown_category') // '#6b7280'
 */
export function getIntentColor(category: string): string {
  const resolved = resolveCategory(category);
  return INTENT_COLORS[resolved] ?? DEFAULT_INTENT_COLOR;
}

/**
 * Gets Tailwind CSS classes for an intent category badge.
 *
 * @param category - The intent category name
 * @returns Tailwind classes string (e.g., 'bg-orange-500/10 text-orange-600 border-orange-500/20')
 *
 * @example
 * getIntentBadgeClasses('debugging') // 'bg-orange-500/10 text-orange-600 border-orange-500/20'
 * getIntentBadgeClasses('testing') // 'bg-green-500/10 text-green-600 border-green-500/20'
 */
export function getIntentBadgeClasses(category: string): string {
  const resolved = resolveCategory(category);
  return INTENT_BADGE_CLASSES[resolved] ?? DEFAULT_BADGE_CLASSES;
}

/**
 * Gets Tailwind CSS classes based on confidence level.
 * Returns color classes indicating confidence tier:
 * - >= 0.8: green (high confidence)
 * - >= 0.6: yellow (medium confidence)
 * - < 0.6: red (low confidence)
 *
 * @param confidence - Confidence value between 0 and 1
 * @returns Tailwind classes string for the confidence badge
 *
 * @example
 * getConfidenceColor(0.95) // 'bg-green-500/10 text-green-600 border-green-500/20'
 * getConfidenceColor(0.7) // 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
 * getConfidenceColor(0.4) // 'bg-red-500/10 text-red-600 border-red-500/20'
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) {
    return 'bg-green-500/10 text-green-600 border-green-500/20';
  }
  if (confidence >= 0.6) {
    return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
  }
  return 'bg-red-500/10 text-red-600 border-red-500/20';
}

/**
 * Gets a Tailwind background color class for an intent category.
 * Useful for timeline indicators and chart elements.
 *
 * @param category - The intent category name
 * @returns Tailwind background class (e.g., 'bg-orange-500')
 *
 * @example
 * getIntentBgClass('debugging') // 'bg-orange-500'
 * getIntentBgClass('testing') // 'bg-green-500'
 */
export function getIntentBgClass(category: string): string {
  const categoryLower = category.toLowerCase();

  if (categoryLower.includes('debug') || categoryLower.includes('fix')) {
    return 'bg-amber-500';
  }
  if (categoryLower.includes('code') || categoryLower.includes('generate')) {
    return 'bg-blue-500';
  }
  if (categoryLower.includes('test')) {
    return 'bg-green-500';
  }
  if (categoryLower.includes('refactor') || categoryLower.includes('improve')) {
    return 'bg-purple-500';
  }
  if (categoryLower.includes('doc') || categoryLower.includes('explain')) {
    return 'bg-cyan-500';
  }
  if (
    categoryLower.includes('review') ||
    categoryLower.includes('analyze') ||
    categoryLower.includes('analysis')
  ) {
    return 'bg-indigo-500';
  }

  return 'bg-primary';
}

/**
 * Calculates opacity based on confidence level.
 * Maps confidence (0.0 - 1.0) to opacity range (0.4 - 1.0).
 *
 * @param confidence - Confidence value between 0 and 1
 * @returns Opacity value between 0.4 and 1.0
 *
 * @example
 * getConfidenceOpacity(1.0) // 1.0
 * getConfidenceOpacity(0.5) // 0.7
 * getConfidenceOpacity(0.0) // 0.4
 */
export function getConfidenceOpacity(confidence: number): number {
  const minOpacity = 0.4;
  const maxOpacity = 1.0;
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  return minOpacity + clampedConfidence * (maxOpacity - minOpacity);
}

/**
 * Gets a hex color with alpha channel based on confidence.
 * Useful for chart visualizations where color intensity indicates confidence.
 *
 * @param category - The intent category name
 * @param confidence - Confidence value between 0 and 1
 * @returns Hex color with alpha (e.g., '#f97316cc')
 *
 * @example
 * getIntentColorWithConfidence('debugging', 1.0) // '#f97316ff'
 * getIntentColorWithConfidence('debugging', 0.5) // '#f97316b3'
 */
export function getIntentColorWithConfidence(category: string, confidence: number): string {
  const hexColor = getIntentColor(category);
  // Clamp confidence to 0.4 - 1.0 range for visibility
  const alpha = Math.round((0.4 + confidence * 0.6) * 255);
  const alphaHex = alpha.toString(16).padStart(2, '0');
  return `${hexColor}${alphaHex}`;
}

/**
 * Formats a category name for display (title case with spaces).
 *
 * @param category - The intent category name (e.g., 'code_generation')
 * @returns Formatted display name (e.g., 'Code Generation')
 *
 * @example
 * formatCategoryName('code_generation') // 'Code Generation'
 * formatCategoryName('debugging') // 'Debugging'
 */
export function formatCategoryName(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
