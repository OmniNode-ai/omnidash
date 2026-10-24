import { describe, expect, it } from 'vitest';
import { modelColor } from './dashboard-colors';

describe('stable model colors across dashboard views', () => {
  it('uses identity rather than list order or rank', () => {
    const first = ['model-a', 'model-b', 'model-c'].map(modelColor);
    expect(['model-c', 'model-a', 'model-b'].map(modelColor)).toEqual([first[2], first[0], first[1]]);
  });
  it('preserves exact served capitalization and surrounding whitespace', () => {
    expect(modelColor(' Model-A ')).not.toBe(modelColor('model-a'));
  });
  it('keeps the populated model fixture identities distinct', () => {
    const names = Array.from({length:32}, (_, i) => `provider/model-${i}`);
    expect(new Set(names.map(modelColor)).size).toBe(names.length);
  });
  it('uses the theme lightness token for readable marks in either theme', () => {
    expect(modelColor('model-a')).toMatch(/^oklch\(var\(--model-identity-lightness, 46%\) 0\.13 [\d.]+\)$/);
  });
});
