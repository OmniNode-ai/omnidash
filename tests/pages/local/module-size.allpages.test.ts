// OMN-23330 AC24 (the operator's 2026-11-09 code review: "a 3,993-line page file"): LocalDashboardPage.tsx is split into
// one module per page plus shared parts, none over 1,000 lines, with no visible change. At 47653180 the file was 3,926
// lines; it is now the page component with its parts in src/pages/local/page-*.tsx (shared, headline, runs, overview,
// settings, workflow, tables). "No visible change" is proved by the AC32 capture (tests/visual) and the full suites.
// Failure modes:
//   M1  the page file or a part grows past 1,000 lines;
//   M2  a name the page exported before the split is no longer exported from it (an import elsewhere would break);
//   M3  the check is blind: it reads no part, or a planted 1,001-line text passes.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as page from '@/pages/LocalDashboardPage';

const ROOT = path.resolve(__dirname, '../../..');
const LIMIT = 1_000;
const lines = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
// Every value the page exported at 47653180 (types are checked by tsc, which every test run compiles against).
const EXPORTED = ['AlertsTable', 'CardBasis', 'ChangeLine', 'CopyButton', 'CredentialsTable', 'FIRST_RUN_COMMAND', 'LastRunCard',
  'LocalDashboardPage', 'LocalIdentity', 'MIXED_PRICING', 'MeteringDayTable', 'MeteringTotalCard', 'MetricCard', 'ModelUsagePanel',
  'NewestRunLine', 'NoRunsYet', 'OverviewDayPicker', 'OverviewStatusStrip', 'OverviewTrendPanel', 'PANEL_CONCEPTS', 'PANEL_ICONS',
  'PENDING_SOURCES', 'PendingState', 'QualityCard', 'QualityPanel', 'RUN_MEASURED_FIELDS', 'RecentRunsTable', 'RunLocallyCard',
  'RunNeighbours', 'RunSummary', 'RunTimeline', 'RunsKpis', 'RunsTable', 'SavingsByModel', 'TierMixPanel', 'UsageKpis', 'WorkflowRun',
  'captionText', 'headlineHoverLines', 'meteringMoneyBasis', 'meteringRangeFor', 'meteringTokens', 'periodChangeLine',
  'pickMeteringRow', 'pricingLabel', 'qualityChangeLine', 'readOverviewWindow', 'readableTime', 'runModelColumnWidth',
  'runModelledCell', 'servedMeteringDays', 'unbroken', 'writeOverviewWindow'];

describe('OMN-23330 AC24: the local page file is split', () => {
  const files = ['src/pages/LocalDashboardPage.tsx',
    ...readdirSync(path.join(ROOT, 'src/pages/local')).filter((name) => /^page-[\w-]+\.tsx$/.test(name)).map((name) => `src/pages/local/${name}`)];

  it('M1, M3: the page file and each of its parts stay within 1,000 lines', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    const over = files.map((file) => ({ file, lines: lines(readFileSync(path.join(ROOT, file), 'utf8')) })).filter((entry) => entry.lines > LIMIT);
    expect(over).toEqual([]);
    expect(lines('x\n'.repeat(LIMIT + 1)) > LIMIT).toBe(true);
  });

  it('M2: every value the page exported before the split is still exported from it', () => {
    expect(EXPORTED.filter((name) => !(name in page))).toEqual([]);
  });
});
