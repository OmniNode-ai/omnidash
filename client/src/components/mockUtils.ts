export type TimeSeriesPoint = { time: string; value: number };

export function generateTimeSeries(count = 20, base = 1, variance = 0.4): TimeSeriesPoint[] {
  const now = Date.now();
  const points: TimeSeriesPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now - i * 60 * 1000).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const jitter = (Math.random() - 0.5) * variance * base * 2;
    const val = Math.max(0, base + jitter);
    points.push({ time: t, value: Number(val.toFixed(2)) });
  }
  return points;
}

export function generateCategorical(
  entries: Array<{ key: string }>,
  total = 100
): Array<{ key: string; value: number; percentage: number }> {
  if (entries.length === 0) return [];
  const weights = entries.map(() => Math.random());
  const sum = weights.reduce((a, b) => a + b, 0);
  return entries.map((e, i) => {
    const value = Math.round((weights[i] / sum) * total);
    const percentage = Math.round((value / total) * 1000) / 10;
    return { key: e.key, value, percentage };
  });
}

export function ensureTimeSeries(
  data?: TimeSeriesPoint[],
  base = 1,
  variance = 0.4
): { data: TimeSeriesPoint[]; isMock: boolean } {
  if (data && data.length > 0) return { data, isMock: false };
  return { data: generateTimeSeries(20, base, variance), isMock: true };
}

export function ensureArray<T>(
  items: T[] | undefined,
  fallback: T[]
): { data: T[]; isMock: boolean } {
  if (items && items.length > 0) return { data: items, isMock: false };
  return { data: fallback, isMock: true };
}
