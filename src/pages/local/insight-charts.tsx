import { formatDashboardCount, formatFullCount } from '@/lib/dashboard-count';
import { modelColor } from '@/lib/dashboard-colors';
import { formatDashboardUsd } from '@/lib/dashboard-currency';
import { formatDuration } from '@/lib/duration';
import { createContext, useContext, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { RankedBars } from '@/components/dashboard/RankedBars';
import { ConceptIcon } from '@/components/dashboard/FieldIcon';
import { causeHref, useSharedRunFilter } from './run-filter';
import { failureCauseLabel } from './plain-text';
import { Link, useLocation, useSearch } from 'wouter';
import { DEFAULT_RUNS_VIEW, readRunsSearch, writeRunsSearch } from '@/navigation/runs-url-state';
import {
  NOT_RECORDED, causes, countBy, durationBuckets, summary, toInsightRuns, windowDays, windowRuns,
  type InsightDay, type InsightRun,
} from './insights';
import {
  aggregateMeteringRange, aggregateMeteringWindow, compareWindow, durationBucketLabel, durationEdges, meteringAllTimeTotals,
  type MeteringWindow,
} from './insight-aggregates';

/**
 * OMN-21166 AC26 (mockup build; rule change R-B, Lakshman 2026-10-18): the Overview's trends and breakdowns, counted
 * in the browser from the served delegation.decisions.v1 rows by `./insights`. Each chart says its window; a value the
 * runtime did not serve is shown as not recorded, never as a number. Every mark a pointer can read is also a button a
 * keyboard can focus, with the same numbers in its name and in the chart's readout.
 */

const RANGES = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 15, label: '15 days' },
  { days: 30, label: '30 days' },
] as const;

const PASS = 'var(--ins-pass)';
const FAIL = 'var(--ins-fail)';
const UNKNOWN = 'var(--ins-unknown)';

const TASK_CONCEPT: Readonly<Record<string, string>> = {
  document: 'task-document', code_generation: 'task-code-generation', research: 'task-research',
  summarization: 'task-summarization', code_review: 'task-code-review', review: 'task-code-review', test: 'task-test',
};
function taskLook(task: string) {
  const concept = TASK_CONCEPT[task] ?? 'task-other';
  return { concept, color: `var(--field-${concept})`, icon: <ConceptIcon concept={concept} label={readable(task)} size={14} /> };
}

/** A task type's canonical icon and colour, with its readable name beside it. */
export function TaskIcon({ task }: { task: string }) {
  const look = taskLook(task);
  return <span className="local-task-icon" style={{ '--ins-swatch': look.color } as CSSProperties} aria-hidden="true">{look.icon}</span>;
}

function count(value: number): string {
  return formatDashboardCount(value);
}

/**
 * OMN-21304 AC3: the population a pass rate is over. A rate counts only runs with a served verdict, so beside it the
 * page says how many of the runs that is; a run with no verdict is never folded into passed or failed.
 */
function verdictCoverage(withVerdict: number, runs: number): string {
  return `${count(withVerdict)} of ${count(runs)} runs have a verdict`;
}

const duration = (ms: number): string => formatDuration(ms);

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function weekday(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function readable(key: string): string {
  return key.replace(/_/g, ' ');
}

/** "1 run", "2 runs" (OMN-21166 part 21 edge case: a day with one run read "1 runs"). */
function runsWord(value: number): string {
  return `${count(value)} ${value === 1 ? 'run' : 'runs'}`;
}

function dayCounts(day: InsightDay): string {
  const parts = [runsWord(day.runs), `${count(day.passed)} passed`, `${count(day.failed)} failed`];
  if (day.unrecorded > 0) parts.push(`${count(day.unrecorded)} not recorded`);
  return parts.join(', ');
}

/** True inside a panel whose own heading already names the chart: the chart's title then only labels the figure. */
const NamedByPanel = createContext(false);

function ChartCard({ title, concept, note, delay, children }: {
  title: string; concept: string; note?: string; delay: number; children: ReactNode;
}) {
  const id = useId();
  const named = useContext(NamedByPanel);
  return (
    <figure className="local-chart ins-card od-card" aria-labelledby={id} style={{ '--ins-accent': `var(--field-${concept})`, animationDelay: `${delay}ms` } as CSSProperties}>
      <div className="ins-card-head">
        <h3 id={id} className="ins-title" hidden={named}><span className="ins-badge" aria-hidden="true"><ConceptIcon concept={concept} label={title} size={16} /></span>{title}</h3>
        {note && <span className="ins-note">{note}</span>}
      </div>
      {children}
    </figure>
  );
}

/** A day chart's words for the day pointed at; empty at rest (part 15 AC96), keeping its line so the chart does not move. */
function Readout({ testId, text, active }: { testId?: string; text: ReactNode; active: boolean }) {
  if (text === null) return null;
  return <p className={`ins-readout${active ? ' ins-readout--active' : ''}`} data-testid={testId} aria-live="polite">{text}</p>;
}

/**
 * Live review 2026-10-25 ("all graphs this style"): one day of a grouped bar chart, the reference screenshot's look:
 * each series a dotted bar side by side, its served value above it; a value not served draws no bar and no number.
 * Heights are each value over the largest single value in the chart.
 */
function DayBars({ values, max }: { values: ReadonlyArray<{ key: string; value: number | null; color: string; label: string }>; max: number }) {
  return (
    <span className="gdb-group">
      {values.map(entry => (
        <span key={entry.key} className="gdb-col" data-series={entry.key}>
          {entry.value !== null && entry.value > 0 && <b className="gdb-val">{entry.label}</b>}
          {entry.value !== null && entry.value > 0 && (
            <span className="gdb-bar ins-seg" style={{ height: `${(entry.value / max) * 100}%`, color: entry.color } as CSSProperties} />
          )}
        </span>
      ))}
    </span>
  );
}

/** A short label above a token bar ("2.9K", "206K"); the exact count is in the day's readout and accessible name. */
function shortCount(value: number | null): string {
  if (value === null) return '';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return String(value);
}

/** Day labels under a grouped chart: every day while they fit, else every few days, always the last. */
/** OMN-21166 part 21 AC139: at most `maxLabels` day labels, so they never touch; Overview's half-width charts show 8. */
function dayTicks(days: readonly { day: string }[], maxLabels = 14): Set<number> {
  if (days.length === 0) return new Set();
  const step = Math.max(1, Math.ceil(days.length / maxLabels));
  const last = days.length - 1;
  const ticks = days.map((_, index) => index).filter(index => index % step === 0);
  // The last day always has a label; the tick before it goes when it would sit beside it (edge case: 30 days at step 4
  // labelled both index 28 and 29, which overlapped). Onex delegate run 5406a8e7.
  const previous = ticks.at(-1);
  if (previous !== undefined && last - previous < step) ticks.pop();
  ticks.push(last);
  return new Set(ticks);
}

function RunsPerDay({ days }: { days: InsightDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // OMN-21166 AC78: a day opens Runs filtered to that UTC day (the day key is already the UTC date).
  // On Runs itself the filters already chosen stay; only the day changes.
  const [location, navigate] = useLocation();
  const search = useSearch();
  const onRuns = location === '/runs';
  const openDay = (key: string) => navigate(`/runs?${writeRunsSearch(onRuns ? search : '', { ...(onRuns ? readRunsSearch(search) : DEFAULT_RUNS_VIEW), day: key, page: 1 })}`);
  const opensId = useId();
  const [show, setShow] = useState({ passed: true, failed: true });
  const max = Math.max(1, ...days.flatMap(day => [show.passed ? day.passed : 0, show.failed ? day.failed : 0, day.unrecorded]));
  const active = hover === null ? null : days[hover]!;
  const ticks = dayTicks(days, onRuns ? 14 : 8);
  const toggle = (key: 'passed' | 'failed') => setShow(current => {
    const other = key === 'passed' ? 'failed' : 'passed';
    return current[key] && !current[other] ? current : { ...current, [key]: !current[key] };
  });
  return (
    <ChartCard title="Runs per day" concept="runs-daily" delay={0}>
      <Readout testId="runs-per-day-readout" active={active !== null}
        text={active ? <>{dayLabel(active.day)} · <span data-field-tone="count">{count(active.runs)} runs</span> · <span data-field-tone="pass">{count(active.passed)} passed</span> · <span data-field-tone="fail">{count(active.failed)} failed</span>{active.unrecorded ? <> · {count(active.unrecorded)} not recorded</> : null}</> : ''} />
      <div className="ins-bars gdb-plot" role="group" aria-label="Runs per day" onMouseLeave={() => setHover(null)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null); }}>
        {days.map((day, index) => (
          <button key={day.day} type="button" className="ins-bar gdb-day" aria-label={`${dayLabel(day.day)}: ${dayCounts(day)}`}
            aria-describedby={opensId} onClick={() => openDay(day.day)}
            data-dim={hover !== null && hover !== index} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}>
            <DayBars max={max} values={[
              ...(show.passed ? [{ key: 'passed', value: day.passed, color: PASS, label: count(day.passed) }] : []),
              ...(show.failed ? [{ key: 'failed', value: day.failed, color: FAIL, label: count(day.failed) }] : []),
              ...(day.unrecorded > 0 ? [{ key: 'unrecorded', value: day.unrecorded, color: UNKNOWN, label: count(day.unrecorded) }] : []),
            ]} />
            <span className="gdb-day-label" aria-hidden="true">{ticks.has(index) ? dayLabel(day.day) : ''}</span>
          </button>
        ))}
      </div>
      <span id={opensId} hidden>Opens Runs for this day</span>
      <div className="ins-toggles gdb-legend" role="group" aria-label="Series">
        <button type="button" className="ins-toggle" data-field-tone="pass" aria-pressed={show.passed} onClick={() => toggle('passed')} style={{ '--ins-swatch': PASS } as CSSProperties}>Passed</button>
        <button type="button" className="ins-toggle" data-field-tone="fail" aria-pressed={show.failed} onClick={() => toggle('failed')} style={{ '--ins-swatch': FAIL } as CSSProperties}>Failed</button>
      </div>
    </ChartCard>
  );
}

/** An SVG path through the points that have a value; a day without one breaks the line rather than drawing a 0. */
function linePath(values: ReadonlyArray<number | null>, min: number, max: number, width: number, height: number): string {
  // The scale's height; a flat scale (every value equal) still needs a non-zero height to draw on.
  const span = max > min ? max - min : 1;
  let path = '';
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) { drawing = false; return; }
    const x = values.length > 1 ? (index / (values.length - 1)) * width : width / 2;
    const y = height - 6 - ((value - min) / span) * (height - 12);
    path += `${drawing ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    drawing = true;
  });
  return path.trim();
}

function HoverColumns({ labels, onHover }: { labels: string[]; onHover: (index: number | null) => void }) {
  return (
    <div className="ins-hits" onMouseLeave={() => onHover(null)}>
      {labels.map((label, index) => (
        <button key={label} type="button" className="ins-hit" aria-label={label} onMouseEnter={() => onHover(index)} onFocus={() => onHover(index)} />
      ))}
    </div>
  );
}

function PassRateTrend({ days }: { days: InsightDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const rates = days.map(day => day.passRate);
  const known = rates.filter((rate): rate is number => rate !== null);
  const min = known.length ? Math.max(0, Math.floor(Math.min(...known) / 10) * 10 - 10) : 0;
  const path = linePath(rates, min, 100, 600, 120);
  const labels = days.map(day => `${dayLabel(day.day)}: ${day.passRate === null ? 'no verdicts' : `${day.passRate.toFixed(1)}% passed`} (${verdictCoverage(day.passed + day.failed, day.runs)})`);
  const active = hover === null ? null : days[hover]!;
  const x = hover === null ? 0 : days.length > 1 ? (hover / (days.length - 1)) * 100 : 50;
  return (
    <ChartCard title="Pass rate per day" concept="pass-rate-daily" delay={60}>
      <Readout active={active !== null} text={active ? <>{dayLabel(active.day)} · <span data-field-tone="pass" data-field-unavailable={active.passRate === null}>{active.passRate === null ? 'no verdicts' : `${active.passRate.toFixed(1)}% passed`}</span> · <span data-field-tone="basis">{verdictCoverage(active.passed + active.failed, active.runs)}</span></> : `Scale from ${min}% to 100%`} />
      <div className="ins-plot">
        <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label="Pass rate per day">
          <path className="od-draw" d={path} fill="none" stroke={PASS} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {/* A dot on every day that has a verdict, so a single day of runs still shows (a line needs two). */}
        {rates.map((rate, index) => rate === null ? null : (
          <span key={days[index]!.day} className="ins-dot" data-active={hover === index}
            style={{ left: `${days.length > 1 ? (index / (days.length - 1)) * 100 : 50}%`, top: `${((120 - 6 - ((rate - min) / (100 - min)) * 108) / 120) * 100}%` }} />
        ))}
        {active && <span className="ins-marker" style={{ left: `${x}%` }} />}
        <HoverColumns labels={labels} onHover={setHover} />
      </div>
      <div className="ins-axis"><span>{dayLabel(days[0]!.day)}</span><span>{dayLabel(days[days.length - 1]!.day)}</span></div>
    </ChartCard>
  );
}

function ActivityHeatmap({ runs, days, window }: { runs: InsightRun[]; days: readonly string[]; window: ActivityWindow }) {
  const counts = days.map(day => {
    const hours = new Array<number>(24).fill(0);
    for (const run of runs) if (run.day === day) hours[run.hour] = hours[run.hour]! + 1;
    return hours;
  });
  const grid = { days: [...days], counts, max: Math.max(0, ...counts.flat()) };
  const rangeLabel = days.length === 1 ? `${days[0]} UTC` : `${days[0]}–${days[days.length - 1]} UTC`;
  const selectedWindowLabel = window.kind === 'days' ? `over the last ${window.days} days`
    : window.kind === 'custom' ? `for ${window.start || 'start date'} to ${window.end || 'end date'} UTC`
      : 'for all served UTC dates';
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [activeCell, setActiveCell] = useState(0);
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const helpId = useId();
  const label = (row: number, hour: number) => `${weekday(grid.days[row]!)} ${String(hour).padStart(2, '0')}:00 UTC · ${runsWord(grid.counts[row]![hour]!)}`;
  const inspect = (row: number, hour: number) => {
    setHover([row, hour]);
    setActiveCell(row * 24 + hour);
  };
  const move = (event: KeyboardEvent<HTMLButtonElement>, row: number, hour: number) => {
    let nextRow = row;
    let nextHour = hour;
    switch (event.key) {
      case 'ArrowLeft': nextHour = Math.max(0, hour - 1); break;
      case 'ArrowRight': nextHour = Math.min(23, hour + 1); break;
      case 'ArrowUp': nextRow = Math.max(0, row - 1); break;
      case 'ArrowDown': nextRow = Math.min(grid.days.length - 1, row + 1); break;
      case 'Home': nextHour = 0; if (event.ctrlKey || event.metaKey) nextRow = 0; break;
      case 'End': nextHour = 23; if (event.ctrlKey || event.metaKey) nextRow = grid.days.length - 1; break;
      default: return;
    }
    event.preventDefault();
    cells.current[nextRow * 24 + nextHour]?.focus();
  };
  return (
    <ChartCard title="When runs happen" concept="activity-hourly" note={`${rangeLabel}, by UTC hour`} delay={120}>
      <Readout testId="activity-hour-readout" active={hover !== null} text={hover ? <>{weekday(grid.days[hover[0]]!)} {String(hover[1]).padStart(2, '0')}:00 UTC · <span data-field-tone="count">{count(grid.counts[hover[0]]![hover[1]]!)} runs</span></> : <>Busiest hour: <span data-field-tone="count">{count(grid.max)} runs</span></>} />
      <p id={helpId} className="sr-only">Use arrow keys to inspect hours and days. Home and End move to the first and last hour. Tab leaves the chart.</p>
      <div className="ins-heat" role="group" aria-describedby={helpId} aria-label={`Runs by UTC hour ${selectedWindowLabel} (${rangeLabel}); busiest hour has ${count(grid.max)} runs`}>
        {grid.days.map((day, row) => (
          <div key={day} className="ins-heat-row">
            <span className="ins-heat-day">{weekday(day)}</span>
            {grid.counts[row]!.map((runsInHour, hour) => (
              <button key={hour} type="button" className="ins-heat-cell" title={label(row, hour)} aria-label={label(row, hour)}
                ref={node => { cells.current[row * 24 + hour] = node; }} tabIndex={activeCell === row * 24 + hour ? 0 : -1}
                // A real pointer move, not mouseenter: a page that scrolls under a resting pointer fires a boundary
                // mouseenter with no move, which would replace the value just tapped or chosen by keyboard.
                onMouseMove={() => setHover(current => current?.[0] === row && current[1] === hour ? current : [row, hour])}
                onFocus={() => inspect(row, hour)} onClick={() => inspect(row, hour)}
                onKeyDown={event => move(event, row, hour)}
                style={{ background: runsInHour ? `color-mix(in oklch, var(--ins-series-2) ${Math.round(15 + 85 * (runsInHour / Math.max(1, grid.max)))}%, transparent)` : undefined }} />
            ))}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function TaskMix({ runs }: { runs: InsightRun[] }) {
  const groups = countBy(runs, 'task');
  const max = Math.max(1, ...groups.map(group => group.runs));
  return (
    <ChartCard title="Tasks" concept="task" note="Runs and pass rate" delay={180}>
      <ul className="ins-list" aria-label="Tasks">
        {groups.map((group, index) => {
          const look = taskLook(group.key);
          const judged = group.passed + group.failed;
          return (
            <li key={group.key} className="ins-list-row" style={{ '--ins-swatch': look.color } as CSSProperties}>
              <span className="ins-chip-icon" aria-hidden="true">{look.icon}</span>
              <span className="ins-list-name">{group.key === NOT_RECORDED ? NOT_RECORDED : readable(group.key)}</span>
              <span className="ins-track"><span className="ins-fill od-growx" style={{ width: `${(group.runs / max) * 100}%`, animationDelay: `${index * 60}ms` }} /></span>
              <span className="ins-list-value"><span data-field-tone="count">{count(group.runs)}</span> · <span data-field-tone="pass" data-field-unavailable={!judged}>{judged ? `${Math.round((group.passed / judged) * 100)}%` : 'no verdicts'}</span> · <span className="ins-list-coverage" data-field-tone="basis">{verdictCoverage(judged, group.runs)}</span></span>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

function DurationHistogram({ runs }: { runs: InsightRun[] }) {
  const edges = durationEdges();
  const { buckets, unrecorded } = durationBuckets(runs, edges);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets);
  const name = (index: number) => durationBucketLabel(index);
  const median = summary(runs).medianLatency;
  return (
    <ChartCard title="How long runs take" concept="duration" note={`${count(unrecorded)} not recorded`} delay={240}>
      <Readout active={hover !== null} text={hover === null ? (median === null ? 'No durations recorded' : <>Median <span data-field-tone="duration">{duration(median)}</span></>) : <><span data-field-tone="duration">{name(hover)}</span> · <span data-field-tone="count">{count(buckets[hover]!)} runs</span></>} />
      <div className="ins-bars ins-bars--short" role="group" aria-label="Duration buckets" onMouseLeave={() => setHover(null)}>
        {buckets.map((runsInBucket, index) => (
          <button key={index} type="button" className="ins-bar" aria-label={`${name(index)}: ${runsWord(runsInBucket)}`}
            data-dim={hover !== null && hover !== index} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}>
            {/* Part 18 AC122: one hatched series in the duration colour, as every bar (part 16 AC97). */}
            {runsInBucket > 0 && <span className="ins-seg gdb-bar od-grow" style={{ height: `${(runsInBucket / max) * 100}%`, color: 'var(--field-duration)', animationDelay: `${index * 50}ms` }} />}
          </button>
        ))}
      </div>
      <div className="ins-axis"><span>{duration(edges[0]!)}</span><span>{duration(edges[edges.length - 2]!)}+</span></div>
    </ChartCard>
  );
}

function ModelScoreboard({ runs }: { runs: InsightRun[] }) {
  // OMN-21166 AC64: the pass rate per model as ranked bars; a model with no verdicts is drawn as not measured.
  const groups = countBy(runs, 'model');
  return (
    <ChartCard title="Model scoreboard" concept="quality-model" delay={300}>
      <RankedBars label="Pass rate by model" unit="Pass rate of runs with a verdict · higher is better" order="desc" layout="vertical"
        items={groups.map(group => {
          const judged = group.passed + group.failed;
          const rate = judged ? (group.passed / judged) * 100 : null;
          return { key: group.key, name: group.key, value: rate, basis: 'measured' as const, color: modelColor(group.key),
            display: rate === null ? 'No verdicts' : `${Math.round(rate)}%`, title: `${count(group.runs)} runs · ${verdictCoverage(judged, group.runs)}` };
        })}
        // Each model's verdict coverage in plain text under the bars, so keyboard and touch readers have it too.
        footnote={groups.map(group => `${group.key}: ${verdictCoverage(group.passed + group.failed, group.runs)}`).join(' · ')} />
    </ChartCard>
  );
}

/** A cause's first or last seen, as UTC minutes ("2026-10-18 08:20 UTC"), with the exact served time kept. */
function SeenAt({ label, at }: { label: string; at: number }) {
  const iso = new Date(at).toISOString();
  return <>{label} <time dateTime={iso} title={iso}>{`${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`}</time></>;
}

/**
 * OV-7 (OMN-19919 AC7): failed runs per cause, each with its count, first and last seen, and a link to Runs filtered
 * to status=failed and that cause. The cause is failureCauseOf's, the same one the filter and the Runs list key on.
 */
function FailureCauses({ runs, onInspectFailure, limit }: { runs: InsightRun[]; onInspectFailure?: (cause: string) => void; limit?: number }) {
  // OMN-21166 AC65: Overview shows the top causes only, ranked as Runs ranks them, with a link to the full list there.
  const all = causes(runs);
  const list = limit === undefined ? all : all.slice(0, limit);
  // On the Overview a cause filters the latest runs below (OMN-21166 approved mockup); alone it is a plain list.
  const shared = useSharedRunFilter();
  const max = Math.max(1, ...list.map(entry => entry.count));
  return (
    <ChartCard title="Why runs failed" concept="failures" delay={360}>
      {list.length === 0 ? <p className="ins-empty">No failed runs in this window</p> : (
        <ul className="ins-list" aria-label="Failure causes">
          {list.map((entry, index) => (
            <li key={entry.cause} className="ins-list-row ins-list-row--plain" style={{ '--ins-swatch': [FAIL, 'var(--ins-series-7)', 'var(--ins-series-5)', 'var(--ins-series-4)', 'var(--ins-series-3)'][index % 5] } as CSSProperties}>
              {shared || onInspectFailure ? (
                <button type="button" className="ins-list-name ins-cause-button" data-failure-cause={entry.cause} aria-label={`Show runs failed by ${failureCauseLabel(entry.cause)}`}
                  aria-pressed={!onInspectFailure && shared?.filter.cause === entry.cause}
                  onClick={() => onInspectFailure ? onInspectFailure(entry.cause) : shared?.setFilter(shared.filter.cause === entry.cause ? { cause: null } : { result: 'failed', cause: entry.cause })}>
                  {failureCauseLabel(entry.cause)}
                </button>
              ) : <span className="ins-list-name" data-failure-cause={entry.cause}>{failureCauseLabel(entry.cause)}</span>}
              <span className="ins-track"><span className="ins-fill od-growx" style={{ width: `${(entry.count / max) * 100}%`, animationDelay: `${index * 60}ms` }} /></span>
              <span className="ins-list-value" data-field-tone="fail">{count(entry.count)}</span>
              <span className="ins-list-seen">
                <span><SeenAt label="First seen" at={entry.firstSeen} /> · <SeenAt label="Last seen" at={entry.lastSeen} /></span>
                <Link href={causeHref(entry.cause)} aria-label={`View runs failed by ${failureCauseLabel(entry.cause)}`}>View runs</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      {limit !== undefined && all.length > limit && <p className="local-dashboard-caption"><Link href="/runs?status=failed">{`All ${count(all.length)} causes on Runs`}</Link></p>}
    </ChartCard>
  );
}

/** A group of charts. Part 18 AC124: no visible group label (each chart names itself); the group keeps its name for assistive tech. */
function ChartSection({ title, children }: { title: string; concept?: string; children: ReactNode }) {
  return <section className="overview-chart-section" aria-label={title}><div className="overview-chart-row">{children}</div></section>;
}

function TokensPerDay({ days }: { days: InsightDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // The scale comes from the days that recorded tokens; a day without a count draws no bar.
  const max = Math.max(1, ...days.flatMap(day => [day.tokensIn, day.tokensOut]).filter((value): value is number => value !== null));
  const side = (value: number | null, missing: number, direction: 'in' | 'out') => `${value === null ? 'not recorded' : formatFullCount(value)} ${direction}${value !== null && missing > 0 ? ` (partial: ${count(missing)} ${missing === 1 ? 'run' : 'runs'} not recorded)` : ''}`;
  const label = (day: InsightDay) => `${dayLabel(day.day)}: ${side(day.tokensIn, day.tokensInUnmeasured, 'in')}, ${side(day.tokensOut, day.tokensOutUnmeasured, 'out')}`;
  const active = hover === null ? null : days[hover]!;
  const [location] = useLocation();
  const ticks = dayTicks(days, location === '/runs' ? 14 : 8);
  return (
    <ChartCard title="Tokens per day" concept="tokens-daily" delay={420}>
      <Readout active={active !== null} text={active ? <>{dayLabel(active.day)} · <span data-field-tone="tokens-in" data-field-unavailable={active.tokensIn === null}>{side(active.tokensIn, active.tokensInUnmeasured, 'in')}</span>, <span data-field-tone="tokens-out" data-field-unavailable={active.tokensOut === null}>{side(active.tokensOut, active.tokensOutUnmeasured, 'out')}</span></> : ''} />
      <div className="ins-bars gdb-plot" role="group" aria-label="Tokens per day" onMouseLeave={() => setHover(null)}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null); }}>
        {days.map((day, index) => (
          <button key={day.day} type="button" className="ins-bar gdb-day" aria-label={label(day)}
            data-dim={hover !== null && hover !== index} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}>
            <DayBars max={max} values={[
              { key: 'in', value: day.tokensIn, color: 'var(--field-tokens-in)', label: shortCount(day.tokensIn) },
              { key: 'out', value: day.tokensOut, color: 'var(--field-tokens-out)', label: shortCount(day.tokensOut) },
            ]} />
            <span className="gdb-day-label" aria-hidden="true">{ticks.has(index) ? dayLabel(day.day) : ''}</span>
          </button>
        ))}
      </div>
      <ul className="ins-token-legend gdb-legend" aria-label="Token series">
        <li data-field-tone="tokens-in"><i aria-hidden="true" style={{ background: 'var(--field-tokens-in)' }} /><span>Tokens in</span></li>
        <li data-field-tone="tokens-out"><i aria-hidden="true" style={{ background: 'var(--field-tokens-out)' }} /><span>Tokens out</span></li>
      </ul>
    </ChartCard>
  );
}

/** The Activity trends window, shared by its summary and the pass-rate sparkline. */

export type ActivityWindow = { kind: 'all' } | { kind: 'days'; days: number } | { kind: 'custom'; start: string; end: string };
export interface InsightsWindowValue { window: ActivityWindow; setWindow: (window: ActivityWindow) => void }
export const InsightsWindowContext = createContext<'all' | 'today' | InsightsWindowValue | null>(null);

/** The Overview's served decision rows, for the Quality hero's pass-rate line (OMN-21166 approved mockup). */
export const OverviewRunsContext = createContext<{ decisions: readonly unknown[]; now: number } | null>(null);

/**
 * The Quality hero's "Pass rate per day": the same chart the trends drew, moved into the hero as the mockup has it.
 * It follows the selected Activity trends window; with no page rows it draws nothing, so the Quality panel alone is unchanged.
 */
/**
 * The latest-runs pass rate: its headline line and delta, and its daily line. OMN-21166 part 13 lets Overview show the
 * headline in view and the daily line inside its closed "More quality detail" (`part`); both read the same runs.
 */
export function PassRateSparkline({ part = 'all' }: { part?: 'all' | 'headline' | 'trend' } = {}) {
  const context = useContext(OverviewRunsContext);
  const pageWindow = useContext(InsightsWindowContext);
  const [ownWindow] = useState<ActivityWindow>({ kind: 'all' });
  if (context === null) return null;
  const runs = toInsightRuns(context.decisions);
  if (runs.length === 0) return null;
  const window = windowFromContext(pageWindow, ownWindow);
  if (window.kind === 'custom' && (window.start === '' || window.end === '' || window.end < window.start)) return null;
  const currentRuns = selectedRuns(runs, context.now, window);
  const comparisonDays = window.kind === 'days' ? window.days : MAX_ALL_TIME_DAYS;
  const comparison = window.kind === 'days' ? compareWindow(context.decisions, context.now, window.days) : null;
  const current = summary(currentRuns);
  const rate = current.passRate === null ? 'Not recorded' : `${current.passRate.toFixed(1)}%`;
  const deltaText = comparison === null ? null
    : comparison.passRateDeltaPoints === null
      ? comparison.previousComplete
        ? `Previous ${comparisonDays === 1 ? 'day' : `${comparisonDays} days`} has no recorded verdicts to compare`
        : `Previous ${comparisonDays === 1 ? 'day' : `${comparisonDays} days`} not fully returned`
      : `${comparison.passRateDeltaPoints > 0 ? '▲' : comparison.passRateDeltaPoints < 0 ? '▼' : '—'} ${Math.abs(comparison.passRateDeltaPoints).toFixed(1)} percentage points vs previous ${comparisonDays === 1 ? 'day' : `${comparisonDays} days`} (${verdictCoverage(comparison.previousVerdicts, comparison.previousRuns)})`;
  // OMN-21166 part 11: this rate is over the latest returned runs, not every check the meter above counts, so its
  // label names that population beside the figure.
  const trend = <PassRateTrend days={seriesForDays(currentRuns, plottedDays(runs, context.now, window))} />;
  if (part === 'trend') return trend;
  return <section className="ins-pass-headline" aria-label="Pass rate trend">
    <p className="local-dashboard-caption ins-pass-line"><span>Pass rate · latest returned runs</span> <strong data-field-unavailable={current.passRate === null}>{rate}</strong> <span className="ins-pass-coverage" data-field-tone="basis">{verdictCoverage(current.passed + current.failed, current.runs)}</span></p>
    {deltaText !== null && <p className="local-dashboard-caption ins-pass-delta" data-field-unavailable={comparison?.passRateDeltaPoints === null}>{deltaText}</p>}
    {part === 'all' && trend}
  </section>;
}
const MAX_ALL_TIME_DAYS = 30;

function windowFromContext(value: 'all' | 'today' | InsightsWindowValue | null, fallback: ActivityWindow): ActivityWindow {
  if (value === 'all') return { kind: 'all' };
  if (value === 'today') return { kind: 'days', days: 1 };
  return value?.window ?? fallback;
}

function customRangeDays(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];
  const count = Math.floor((last - first) / 86_400_000) + 1;
  const plottedStart = first + Math.max(0, count - MAX_ALL_TIME_DAYS) * 86_400_000;
  return Array.from({ length: Math.min(count, MAX_ALL_TIME_DAYS) }, (_, index) => new Date(plottedStart + index * 86_400_000).toISOString().slice(0, 10));
}

function selectedRuns(runs: readonly InsightRun[], now: number, window: ActivityWindow): InsightRun[] {
  if (window.kind === 'all') return [...runs];
  if (window.kind === 'days') return windowRuns(runs, now, window.days);
  if (window.start === '' || window.end === '' || window.end < window.start) return [];
  return runs.filter(run => run.day >= window.start && run.day <= window.end);
}

function plottedDays(runs: readonly InsightRun[], now: number, window: ActivityWindow): string[] {
  if (window.kind === 'days') return windowDays(now, window.days);
  if (window.kind === 'custom') return customRangeDays(window.start, window.end);
  return windowDays(now, allTimeDays(runs, now));
}

function seriesForDays(runs: readonly InsightRun[], days: readonly string[]) {
  return days.map(day => ({ day, ...summary(runs.filter(run => run.day === day)) }));
}

function windowCaption(window: ActivityWindow): string {
  if (window.kind === 'all') return 'All served dates';
  if (window.kind === 'days') return window.days === 1 ? '1 UTC day' : `last ${window.days} UTC days`;
  if (window.start === '' || window.end === '') return 'Custom UTC date range';
  if (window.end < window.start) return 'Invalid UTC date range';
  return `${window.start} through ${window.end} UTC`;
}

function ChartHeading({ title, concept, detail }: { title: string; concept: string; detail: string }) {
  return <div className="ins-card-head"><h3 className="ins-title"><ConceptIcon concept={concept} label={title} size={16} />{title}</h3><span className="ins-note">{detail}</span></div>;
}

function usd(value: number | null): string {
  return value === null ? 'Not served' : formatDashboardUsd(value);
}

function delta(value: number | null, format: (value: number) => string): string {
  if (value === null) return 'Previous window unavailable';
  return `${value > 0 ? '+' : ''}${format(value)} vs previous window`;
}

function RunWindowKpis({ runs, decisions, label, comparisonEnabled, now, days }: {
  runs: InsightRun[]; decisions: readonly unknown[]; label: string; comparisonEnabled: boolean; now: number; days: number;
}) {
  const comparison = comparisonEnabled ? compareWindow(decisions, now, days) : null;
  const selectedLabel = label;
  const durationMissing = runs.filter(run => run.latencyMs === null).length;
  const summaryNow = summary(runs);
  const runDelta = !comparisonEnabled ? null
    : comparison?.previousComplete && comparison.runsDelta !== null
      ? delta(comparison.runsDelta, value => `${value} runs`) : 'Previous window not fully returned';
  const medianDelta = !comparisonEnabled ? null
    : comparison?.previousComplete && comparison.medianLatencyDelta !== null
      ? delta(comparison.medianLatencyDelta, value => `${(value / 1000).toFixed(2)} s`) : 'Previous window not fully returned';
  const median = summaryNow.medianLatency === null ? 'Not recorded' : duration(summaryNow.medianLatency);
  return (
    <section className="ins-window-kpis ins-window-kpis--runs" aria-label={`Runs in ${selectedLabel}`}>
      <div className="ins-kpi local-dashboard-metric" data-field-tone="count"><span>Runs</span><strong>{count(summaryNow.runs)}</strong><small>{selectedLabel} · counted from the returned decision rows</small>{runDelta !== null && <small>{runDelta}</small>}</div>
      <div className="ins-kpi local-dashboard-metric" data-field-tone="duration"><span>Median duration</span><strong data-field-unavailable={summaryNow.medianLatency === null}>{median}</strong><small>{count(durationMissing)} duration values not recorded</small>{medianDelta !== null && <small>{medianDelta}</small>}</div>
    </section>
  );
}

function MeteringWindowKpis({ current, previous, days, label, comparisonEnabled, unavailable }: {
  current: MeteringWindow; previous: MeteringWindow | null; days: number; label: string; comparisonEnabled: boolean; unavailable: string | null;
}) {
  // A window total is non-null only when every selected day has a served row (completeTotal in insight-aggregates, pinned
  // by a test), so a total alone shows the window is complete; windowComplete is read below only to word the note.
  const paidReady = unavailable === null && current.available && current.spend !== null;
  const savedReady = unavailable === null && current.available && current.saved !== null;
  const servedDayCount = current.days.filter(day => day.served).length;
  const savedPct = current.saved !== null && current.counterfactual !== null && current.counterfactual > 0
    ? `${(current.saved / current.counterfactual * 100).toFixed(1)}% below ${current.baseline ?? 'the served baseline'}` : 'Baseline comparison not recorded';
  const paidNote = unavailable ?? current.reason ?? (!current.windowComplete
    ? `${servedDayCount} of ${days} daily rows served; the selected window is incomplete.`
    : current.spend === null ? 'One or more daily spend values are not recorded; paid total unavailable.'
      : `${servedDayCount} served day rows.`);
  const savedNote = unavailable ?? current.reason ?? (!current.windowComplete
    ? `${servedDayCount} of ${days} daily rows served; the selected window is incomplete.`
    : current.saved === null ? 'One or more daily savings values are not recorded; saved total unavailable.'
      : `${servedDayCount} served day rows · ${savedPct}`);
  const previousComplete = comparisonEnabled && unavailable === null && current.available && current.windowComplete
    && previous !== null && previous.available && previous.windowComplete;
  const paidDelta = !comparisonEnabled ? null
    : previousComplete && current.spend !== null && previous.spend !== null
      ? delta(current.spend - previous.spend, value => usd(value)) : 'Previous window not fully returned';
  const savedDelta = !comparisonEnabled ? null
    : previousComplete && current.saved !== null && previous.saved !== null
      ? delta(current.saved - previous.saved, value => usd(value)) : 'Previous window not fully returned';
  return <section className="ins-window-kpis ins-window-kpis--metering" aria-label={`Metered spend summary for ${label}`}>
    <div className="ins-kpi local-dashboard-metric" data-field-tone="cost"><span>You paid</span><strong data-field-unavailable={!paidReady}>{paidReady ? usd(current.spend) : 'Unavailable'}</strong><small>{paidNote}</small>{paidDelta !== null && <small>{paidDelta}</small>}</div>
    <div className="ins-kpi local-dashboard-metric" data-field-tone="savings"><span>Saved</span><strong data-field-unavailable={!savedReady}>{savedReady ? usd(current.saved) : 'Unavailable'}</strong><small>{savedNote}</small>{savedDelta !== null && <small>{savedDelta}</small>}</div>
  </section>;
}

/**
 * AC42 All window: the served all-time row's spend, as served; no day row is summed into it. No Saved figure here:
 * the Overview keeps one savings number, its headline card (Lakshman 2026-10-21 ~19:40Z, AC37).
 */
function MeteringAllTimeKpis({ rows, label, unavailable }: { rows: readonly unknown[]; label: string; unavailable: string | null }) {
  const total = meteringAllTimeTotals(rows);
  const reason = unavailable ?? total.reason;
  const paidReady = reason === null && total.spend !== null;
  const paidNote = reason ?? (total.spend === null ? 'The all-time spend total is not recorded.' : 'All-time total, as served.');
  return <section className="ins-window-kpis ins-window-kpis--metering" aria-label={`Metered spend summary for ${label}`}>
    <div className="ins-kpi local-dashboard-metric" data-field-tone="cost"><span>You paid</span><strong data-field-unavailable={!paidReady}>{paidReady ? usd(total.spend) : 'Unavailable'}</strong><small>{paidNote}</small></div>
  </section>;
}

function MoneyWindowCharts({ rows, now, days, unavailable }: { rows: readonly unknown[]; now: number; days: number; unavailable: string | null }) {
  const data = aggregateMeteringWindow(rows, now, days);
  const [activeSpend, setActiveSpend] = useState<number | null>(null);
  const [activeCumulative, setActiveCumulative] = useState<number | null>(null);
  if (unavailable !== null || !data.available) {
    return <div className="ins-money-unavailable" role="status">{unavailable ?? data.reason ?? 'Daily metering data is unavailable.'}</div>;
  }
  const servedMoneyValues = data.days.flatMap(day => [day.spend, day.saved, day.counterfactual])
    .filter((value): value is number => value !== null);
  const max = Math.max(0.01, ...servedMoneyValues);
  const cumulativeValues = data.cumulativeSaved.filter((value): value is number => value !== null);
  const cumulativeMax = Math.max(0.01, ...cumulativeValues);
  const selected = activeSpend === null ? null : data.days[activeSpend]!;
  const dateLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const detail = (day: typeof data.days[number]) => `${dateLabel(day.day)} · Paid ${usd(day.spend)} · Saved ${usd(day.saved)} · All-cloud ${usd(day.counterfactual)}`;
  return (
    <ChartSection concept="spend-daily" title="Daily paid vs all-cloud">
      <figure className="local-chart ins-money-chart" aria-label="Spend vs all-cloud">
        <ChartHeading concept="spend-daily" title="Spend vs all-cloud" detail={`${days === 1 ? 'Today (UTC)' : `Last ${days} UTC days`} · ${data.baseline ?? 'baseline not recorded'}`} />
        {selected && <p className="ins-readout" role="status">{detail(selected)}</p>}
        <div className="ins-money-bars" role="group" aria-label="Spend vs all-cloud by UTC day" onMouseLeave={() => setActiveSpend(null)}>
          {data.days.map((day, index) => <button key={day.day} type="button" className="ins-money-day" aria-label={detail(day)} onMouseEnter={() => setActiveSpend(index)} onFocus={() => setActiveSpend(index)}>
            <span className="ins-money-day-bars">
              {day.spend !== null && <span className="ins-money-paid" style={{ height: `${day.spend / max * 100}%` }} />}
              {day.saved !== null && <span className="ins-money-saved" style={{ height: `${day.saved / max * 100}%` }} />}
              {day.counterfactual !== null && <span className="ins-money-baseline" style={{ bottom: `${day.counterfactual / max * 100}%` }} />}
            </span>
            <span>{dateLabel(day.day)}</span>
            <span className="ins-money-values">{day.spend === null ? 'Paid not recorded' : usd(day.spend)} · {day.saved === null ? 'saved not recorded' : `${usd(day.saved)} saved`}</span>
          </button>)}
        </div>
        <div className="ins-money-legend"><span data-tone="paid">Paid</span><span data-tone="saved">Saved</span><span data-tone="baseline">All-cloud baseline</span></div>
        <figcaption>Saved uses the served daily savings value. {data.windowComplete ? 'Returned rows cover the selected window.' : 'The returned rows do not cover the full selected window.'}{data.days.some(day => day.served && day.saved === null) ? ' At least one served day has no recorded savings value.' : ''}</figcaption>
      </figure>
      <figure className="local-chart ins-cumulative-chart" aria-label="Cumulative savings">
        <ChartHeading concept="savings" title="Cumulative savings" detail={`${days === 1 ? 'Today (UTC)' : `Last ${days} UTC days`} · ${data.baseline ?? 'baseline not recorded'}`} />
        <p className="ins-readout" role="status">{activeCumulative === null ? `${data.windowComplete && data.saved !== null ? 'Window total' : 'Served rows only · cumulative incomplete'}: ${usd(data.cumulativeSaved[data.cumulativeSaved.length - 1] ?? null)}` : `${dateLabel(data.days[activeCumulative]!.day)} · cumulative ${usd(data.cumulativeSaved[activeCumulative] ?? null)}${!data.days[activeCumulative]!.served ? ' · no served day row; total carried forward' : data.days[activeCumulative]!.saved === null ? ' · savings value not recorded; cumulative unavailable' : ''}`}</p>
        <div className="ins-bars ins-bars--short" role="group" aria-label="Cumulative savings by UTC day" onMouseLeave={() => setActiveCumulative(null)}>
          {data.cumulativeSaved.map((value, index) => <button key={data.days[index]!.day} type="button" className="ins-bar" aria-label={`${dateLabel(data.days[index]!.day)}: cumulative ${usd(value)}${!data.days[index]!.served ? ', no served day row; prior total carried forward' : data.days[index]!.saved === null ? ', savings value not recorded' : ''}`} onMouseEnter={() => setActiveCumulative(index)} onFocus={() => setActiveCumulative(index)}>
            <span className="ins-seg od-grow" style={{ height: `${value === null ? 0 : value / cumulativeMax * 100}%`, background: 'var(--ins-series-3)' }} />
          </button>)}
        </div>
        <figcaption>Missing rows carry the prior total forward. A served row without a savings value makes the cumulative total unavailable from that day onward.</figcaption>
      </figure>
    </ChartSection>
  );
}

/** Savings figures in this child come only from the separately declared Overview metering binding. */
export function MeteringActivityInsights({ rows, now, unavailable, window, display = 'all' }: {
  rows: readonly unknown[]; now: number; unavailable: string | null; window: ActivityWindow; display?: 'all' | 'kpis' | 'charts';
}) {
  const days = window.kind === 'days' ? window.days : MAX_ALL_TIME_DAYS;
  const label = windowCaption(window);
  // AC42 (Lakshman 2026-10-21 ~19:10Z, ~19:40Z): All shows the served all-time row's spend only; a custom range sums
  // its served day rows.
  // The daily charts stay on the rolling windows.
  const chartUnavailable = window.kind === 'days' ? unavailable
    : 'Daily metering charts are drawn for the 1, 7, 15 and 30 day windows.';
  const kpis = () => {
    if (window.kind === 'all') return <MeteringAllTimeKpis rows={rows} label={label} unavailable={unavailable} />;
    if (window.kind === 'custom') {
      const range = aggregateMeteringRange(rows, window.start, window.end);
      return <MeteringWindowKpis current={range} previous={null} days={range.days.length} label={label} comparisonEnabled={false} unavailable={unavailable} />;
    }
    return <MeteringWindowKpis current={aggregateMeteringWindow(rows, now, days)} previous={aggregateMeteringWindow(rows, now - days * 86_400_000, days)}
      days={days} label={label} comparisonEnabled unavailable={unavailable} />;
  };
  return <div className="ins-metering-activity" aria-label="Metered activity details">
    {display !== 'charts' && kpis()}
    {display !== 'kpis' && <MoneyWindowCharts rows={rows} now={now} days={days} unavailable={chartUnavailable} />}
  </div>;
}

function allTimeDays(runs: readonly InsightRun[], now: number): number {
  if (runs.length === 0) return 7;
  const oldest = Math.min(...runs.map(run => Date.parse(`${run.day}T00:00:00Z`)));
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.min(MAX_ALL_TIME_DAYS, Math.max(7, Math.round((today - oldest) / 86_400_000) + 1));
}

/** OMN-21166 part 21 AC142: mirrors `limit: 500` on onex.snapshot.projection.delegation.decisions.v1 in omnimarket's
 * node_projection_delegation contract; a read that returns this many rows may have left older runs out. */
export const DECISIONS_READ_LIMIT = 500;

/** OMN-21166 part 21 AC142: the line under an Overview chart, only when the chart does not draw every run. */
export function chartLimitLine(servedCount: number, undatedCount: number): string | null {
  const parts: string[] = [];
  if (servedCount >= DECISIONS_READ_LIMIT) parts.push(`Showing the latest ${count(DECISIONS_READ_LIMIT)} runs`);
  if (undatedCount > 0) parts.push(undatedCount === 1 ? '1 run has no date and is not drawn' : `${count(undatedCount)} runs have no date and are not drawn`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function InsightsSection({ decisions, now, view = 'all', onInspectFailure, more }: {
  decisions: readonly unknown[]; now: number; view?: 'all' | 'summary' | 'analysis' | 'runs' | 'tokens' | 'failures'; onInspectFailure?: (cause: string) => void;
  /** OMN-21166 part 13: on the summary view, further detail shown inside the section's closed "More activity". */
  more?: ReactNode;
}) {
  const pageWindow = useContext(InsightsWindowContext);
  const [ownWindow, setOwnWindow] = useState<ActivityWindow>({ kind: 'all' });
  const window = windowFromContext(pageWindow, ownWindow);
  const setWindow = pageWindow !== null && typeof pageWindow === 'object' ? pageWindow.setWindow : setOwnWindow;
  const all = toInsightRuns(decisions);
  const runs = selectedRuns(all, now, window);
  const chartDaysList = plottedDays(all, now, window);
  const chartRuns = all.filter(run => chartDaysList.includes(run.day));
  const chartDays = seriesForDays(chartRuns, chartDaysList);
  // The exposure returns only its latest rows. A calendar axis is not proof
  // that earlier days contain no runs; disclose the actual received span.
  const times = all.map(run => run.at);
  const utcTime = (time: number) => new Date(time).toISOString().slice(0, 19).replace('T', ' ');
  const servedSpan = times.length === 0 ? 'No dated runs served' : `${utcTime(Math.min(...times))}–${utcTime(Math.max(...times))} UTC`;
  const servedCount = decisions.length;
  const undatedCount = servedCount - all.length;
  const customIncomplete = window.kind === 'custom' && (window.start === '' || window.end === '');
  const customReversed = window.kind === 'custom' && window.start !== '' && window.end !== '' && window.end < window.start;
  const population = window.kind === 'all'
    ? undatedCount === 0 ? `Latest ${count(servedCount)} served runs · ${windowCaption(window)}` : `${count(runs.length)} of the latest ${count(servedCount)} served runs · ${windowCaption(window)}`
    : window.kind === 'custom' && (customIncomplete || customReversed || runs.length === 0)
      ? `Latest ${count(servedCount)} served runs · ${windowCaption(window)}`
      : `${count(runs.length)} of the latest ${count(servedCount)} served runs · ${windowCaption(window)}`;
  const undated = undatedCount > 0 ? ` · ${count(undatedCount)} undated ${undatedCount === 1 ? 'row' : 'rows'} excluded` : '';
  const limitLine = chartLimitLine(servedCount, undatedCount);
  const emptyMessage = customIncomplete ? 'Choose both UTC dates for this range'
    : customReversed ? 'End date must be on or after the start date'
      : runs.length === 0 ? window.kind === 'custom' ? 'No runs in this date range'
        : window.kind === 'all' ? 'No runs in served data'
          : window.kind === 'days' && window.days === 1 ? 'No runs today' : `No runs in the last ${window.kind === 'days' ? window.days : MAX_ALL_TIME_DAYS} days`
        : null;
  // OMN-21166 Maple grid: a slice draws one piece in its own panel; the runs panel carries the window and the population.
  if (view === 'runs' || view === 'tokens' || view === 'failures') {
    return (
      <NamedByPanel.Provider value>
      <div className="ins-section ins-section--slice">
        {/* Live review 2026-10-25: the window presets moved to the page header (ChartWindowPresets); the panel keeps its population. */}
        {view === 'runs' && limitLine !== null && <div className="ins-slice-tools">
          <p className="local-dashboard-caption ins-sub" data-testid="insights-total">{limitLine}</p>
        </div>}
        {emptyMessage !== null ? <p className="local-dashboard-empty ins-empty" role="status">{emptyMessage}</p>
          : view === 'runs' ? <><RunsPerDay days={chartDays} />
            {/* Live review 2026-10-25: no "More activity" on Overview; part 15 AC96: no "Explore" links, the sidebar reaches Runs and Usage. */}
            </>
            : view === 'tokens' ? <TokensPerDay days={chartDays} />
              : <FailureCauses runs={runs} limit={5} onInspectFailure={onInspectFailure} />}
      </div>
      </NamedByPanel.Provider>
    );
  }
  return (
    <div className={`ins-section${view === 'summary' ? ' ins-section--summary' : ''}`} aria-label="Insights" role="group">
      {view !== 'analysis' && (
        <div className="local-dashboard-filters ins-range" role="group" aria-label="Activity window">
          <div className="ins-range-presets" role="group" aria-label="Quick ranges">
            <button type="button" data-window="all" aria-pressed={window.kind === 'all'} onClick={() => setWindow({ kind: 'all' })}>All</button>
            {RANGES.map(range => <button key={range.days} type="button" data-window={range.days} aria-pressed={window.kind === 'days' && window.days === range.days} onClick={() => setWindow({ kind: 'days', days: range.days })}>{range.label}</button>)}
          </div>
          <div className="ins-custom-range">
            <label><span>Start date (UTC)</span><input type="date" aria-label="Start date (UTC)" value={window.kind === 'custom' ? window.start : ''} onChange={event => setWindow({ kind: 'custom', start: event.target.value, end: window.kind === 'custom' ? window.end : '' })} /></label>
            <label><span>End date (UTC)</span><input type="date" aria-label="End date (UTC)" value={window.kind === 'custom' ? window.end : ''} onChange={event => setWindow({ kind: 'custom', start: window.kind === 'custom' ? window.start : '', end: event.target.value })} /></label>
          </div>
        </div>
      )}
      <p className="local-dashboard-caption ins-sub" data-testid="insights-total">{population}{undated}{view === 'summary' ? null : <> · Row timestamps: {servedSpan} · Earlier activity is not included{window.kind === 'days' ? '' : ' · Comparisons with the previous window appear for 1, 7, 15 and 30 days'}{window.kind === 'all' || window.kind === 'custom' ? ` · Charts show at most ${MAX_ALL_TIME_DAYS} UTC days; ${count(chartRuns.length)} of ${count(runs.length)} selected runs plotted` : ''}</>}</p>
      {emptyMessage !== null ? <p className="local-dashboard-empty ins-empty" role="status" aria-label="Insights">{emptyMessage}</p> : (
        <div className="overview-chart-sections">
          {view === 'all' && <RunWindowKpis runs={runs} decisions={decisions} now={now} days={window.kind === 'days' ? window.days : MAX_ALL_TIME_DAYS} label={windowCaption(window)} comparisonEnabled={window.kind === 'days'} />}
          {view !== 'analysis' && <ChartSection concept="activity" title="Activity over time"><RunsPerDay days={chartDays} /><TokensPerDay days={chartDays} /></ChartSection>}
          {view === 'summary' && <ChartSection concept="quality-outcomes" title="Why runs failed"><FailureCauses runs={runs} limit={3} /></ChartSection>}
          {view !== 'summary' && <>
          {/* Part 18 AC119, AC121: runs by model and by tier are Overview's Model usage and Tier mix, and the outcome donut
              repeats the Runs headline cards, so none is drawn here. */}
          <ChartSection concept="routing-workload" title="Routing and workload"><TaskMix runs={runs} /></ChartSection>
          <ChartSection concept="quality-outcomes" title="Quality and outcomes"><PassRateTrend days={chartDays} /><FailureCauses runs={runs} onInspectFailure={onInspectFailure} /></ChartSection>
          <ChartSection concept="performance-model" title="Performance by model"><DurationHistogram runs={runs} /><ModelScoreboard runs={runs} /></ChartSection>
          <ChartSection concept="activity-hourly" title="Activity by UTC hour"><ActivityHeatmap runs={runs} days={chartDaysList} window={window} /></ChartSection>
          </>}
        </div>
      )}
      {view === 'summary' && emptyMessage === null && (
        <details className="local-more">
          <summary>More activity</summary>
          <p className="local-dashboard-caption ins-sub">{population}{undated} · Row timestamps: {servedSpan} · Earlier activity is not included{window.kind === 'days' ? '' : ' · Comparisons with the previous window appear for 1, 7, 15 and 30 days'}{window.kind === 'all' || window.kind === 'custom' ? ` · Charts show at most ${MAX_ALL_TIME_DAYS} UTC days; ${count(chartRuns.length)} of ${count(runs.length)} selected runs plotted` : ''}</p>
          <RunWindowKpis runs={runs} decisions={decisions} now={now} days={window.kind === 'days' ? window.days : MAX_ALL_TIME_DAYS} label={windowCaption(window)} comparisonEnabled={window.kind === 'days'} />
          {more}
        </details>
      )}
    </div>
  );
}
