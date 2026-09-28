import { describe, expect, it } from 'vitest';
import { parseBrowserLoginOrigin } from '../data-source-contract.js';

describe('auth.external_origin', () => {
  it.each(['', 'http://dash.omninode.ai', 'https://user@dash.omninode.ai', 'https://dash.omninode.ai/path', 'https://dash.omninode.ai?x=1', 'https://dash.omninode.ai#fragment'])(
    'rejects unsafe browser-login origin %s', (value) => {
      expect(() => parseBrowserLoginOrigin(value)).toThrow();
    },
  );

  it.each([
    ['https://dev.dash.omninode.ai', 'https://dev.dash.omninode.ai'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
  ])('accepts canonical origin %s', (input, expected) => {
    expect(parseBrowserLoginOrigin(input)).toBe(expected);
  });
});
