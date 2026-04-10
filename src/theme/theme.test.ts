import { describe, it, expect } from 'vitest';
import { REQUIRED_TOKENS, validateThemeDefinition } from './types';

describe('Theme validation', () => {
  it('rejects theme missing required tokens', () => {
    const result = validateThemeDefinition({
      name: 'bad',
      author: 'test',
      themeSchemaVersion: '1.0',
      version: '1.0.0',
      tokens: { background: '220 15% 12%' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts theme with all required tokens', () => {
    const tokens: Record<string, string> = {};
    for (const t of REQUIRED_TOKENS) {
      tokens[t] = '220 15% 12%';
    }
    const result = validateThemeDefinition({
      name: 'complete',
      author: 'test',
      themeSchemaVersion: '1.0',
      version: '1.0.0',
      tokens,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid HSL values', () => {
    const tokens: Record<string, string> = {};
    for (const t of REQUIRED_TOKENS) {
      tokens[t] = '220 15% 12%';
    }
    tokens['background'] = 'not-hsl';
    const result = validateThemeDefinition({
      name: 'bad-hsl',
      author: 'test',
      themeSchemaVersion: '1.0',
      version: '1.0.0',
      tokens,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('background');
  });
});
