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
        <path className="od-draw" d={linePath(values, min, max, W, H)} pathLength={1} fill="none" stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
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
