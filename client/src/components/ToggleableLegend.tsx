/**
 * ToggleableLegend — Recharts-compatible legend with click-to-toggle
 *
 * Drop-in replacement for Recharts <Legend> that integrates with
 * useToggleableLegend(). Hidden series render at reduced opacity with
 * a strikethrough-style dim. Clicking toggles visibility; the parent
 * chart sets `hide={!legend.isActive(key)}` on each <Area>/<Line>/<Bar>.
 *
 * Usage:
 *   const legend = useToggleableLegend();
 *   <Legend content={<ToggleableLegend legend={legend} labels={...} />} />
 *   <Area dataKey="foo" hide={!legend.isActive('foo')} />
 */

import type { ToggleableLegendState } from '@/hooks/useToggleableLegend';

interface LegendPayloadItem {
  value: string;
  dataKey?: string | number;
  color?: string;
  type?: string;
}

interface ToggleableLegendProps {
  /** Legend state from useToggleableLegend() */
  legend: ToggleableLegendState;

  /** Optional display labels: { dataKey: "Human Label" } */
  labels?: Record<string, string>;

  /** Recharts injects this automatically via `content` prop */
  payload?: LegendPayloadItem[];
}

export function ToggleableLegend({ legend, labels, payload }: ToggleableLegendProps) {
  if (!payload?.length) return null;

  return (
    <div className="flex items-center justify-center gap-4 text-xs pt-1">
      {payload.map((entry) => {
        const key = entry.dataKey != null ? String(entry.dataKey) : entry.value;
        const active = legend.isActive(key);
        const label = labels?.[key] ?? entry.value;

        return (
          <button
            key={key}
            type="button"
            className="flex items-center gap-1.5 cursor-pointer select-none transition-opacity"
            style={{ opacity: active ? 1 : 0.35 }}
            onClick={() => legend.toggle(key)}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
