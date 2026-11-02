// @vitest-environment node
/**
 * OMN-22168 AC2: every icon resolves through src/design-system/icons.ts by concept, and nothing outside it imports
 * lucide-react. Failure modes this catches:
 *   1. a page or component imports an icon straight from lucide-react (static, dynamic or a deep path);
 *   2. a file inside src/design-system other than icons.ts does the same;
 *   3. the ESLint rule that should refuse it is missing, so the editor stops warning;
 *   4. the scanner itself goes blind (the planted controls fail first).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS_FILE, ROOT, lucideImports, read, scanAll, summarise } from './scan';

describe('OMN-22168 AC2: one source for icons', () => {
  it('control: a planted import on a page is caught in every form', () => {
    const text = "import { Gauge } from 'lucide-react';\nconst X = await import('lucide-react');\nimport Y from \"lucide-react/dist/esm/icons/gauge\";";
    expect(lucideImports('src/pages/Planted.tsx', text)).toHaveLength(3);
  });

  it('control: a planted import inside src/design-system outside icons.ts is caught', () => {
    expect(lucideImports('src/design-system/components/Card.tsx', "import { X } from 'lucide-react';")).toHaveLength(1);
  });

  it('control: icons.ts itself may import, and a comment naming the package is not an import', () => {
    expect(lucideImports(ICONS_FILE, "import { Gauge } from 'lucide-react';")).toEqual([]);
    expect(lucideImports('src/pages/Planted.tsx', '// icons come from lucide-react through icons.ts')).toEqual([]);
  });

  it('icons.ts exists', () => {
    expect(existsSync(join(ROOT, ICONS_FILE)), ICONS_FILE).toBe(true);
  });

  it('nothing under src but icons.ts imports lucide-react', () => {
    const hits = scanAll(lucideImports);
    expect(hits, summarise(hits)).toEqual([]);
  });

  it('ESLint refuses a lucide-react import everywhere but icons.ts', () => {
    const config = read('eslint.config.js');
    expect(config).toMatch(/no-restricted-imports[\s\S]*lucide-react/);
    expect(config).toContain('src/design-system/icons.ts');
  });
});
