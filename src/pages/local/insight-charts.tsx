import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDownUp, CalendarClock, ChartColumnStacked, CircleHelp, CodeXml, FileText, FlaskConical, GitPullRequest, Globe,
  Hourglass, LayoutGrid, ScrollText, TrendingUp, TriangleAlert, Trophy,
} from 'lucide-react';
import {
  NOT_RECORDED, causes, countBy, dailySeries, durationBuckets, hourGrid, summary, toInsightRuns, windowRuns,
  type InsightDay, type InsightRun,
} from './insights';

/**
 * OMN-21166 AC26 (mockup build; rule change R-B, Lakshman 2026-10-18): the Overview's trends and breakdowns, counted
 * in the browser from the served delegation.decisions.v1 rows by `./insights`. Each chart says its window; a value the
 * runtime did not serve is shown as not recorded, never as a number. Every mark a pointer can read is also a button a
 * keyboard can focus, with the same numbers in its name and in the chart's readout.
 */

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
] as const;

const PASS = '#34D399';
const FAIL = '#F87171';
const UNKNOWN = '#8D95A3';
const PALETTE = ['#818CF8', '#22D3EE', '#F472B6', '#A78BFA', '#FBBF24', '#2DD4BF', '#FB923C', '#60A5FA'];
const DURATION_EDGES = [0, 250, 500, 750, 1000, 1500, 2000, 3000, Infinity];
const DURATION_RAMP = ['#34D399', '#4ADE80', '#A3E635', '#FACC15', '#FBBF24', '#FB923C', '#F87171', '#F43F5E'];

const TASK_LOOK: Record<string, { icon: ReactNode; color: string }> = {
  document: { icon: <FileText size={14} />, color: '#60A5FA' },
  code_generation: { icon: <CodeXml size={14} />, color: '#A78BFA' },
  research: { icon: <Globe size={14} />, color: '#2DD4BF' },
  summarization: { icon: <ScrollText size={14} />, color: '#FBBF24' },
  code_review: { icon: <GitPullRequest size={14} />, color: '#F472B6' },
  review: { icon: <GitPullRequest size={14} />, color: '#F472B6' },
  test: { icon: <FlaskConical size={14} />, color: '#FB923C' },
};
const OTHER_TASK = { icon: <CircleHelp size={14} />, color: UNKNOWN };

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function duration(ms: number): string {
  return ms < 1000 ? `${count(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function weekday(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function readable(key: string): string {
  return key.replace(/_/g, ' ');
}

function dayCounts(day: InsightDay): string {
  const parts = [`${count(day.runs)} runs`, `${count(day.passed)} passed`, `${count(day.failed)} failed`];
  if (day.unrecorded > 0) parts.push(`${count(day.unrecorded)} not recorded`);
  return parts.join(', ');
}

function ChartCard({ title, icon, accent, note, delay, children }: {
  title: string; icon: ReactNode; accent: string; note?: string; delay: number; children: ReactNode;
}) {
  const id = useId();
  return (
    <figure className="local-chart ins-card od-card" aria-labelledby={id} style={{ '--ins-accent': accent, animationDelay: `${delay}ms` } as CSSProperties}>
      <div className="ins-card-head">
        <h3 id={id} className="ins-title"><span className="ins-badge" aria-hidden="true">{icon}</span>{title}</h3>
        {note && <span className="ins-note">{note}</span>}
      </div>
      {children}
    </figure>
  );
}

function Readout({ testId, text, active }: { testId?: string; text: string; active: boolean }) {
  return <p className={`ins-readout${active ? ' ins-readout--active' : ''}`} data-testid={testId} aria-live="polite">{text}</p>;
}

function RunsPerDay({ days }: { days: InsightDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [show, setShow] = useState({ passed: true, failed: true });
  const height = (day: InsightDay) => (show.passed ? day.passed : 0) + (show.failed ? day.failed : 0) + day.unrecorded;
  const max = Math.max(1, ...days.map(height));
  const active = hover === null ? null : days[hover]!;
  const toggle = (key: 'passed' | 'failed') => setShow(current => {
    const other = key === 'passed' ? 'failed' : 'passed';
    return current[key] && !current[other] ? current : { ...current, [key]: !current[key] };
  });
  return (
    <ChartCard title="Runs per day" icon={<ChartColumnStacked size={16} />} accent="#38BDF8" delay={0}>
      <div className="ins-toggles" role="group" aria-label="Series">
        <button type="button" className="ins-toggle" aria-pressed={show.passed} onClick={() => toggle('passed')} style={{ '--ins-swatch': PASS } as CSSProperties}>Passed</button>
        <button type="button" className="ins-toggle" aria-pressed={show.failed} onClick={() => toggle('failed')} style={{ '--ins-swatch': FAIL } as CSSProperties}>Failed</button>
      </div>
      <Readout testId="runs-per-day-readout" active={active !== null}
        text={active ? `${dayLabel(active.day)} · ${dayCounts(active).replace(/, /g, ' · ')}` : 'Hover or tab through the days'} />
      <div className="ins-bars" role="group" aria-label="Runs per day" onMouseLeave={() => setHover(null)}>
        {days.map((day, index) => (
          <button key={day.day} type="button" className="ins-bar" aria-label={`${dayLabel(day.day)}: ${dayCounts(day)}`}
            data-dim={hover !== null && hover !== index} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}>
            <span className="ins-seg od-grow" style={{ height: `${(day.unrecorded / max) * 100}%`, background: UNKNOWN, animationDelay: `${index * 30}ms` }} />
            {show.failed && <span className="ins-seg od-grow" style={{ height: `${(day.failed / max) * 100}%`, background: FAIL, animationDelay: `${index * 30}ms` }} />}
            {show.passed && <span className="ins-seg od-grow" style={{ height: `${(day.passed / max) * 100}%`, background: PASS, animationDelay: `${index * 30}ms` }} />}
          </button>
        ))}
      </div>
      <div className="ins-axis"><span>{dayLabel(days[0]!.day)}</span><span>{dayLabel(days[days.length - 1]!.day)}</span></div>
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
  const labels = days.map(day => `${dayLabel(day.day)}: ${day.passRate === null ? 'no verdicts' : `${day.passRate.toFixed(1)}% passed`}`);
  const active = hover === null ? null : days[hover]!;
  const x = hover === null ? 0 : days.length > 1 ? (hover / (days.length - 1)) * 100 : 50;
  return (
    <ChartCard title="Pass rate per day" icon={<TrendingUp size={16} />} accent={PASS} delay={60}>
      <Readout active={active !== null} text={active ? labels[hover!]!.replace(': ', ' · ') : `Scale from ${min}% to 100%`} />
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

function ActivityHeatmap({ runs, now }: { runs: InsightRun[]; now: number }) {
  const grid = hourGrid(runs, now, 7);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const label = (row: number, hour: number) => `${weekday(grid.days[row]!)} ${String(hour).padStart(2, '0')}:00 UTC · ${count(grid.counts[row]![hour]!)} runs`;
  return (
    <ChartCard title="When runs happen" icon={<CalendarClock size={16} />} accent="#22D3EE" note="Last 7 days, by UTC hour" delay={120}>
      <Readout active={hover !== null} text={hover ? label(hover[0], hover[1]) : `Busiest hour: ${count(grid.max)} runs`} />
      <div className="ins-heat" role="img" aria-label={`Runs by UTC hour over the last 7 days; busiest hour has ${count(grid.max)} runs`} onMouseLeave={() => setHover(null)}>
        {grid.days.map((day, row) => (
          <div key={day} className="ins-heat-row">
            <span className="ins-heat-day">{weekday(day)}</span>
            {grid.counts[row]!.map((runsInHour, hour) => (
              <span key={hour} className="ins-heat-cell" title={label(row, hour)} onMouseEnter={() => setHover([row, hour])}
                style={{ background: runsInHour ? `color-mix(in oklch, #22D3EE ${Math.round(15 + 85 * (runsInHour / Math.max(1, grid.max)))}%, transparent)` : undefined }} />
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
    <ChartCard title="Tasks" icon={<LayoutGrid size={16} />} accent="#A78BFA" note="Runs and pass rate" delay={180}>
      <ul className="ins-list" aria-label="Tasks">
        {groups.map((group, index) => {
          const look = TASK_LOOK[group.key] ?? OTHER_TASK;
          const judged = group.passed + group.failed;
          return (
            <li key={group.key} className="ins-list-row" style={{ '--ins-swatch': look.color } as CSSProperties}>
              <span className="ins-chip-icon" aria-hidden="true">{look.icon}</span>
              <span className="ins-list-name">{group.key === NOT_RECORDED ? NOT_RECORDED : readable(group.key)}</span>
              <span className="ins-track"><span className="ins-fill od-growx" style={{ width: `${(group.runs / max) * 100}%`, animationDelay: `${index * 60}ms` }} /></span>
              <span className="ins-list-value">{count(group.runs)} · {judged ? `${Math.round((group.passed / judged) * 100)}%` : 'no verdicts'}</span>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

function DurationHistogram({ runs }: { runs: InsightRun[] }) {
  const { buckets, unrecorded } = durationBuckets(runs, DURATION_EDGES);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...buckets);
  const name = (index: number) => DURATION_EDGES[index + 1] === Infinity
    ? `${duration(DURATION_EDGES[index]!)} or more` : `${duration(DURATION_EDGES[index]!)} to ${duration(DURATION_EDGES[index + 1]!)}`;
  const median = summary(runs).medianLatency;
  return (
    <ChartCard title="How long runs take" icon={<Hourglass size={16} />} accent="#FBBF24" note={unrecorded ? `${count(unrecorded)} not recorded` : undefined} delay={240}>
      <Readout active={hover !== null} text={hover === null ? (median === null ? 'No durations recorded' : `Median ${duration(median)}`) : `${name(hover)} · ${count(buckets[hover]!)} runs`} />
      <div className="ins-bars ins-bars--short" role="group" aria-label="Duration buckets" onMouseLeave={() => setHover(null)}>
        {buckets.map((runsInBucket, index) => (
          <button key={index} type="button" className="ins-bar" aria-label={`${name(index)}: ${count(runsInBucket)} runs`}
            data-dim={hover !== null && hover !== index} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}>
            <span className="ins-seg od-grow" style={{ height: `${(runsInBucket / max) * 100}%`, background: DURATION_RAMP[index], animationDelay: `${index * 50}ms` }} />
          </button>
        ))}
      </div>
      <div className="ins-axis"><span>{duration(DURATION_EDGES[0]!)}</span><span>{duration(DURATION_EDGES[DURATION_EDGES.length - 2]!)}+</span></div>
    </ChartCard>
  );
}

function ModelScoreboard({ runs }: { runs: InsightRun[] }) {
  const groups = countBy(runs, 'model');
  return (
    <ChartCard title="Model scoreboard" icon={<Trophy size={16} />} accent="#FB923C" note="Pass rate" delay={300}>
      <ul className="ins-rings" aria-label="Pass rate by model">
        {groups.map((group, index) => {
          const judged = group.passed + group.failed;
          const rate = judged ? (group.passed / judged) * 100 : null;
          const color = PALETTE[index % PALETTE.length]!;
          return (
            <li key={group.key} className="ins-ring" style={{ '--ins-swatch': color } as CSSProperties}>
              <svg viewBox="0 0 42 42" width={60} height={60} aria-hidden="true">
                <circle cx="21" cy="21" r="15.915" fill="none" className="ins-ring-track" strokeWidth={4.5} />
                {rate !== null && <circle className="od-ring" cx="21" cy="21" r="15.915" fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round" strokeDasharray={`${rate.toFixed(2)} ${(100 - rate).toFixed(2)}`} transform="rotate(-90 21 21)" />}
              </svg>
              <span className="ins-ring-text">
                <span className="ins-ring-name">{group.key}</span>
                <span className="ins-ring-rate">{rate === null ? 'No verdicts' : `${Math.round(rate)}% passed`}</span>
                <span className="ins-ring-runs">{count(group.runs)} runs</span>
              </span>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

function FailureCauses({ runs }: { runs: InsightRun[] }) {
  const list = causes(runs);
  const max = Math.max(1, ...list.map(entry => entry.count));
  return (
    <ChartCard title="Why runs failed" icon={<TriangleAlert size={16} />} accent={FAIL} delay={360}>
      {list.length === 0 ? <p className="ins-empty">No failed runs in this window</p> : (
        <ul className="ins-list" aria-label="Failure causes">
          {list.map((entry, index) => (
            <li key={entry.cause} className="ins-list-row ins-list-row--plain" style={{ '--ins-swatch': [FAIL, '#FB923C', '#FBBF24', '#C084FC', '#F472B6'][index % 5] } as CSSProperties}>
              <span className="ins-list-name">{entry.cause}</span>
              <span className="ins-track"><span className="ins-fill od-growx" style={{ width: `${(entry.count / max) * 100}%`, animationDelay: `${index * 60}ms` }} /></span>
              <span className="ins-list-value">{count(entry.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

function TokensPerDay({ days }: { days: InsightDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = (day: InsightDay) => (day.tokensIn === null ? 0 : day.tokensIn) + (day.tokensOut === null ? 0 : day.tokensOut);
  const max = Math.max(1, ...days.map(total));
  const side = (value: number | null) => (value === null ? 'not recorded' : count(value));
  const label = (day: InsightDay) => `${dayLabel(day.day)}: ${side(day.tokensIn)} in, ${side(day.tokensOut)} out`;
  const active = hover === null ? null : days[hover]!;
  return (
    <ChartCard title="Tokens per day" icon={<ArrowDownUp size={16} />} accent="#FACC15" delay={420}>
      <Readout active={active !== null} text={active ? label(active).replace(': ', ' · ') : 'Tokens in and out, per UTC day'} />
      <div className="ins-bars" role="group" aria-label="Tokens per day" onMouseLeave={() => setHover(null)}>
        {days.map((day, index) => (
          <button key={day.day} type="button" className="ins-bar" aria-label={label(day)}
            data-dim={hover !== null && hover !== index} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}>
            {day.tokensOut !== null && <span className="ins-seg od-grow" style={{ height: `${(day.tokensOut / max) * 100}%`, background: '#FACC15', animationDelay: `${index * 30}ms` }} />}
            {day.tokensIn !== null && <span className="ins-seg od-grow" style={{ height: `${(day.tokensIn / max) * 100}%`, background: '#22D3EE', animationDelay: `${index * 30}ms` }} />}
          </button>
        ))}
      </div>
      <div className="ins-axis"><span>{dayLabel(days[0]!.day)}</span><span>{dayLabel(days[days.length - 1]!.day)}</span></div>
    </ChartCard>
  );
}

export function InsightsSection({ decisions, now }: { decisions: readonly unknown[]; now: number }) {
  const [days, setDays] = useState<number>(7);
  const all = toInsightRuns(decisions);
  const runs = windowRuns(all, now, days);
  const chartDays = dailySeries(all, now, days === 1 ? 7 : days);
  const windowText = days === 1 ? 'today' : `in the last ${days} days`;
  return (
    <div className="ins-section" aria-label="Insights" role="group">
      <div className="local-dashboard-filters ins-range" role="group" aria-label="Range">
        {RANGES.map(range => (
          <button key={range.days} type="button" aria-pressed={days === range.days} onClick={() => setDays(range.days)}>{range.label}</button>
        ))}
      </div>
      <p className="local-dashboard-caption ins-sub" data-testid="insights-total">{count(runs.length)} runs {windowText} · counted from the served runs</p>
      {runs.length === 0 ? <p className="local-dashboard-empty ins-empty" role="status" aria-label="Insights">{days === 1 ? 'No runs today' : `No runs in the last ${days} days`}</p> : (
        <div className="ins-grid">
          <RunsPerDay days={chartDays} />
          <PassRateTrend days={chartDays} />
          <ActivityHeatmap runs={all} now={now} />
          <TaskMix runs={runs} />
          <DurationHistogram runs={runs} />
          <ModelScoreboard runs={runs} />
          <FailureCauses runs={runs} />
          <TokensPerDay days={chartDays} />
        </div>
      )}
    </div>
  );
}
