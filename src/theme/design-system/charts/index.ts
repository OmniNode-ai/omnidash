/**
 * OMN-22168 AC3: the one chart kit. Every chart the six product pages draw (Overview, Runs, Workflow, Usage, Settings,
 * Delegation Evidence) comes from here; tests/design-system/chart-scan.test.ts fails on a chart drawn anywhere else.
 *
 * Frame and states: ChartCard (an Overview card), ChartHeading (a chart's row inside a panel), ChartReadout (the
 * tooltip, in words), ChartEmpty, ChartNotRecorded.
 * Legends: SeriesToggles (+ useSeriesToggles), SwatchToggles, SeriesLegend, TierLegend.
 * Charts: DayColumns and Histogram (daily bars), SpendByDayChart (stacked spend bars) and the run bar charts, TierMix
 * (tier mix), RankedBars and GroupedBars (model usage), LinePlot (line), BarSparkline (sparkline), HourHeatmap,
 * CostQualityScatter, Meter and BarTrack.
 */
export { ChartCard, ChartEmpty, ChartHeading, ChartNotRecorded, ChartReadout, NamedByPanel } from './frame';
// SwatchToggles stays inside the kit: only the kit's bar charts draw it (bar-charts.tsx imports it from ./legend).
export { SeriesLegend, SeriesToggles, TierLegend, useSeriesToggles } from './legend';
export type { LegendSeries, ToggleSeries } from './legend';
export { DayColumns, Histogram, dayTicks } from './DayColumns';
export type { DayBarValue, DayColumn, HistogramBucket } from './DayColumns';
export { LinePlot, linePath } from './LinePlot';
export { CumulativeColumns, SpendColumns } from './SpendColumns';
export type { CumulativeDay, SpendDay } from './SpendColumns';
export { BarSparkline } from './BarSparkline';
export type { SparkDay } from './BarSparkline';
export { HourHeatmap } from './HourHeatmap';
export { CostQualityScatter } from './CostQualityScatter';
export type { ScatterPoint } from './CostQualityScatter';
export { BarTrack, ComparisonTrack, Meter } from './Meter';
export { SHARES_OVER_WHOLE, TIER_TONES, TierMix, arcPath, percent } from './TierMix';
export type { TierSegment, TierShares } from './TierMix';
export { RankedBars } from './RankedBars';
export type { RankedBarBasis, RankedBarItem } from './RankedBars';
export { GroupedBars } from './GroupedBars';
export type { GroupedBarGroup, GroupedBarValue } from './GroupedBars';
export {
  EVERY_SERIES_HIDDEN, RunDurationChart, RunMetricChart, RunTimingChart, RunTokensChart, SpendByDayChart, UNRESOLVED_BASELINE,
  countAxisLabel, dayAxisLabel, flatBar, millisecondsAxisLabel, runTimingBars, spendByDayGroups, valueAxisLabel,
} from './bar-charts';
export type { DeclaredChartColumn, ListedRun, RunTiming, RunTimingBar, ServedSeries, SpendByDayGroup } from './bar-charts';
