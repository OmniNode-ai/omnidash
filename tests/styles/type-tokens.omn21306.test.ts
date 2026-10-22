/** Existing token-floor assertions relocated from src/typography-compliance.test.ts. */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1: 12 px token floor', () => {
  let css = '';
  beforeAll(() => { css = readFileSync(resolve(__dirname, '../../src/styles/globals.css'), 'utf-8'); });

  const tokens: Array<[string, string]> = [
    ['--text-xs', '0.75rem'], ['--text-sm', '0.75rem'], ['--text-md', '0.75rem'],
  ];
  for (const [name, value] of tokens) {
    it(`declares ${name} = ${value}`, () => {
      const en = name.replace(/[-]/g, '\\-');
      const ev = value.replace(/[()]/g, '\\$&').replace(/[.]/g, '\\.');
      const pattern = new RegExp(`${en}\\s*:\\s*${ev}\\s*;`);
      expect(css).toMatch(pattern);
    });
  }
});
