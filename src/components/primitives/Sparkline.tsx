export interface SparklineProps {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
}

/**
 * Sparkline -- tiny inline SVG trend line.
 */
export function Sparkline({
  data,
  w = 80,
  h = 24,
  color = 'var(--accent)',
}: SparklineProps) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 0.001);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
