// @vitest-environment node
/**
 * OMN-22168 AC3: every page chart is drawn by the kit in src/design-system/charts; no page or component outside it draws
 * a chart of its own or imports a chart library. Failure modes this catches:
 *   1. a page draws an SVG plot, a meter or the kit's bar marks itself (a second, drifting copy of a kit chart);
 *   2. a page imports ECharts (or another chart library) instead of using the kit's charts;
 *   3. a kit chart nobody uses is kept (dead code that the next page copies instead of importing);
 *   4. the scanner goes blind (the planted controls fail first).
 */
import { describe, expect, it } from 'vitest';
import { CHART_KIT, WIDGET_DASHBOARD_CHARTS, chartDrawing, read, scanAll, sourceFiles, stripComments, summarise } from './scan';

describe('OMN-22168 AC3: one chart kit', () => {
  it('control: a planted chart on a page is caught in each form', () => {
    const planted = [
      "import * as echarts from 'echarts/core';",
      "import ReactEChartsCore from 'echarts-for-react/lib/core';",
      '<svg viewBox="0 0 10 10"><path d="M0 0" /></svg>',
      '<div role="meter" aria-valuenow={1} />',
      '<span className="gdb-bar ins-seg" />',
      '<span className="ins-track"><span className="ins-fill" /></span>',
    ].join('\n');
    expect(chartDrawing('src/pages/local/Planted.tsx', planted).length).toBeGreaterThanOrEqual(7);
  });

  it('control: the kit itself, a test and a comment naming a chart are not violations', () => {
    expect(chartDrawing(`${CHART_KIT}DayColumns.tsx`, '<svg />')).toEqual([]);
    expect(chartDrawing('src/pages/local/x.test.tsx', '<svg />')).toEqual([]);
    expect(chartDrawing('src/pages/local/x.tsx', '// the kit draws the <svg> for this chart')).toEqual([]);
  });

  it('control: a page planted beside the widget allowlist is still caught', () => {
    expect(chartDrawing('src/components/dashboard/cost-trend/NewChart.tsx', "import 'echarts';").length).toBe(1);
  });

  it('every widget-dashboard file the allowlist names exists, so the list cannot go stale and hide a page', () => {
    const files = new Set(sourceFiles());
    for (const path of WIDGET_DASHBOARD_CHARTS) expect(files.has(path), path).toBe(true);
  });

  it('no page or component outside the kit draws a chart or imports a chart library', () => {
    const hits = scanAll(chartDrawing);
    expect(hits, summarise(hits)).toEqual([]);
  });

  it('every chart the kit exports is used by a page', () => {
    const index = read(`${CHART_KIT}index.ts`);
    const exported = [...index.matchAll(/export\s*\{([^}]*)\}/g)].flatMap(m => m[1]!.split(','))
      .map(name => name.trim().split(/\s+as\s+/).pop()!).filter(name => /^[A-Z][a-z]/.test(name));
    expect(exported.length).toBeGreaterThan(10);
    const users = sourceFiles().filter(path => !path.startsWith(CHART_KIT) && /\.tsx?$/.test(path) && !/\.(test|stories)\./.test(path))
      .map(path => stripComments(path, read(path))).filter(code => code.includes("'@/design-system/charts'"));
    const unused = exported.filter(name => !users.some(code => new RegExp(`\\b${name}\\b`).test(code)));
    expect(unused, 'kit exports no page imports').toEqual([]);
  });
});
