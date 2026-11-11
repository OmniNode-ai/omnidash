import { useId } from 'react';
import { fixed as fmtFixed } from '@/theme/format';
/**
 * OMN-22168 AC3: the line chart of the local pages (Pass rate per day). Moved from src/pages/local/insight-charts.tsx.
 * A day without a value breaks the line rather than drawing a 0, and gets no dot; every day is a focusable column.
 */
export function linePath(values: ReadonlyArray<number | null>, min: number, max: number, width: number, height: number): string {
  // A flat scale (every value equal) still needs a non-zero height to draw on.
  const span = max > min ? max - min : 1;
  let path = '';
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) { drawing = false; return; }
    const x = values.length > 1 ? (index / (values.length - 1)) * width : width / 2;
    const y = height - 6 - ((value - min) / span) * (height - 12);
    path += `${drawing ? 'L' : 'M'}${fmtFixed(x, 1)} ${fmtFixed(y, 1)} `;
    drawing = true;
  });
  return path.trim();
}

const W = 600;
const H = 120;

/**
 * OMN-22168 (Lakshman 2026-11-05, "this look congested and bad"): the same points as linePath, joined by monotone cubic
 * curves (Fritsch-Carlson, as d3's curveMonotoneX). A tangent is 0 where the line turns, and never steeper than either
 * neighbouring slope, so a curve stays within the heights of the two days it joins: it never invents a peak or a dip.
 * A null breaks the line, as in linePath; a run of two points is a straight segment.
 */
export function smoothPath(values: ReadonlyArray<number | null>, max: number, width: number, height: number): string {
  const span = max > 0 ? max : 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const runs: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> = [];
  values.forEach((value, index) => {
    if (value === null) { if (run.length) runs.push(run); run = []; return; }
    run.push([values.length > 1 ? index * step : width / 2, height - 6 - (value / span) * (height - 12)]);
  });
  if (run.length) runs.push(run);
  const f = (n: number) => fmtFixed(n, 1);
  return runs.map(points => {
    let d = `M${f(points[0]![0])} ${f(points[0]![1])}`;
    if (points.length === 2) return `${d} L${f(points[1]![0])} ${f(points[1]![1])}`;
    if (points.length < 2) return d;
    const slopes = points.slice(1).map((point, index) => (point[1] - points[index]![1]) / (point[0] - points[index]![0]));
    const tangents = points.map((_, index) => {
      if (index === 0) return slopes[0]!;
      if (index === points.length - 1) return slopes[slopes.length - 1]!;
      const [before, after] = [slopes[index - 1]!, slopes[index]!];
      if (before * after <= 0) return 0;
      return Math.sign(before) * Math.min(Math.abs(before), Math.abs(after), Math.abs((before + after) / 2));
    });
    for (let index = 0; index + 1 < points.length; index += 1) {
      const [[x0, y0], [x1, y1]] = [points[index]!, points[index + 1]!];
      const third = (x1 - x0) / 3;
      d += ` C${f(x0 + third)} ${f(y0 + tangents[index]! * third)} ${f(x1 - third)} ${f(y1 - tangents[index + 1]! * third)} ${f(x1)} ${f(y1)}`;
    }
    return d;
  }).join(' ');
}


export function LinePlot({ label, values, keys, labels, min, max, hover, onHover, color }: {
  label: string;
  values: ReadonlyArray<number | null>;
  /** One stable key per point (a day). */
  keys: readonly string[];
  /** Each point's accessible name, in words. */
  labels: readonly string[];
  min: number; max: number;
  hover: number | null;
  onHover: (index: number | null) => void;
  color: string;
}) {
  const span = max > min ? max - min : 1;
  const at = (index: number) => (values.length > 1 ? (index / (values.length - 1)) * 100 : 50);
  return (
    <div className="ins-plot">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <path className="od-draw" d={linePath(values, min, max, W, H)} fill="none" stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {/* A dot on every point that has a value, so a single day still shows (a line needs two). */}
      {values.map((value, index) => value === null ? null : (
        <span key={keys[index]} className="ins-dot" data-active={hover === index}
          style={{ left: `${at(index)}%`, top: `${((H - 6 - ((value - min) / span) * (H - 12)) / H) * 100}%` }} />
      ))}
      {hover !== null && <span className="ins-marker" style={{ left: `${at(hover)}%` }} />}
      <div className="ins-hits" onMouseLeave={() => onHover(null)}>
        {labels.map((text, index) => (
          <button key={keys[index]} type="button" className="ins-hit" aria-label={text} onMouseEnter={() => onHover(index)} onFocus={() => onHover(index)} />
        ))}
      </div>
    </div>
  );
}

/** One line of a MultiLinePlot: its values (null breaks the line) and its colour. */
export interface PlotLine {
  key: string; color: string; values: ReadonlyArray<number | null>;
}

/**
 * OMN-22168 (Lakshman 2026-11-04, "legend and one line chart for all"): several lines over the same days, each drawn
 * against its own largest value so lines of different units (runs, tokens, dollars) are all readable together. Heights
 * compare a line with itself, never with another line; each day is one focusable column whose name gives every value.
 */
export function MultiLinePlot({ label, lines, keys, labels, hover, onHover, focus = null }: {
  label: string;
  lines: readonly PlotLine[];
  /** One stable key per point (a day). */
  keys: readonly string[];
  /** Each day's accessible name, in words, with every line's value. */
  labels: readonly string[];
  hover: number | null;
  onHover: (index: number | null) => void;
  /** The line drawn in front, bold and with a soft fill; the others are drawn thinner behind it. */
  focus?: string | null;
}) {
  const at = (index: number) => (keys.length > 1 ? (index / (keys.length - 1)) * 100 : 50);
  const peak = (values: ReadonlyArray<number | null>) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length === 0 ? 1 : Math.max(...known);
  };
  const fillId = `ins-fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const front = lines.find(line => line.key === focus) ?? null;
  // The lines keep one order (moving an SVG node restarts its draw-in animation); the line in focus is drawn again on top.
  const order = lines;
  const topOf = (value: number, values: ReadonlyArray<number | null>) => ((H - 6 - (value / peak(values)) * (H - 12)) / H) * 100;
  return (
    // The operator, 2026-11-10: values are given in the readout above the plot, never as labels over it; the plot shows
    // where the pointer is (the guide line and a dot on each line), superseding OMN-23330 AC7's peak labels.
    <div className="ins-plot ins-plot--multi" data-focus={front ? front.key : undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {front && (
          <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={front.color} stopOpacity={0.28} /><stop offset="100%" stopColor={front.color} stopOpacity={0} />
          </linearGradient></defs>
        )}
        {front && smoothPath(front.values, peak(front.values), W, H).split(/ (?=M)/).filter(part => part.includes('C') || part.includes('L')).map((part, index) => {
          const xs = [...part.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(match => Number(match[1]));
          return <path key={index} className="ins-area" aria-hidden="true" fill={`url(#${fillId})`} stroke="none"
            d={`${part} L${fmtFixed(Math.max(...xs), 1)} ${H} L${fmtFixed(Math.min(...xs), 1)} ${H} Z`} />;
        })}
        {order.map(line => (
          <path key={line.key} className="od-draw" data-line={line.key} data-front={front ? String(line === front) : undefined}
            d={smoothPath(line.values, peak(line.values), W, H)} fill="none" stroke={line.color}
            strokeWidth={front && line !== front ? 1.75 : 2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {front && <path key={`front-${front.key}`} className="ins-front" aria-hidden="true" d={smoothPath(front.values, peak(front.values), W, H)}
          fill="none" stroke={front.color} strokeWidth={2.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
      </svg>
      {/* A served day with no served neighbour has no segment to draw, so it is a dot (never lost). */}
      {order.map(line => line.values.map((value, index) => (value === null || line.values[index - 1] != null || line.values[index + 1] != null ? null
        : <span key={`${line.key}-${index}`} className="ins-lone" data-line={line.key} data-front={front ? String(line === front) : undefined} aria-hidden="true"
          style={{ left: `${at(index)}%`, top: `${topOf(value, line.values)}%`, background: line.color }} />)))}
      {hover !== null && <span className="ins-marker" style={{ left: `${at(hover)}%` }} />}
      {/* A dot for each line on the day in focus, so the reader sees where each line sits that day. */}
      {hover !== null && lines.map(line => {
        const value = line.values[hover];
        if (value === null || value === undefined) return null;
        const top = topOf(value, line.values);
        return <span key={line.key} className="ins-dot" data-active="true" style={{ left: `${at(hover)}%`, top: `${top}%`, background: line.color }} />;
      })}
      <div className="ins-hits" onMouseLeave={() => onHover(null)}>
        {labels.map((text, index) => (
          <button key={keys[index]} type="button" className="ins-hit" aria-label={text} onMouseEnter={() => onHover(index)} onFocus={() => onHover(index)} />
        ))}
      </div>
    </div>
  );
}
