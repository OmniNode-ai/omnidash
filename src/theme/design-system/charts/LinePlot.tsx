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
    path += `${drawing ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    drawing = true;
  });
  return path.trim();
}

const W = 600;
const H = 120;

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
export interface PlotLine { key: string; color: string; values: ReadonlyArray<number | null> }

/**
 * OMN-22168 (Lakshman 2026-11-04, "legend and one line chart for all"): several lines over the same days, each drawn
 * against its own largest value so lines of different units (runs, tokens, dollars) are all readable together. Heights
 * compare a line with itself, never with another line; each day is one focusable column whose name gives every value.
 */
export function MultiLinePlot({ label, lines, keys, labels, hover, onHover }: {
  label: string;
  lines: readonly PlotLine[];
  /** One stable key per point (a day). */
  keys: readonly string[];
  /** Each day's accessible name, in words, with every line's value. */
  labels: readonly string[];
  hover: number | null;
  onHover: (index: number | null) => void;
}) {
  const at = (index: number) => (keys.length > 1 ? (index / (keys.length - 1)) * 100 : 50);
  const peak = (values: ReadonlyArray<number | null>) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length === 0 ? 1 : Math.max(...known);
  };
  return (
    <div className="ins-plot ins-plot--multi">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {lines.map(line => (
          <path key={line.key} className="od-draw" data-line={line.key} d={linePath(line.values, 0, peak(line.values), W, H)} fill="none"
            stroke={line.color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      {hover !== null && <span className="ins-marker" style={{ left: `${at(hover)}%` }} />}
      {/* A dot for each line on the day in focus, so the reader sees where each line sits that day. */}
      {hover !== null && lines.map(line => {
        const value = line.values[hover];
        if (value === null || value === undefined) return null;
        const top = ((H - 6 - (value / peak(line.values)) * (H - 12)) / H) * 100;
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
