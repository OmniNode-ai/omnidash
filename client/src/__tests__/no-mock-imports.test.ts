import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('production data sources must not import mock data', () => {
  const sources = [
    'contract-registry-source.ts',
    'contract-schema-source.ts',
  ];

  for (const source of sources) {
    it(`${source} should not contain mock-data imports`, () => {
      const filePath = path.resolve(
        __dirname,
        '../lib/data-sources',
        source
      );
      const src = fs.readFileSync(filePath, 'utf8');
      expect(src).not.toContain('mock-data');
      expect(src).not.toContain('USE_MOCKS');
      expect(src).not.toContain('ContractRegistryMockData');
      expect(src).not.toContain('ContractSchemaMockData');
    });
  }
});
