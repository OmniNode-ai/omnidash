import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// fixtures/ is gitignored and only exists after running `npm run generate:fixtures` locally.
// Skip in CI (where generate:fixtures is not part of the pipeline).
const inCI = process.env['CI'] === 'true';

describe('Proof of Life', () => {
  it.skipIf(inCI)('fixtures exist after generate:fixtures', () => {
    expect(existsSync(path.join(ROOT, 'fixtures/onex.snapshot.projection.llm_cost.v1'))).toBe(true);
  });

  it('component registry lists at least 7 components', async () => {
    const registry = await import('../public/component-registry.json');
    // components is a record object; count keys
    expect(Object.keys(registry.components).length).toBeGreaterThanOrEqual(7);
  });

  it('generated TS enum matches Part 1 values', async () => {
    const mod = await import('../src/shared/types/generated/enum-dashboard-widget-type');
    expect(mod.EnumDashboardWidgetType.Chart).toBe('chart');
  });
});
