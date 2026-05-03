/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype primitive layout while source-level typography compliance is enforced separately. */
import { CountUp } from './CountUp';

type KPITone = 'default' | 'good' | 'warn' | 'bad' | 'accent';

const TONE_COLOR: Record<KPITone, string> = {
  default: 'var(--ink)',
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  accent: 'var(--accent)',
};

export interface KPIProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  tone?: KPITone;
  caption?: string;
  big?: boolean;
}

/**
 * KPI tile -- eyebrow label + large animated number with semantic tone coloring.
 */
export function KPI({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  tone = 'default',
  caption,
  big = false,
}: KPIProps) {
  const toneColor = TONE_COLOR[tone];

  return (
    <div className="kpi">
      <div
        className="kpi-num tnum"
        style={{ color: toneColor, fontSize: big ? 56 : 'var(--kpi-num)' }}
      >
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div className="kpi-label">{label}</div>
      {caption && (
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, fontStyle: 'italic' }}>
          {caption}
        </div>
      )}
    </div>
  );
}
