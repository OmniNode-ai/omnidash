/**
 * STORYBOOK WIDGET COVERAGE — COMPLIANCE SCORECARD (OMN-100)
 *
 * Encodes every acceptance criterion of OMN-100 Tasks 2-18 as a Vitest
 * assertion. Mirrors the OMN-59 scorecard pattern (see
 * src/typography-compliance.test.ts).
 *
 * The count of FAILING tests is the refactor's progress indicator. When
 * this file passes 100%, the refactor is complete; Task 18 removes it
 * from the vitest exclude list so it becomes a permanent regression gate.
 *
 * Runs outside the default test suite while the refactor is in progress
 * (see vitest.config.ts `test.exclude`). Execute with:
 *   `npx vitest run src/storybook-coverage-compliance.test.ts --reporter=verbose`
 *
 * Strategy: file-existence + content-grep. We deliberately do NOT
 * dynamically `import()` the story files — Storybook story modules
 * import from `@storybook/react-vite` which is awkward to resolve from
 * vitest's jsdom environment. Storybook's own `npx storybook build` is
 * the render-time gate; this scorecard is the structural gate.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(__dirname, '..');
const readSrc = (relPath: string) => readFileSync(resolve(ROOT, relPath), 'utf-8');
const srcExists = (relPath: string) => existsSync(resolve(ROOT, relPath));

// Kept for parity with the OMN-59 scorecard helpers — may be used by
// future Phase 2 expansions that walk the dashboard tree to enumerate
// widgets dynamically.
function listTsxRecursively(dir: string, opts: { excludeTests: boolean }): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.tsx')) {
        if (opts.excludeTests && (entry.name.endsWith('.test.tsx') || entry.name.endsWith('.stories.tsx'))) continue;
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}
// Reference to silence unused-export lint for this helper. Kept for
// future expansion (per OMN-59 pattern).
void listTsxRecursively;

describe('Phase 0: ADR', () => {
  const ADR_PATH = 'docs/adr/002-storybook-widget-coverage.md';

  it('ADR file exists at docs/adr/002-storybook-widget-coverage.md', () => {
    expect(srcExists(ADR_PATH)).toBe(true);
  });

  it('ADR contains required sections', () => {
    if (!srcExists(ADR_PATH)) {
      throw new Error(`ADR file missing: ${ADR_PATH}`);
    }
    const adr = readSrc(ADR_PATH);
    for (const section of ['Context', 'Decision', 'Consequences', 'Alternatives', 'Status']) {
      expect(adr, `ADR missing "${section}" heading`).toMatch(new RegExp(`^##?\\s+${section}`, 'm'));
    }
  });
});

describe('Phase 1: Foundation', () => {
  const DECORATOR_PATH = 'src/storybook/decorators/withDashboardContext.tsx';
  const FIXTURES_BARREL = 'src/storybook/fixtures/index.ts';
  const PREVIEW_PATH = '.storybook/preview.tsx';

  it('decorator file exists at src/storybook/decorators/withDashboardContext.tsx', () => {
    expect(srcExists(DECORATOR_PATH)).toBe(true);
  });

  it('decorator exports makeDashboardDecorator', () => {
    if (!srcExists(DECORATOR_PATH)) {
      throw new Error(`Decorator file missing: ${DECORATOR_PATH}`);
    }
    const content = readSrc(DECORATOR_PATH);
    // Match named-function or named-const export forms.
    expect(content).toMatch(/export\s+(function|const)\s+makeDashboardDecorator\b/);
  });

  it('fixtures barrel exists at src/storybook/fixtures/index.ts', () => {
    expect(srcExists(FIXTURES_BARREL)).toBe(true);
  });

  it('.storybook/preview.tsx references withDashboardContext', () => {
    expect(srcExists(PREVIEW_PATH)).toBe(true);
    const preview = readSrc(PREVIEW_PATH);
    expect(preview).toMatch(/withDashboardContext/);
  });
});

// `widget: true` flags the dashboard widgets — the canonical things this
// scorecard polices for full test + story coverage. The remaining entries
// are infrastructure components (frame, agent shell, config dialog,
// shared dashboard chrome) where stories alone are sufficient for now.
const STORY_FILES: Array<{ rel: string; id: string; widget: boolean }> = [
  { rel: 'src/components/dashboard/routing/RoutingDecisionTable.stories.tsx', id: 'RoutingDecisionTable.stories', widget: true },
  { rel: 'src/components/dashboard/events/EventStream.stories.tsx', id: 'EventStream.stories', widget: true },
  { rel: 'src/components/dashboard/cost-trend/CostTrend2D.stories.tsx', id: 'CostTrend2D.stories', widget: true },
  { rel: 'src/components/dashboard/cost-trend/CostTrend3DBars.stories.tsx', id: 'CostTrend3DBars.stories', widget: true },
  { rel: 'src/components/dashboard/cost-trend/CostTrend3DArea.stories.tsx', id: 'CostTrend3DArea.stories', widget: true },
  { rel: 'src/components/dashboard/cost-by-model/CostByModelPie.stories.tsx', id: 'CostByModelPie.stories', widget: true },
  { rel: 'src/components/dashboard/cost-by-model/CostByModelBars.stories.tsx', id: 'CostByModelBars.stories', widget: true },
  { rel: 'src/components/dashboard/quality/QualityScoreTilted3D.stories.tsx', id: 'QualityScoreTilted3D.stories', widget: true },
  { rel: 'src/components/dashboard/quality/QualityScoreHistogram.stories.tsx', id: 'QualityScoreHistogram.stories', widget: true },
  { rel: 'src/components/dashboard/delegation/DelegationMetrics2D.stories.tsx', id: 'DelegationMetrics2D.stories', widget: true },
  { rel: 'src/components/dashboard/delegation/DelegationMetrics3D.stories.tsx', id: 'DelegationMetrics3D.stories', widget: true },
  { rel: 'src/components/dashboard/baselines/BaselinesROICard.stories.tsx', id: 'BaselinesROICard.stories', widget: true },
  { rel: 'src/components/dashboard/readiness/ReadinessGate.stories.tsx', id: 'ReadinessGate.stories', widget: true },
  { rel: 'src/components/dashboard/CustomRangePicker.stories.tsx', id: 'CustomRangePicker.stories', widget: false },
  { rel: 'src/components/dashboard/DateRangeSelector.stories.tsx', id: 'DateRangeSelector.stories', widget: false },
  { rel: 'src/components/dashboard/Selectors.stories.tsx', id: 'Selectors.stories', widget: false },
  { rel: 'src/components/dashboard/ComponentWrapper.stories.tsx', id: 'ComponentWrapper.stories', widget: false },
  { rel: 'src/components/dashboard/ComponentPalette.stories.tsx', id: 'ComponentPalette.stories', widget: false },
  { rel: 'src/components/frame/Header.stories.tsx', id: 'Header.stories', widget: false },
  { rel: 'src/components/frame/Sidebar.stories.tsx', id: 'Sidebar.stories', widget: false },
  { rel: 'src/components/frame/FrameLayout.stories.tsx', id: 'FrameLayout.stories', widget: false },
  { rel: 'src/components/frame/DeleteDashboardDialog.stories.tsx', id: 'DeleteDashboardDialog.stories', widget: false },
  { rel: 'src/components/agent/AgentLauncher.stories.tsx', id: 'AgentLauncher.stories', widget: false },
  { rel: 'src/components/agent/AgentChatPanel.stories.tsx', id: 'AgentChatPanel.stories', widget: false },
  { rel: 'src/config/ComponentConfigPanel.stories.tsx', id: 'ComponentConfigPanel.stories', widget: false },
];

describe('Phase 2: Widget stories', () => {
  for (const { rel, id } of STORY_FILES) {
    describe(id, () => {
      it(`${rel} exists`, () => {
        expect(srcExists(rel)).toBe(true);
      });

      it(`${rel} exports Empty story`, () => {
        if (!srcExists(rel)) {
          throw new Error(`Story file missing: ${rel}`);
        }
        const content = readSrc(rel);
        expect(content).toMatch(/export\s+const\s+Empty\s*[:=]/);
      });

      it(`${rel} exports Populated story`, () => {
        if (!srcExists(rel)) {
          throw new Error(`Story file missing: ${rel}`);
        }
        const content = readSrc(rel);
        expect(content).toMatch(/export\s+const\s+Populated\s*[:=]/);
      });
    });
  }
});

describe('Phase 4: Widget tests (T11 / OMN-152)', () => {
  // Mirror of Phase 2 but for the `<widget>.test.tsx` neighbour file. The
  // contract: every widget that has stories must also have a test. Phase
  // 4 is scoped to entries flagged `widget: true` — infrastructure
  // components are still encouraged to gain tests, but not gated here.
  for (const { rel, id, widget } of STORY_FILES) {
    if (!widget) continue;
    const testPath = rel.replace(/\.stories\.tsx$/, '.test.tsx');
    it(`${id}: ${testPath} exists`, () => {
      expect(srcExists(testPath)).toBe(true);
    });
  }
});

describe('Phase 3: Verification — package.json sanity', () => {
  let pkg = '';
  beforeAll(() => { pkg = readSrc('package.json'); });

  it('package.json has a "storybook" script', () => {
    expect(pkg).toMatch(/"storybook"\s*:\s*"[^"]*storybook[^"]*"/);
  });

  it('package.json has a "build-storybook" script', () => {
    expect(pkg).toMatch(/"build-storybook"\s*:\s*"[^"]*storybook[^"]*"/);
  });
});
