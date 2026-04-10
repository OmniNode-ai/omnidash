import { describe, it, expect } from 'vitest';
import { exportTheme, importTheme, REQUIRED_TOKENS } from './themeIO';

const validTokens: Record<string, string> = {};
for (const t of REQUIRED_TOKENS) {
  validTokens[t] = '260 20% 8%';
}

const cyberpunkTheme = {
  name: 'Cyberpunk',
  author: 'jonah',
  themeSchemaVersion: '1.0',
  version: '1.0.0',
  tokens: validTokens,
};

describe('themeIO', () => {
  it('round-trips a valid theme through export/import', () => {
    const json = exportTheme(cyberpunkTheme);
    const result = importTheme(json);
    expect(result.valid).toBe(true);
    expect(result.theme!.name).toBe('Cyberpunk');
  });

  it('rejects invalid JSON on import', () => {
    const result = importTheme('not json');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('JSON');
  });

  it('rejects theme with missing required fields', () => {
    const result = importTheme(JSON.stringify({ name: 'bad' }));
    expect(result.valid).toBe(false);
  });

  it('strips unknown token keys on import', () => {
    const extended = { ...cyberpunkTheme, tokens: { ...validTokens, 'custom-extra': '0 0% 0%' } };
    const json = exportTheme(extended);
    const result = importTheme(json);
    expect(result.valid).toBe(true);
    // Unknown keys are stripped — only REQUIRED_TOKENS remain plus any optional known tokens
    expect(result.theme!.tokens).not.toHaveProperty('custom-extra');
  });
});
