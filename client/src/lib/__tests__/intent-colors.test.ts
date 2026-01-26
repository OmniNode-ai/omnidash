import { describe, it, expect } from 'vitest';
import {
  INTENT_COLORS,
  INTENT_CATEGORY_ALIASES,
  INTENT_BADGE_CLASSES,
  DEFAULT_INTENT_COLOR,
  DEFAULT_BADGE_CLASSES,
  getIntentColor,
  getIntentBadgeClasses,
  getConfidenceColor,
  getIntentBgClass,
  getConfidenceOpacity,
  getIntentColorWithConfidence,
  formatCategoryName,
} from '@/lib/intent-colors';

describe('intent-colors', () => {
  describe('Constants', () => {
    it('should have all expected intent colors defined', () => {
      const expectedCategories = [
        'debugging',
        'code_generation',
        'refactoring',
        'testing',
        'documentation',
        'analysis',
        'pattern_learning',
        'quality_assessment',
        'semantic_analysis',
        'deployment',
        'configuration',
        'question',
        'unknown',
      ];
      expectedCategories.forEach((category) => {
        expect(INTENT_COLORS[category]).toBeDefined();
        expect(INTENT_COLORS[category]).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it('should have all expected aliases defined', () => {
      const expectedAliases = [
        'debug',
        'fix',
        'code',
        'generate',
        'test',
        'refactor',
        'improve',
        'doc',
        'explain',
        'review',
        'analyze',
      ];
      expectedAliases.forEach((alias) => {
        expect(INTENT_CATEGORY_ALIASES[alias]).toBeDefined();
      });
    });

    it('should have badge classes for each color category', () => {
      Object.keys(INTENT_COLORS).forEach((category) => {
        expect(INTENT_BADGE_CLASSES[category]).toBeDefined();
      });
    });

    it('should have valid default color', () => {
      expect(DEFAULT_INTENT_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should have valid default badge classes', () => {
      expect(DEFAULT_BADGE_CLASSES).toBeTruthy();
      expect(typeof DEFAULT_BADGE_CLASSES).toBe('string');
    });
  });

  describe('getIntentColor', () => {
    it('should return correct color for known categories', () => {
      expect(getIntentColor('debugging')).toBe('#f97316');
      expect(getIntentColor('code_generation')).toBe('#3b82f6');
      expect(getIntentColor('refactoring')).toBe('#a855f7');
      expect(getIntentColor('testing')).toBe('#22c55e');
      expect(getIntentColor('documentation')).toBe('#6b7280');
      expect(getIntentColor('analysis')).toBe('#06b6d4');
      expect(getIntentColor('pattern_learning')).toBe('#eab308');
      expect(getIntentColor('quality_assessment')).toBe('#ec4899');
      expect(getIntentColor('semantic_analysis')).toBe('#6366f1');
      expect(getIntentColor('deployment')).toBe('#f59e0b');
      expect(getIntentColor('configuration')).toBe('#8b5cf6');
      expect(getIntentColor('question')).toBe('#ec4899');
    });

    it('should resolve aliases to canonical categories', () => {
      expect(getIntentColor('debug')).toBe(getIntentColor('debugging'));
      expect(getIntentColor('fix')).toBe(getIntentColor('debugging'));
      expect(getIntentColor('code')).toBe(getIntentColor('code_generation'));
      expect(getIntentColor('generate')).toBe(getIntentColor('code_generation'));
      expect(getIntentColor('test')).toBe(getIntentColor('testing'));
      expect(getIntentColor('refactor')).toBe(getIntentColor('refactoring'));
      expect(getIntentColor('improve')).toBe(getIntentColor('refactoring'));
      expect(getIntentColor('doc')).toBe(getIntentColor('documentation'));
      expect(getIntentColor('explain')).toBe(getIntentColor('documentation'));
      expect(getIntentColor('review')).toBe(getIntentColor('analysis'));
      expect(getIntentColor('analyze')).toBe(getIntentColor('analysis'));
    });

    it('should return unknown category color for unrecognized inputs', () => {
      // Unknown categories resolve to 'unknown' which has its own color (#9ca3af)
      const unknownColor = INTENT_COLORS['unknown'];
      expect(getIntentColor('unknown_category')).toBe(unknownColor);
      expect(getIntentColor('foobar')).toBe(unknownColor);
      expect(getIntentColor('')).toBe(unknownColor);
      expect(getIntentColor('random_text_here')).toBe(unknownColor);
    });

    it('should handle case-insensitive input', () => {
      expect(getIntentColor('DEBUGGING')).toBe(getIntentColor('debugging'));
      expect(getIntentColor('Debugging')).toBe(getIntentColor('debugging'));
      expect(getIntentColor('DeBuGgInG')).toBe(getIntentColor('debugging'));
      expect(getIntentColor('CODE_GENERATION')).toBe(getIntentColor('code_generation'));
      expect(getIntentColor('Code_Generation')).toBe(getIntentColor('code_generation'));
    });

    it('should handle partial alias matches', () => {
      // Contains 'debug' should resolve to debugging
      expect(getIntentColor('my_debug_task')).toBe(getIntentColor('debugging'));
      // Contains 'test' should resolve to testing
      expect(getIntentColor('unit_test_something')).toBe(getIntentColor('testing'));
    });

    it('should normalize special characters', () => {
      expect(getIntentColor('debug-ing')).toBe(getIntentColor('debugging'));
      expect(getIntentColor('code generation')).toBe(getIntentColor('code_generation'));
    });
  });

  describe('getIntentBadgeClasses', () => {
    it('should return correct Tailwind classes for known categories', () => {
      expect(getIntentBadgeClasses('debugging')).toBe(
        'bg-orange-500/10 text-orange-600 border-orange-500/20'
      );
      expect(getIntentBadgeClasses('code_generation')).toBe(
        'bg-blue-500/10 text-blue-600 border-blue-500/20'
      );
      expect(getIntentBadgeClasses('testing')).toBe(
        'bg-green-500/10 text-green-600 border-green-500/20'
      );
      expect(getIntentBadgeClasses('refactoring')).toBe(
        'bg-purple-500/10 text-purple-600 border-purple-500/20'
      );
      expect(getIntentBadgeClasses('documentation')).toBe(
        'bg-gray-500/10 text-gray-600 border-gray-500/20'
      );
    });

    it('should resolve aliases to correct badge classes', () => {
      expect(getIntentBadgeClasses('debug')).toBe(getIntentBadgeClasses('debugging'));
      expect(getIntentBadgeClasses('fix')).toBe(getIntentBadgeClasses('debugging'));
      expect(getIntentBadgeClasses('test')).toBe(getIntentBadgeClasses('testing'));
      expect(getIntentBadgeClasses('code')).toBe(getIntentBadgeClasses('code_generation'));
      expect(getIntentBadgeClasses('refactor')).toBe(getIntentBadgeClasses('refactoring'));
    });

    it('should return default badge classes for unknown categories', () => {
      expect(getIntentBadgeClasses('unknown_category')).toBe(DEFAULT_BADGE_CLASSES);
      expect(getIntentBadgeClasses('foobar')).toBe(DEFAULT_BADGE_CLASSES);
      expect(getIntentBadgeClasses('')).toBe(DEFAULT_BADGE_CLASSES);
    });

    it('should handle case-insensitive input', () => {
      expect(getIntentBadgeClasses('DEBUGGING')).toBe(getIntentBadgeClasses('debugging'));
      expect(getIntentBadgeClasses('Testing')).toBe(getIntentBadgeClasses('testing'));
    });
  });

  describe('getConfidenceColor', () => {
    it('should return green classes for high confidence (>= 0.9)', () => {
      const expected = 'bg-green-500/10 text-green-600 border-green-500/20';
      expect(getConfidenceColor(0.9)).toBe(expected);
      expect(getConfidenceColor(0.95)).toBe(expected);
      expect(getConfidenceColor(1.0)).toBe(expected);
    });

    it('should return yellow classes for medium confidence (>= 0.7, < 0.9)', () => {
      const expected = 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      expect(getConfidenceColor(0.7)).toBe(expected);
      expect(getConfidenceColor(0.75)).toBe(expected);
      expect(getConfidenceColor(0.8)).toBe(expected);
      expect(getConfidenceColor(0.85)).toBe(expected);
      expect(getConfidenceColor(0.89)).toBe(expected);
    });

    it('should return red classes for low confidence (< 0.7)', () => {
      const expected = 'bg-red-500/10 text-red-600 border-red-500/20';
      expect(getConfidenceColor(0.0)).toBe(expected);
      expect(getConfidenceColor(0.1)).toBe(expected);
      expect(getConfidenceColor(0.3)).toBe(expected);
      expect(getConfidenceColor(0.5)).toBe(expected);
      expect(getConfidenceColor(0.6)).toBe(expected);
      expect(getConfidenceColor(0.69)).toBe(expected);
    });

    it('should handle edge cases at exact boundaries', () => {
      // Exactly at boundaries (0.9 for high, 0.7 for medium)
      expect(getConfidenceColor(0.9)).toBe('bg-green-500/10 text-green-600 border-green-500/20');
      expect(getConfidenceColor(0.7)).toBe('bg-yellow-500/10 text-yellow-600 border-yellow-500/20');
    });

    it('should handle values outside 0-1 range', () => {
      // Values > 1 should still work (treated as high confidence)
      expect(getConfidenceColor(1.5)).toBe('bg-green-500/10 text-green-600 border-green-500/20');
      expect(getConfidenceColor(2.0)).toBe('bg-green-500/10 text-green-600 border-green-500/20');

      // Negative values should be treated as low confidence
      expect(getConfidenceColor(-0.1)).toBe('bg-red-500/10 text-red-600 border-red-500/20');
      expect(getConfidenceColor(-1.0)).toBe('bg-red-500/10 text-red-600 border-red-500/20');
    });
  });

  describe('getIntentBgClass', () => {
    // Colors now match INTENT_COLORS for consistency:
    // - debugging: bg-orange-500 (matches #f97316)
    // - documentation: bg-gray-500 (matches #6b7280)
    // - analysis: bg-cyan-500 (matches #06b6d4)

    it('should return correct bg class for debug-related categories', () => {
      expect(getIntentBgClass('debugging')).toBe('bg-orange-500');
      expect(getIntentBgClass('debug')).toBe('bg-orange-500');
      expect(getIntentBgClass('fix')).toBe('bg-orange-500');
      expect(getIntentBgClass('debug_task')).toBe('bg-orange-500');
      expect(getIntentBgClass('fix_bug')).toBe('bg-orange-500');
    });

    it('should return correct bg class for code-related categories', () => {
      expect(getIntentBgClass('code')).toBe('bg-blue-500');
      expect(getIntentBgClass('code_generation')).toBe('bg-blue-500');
      expect(getIntentBgClass('generate')).toBe('bg-blue-500');
      expect(getIntentBgClass('generate_code')).toBe('bg-blue-500');
    });

    it('should return correct bg class for test-related categories', () => {
      expect(getIntentBgClass('test')).toBe('bg-green-500');
      expect(getIntentBgClass('testing')).toBe('bg-green-500');
      expect(getIntentBgClass('unit_test')).toBe('bg-green-500');
    });

    it('should return correct bg class for refactor-related categories', () => {
      expect(getIntentBgClass('refactor')).toBe('bg-purple-500');
      expect(getIntentBgClass('refactoring')).toBe('bg-purple-500');
      expect(getIntentBgClass('improve')).toBe('bg-purple-500');
      // Note: 'improve_code' matches 'code' first due to check order in implementation
      expect(getIntentBgClass('improve_code')).toBe('bg-blue-500');
      expect(getIntentBgClass('improve_quality')).toBe('bg-purple-500');
    });

    it('should return correct bg class for documentation-related categories', () => {
      // Now consistent with INTENT_COLORS (documentation = #6b7280 = gray)
      expect(getIntentBgClass('doc')).toBe('bg-gray-500');
      expect(getIntentBgClass('documentation')).toBe('bg-gray-500');
      expect(getIntentBgClass('explain')).toBe('bg-gray-500');
    });

    it('should return correct bg class for analysis-related categories', () => {
      // Now consistent with INTENT_COLORS (analysis = #06b6d4 = cyan)
      expect(getIntentBgClass('review')).toBe('bg-cyan-500');
      expect(getIntentBgClass('analyze')).toBe('bg-cyan-500');
      expect(getIntentBgClass('analysis')).toBe('bg-cyan-500');
      // Note: 'code_analysis' matches 'code' first due to check order in implementation
      expect(getIntentBgClass('code_analysis')).toBe('bg-blue-500');
      expect(getIntentBgClass('performance_analysis')).toBe('bg-cyan-500');
    });

    it('should return correct bg class for other known categories', () => {
      // Now these have proper mappings in INTENT_BG_CLASSES
      expect(getIntentBgClass('deployment')).toBe('bg-amber-500');
      expect(getIntentBgClass('configuration')).toBe('bg-violet-500');
      expect(getIntentBgClass('pattern_learning')).toBe('bg-yellow-500');
      expect(getIntentBgClass('quality_assessment')).toBe('bg-pink-500');
      expect(getIntentBgClass('semantic_analysis')).toBe('bg-indigo-500');
    });

    it('should return bg-gray-400 for unknown and bg-primary for truly unrecognized categories', () => {
      // 'unknown' is a known category with its own class
      expect(getIntentBgClass('unknown')).toBe('bg-gray-400');
      // Truly unrecognized strings resolve to 'unknown' category
      expect(getIntentBgClass('foobar')).toBe('bg-gray-400');
      expect(getIntentBgClass('')).toBe('bg-gray-400');
    });

    it('should handle case-insensitive input', () => {
      expect(getIntentBgClass('DEBUG')).toBe('bg-orange-500');
      expect(getIntentBgClass('Test')).toBe('bg-green-500');
      expect(getIntentBgClass('REFACTOR')).toBe('bg-purple-500');
    });
  });

  describe('getConfidenceOpacity', () => {
    it('should return 1.0 for confidence 1.0', () => {
      expect(getConfidenceOpacity(1.0)).toBe(1.0);
    });

    it('should return 0.4 for confidence 0.0', () => {
      expect(getConfidenceOpacity(0.0)).toBe(0.4);
    });

    it('should interpolate correctly for values between 0 and 1', () => {
      // At 0.5, opacity should be 0.4 + 0.5 * 0.6 = 0.7
      expect(getConfidenceOpacity(0.5)).toBe(0.7);
      // At 0.25, opacity should be 0.4 + 0.25 * 0.6 = 0.55
      expect(getConfidenceOpacity(0.25)).toBe(0.55);
      // At 0.75, opacity should be 0.4 + 0.75 * 0.6 = 0.85
      expect(getConfidenceOpacity(0.75)).toBeCloseTo(0.85, 10);
    });

    it('should clamp values below 0 to minimum opacity', () => {
      expect(getConfidenceOpacity(-0.5)).toBe(0.4);
      expect(getConfidenceOpacity(-1.0)).toBe(0.4);
      expect(getConfidenceOpacity(-100)).toBe(0.4);
    });

    it('should clamp values above 1 to maximum opacity', () => {
      expect(getConfidenceOpacity(1.5)).toBe(1.0);
      expect(getConfidenceOpacity(2.0)).toBe(1.0);
      expect(getConfidenceOpacity(100)).toBe(1.0);
    });

    it('should return values within 0.4 to 1.0 range', () => {
      const testValues = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      testValues.forEach((value) => {
        const opacity = getConfidenceOpacity(value);
        expect(opacity).toBeGreaterThanOrEqual(0.4);
        expect(opacity).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe('getIntentColorWithConfidence', () => {
    it('should return hex color with alpha channel', () => {
      const result = getIntentColorWithConfidence('debugging', 1.0);
      // Should be base color (#f97316) plus alpha
      expect(result).toMatch(/^#[0-9a-f]{8}$/i);
      expect(result.slice(0, 7)).toBe('#f97316');
    });

    it('should have correct alpha for confidence 1.0', () => {
      const result = getIntentColorWithConfidence('debugging', 1.0);
      // At confidence 1.0, alpha = 0.4 + 1.0 * 0.6 = 1.0 = 255 = 'ff'
      expect(result.slice(-2)).toBe('ff');
    });

    it('should have correct alpha for confidence 0.0', () => {
      const result = getIntentColorWithConfidence('debugging', 0.0);
      // At confidence 0.0, alpha = 0.4 + 0.0 * 0.6 = 0.4 = 102 = '66'
      expect(result.slice(-2)).toBe('66');
    });

    it('should have correct alpha for confidence 0.5', () => {
      const result = getIntentColorWithConfidence('debugging', 0.5);
      // At confidence 0.5, alpha = 0.4 + 0.5 * 0.6 = 0.7 = 178.5 rounded = 179 = 'b3'
      expect(result.slice(-2).toLowerCase()).toBe('b3');
    });

    it('should work with different categories', () => {
      const categories = ['debugging', 'code_generation', 'testing', 'refactoring'];
      categories.forEach((category) => {
        const result = getIntentColorWithConfidence(category, 0.8);
        const baseColor = getIntentColor(category);
        expect(result.slice(0, 7)).toBe(baseColor);
        expect(result).toMatch(/^#[0-9a-f]{8}$/i);
      });
    });

    it('should work with aliases', () => {
      const debugResult = getIntentColorWithConfidence('debug', 0.8);
      const debuggingResult = getIntentColorWithConfidence('debugging', 0.8);
      expect(debugResult).toBe(debuggingResult);
    });

    it('should handle unknown categories with unknown color', () => {
      const result = getIntentColorWithConfidence('unknown_category', 0.5);
      // Unknown categories resolve to 'unknown' which has its own color (#9ca3af)
      expect(result.slice(0, 7)).toBe(INTENT_COLORS['unknown']);
    });
  });

  describe('formatCategoryName', () => {
    it('should convert underscores to spaces', () => {
      expect(formatCategoryName('code_generation')).toBe('Code Generation');
      expect(formatCategoryName('pattern_learning')).toBe('Pattern Learning');
      expect(formatCategoryName('quality_assessment')).toBe('Quality Assessment');
      expect(formatCategoryName('semantic_analysis')).toBe('Semantic Analysis');
    });

    it('should capitalize each word', () => {
      expect(formatCategoryName('testing')).toBe('Testing');
      expect(formatCategoryName('debugging')).toBe('Debugging');
      expect(formatCategoryName('analysis')).toBe('Analysis');
    });

    it('should handle single-word categories', () => {
      expect(formatCategoryName('debugging')).toBe('Debugging');
      expect(formatCategoryName('testing')).toBe('Testing');
      expect(formatCategoryName('refactoring')).toBe('Refactoring');
      expect(formatCategoryName('documentation')).toBe('Documentation');
    });

    it('should handle already capitalized words', () => {
      expect(formatCategoryName('Debugging')).toBe('Debugging');
      expect(formatCategoryName('CODE_GENERATION')).toBe('CODE GENERATION');
    });

    it('should handle empty string', () => {
      expect(formatCategoryName('')).toBe('');
    });

    it('should handle multiple underscores', () => {
      expect(formatCategoryName('very_long_category_name')).toBe('Very Long Category Name');
    });

    it('should handle leading/trailing underscores', () => {
      expect(formatCategoryName('_test_')).toBe(' Test ');
    });
  });
});
