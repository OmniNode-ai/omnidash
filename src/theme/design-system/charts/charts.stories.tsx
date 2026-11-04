/**
 * OMN-22168 AC6: every chart the chart kit exports, drawn with sample data in its populated, not-recorded and empty
 * states. The sample values are story data only; no page reads them.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { StoryPage, StorySection } from '../story-frame';
import {
  BarSparkline, BarTrack, ChartCard, ChartEmpty, ChartHeading, ChartNotRecorded, ChartReadout, ComparisonTrack, CostQualityScatter,
  CumulativeColumns, DayColumns, GroupedBars, Histogram, HourHeatmap, LinePlot, Meter, NamedByPanel, RankedBars, RunDurationChart,
  RunMetricChart, RunTimingChart, RunTokensChart, SeriesLegend, SeriesToggles, SpendByDayChart, SpendColumns, TierLegend, TierMix,
  type ListedRun,
} from './index';

const none = () => {};
const DAYS = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];
const RUNS: ListedRun[] = [
  { id: 'a1b2c3d4e5f6', status: 'passed', model: 'qwen3.8-27b', duration: 4200, tokensIn: 1800, tokensOut: 420, cost: '0.000000', score: 0.92 },
  { id: 'b2c3d4e5f6a1', status: 'failed', model: 'glm-5.1', duration: 9100, tokensIn: 3200, tokensOut: 900, cost: '0.004100', score: 0.41 },
  { id: 'c3d4e5f6a1b2', status: 'passed', model: 'claude-sonnet-5-5', duration: 2600, tokensIn: 1200, tokensOut: 300, cost: '0.012000', score: 0.97 },
  { id: null, status: 'passed', model: 'qwen3.8-27b', duration: null, tokensIn: null, tokensOut: null },
];
const SPEND_COLUMNS = [
  { key: 'window_start', header: 'Day' },
  { key: 'spend_usd', header: 'Actual spend', format: 'currency' },
  { key: 'counterfactual_usd', header: 'Baseline spend', format: 'currency' },
  { key: 'savings_usd', header: 'Savings', format: 'currency' },
];
const SPEND_ROWS = DAYS.slice(0, 4).map((day, index) => ({
  window_kind: 'day', window_start: day, as_of: `${day}T23:00:00+00:00`, baseline_model: 'claude-sonnet-5-5', baseline_state: 'resolved',
  spend_usd: (0.1 + index * 0.02).toFixed(6), counterfactual_usd: (0.4 + index * 0.05).toFixed(6), savings_usd: (0.3 + index * 0.03).toFixed(6),
}));
const COUNTS = [12, 18, null, 9, 22, 15, 6];

function Charts() {
  return <>
    <StorySection title="Frame: card, heading, readout, not recorded, empty">
      <ChartCard title="Runs per day" concept="runs" delay={0}>
        <ChartHeading title="Runs per day" detail="Last 7 days" concept="runs" />
        <ChartReadout text="Oct 29: not recorded" active />
        <ChartNotRecorded role="status">Not recorded: the projection served no rows for this window.</ChartNotRecorded>
        <ChartEmpty status>No runs in this window</ChartEmpty>
      </ChartCard>
      <NamedByPanel.Provider value>
        <ChartCard title="Named by its panel" concept="spend" delay={0}><ChartEmpty>No spend recorded</ChartEmpty></ChartCard>
      </NamedByPanel.Provider>
    </StorySection>

    <StorySection title="Legends">
      <SeriesLegend label="Series" series={[{ label: 'Spend', color: 'var(--ds-chart-1)' }, { label: 'Saved', color: 'var(--ds-chart-2)' }]} />
      <SeriesToggles label="Series shown" onToggle={none} series={[
        { key: 'spend', label: 'Spend', color: 'var(--ds-chart-1)', shown: true }, { key: 'saved', label: 'Saved', color: 'var(--ds-chart-2)', shown: false }]} />
      <TierLegend models={['local', 'cheap_frontier', 'claude', 'frontier']} />
    </StorySection>

    <StorySection title="Daily bars">
      <DayColumns label="Runs per day" max={22} hover={null} onHover={none} dayLabel={key => key.slice(5)} days={DAYS.map((day, index) => ({
        key: day, ariaLabel: `${day}: ${COUNTS[index] ?? 'not recorded'} runs`, tick: true,
        values: [{ key: 'runs', value: COUNTS[index], color: 'var(--ds-chart-1)', label: 'Runs' }] }))} />
      <Histogram label="Duration buckets" onHover={none} color="var(--ds-chart-3)" buckets={[
        { key: '0-1s', ariaLabel: '0 to 1 s: 4', value: 4 }, { key: '1-5s', ariaLabel: '1 to 5 s: 11', value: 11 },
        { key: '5-10s', ariaLabel: '5 to 10 s: not served', value: null }, { key: '10s+', ariaLabel: 'over 10 s: 2', value: 2 }]} />
      <Histogram label="Cumulative savings, solid" onHover={none} color="var(--ds-chart-2)" look="solid" buckets={[
        { key: 'a', ariaLabel: 'a', value: 1 }, { key: 'b', ariaLabel: 'b', value: 3 }, { key: 'c', ariaLabel: 'c', value: 6 }]} />
    </StorySection>

    <StorySection title="Stacked and grouped bars">
      <SpendColumns label="Spend and savings per day" max={0.6} onHover={none} days={DAYS.slice(0, 4).map((day, index) => ({
        key: day, ariaLabel: day, dayText: day.slice(5), valuesText: 'spend and savings',
        spend: 0.1 + index * 0.02, saved: index === 2 ? null : 0.3 + index * 0.03, baseline: 0.4 + index * 0.05 }))} />
      <CumulativeColumns label="Cumulative savings" max={1.4} onHover={none} days={DAYS.slice(0, 4).map((day, index) => ({
        key: day, ariaLabel: day, value: index === 1 ? null : 0.3 * (index + 1) }))} />
      <GroupedBars label="Cost by model and tier" legend={[{ label: 'Measured', color: 'var(--ds-chart-1)' }, { label: 'Modelled', color: 'var(--ds-chart-4)' }]} groups={[
        { key: 'qwen', name: 'qwen3.8-27b', label: 'qwen: measured 0.00, modelled 0.01', values: [
          { key: 'm', value: 0, display: '$0.00', color: 'var(--ds-chart-1)' }, { key: 'e', value: 0.01, display: '$0.01', color: 'var(--ds-chart-4)' }] },
        { key: 'glm', name: 'glm-5.1', label: 'glm: measured 0.04, modelled not served', values: [
          { key: 'm', value: 0.04, display: '$0.04', color: 'var(--ds-chart-1)' }, { key: 'e', value: null, display: 'Not measured', color: 'var(--ds-chart-4)' }] }]} />
      <SpendByDayChart rows={SPEND_ROWS} columns={SPEND_COLUMNS} />
    </StorySection>

    <StorySection title="Tier mix">
      <TierMix nameOf={tier => tier} shares={{ segments: [
        { name: 'local', share: 0.6, count: 12 }, { name: 'cheap_frontier', share: 0.25, count: 5 }, { name: 'claude', share: 0.15, count: 3 }], unmeasured: ['frontier'] }} />
      <TierMix variant="bars" nameOf={tier => tier} shares={{ segments: [{ name: 'local', share: 0.7, count: 7 }, { name: 'cloud', share: 0.3, count: 3 }], unmeasured: [] }} />
      <TierMix nameOf={tier => tier} shares={{ refused: 'Not recorded: the tier shares do not add up to the routed runs.' }} />
    </StorySection>

    <StorySection title="Model usage">
      <RankedBars label="Cost per run by model" unit="USD · lower is better" items={[
        { key: 'qwen', name: 'qwen3.8-27b', value: 0, display: '$0.00', basis: 'measured', color: 'var(--ds-chart-1)' },
        { key: 'glm', name: 'glm-5.1', value: 0.004, display: '$0.004', basis: 'estimated', color: 'var(--ds-chart-2)' },
        { key: 'sonnet', name: 'claude-sonnet-5-5', value: null, display: 'Not measured', basis: 'unknown', color: 'var(--ds-chart-unknown)' }]} />
      <CostQualityScatter label="Cost against quality" formatCost={value => `$${value.toFixed(3)}`} unplotted={['frontier-x']} points={[
        { key: 'qwen', name: 'qwen3.8-27b', cost: 0, rate: 0.9, runs: 12, color: 'var(--ds-chart-1)', detail: '12 runs' },
        { key: 'glm', name: 'glm-5.1', cost: 0.004, rate: 0.7, runs: 5, color: 'var(--ds-chart-2)', detail: '5 runs' }]} />
      <CostQualityScatter label="Cost against quality, empty" formatCost={value => `$${value}`} unplotted={['qwen3.8-27b']} points={[]} />
      <HourHeatmap label="Runs by hour" onInspect={none} cellLabel={(row, hour) => `row ${row}, ${hour}:00`}
        rows={[{ key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }]}
        counts={[Array.from({ length: 24 }, (_, hour) => (hour * 7) % 5), Array.from({ length: 24 }, (_, hour) => (hour * 3) % 4)]} />
    </StorySection>

    <StorySection title="Line and sparkline">
      <LinePlot label="Median duration per day" values={[4.2, 3.9, null, 5.1, 4.4, 3.6, 4.0]} keys={DAYS} labels={DAYS} min={0} max={6}
        hover={null} onHover={none} color="var(--ds-chart-3)" />
      <BarSparkline label="Runs per day" days={DAYS.map((day, index) => ({ key: day, value: COUNTS[index], title: day }))} />
    </StorySection>

    <StorySection title="Meters and tracks">
      <Meter kind="routing-share" label="Local share of all runs" min={0} max={100} now={62} valueText="62.0%" share={0.62} />
      <Meter kind="selected-quality" label="Quality score versus required bar" min={0} max={1} now={0.81} share={0.81} mark={0.75} />
      <ComparisonTrack />
      <BarTrack share={0.4} delay={0} />
    </StorySection>

    <StorySection title="Run charts">
      <RunDurationChart runs={RUNS} onOpen={none} />
      <RunTokensChart runs={RUNS} onOpen={none} />
      <RunMetricChart runs={RUNS} onOpen={none} metric="cost" />
      <RunMetricChart runs={RUNS} onOpen={none} metric="score" />
      <RunTimingChart timings={[{ key: 'queue', label: 'Queue', value: 120 }, { key: 'model', label: 'Model', value: 3400 }, { key: 'score', label: 'Score', value: null }]} />
      <RunDurationChart runs={[]} onOpen={none} />
    </StorySection>
  </>;
}

const meta = { title: 'Design system/Charts', component: Charts } satisfies Meta<typeof Charts>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = { render: () => <StoryPage><Charts /></StoryPage>, parameters: { themes: { themeOverride: 'Light' } } };
export const Dark: Story = { render: () => <StoryPage><Charts /></StoryPage>, parameters: { themes: { themeOverride: 'Dark' } } };
