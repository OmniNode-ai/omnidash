import { createContext, useContext, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowDownUp, ArrowUp, CalendarClock, ChartColumnStacked, CircleHelp, CodeXml, FileText, FlaskConical, GitPullRequest, Globe,
  Hourglass, LayoutGrid, ScrollText, TrendingUp, TriangleAlert, Trophy, ChartBarBig, ChartPie, Network,
} from 'lucide-react';
import { useSharedRunFilter } from './run-filter';
import { Link } from 'wouter';
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

const PASS = 'var(--ins-pass)';
const FAIL = 'var(--ins-fail)';
const UNKNOWN = 'var(--ins-unknown)';
const PALETTE = ['var(--ins-series-1)', 'var(--ins-series-2)', 'var(--ins-series-3)', 'var(--ins-series-4)', 'var(--ins-series-5)', 'var(--ins-series-6)', 'var(--ins-series-7)', 'var(--ins-series-8)'];
const DURATION_EDGES = [0, 250, 500, 750, 1000, 1500, 2000, 3000, Infinity];
const DURATION_RAMP = ['var(--ins-pass)', 'var(--ins-ramp-2)', 'var(--ins-ramp-3)', 'var(--ins-series-5)', 'var(--ins-series-5)', 'var(--ins-series-7)', 'var(--ins-fail)', 'var(--ins-fail-strong)'];

const TASK_LOOK: Record<string, { icon: ReactNode; color: string }> = {
  document: { icon: <FileText size={14} />, color: 'var(--ins-series-8)' },
  code_generation: { icon: <CodeXml size={14} />, color: 'var(--ins-series-4)' },
  research: { icon: <Globe size={14} />, color: 'var(--ins-series-6)' },
  summarization: { icon: <ScrollText size={14} />, color: 'var(--ins-series-5)' },
  code_review: { icon: <GitPullRequest size={14} />, color: 'var(--ins-series-3)' },
  review: { icon: <GitPullRequest size={14} />, color: 'var(--ins-series-3)' },
  test: { icon: <FlaskConical size={14} />, color: 'var(--ins-series-7)' },
};
const OTHER_TASK = { icon: <CircleHelp size={14} />, color: UNKNOWN };

/** A task type's own icon in its own colour (OMN-21166 AC27), for the run tables. Decorative: the name is beside it. */
export function TaskIcon({ task }: { task: string }) {
  const look = TASK_LOOK[task] ?? OTHER_TASK;
  return <span className="local-task-icon" style={{ '--ins-swatch': look.color } as CSSProperties} aria-hidden="true">{look.icon}</span>;
}

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

function Readout({ testId, text, active }: { testId?: string; text: ReactNode; active: boolean }) {
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
    <ChartCard title="Runs per day" icon={<ChartColumnStacked size={16} />} accent="var(--ins-series-2)" delay={0}>
      <div className="ins-toggles" role="group" aria-label="Series">
        <button type="button" className="ins-toggle" data-field-tone="pass" aria-pressed={show.passed} onClick={() => toggle('passed')} style={{ '--ins-swatch': PASS } as CSSProperties}>Passed</button>
        <button type="button" className="ins-toggle" data-field-tone="fail" aria-pressed={show.failed} onClick={() => toggle('failed')} style={{ '--ins-swatch': FAIL } as CSSProperties}>Failed</button>
      </div>
      <Readout testId="runs-per-day-readout" active={active !== null}
        text={active ? <>{dayLabel(active.day)} · <span data-field-tone="count">{count(active.runs)} runs</span> · <span data-field-tone="pass">{count(active.passed)} passed</span> · <span data-field-tone="fail">{count(active.failed)} failed</span>{active.unrecorded > 0 && <> · <span data-field-tone="basis" data-field-unavailable="true">{count(active.unrecorded)} not recorded</span></>}</> : 'Hover or tab through the days'} />
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
      <Readout active={active !== null} text={active ? <>{dayLabel(active.day)} · <span data-field-tone="pass" data-field-unavailable={active.passRate === null}>{active.passRate === null ? 'no verdicts' : `${active.passRate.toFixed(1)}% passed`}</span></> : `Scale from ${min}% to 100%`} />
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
  const [activeCell, setActiveCell] = useState(0);
  const cells = useRef<Array<HTMLButtonElement | null>>([]);
  const helpId = useId();
  const label = (row: number, hour: number) => `${weekday(grid.days[row]!)} ${String(hour).padStart(2, '0')}:00 UTC · ${count(grid.counts[row]![hour]!)} runs`;
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
    <ChartCard title="When runs happen" icon={<CalendarClock size={16} />} accent="var(--ins-series-2)" note="Last 7 days, by UTC hour" delay={120}>
      <Readout testId="activity-hour-readout" active={hover !== null} text={hover ? <>{weekday(grid.days[hover[0]]!)} {String(hover[1]).padStart(2, '0')}:00 UTC · <span data-field-tone="count">{count(grid.counts[hover[0]]![hover[1]]!)} runs</span></> : <>Busiest hour: <span data-field-tone="count">{count(grid.max)} runs</span></>} />
      <p id={helpId} className="sr-only">Use arrow keys to inspect hours and days. Home and End move to the first and last hour. Tab leaves the chart.</p>
      <div className="ins-heat" role="group" aria-describedby={helpId} aria-label={`Runs by UTC hour over the last 7 days; busiest hour has ${count(grid.max)} runs`}>
        {grid.days.map((day, row) => (
          <div key={day} className="ins-heat-row">
            <span className="ins-heat-day">{weekday(day)}</span>
            {grid.counts[row]!.map((runsInHour, hour) => (
              <button key={hour} type="button" className="ins-heat-cell" title={label(row, hour)} aria-label={label(row, hour)}
                ref={node => { cells.current[row * 24 + hour] = node; }} tabIndex={activeCell === row * 24 + hour ? 0 : -1}
                onMouseEnter={() => setHover([row, hour])} onFocus={() => inspect(row, hour)} onClick={() => inspect(row, hour)}
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
    <ChartCard title="Tasks" icon={<LayoutGrid size={16} />} accent="var(--ins-series-4)" note="Runs and pass rate" delay={180}>
      <ul className="ins-list" aria-label="Tasks">
        {groups.map((group, index) => {
          const look = TASK_LOOK[group.key] ?? OTHER_TASK;
          const judged = group.passed + group.failed;
          return (
            <li key={group.key} className="ins-list-row" style={{ '--ins-swatch': look.color } as CSSProperties}>
              <span className="ins-chip-icon" aria-hidden="true">{look.icon}</span>
              <span className="ins-list-name">{group.key === NOT_RECORDED ? NOT_RECORDED : readable(group.key)}</span>
              <span className="ins-track"><span className="ins-fill od-growx" style={{ width: `${(group.runs / max) * 100}%`, animationDelay: `${index * 60}ms` }} /></span>
              <span className="ins-list-value"><span data-field-tone="count">{count(group.runs)}</span> · <span data-field-tone="pass" data-field-unavailable={!judged}>{judged ? `${Math.round((group.passed / judged) * 100)}%` : 'no verdicts'}</span></span>
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
    <ChartCard title="How long runs take" icon={<Hourglass size={16} />} accent="var(--ins-series-5)" note={unrecorded ? `${count(unrecorded)} not recorded` : undefined} delay={240}>
      <Readout active={hover !== null} text={hover === null ? (median === null ? 'No durations recorded' : <>Median <span data-field-tone="duration">{duration(median)}</span></>) : <><span data-field-tone="duration">{name(hover)}</span> · <span data-field-tone="count">{count(buckets[hover]!)} runs</span></>} />
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
    <ChartCard title="Model scoreboard" icon={<Trophy size={16} />} accent="var(--ins-series-7)" note="Pass rate" delay={300}>
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
                <span className="ins-ring-name" data-field-tone="model" data-field-unavailable={group.key === NOT_RECORDED}>{group.key}</span>
                <span className="ins-ring-rate" data-field-tone="pass" data-field-unavailable={rate === null}>{rate === null ? 'No verdicts' : `${Math.round(rate)}% passed`}</span>
                <span className="ins-ring-runs" data-field-tone="count">{count(group.runs)} runs</span>
              </span>
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}

function FailureCauses({ runs, onInspectFailure }: { runs: InsightRun[]; onInspectFailure?: (cause: string) => void }) {
  const list = causes(runs);
  // On the Overview a cause filters the latest runs below (OMN-21166 approved mockup); alone it is a plain list.
  const shared = useSharedRunFilter();
  const max = Math.max(1, ...list.map(entry => entry.count));
  return (
    <ChartCard title="Why runs failed" icon={<TriangleAlert size={16} />} accent={FAIL} delay={360}>
      {list.length === 0 ? <p className="ins-empty">No failed runs in this window</p> : (
        <ul className="ins-list" aria-label="Failure causes">
          {list.map((entry, index) => (
            <li key={entry.cause} className="ins-list-row ins-list-row--plain" style={{ '--ins-swatch': [FAIL, 'var(--ins-series-7)', 'var(--ins-series-5)', 'var(--ins-series-4)', 'var(--ins-series-3)'][index % 5] } as CSSProperties}>
              {(shared || onInspectFailure) && entry.cause !== NOT_RECORDED ? (
                <button type="button" className="ins-list-name ins-cause-button" aria-label={`Show runs failed by ${entry.cause}`}
                  aria-pressed={!onInspectFailure && shared?.filter.cause === entry.cause}
                  onClick={() => onInspectFailure ? onInspectFailure(entry.cause) : shared?.setFilter(shared.filter.cause === entry.cause ? { cause: null } : { result: 'failed', cause: entry.cause })}>
                  {entry.cause}
                </button>
              ) : <span className="ins-list-name">{entry.cause}</span>}
              <span className="ins-track"><span className="ins-fill od-growx" style={{ width: `${(entry.count / max) * 100}%`, animationDelay: `${index * 60}ms` }} /></span>
              <span className="ins-list-value" data-field-tone="fail">{count(entry.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

function VolumeBars({ runs, field }: { runs: InsightRun[]; field: 'model' | 'tier' }) {
  const groups = countBy(runs, field);
  const [selected, setSelected] = useState<string | null>(null);
  const maximum = Math.max(1, ...groups.map(group => group.runs));
  const active = groups.find(group => group.key === selected);
  return <ChartCard title={field === 'model' ? 'Runs by model' : 'Runs by tier'} icon={field === 'model' ? <ChartBarBig size={16} /> : <Network size={16} />}
    accent={field === 'model' ? 'var(--ins-series-1)' : 'var(--ins-series-6)'} note="Counted from returned runs" delay={120}>
    <p className="ins-readout" role="status">{active ? <><span data-field-tone={field === 'model' ? 'model' : 'tier'} data-field-unavailable={active.key === NOT_RECORDED}>{active.key}</span>: <span data-field-tone="count">{count(active.runs)} runs</span> · {(active.runs / runs.length * 100).toFixed(1)}% of this window</> : 'Select a bar to inspect its count and share'}</p>
    <div className="overview-volume-bars">
      {groups.map((group, index) => <button type="button" key={group.key} aria-pressed={selected === group.key}
        aria-label={`${group.key}: ${count(group.runs)} ${group.runs === 1 ? 'run' : 'runs'}`} onClick={() => setSelected(group.key)}
        style={{ '--ins-swatch': PALETTE[index % PALETTE.length] } as CSSProperties}>
        <span className="overview-volume-label" data-field-tone={field === 'model' ? 'model' : 'tier'} data-field-unavailable={group.key === NOT_RECORDED}>{group.key}</span><strong data-field-tone="count">{count(group.runs)}</strong>
        <span className="overview-volume-track" aria-hidden="true"><span style={{ width: `${group.runs / maximum * 100}%` }} /></span>
      </button>)}
    </div>
  </ChartCard>;
}

function OutcomeComposition({ runs }: { runs: InsightRun[] }) {
  const totals = summary(runs);
  const [selected, setSelected] = useState<number | null>(null);
  const segments = [{ label: 'Passed', value: totals.passed, color: PASS }, { label: 'Failed', value: totals.failed, color: FAIL }, { label: 'Not recorded', value: totals.unrecorded, color: UNKNOWN }];
  let offset = 0;
  return <ChartCard title="Run outcomes" icon={<ChartPie size={16} />} accent="var(--ins-series-3)" note="Returned-run composition" delay={180}>
    <div className="overview-outcomes">
      <svg viewBox="0 0 120 120" className="overview-outcome-donut" aria-hidden="true">
        {segments.map((segment, index) => {
          const share = segment.value / runs.length * 100;
          const start = offset;
          offset += share;
          return segment.value > 0 && <circle key={segment.label} cx="60" cy="60" r="44" fill="none" stroke={segment.color} strokeWidth="13"
            pathLength="100" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} transform="rotate(-90 60 60)"
            opacity={selected === null || selected === index ? 1 : .3} />;
        })}
        <text x="60" y="59" textAnchor="middle" className="overview-outcome-total">{count(runs.length)}</text>
        <text x="60" y="73" textAnchor="middle" className="overview-outcome-caption">runs</text>
      </svg>
      <div className="overview-outcome-legend">{segments.map((segment, index) => <button type="button" key={segment.label} data-field-tone={index === 0 ? 'pass' : index === 1 ? 'fail' : 'basis'} data-field-unavailable={index === 2} aria-pressed={selected === index}
        aria-label={`${segment.label}: ${count(segment.value)} ${segment.value === 1 ? 'run' : 'runs'}`} onClick={() => setSelected(index)} style={{ '--ins-swatch': segment.color } as CSSProperties}>
        <span aria-hidden="true" /><span>{segment.label}</span><strong>{count(segment.value)}</strong>
      </button>)}</div>
    </div>
    <p role="status" className="ins-readout">{selected === null ? 'Includes runs without a recorded verdict' : <span data-field-tone={selected === 0 ? 'pass' : selected === 1 ? 'fail' : 'basis'} data-field-unavailable={selected === 2}>{segments[selected]!.label}: {count(segments[selected]!.value)} {segments[selected]!.value === 1 ? 'run' : 'runs'}</span>}</p>
  </ChartCard>;
}

function ChartSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="overview-chart-section" aria-label={title}><h3 className="local-dashboard-caption overview-chart-heading">{title}</h3><div className="overview-chart-row">{children}</div></section>;
}

function TokensPerDay({ days }: { days: InsightDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = (day: InsightDay) => (day.tokensIn === null ? 0 : day.tokensIn) + (day.tokensOut === null ? 0 : day.tokensOut);
  const max = Math.max(1, ...days.map(total));
  const side = (value: number | null, missing: number, direction: 'in' | 'out') => `${value === null ? 'not recorded' : count(value)} ${direction}${value !== null && missing > 0 ? ` (partial: ${count(missing)} ${missing === 1 ? 'run' : 'runs'} not recorded)` : ''}`;
  const label = (day: InsightDay) => `${dayLabel(day.day)}: ${side(day.tokensIn, day.tokensInUnmeasured, 'in')}, ${side(day.tokensOut, day.tokensOutUnmeasured, 'out')}`;
  const active = hover === null ? null : days[hover]!;
  return (
    <ChartCard title="Tokens per day" icon={<ArrowDownUp size={16} />} accent="var(--field-tokens-daily)" delay={420}>
      <ul className="ins-token-legend" aria-label="Token series">
        <li data-field-tone="tokens-in"><ArrowDown size={14} aria-hidden="true" /><span>Tokens in</span></li>
        <li data-field-tone="tokens-out"><ArrowUp size={14} aria-hidden="true" /><span>Tokens out</span></li>
      </ul>
      <Readout active={active !== null} text={active ? <>{dayLabel(active.day)} · <span data-field-tone="tokens-in" data-field-unavailable={active.tokensIn === null}>{side(active.tokensIn, active.tokensInUnmeasured, 'in')}</span>, <span data-field-tone="tokens-out" data-field-unavailable={active.tokensOut === null}>{side(active.tokensOut, active.tokensOutUnmeasured, 'out')}</span></> : <><span data-field-tone="tokens-in">Tokens in</span> and <span data-field-tone="tokens-out">out</span>, per UTC day</>} />
      <div className="ins-bars" role="group" aria-label="Tokens per day" onMouseLeave={() => setHover(null)}>
        {days.map((day, index) => (
          <button key={day.day} type="button" className="ins-bar" aria-label={label(day)}
            data-dim={hover !== null && hover !== index} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}>
            {day.tokensOut !== null && <span className="ins-seg od-grow" style={{ height: `${(day.tokensOut / max) * 100}%`, background: 'var(--field-tokens-out)', animationDelay: `${index * 30}ms` }} />}
            {day.tokensIn !== null && <span className="ins-seg od-grow" style={{ height: `${(day.tokensIn / max) * 100}%`, background: 'var(--field-tokens-in)', animationDelay: `${index * 30}ms` }} />}
          </button>
        ))}
      </div>
      <div className="ins-axis"><span>{dayLabel(days[0]!.day)}</span><span>{dayLabel(days[days.length - 1]!.day)}</span></div>
    </ChartCard>
  );
}

/**
 * The Overview's one window ("Figures for"), when the page provides it: Today is today's UTC day; All time is every
 * day from the oldest served run to today (at least 7, at most 30 days drawn). With no page window (a standalone
 * render) the section keeps its own Today / 7 / 14 day switch.
 */
export const InsightsWindowContext = createContext<'all' | 'today' | null>(null);

/** The Overview's served decision rows, for the Quality hero's pass-rate line (OMN-21166 approved mockup). */
export const OverviewRunsContext = createContext<{ decisions: readonly unknown[]; now: number } | null>(null);

/**
 * The Quality hero's "Pass rate per day": the same chart the trends drew, moved into the hero as the mockup has it.
 * It follows the page window like the trends (today shows the last 7 days for context); with no page rows it draws
 * nothing, so the Quality panel alone is unchanged.
 */
export function PassRateSparkline() {
  const context = useContext(OverviewRunsContext);
  const pageWindow = useContext(InsightsWindowContext);
  if (context === null) return null;
  const runs = toInsightRuns(context.decisions);
  if (runs.length === 0) return null;
  return <PassRateTrend days={dailySeries(runs, context.now, pageWindow === 'all' ? allTimeDays(runs, context.now) : 7)} />;
}
const MAX_ALL_TIME_DAYS = 30;

function allTimeDays(runs: readonly InsightRun[], now: number): number {
  if (runs.length === 0) return 7;
  const oldest = Math.min(...runs.map(run => Date.parse(`${run.day}T00:00:00Z`)));
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.min(MAX_ALL_TIME_DAYS, Math.max(7, Math.round((today - oldest) / 86_400_000) + 1));
}

export function InsightsSection({ decisions, now, view = 'all', onInspectFailure }: { decisions: readonly unknown[]; now: number; view?: 'all' | 'summary' | 'analysis'; onInspectFailure?: (cause: string) => void }) {
  const pageWindow = useContext(InsightsWindowContext);
  const [ownDays, setDays] = useState<number>(7);
  const all = toInsightRuns(decisions);
  const days = pageWindow === 'today' ? 1 : pageWindow === 'all' ? allTimeDays(all, now) : ownDays;
  const runs = windowRuns(all, now, days);
  const chartDays = dailySeries(all, now, days === 1 ? 7 : days);
  // The exposure returns only its latest rows. A calendar axis is not proof
  // that earlier days contain no runs; disclose the actual received span.
  const times = all.map(run => run.at);
  const utcTime = (time: number) => new Date(time).toISOString().slice(0, 19).replace('T', ' ');
  const servedSpan = times.length === 0 ? 'No dated runs served' : `${utcTime(Math.min(...times))}–${utcTime(Math.max(...times))} UTC`;
  const servedCount = decisions.length;
  const undatedCount = servedCount - all.length;
  const population = pageWindow === 'all' && runs.length === servedCount
    ? `Latest ${count(servedCount)} served runs`
    : `${count(runs.length)} of the latest ${count(servedCount)} served runs · ${days === 1 ? 'today' : `last ${days} UTC days`}`;
  const undated = undatedCount > 0 ? ` · ${count(undatedCount)} undated ${undatedCount === 1 ? 'row' : 'rows'} excluded` : '';
  return (
    <div className={`ins-section${view === 'summary' ? ' ins-section--summary' : ''}`} aria-label="Insights" role="group">
      {pageWindow === null && (
        <div className="local-dashboard-filters ins-range" role="group" aria-label="Range">
          {RANGES.map(range => (
            <button key={range.days} type="button" aria-pressed={days === range.days} onClick={() => setDays(range.days)}>{range.label}</button>
          ))}
        </div>
      )}
      <p className="local-dashboard-caption ins-sub" data-testid="insights-total">{population}{undated} · Row timestamps: {servedSpan} · Earlier activity is not included</p>
      {runs.length === 0 ? <p className="local-dashboard-empty ins-empty" role="status" aria-label="Insights">{days === 1 ? 'No runs today' : `No runs in the last ${days} days`}</p> : (
        <div className="overview-chart-sections">
          {view !== 'analysis' && <ChartSection title="Activity over time"><RunsPerDay days={chartDays} /><TokensPerDay days={chartDays} /></ChartSection>}
          {view !== 'summary' && <>
          <ChartSection title="Routing and workload"><VolumeBars runs={runs} field="model" /><VolumeBars runs={runs} field="tier" /><TaskMix runs={runs} /></ChartSection>
          <ChartSection title="Quality and outcomes"><OutcomeComposition runs={runs} /><PassRateTrend days={chartDays} /><FailureCauses runs={runs} onInspectFailure={onInspectFailure} /></ChartSection>
          <ChartSection title="Performance by model"><DurationHistogram runs={runs} /><ModelScoreboard runs={runs} /></ChartSection>
          <ChartSection title="Activity by UTC hour"><ActivityHeatmap runs={all} now={now} /></ChartSection>
          </>}
        </div>
      )}
      {view === 'summary' && <nav className="local-summary-links" aria-label="Detailed analysis"><Link href="/runs">Explore run analysis</Link><Link href="/usage">Explore usage</Link></nav>}
    </div>
  );
}
