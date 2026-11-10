// OMN-23330 AC25 (the operator's ruling 2026-11-10, "All in touched files"): the count of static inline style attributes
// in src does not rise, and every file this ticket touches carries none. A static inline style is a style object whose
// every value is a literal (style={{ marginTop: 4 }}); a style computed from data stays inline, as it must.
// Measured 2026-11-10: 970 in src at the base 4be1140a, 958 before this change; the 54 touched files below held 609, now
// classes in a stylesheet beside each file (the Text colours that matched a token became Text's color prop). Now 349.
// Failure modes:
//   I1  a static inline style is added anywhere in src (the count rises above the recorded 349);
//   I2  a file this ticket touched carries a static inline style again;
//   I3  the counter is blind: it misses a planted static style, or counts a computed one.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const RECORDED = 349;
const TOUCHED = [
  'src/components/charts/threejs/BarChart.tsx',
  'src/components/charts/threejs/DoughnutChartAdapter.tsx',
  'src/components/charts/threejs/TrendChart.tsx',
  'src/components/dashboard/AutoRefreshSelector.tsx',
  'src/components/dashboard/ab-compare/AbCompareWidget.tsx',
  'src/components/dashboard/alert-banner/AlertBanner.tsx',
  'src/components/dashboard/baselines/BaselinesROICard.tsx',
  'src/components/dashboard/consumer-flow/ConsumerFlowWidget.tsx',
  'src/components/dashboard/context-heatmap/ContextEffectivenessHeatmap.tsx',
  'src/components/dashboard/control-plane/PipelineLogStream.tsx',
  'src/components/dashboard/cost-by-model/CostByModelPie.tsx',
  'src/components/dashboard/cost-savings-overview/CostSavingsOverviewWidget.tsx',
  'src/components/dashboard/cost-summary/CostSummaryAdapter.tsx',
  'src/components/dashboard/cost-trend/CostTrend2D.tsx',
  'src/components/dashboard/cost-trend/StackedChart.tsx',
  'src/components/dashboard/delegation/DelegationCostBreakdownWidget.tsx',
  'src/components/dashboard/delegation/DelegationCostComparisonWidget.tsx',
  'src/components/dashboard/delegation/DelegationMetrics2D.tsx',
  'src/components/dashboard/delegation/DelegationMetrics3D.tsx',
  'src/components/dashboard/delegation/DelegationModelOutputWidget.tsx',
  'src/components/dashboard/delegation/DelegationModelRoutingWidget.tsx',
  'src/components/dashboard/delegation/DelegationQualityGateWidget.tsx',
  'src/components/dashboard/delegation/DelegationTokenUsageWidget.tsx',
  'src/components/dashboard/delegation/DoughnutChart.tsx',
  'src/components/dashboard/dep-health/DepHealthWidget.tsx',
  'src/components/dashboard/errors/ErrorsWidget.tsx',
  'src/components/dashboard/events/EventStream.tsx',
  'src/components/dashboard/evidence-pipeline/EvidencePipelineFlow.tsx',
  'src/components/dashboard/instruction-eval/InstructionEvalHeatmap.tsx',
  'src/components/dashboard/intent-distribution/IntentDistributionWidget.tsx',
  'src/components/dashboard/lab-runners/LabRunnersWidget.tsx',
  'src/components/dashboard/live-events/LiveEventStreamWidget.tsx',
  'src/components/dashboard/mcp-tools/McpToolsWidget.tsx',
  'src/components/dashboard/projection-container/visualizations/CostBarChart.tsx',
  'src/components/dashboard/projection-container/visualizations/CostScatter.tsx',
  'src/components/dashboard/quality/QualityScoreTilted3D.tsx',
  'src/components/dashboard/readiness/ReadinessGate.tsx',
  'src/components/dashboard/receipt-gate/ReceiptGateWidget.tsx',
  'src/components/dashboard/routing-decision/RoutingDecisionWidget.tsx',
  'src/components/dashboard/routing/RoutingDecisionTable.tsx',
  'src/components/dashboard/session-replay/SessionReplayWidget.tsx',
  'src/components/dashboard/session-timeline/SessionTimelineWidget.tsx',
  'src/components/dashboard/skill-adoption/SkillAdoptionWidget.tsx',
  'src/components/dashboard/status-grid/StatusGrid.tsx',
  'src/components/dashboard/swarm-control-plane/SwarmSubtaskCard.tsx',
  'src/components/dashboard/topic-activity/TopicActivityWidget.tsx',
  'src/components/dashboard/trace-explorer/TraceExplorerWidget.tsx',
  'src/components/dashboard/work-events/WorkEventsWidget.tsx',
  'src/pages/DelegationEvidencePage.tsx',
  'src/pages/FeatureFlagDashboard.tsx',
  'src/pages/SandboxMonitorPage.tsx',
  'src/pages/SessionReplayPage.tsx',
  'src/pages/VoiceSessionPage.tsx',
  'src/pages/local/page-headline.tsx',
];

const literal = (node: ts.Expression) => ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
  || (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand));
/** How many style attributes in a TSX source are objects of literal values only. */
export function staticStyles(code: string): number {
  const source = ts.createSourceFile('x.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'style' && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && ts.isObjectLiteralExpression(node.initializer.expression)) {
      const props = node.initializer.expression.properties;
      if (props.length > 0 && props.every((p) => ts.isPropertyAssignment(p) && literal(p.initializer))) count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sources(file);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) ? [file] : [];
  });
}

describe('OMN-23330 AC25: static inline styles', () => {
  it('I1: the count in src does not rise above the recorded 349', () => {
    const total = sources(path.join(ROOT, 'src')).reduce((sum, file) => sum + staticStyles(readFileSync(file, 'utf8')), 0);
    expect(total).toBeLessThanOrEqual(RECORDED);
    expect(total).toBeGreaterThan(0);
  });

  it('I2: no file this ticket touched carries a static inline style', () => {
    expect(TOUCHED.length).toBe(54);
    const left = TOUCHED.map((file) => ({ file, count: staticStyles(readFileSync(path.join(ROOT, file), 'utf8')) })).filter((entry) => entry.count > 0);
    expect(left).toEqual([]);
  });

  it('I3 control: a planted static style is counted, a computed one is not', () => {
    expect(staticStyles('const a = <div style={{ marginTop: 4, color: "red" }} />;')).toBe(1);
    expect(staticStyles('const a = <div style={{ width: `${pct}%` }} />;')).toBe(0);
    expect(staticStyles('const a = <div style={{ marginTop: -4 }} />;')).toBe(1);
  });
});
