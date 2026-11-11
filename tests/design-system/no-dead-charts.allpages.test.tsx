// OMN-23330 AC18: two 3D cost-trend chart components that only their own tests and stories import are deleted with
// those tests and stories, so they cannot drift or ship. Failure mode F10: a deleted file was still reachable, which
// the static and dynamic import cases and the build catch.
// StackedChart.tsx stays: charts/threejs/TrendChart.tsx, charts/threejs/BarChart.tsx and cost-trend/CostTrend2D.tsx
// import it (a false-zero search first listed it as unused, ledger M1323).
// QualityScoreTilted3D.tsx stays: the registered quality-score-panel widget (quality/QualityScore, default 3d)
// lazy-loads it with import('./QualityScoreTilted3D'); a static-import-only scan missed that (2026-11-09).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const COST_TREND = 'src/components/dashboard/cost-trend';
const DELETED = ['CostTrend3DBars', 'CostTrend3DArea'].flatMap((name) =>
  ['.tsx', '.test.tsx', '.stories.tsx'].map((suffix) => `${COST_TREND}/${name}${suffix}`));
const MODULES = ['CostTrend3DBars', 'CostTrend3DArea'];
const KEPT = [`${COST_TREND}/StackedChart.tsx`, 'src/components/dashboard/quality/QualityScoreTilted3D.tsx'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** A static `from '…/X'` or a dynamic `import('…/X')` of the module, with or without an extension. */
const importsModule = (text: string, module: string) => {
  const target = `[^'"]*/${escape(module)}(?:\\.tsx?)?['"]`;
  return new RegExp(`from\\s+['"]${target}`).test(text) || new RegExp(`import\\(\\s*['"]${target}`).test(text);
};
const importersOf = (module: string) => sourceFiles(path.join(ROOT, 'src'))
  .filter((file) => importsModule(readFileSync(file, 'utf8'), module))
  .map((file) => path.relative(ROOT, file));

describe('OMN-23330 AC18: unused 3D cost-trend charts are gone, StackedChart and QualityScoreTilted3D stay', () => {
  it.each(DELETED)('%s does not exist', (file) => {
    expect(existsSync(path.join(ROOT, file))).toBe(false);
  });

  it.each(MODULES)('no source file imports %s, statically or dynamically', (module) => {
    expect(importersOf(module)).toEqual([]);
  });

  it.each(KEPT)('%s stays', (file) => {
    expect(existsSync(path.join(ROOT, file))).toBe(true);
  });

  it('positive control, static imports: the live charts that import StackedChart are found', () => {
    expect(importersOf('StackedChart')).toEqual(expect.arrayContaining([
      'src/components/charts/threejs/TrendChart.tsx',
      'src/components/charts/threejs/BarChart.tsx',
      `${COST_TREND}/CostTrend2D.tsx`,
    ]));
  });

  it('positive control, dynamic imports: QualityScore lazy-loading QualityScoreTilted3D is found', () => {
    expect(importersOf('QualityScoreTilted3D')).toContain('src/components/dashboard/quality/QualityScore.tsx');
  });

  it('the Storybook coverage list no longer names the deleted stories', () => {
    const list = readFileSync(path.join(ROOT, 'src/storybook-coverage-compliance.test.ts'), 'utf8');
    expect(list).not.toMatch(/CostTrend3D(Bars|Area)/);
  });
});
