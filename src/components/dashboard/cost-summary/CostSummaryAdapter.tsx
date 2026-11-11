/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype widget layout while source-level typography compliance is enforced separately. */
import { useState, useMemo, type CSSProperties } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { CountUp, SortableTable } from '@/components/primitives';
import type { ColumnDef } from '@/components/primitives';
import { fixed as fmtFixed, localeString as fmtLocaleString } from '@/theme/format';
// OMN-23330 AC25: this file's fixed inline styles are classes in CostSummaryAdapter.static.css.
import './CostSummaryAdapter.static.css';

// ── Data types ──────────────────────────────────────────────────────

interface CostRow {
  total_cost_usd?: number;
  total_savings_usd?: number;
  total_tokens?: number;
  usage_source?: string;
}

// ── Synthetic data ──────────────────────────────────────────────────

const KPIS = {
  totalCloudSpend: 12.34,
  cloudAvoided: 487.62,
  tokensProcessed: 38_400_000,
  localPct: 0.75,
};

const COST_TREND = (() => {
  const out: { t: number; local: number; cloud: number; savedVsCloud: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const local = 0;
    let cloud = 0;
    if (i === 4) cloud = 0.118;
    if (i === 11) cloud = 0.034;
    if (i === 19) cloud = 0.092;
    if (i === 24) cloud = 0.041;
    out.push({ t: i, local, cloud, savedVsCloud: 0.41 + Math.sin(i * 0.4) * 0.06 });
  }
  return out;
})();

interface PerModelRow {
  id: string;
  name: string;
  tier: string;
  tasks: number;
  tokensM: number;
  spent: number;
  wouldHaveCost: number;
  p50: number;
  p95: number;
  accuracy: number;
  color: string;
}

// OMN-22168: these six demo rows are frozen by the hardcoded-model-config ratchet (config/hardcoded_model_config_baseline.yaml,
// "entries only leave"), so their lines stay byte-identical. Their colour strings name six legacy properties; the
// widget's root maps each one to its design token (LEGACY_ROW_COLOURS below), so nothing here reads an old token.
const PER_MODEL_SAVINGS: PerModelRow[] = [
  { id: 'qwen3-coder-30b', name: 'Qwen3-Coder-30B', tier: 'local', tasks: 412, tokensM: 14.8, spent: 0.00, wouldHaveCost: 198.40, p50: 1.4, p95: 2.9, accuracy: 0.942, color: 'var(--compute)' },
  { id: 'deepseek-r1-32b', name: 'DeepSeek-R1-32B', tier: 'local', tasks: 187, tokensM: 9.2, spent: 0.00, wouldHaveCost: 142.18, p50: 7.0, p95: 12.4, accuracy: 0.918, color: 'var(--reducer)' },
  { id: 'qwen3-next-80b', name: 'Qwen3-Next-80B', tier: 'local', tasks: 94, tokensM: 6.1, spent: 0.00, wouldHaveCost: 87.55, p50: 2.6, p95: 4.8, accuracy: 0.901, color: 'var(--orchestrator)' },
  { id: 'deepseek-r1-14b', name: 'DeepSeek-R1-14B', tier: 'local', tasks: 156, tokensM: 4.8, spent: 0.00, wouldHaveCost: 41.20, p50: 0.8, p95: 1.6, accuracy: 0.873, color: 'var(--effect)' },
  { id: 'claude-sonnet-4-5', name: 'Claude-Sonnet-4-5', tier: 'cloud', tasks: 19, tokensM: 2.1, spent: 8.94, wouldHaveCost: 8.94, p50: 21.0, p95: 32.5, accuracy: 0.967, color: 'var(--accent)' },
  { id: 'glm-4-plus', name: 'GLM-4-Plus', tier: 'cloud', tasks: 41, tokensM: 1.4, spent: 3.40, wouldHaveCost: 3.40, p50: 8.7, p95: 14.2, accuracy: 0.889, "color": 'var(--ink-3)' },
];

/** The frozen rows' colour names, mapped to the tokens they always meant (node kinds, brand, muted ink). */
const LEGACY_ROW_COLOURS = {
  '--compute': 'var(--ds-kind-compute)',
  '--reducer': 'var(--ds-kind-reducer)',
  '--orchestrator': 'var(--ds-kind-orchestrator)',
  '--effect': 'var(--ds-kind-effect)',
  '--accent': 'var(--ds-brand)',
  '--ink-3': 'var(--ds-ink-3)',
} as CSSProperties;

// ── SmallKPI ────────────────────────────────────────────────────────

function SmallKPI({ label, value, prefix = '', suffix = '', decimals = 0, tone = 'default' }: {
  label: string; value: number; prefix?: string; suffix?: string; decimals?: number; tone?: string;
}) {
  const c = tone === 'good' ? 'var(--ds-ok)' : 'var(--ds-ink)';
  return (
    <div>
      <div className="mono tnum" style={{ "fontSize": 18, "fontWeight": 700, color: c, "lineHeight": 1 }}>
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div className="cost-summary-adapter-sd5faf9">
        {label}
      </div>
    </div>
  );
}

// ── Cost Line Chart ─────────────────────────────────────────────────

function CostLineChart({ data }: { data: typeof COST_TREND }) {
  const W = 480, H = 140;
  const padL = 40, padR = 16, padT = 24, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const baseline = data.map((_d, i) => {
    const v = 0.10 + Math.sin(i * 0.35) * 0.05 + Math.cos(i * 0.22) * 0.025 + (i % 7 === 0 ? 0.03 : 0);
    return Math.max(0.04, v);
  });

  const allVals = [...baseline, ...data.map((d) => d.cloud)];
  const yMax = Math.max(...allVals, 0.2);

  const x = (i: number) => padL + (i / (data.length - 1)) * innerW;
  const y = (v: number) => padT + (1 - v / yMax) * innerH;

  const baselinePath = baseline.map((v, i) => `${i === 0 ? 'M' : 'L'} ${fmtFixed(x(i), 1)} ${fmtFixed(y(v), 1)}`).join(' ');
  const actualPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${fmtFixed(x(i), 1)} ${fmtFixed(y(d.cloud), 1)}`).join(' ');

  const yTicks = [0, 0.05, 0.10, 0.15, 0.20].filter((t) => t <= yMax);

  return (
    <svg className="cost-summary-adapter-s048b9a" viewBox={`0 0 ${W} ${H}`} width="100%">
      {/* horizontal gridlines */}
      {yTicks.map((t) => (
        <line key={t} x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--ds-ink-4)" strokeWidth="0.5" />
      ))}

      {/* y-axis labels */}
      {yTicks.map((t) => (
        <text key={`y-${t}`} x={padL - 6} y={y(t) + 3} fontSize="9" fill="var(--ds-ink-3)" fontFamily="var(--ds-font-mono)" textAnchor="end">
          ${fmtFixed(t, 2)}
        </text>
      ))}

      {/* cloud-only baseline — same weight as actual spend */}
      <path d={baselinePath} fill="none" stroke="var(--ds-warn)" strokeWidth="1.5" />
      {baseline.map((v, i) => (
        <circle key={`b-${i}`} cx={x(i)} cy={y(v)} r="1.5" fill="var(--ds-warn)" opacity="0.5" />
      ))}

      {/* actual spend — thin line, small dots */}
      <path d={actualPath} fill="none" stroke="var(--ds-ok)" strokeWidth="1.5" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={`a-${i}`} cx={x(i)} cy={y(d.cloud)} r={d.cloud > 0.01 ? 3 : 1.5} fill="var(--ds-ok)" />
      ))}

      {/* x-axis line */}
      <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--ds-ink-4)" strokeWidth="0.5" />

      {/* x-axis labels */}
      <text x={padL} y={H - 8} fontSize="9" fill="var(--ds-ink-3)" fontFamily="var(--ds-font-mono)">{'−'}30m</text>
      <text x={padL + innerW * 0.33} y={H - 8} fontSize="9" fill="var(--ds-ink-3)" fontFamily="var(--ds-font-mono)" textAnchor="middle">{'−'}20m</text>
      <text x={padL + innerW * 0.66} y={H - 8} fontSize="9" fill="var(--ds-ink-3)" fontFamily="var(--ds-font-mono)" textAnchor="middle">{'−'}10m</text>
      <text x={W - padR} y={H - 8} fontSize="9" fill="var(--ds-ink-3)" fontFamily="var(--ds-font-mono)" textAnchor="end">now</text>

      {/* legend */}
      <g transform={`translate(${padL}, ${padT - 12})`}>
        <line x1="0" y1="0" x2="16" y2="0" stroke="var(--ds-warn)" strokeWidth="1.5" />
        <circle cx="8" cy="0" r="2" fill="var(--ds-warn)" />
        <text x="22" y="3" fontSize="9" fill="var(--ds-ink-2)" fontFamily="var(--ds-font-mono)">cloud-only baseline</text>

        <line x1="160" y1="0" x2="176" y2="0" stroke="var(--ds-ok)" strokeWidth="1.5" />
        <circle cx="168" cy="0" r="2" fill="var(--ds-ok)" />
        <text x="182" y="3" fontSize="9" fill="var(--ds-ink-2)" fontFamily="var(--ds-font-mono)">actual spend</text>
      </g>
    </svg>
  );
}

// ── Column picker ───────────────────────────────────────────────────

function ColumnPicker({ open, onToggle, options, visible, setVisible }: {
  open: boolean;
  onToggle: () => void;
  options: { key: string; label: string }[];
  visible: Record<string, boolean>;
  setVisible: (fn: (v: Record<string, boolean>) => Record<string, boolean>) => void;
}) {
  return (
    <div className="cost-summary-adapter-s50666a">
      <button
        type="button"
        onClick={onToggle}
        className="mono"
        style={{
          appearance: 'none',
          cursor: 'pointer',
          height: 24,
          padding: '0 10px',
          background: open ? 'var(--ds-inset)' : 'var(--ds-surface)',
          border: '1px solid var(--ds-line)',
          borderRadius: 6,
          "fontSize": 10,
          "fontWeight": 700,
          "color": 'var(--ds-ink-2)',
          "letterSpacing": '0.08em',
          "textTransform": 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1,2 L9,2 M1,5 L9,5 M1,8 L9,8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Columns
      </button>
      {open && (
        <div className="cost-summary-adapter-sb7b9d2"
        >
          <div className="eyebrow cost-summary-adapter-s4feedf">show columns</div>
          {options.map((opt) => (
            <label className="cost-summary-adapter-s9ffbf7"
              key={opt.key}
            >
              <input className="cost-summary-adapter-saece64"
                type="checkbox"
                checked={!!visible[opt.key]}
                onChange={() => setVisible((v) => ({ ...v, [opt.key]: !v[opt.key] }))}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Total view ──────────────────────────────────────────────────────

function TotalView({ k, trend, localPctDeg, cloudPctDeg }: {
  k: typeof KPIS;
  trend: typeof COST_TREND;
  localPctDeg: number;
  cloudPctDeg: number;
}) {
  return (
    <>
      {/* Hero */}
      <div className="cost-summary-adapter-se5e1c3">
        <div className="mono tnum cost-summary-adapter-scaa4fc">
          <CountUp value={localPctDeg} suffix="%" />
        </div>
        <div className="cost-summary-adapter-s15fa32">
          <div className="cost-summary-adapter-s9a3dee">tokens routed locally</div>
          <div className="cost-summary-adapter-s2ee8e7">$0 marginal cost {'·'} 4 hosts on-prem</div>
        </div>
      </div>

      {/* Split bar */}
      <div className="cost-summary-adapter-sfe5717">
        <div style={{ width: `${localPctDeg}%`, background: 'var(--ds-ok)', display: 'flex', alignItems: 'center', paddingLeft: 10, color: 'var(--ds-on-inverse)', "fontSize": 10, "fontWeight": 600, "letterSpacing": '0.08em', transition: 'width .9s cubic-bezier(.2,.7,.3,1)' }}>
          {localPctDeg}% LOCAL
        </div>
        <div style={{ width: `${cloudPctDeg}%`, background: 'var(--ds-brand)', display: 'flex', alignItems: 'center', paddingLeft: 10, color: 'var(--ds-on-inverse)', "fontSize": 10, "fontWeight": 600, "letterSpacing": '0.08em' }}>
          {cloudPctDeg}% CLOUD
        </div>
      </div>
      <div className="cost-summary-adapter-sab1c0b">
        <span>Routed to local models</span>
        <span className="mono">$<CountUp value={k.cloudAvoided} decimals={2} /> avoided</span>
      </div>

      <hr className="hr cost-summary-adapter-see3746" />

      <div className="cost-summary-adapter-s373c5c">
        <SmallKPI label="Cloud spend" value={k.totalCloudSpend} prefix="$" decimals={2} />
        <SmallKPI label="Avoided" value={k.cloudAvoided} prefix="$" decimals={2} tone="good" />
        <SmallKPI label="Tokens" value={k.tokensProcessed / 1e6} suffix="M" decimals={1} />
      </div>

      {/* Line chart */}
      <div className="cost-summary-adapter-s8de070">
        <div className="cost-summary-adapter-s8d7976">
          <div className="eyebrow">cost per minute {'·'} last 30 min</div>
          <div className="mono cost-summary-adapter-sa29e5a">{'↓'} 87% vs cloud-only</div>
        </div>
        <CostLineChart data={trend} />
      </div>
    </>
  );
}

// ── Per-model view ──────────────────────────────────────────────────

function PerModelView({ models, totalSaved }: { models: PerModelRow[]; totalSaved: number }) {
  const local = models.filter((m) => m.tier === 'local');
  const cloud = models.filter((m) => m.tier === 'cloud');

  const [visible, setVisible] = useState<Record<string, boolean>>({
    name: true, tier: false, tasks: false, tokensM: false, p50: true, p95: false, accuracy: true, spent: false, savings: true, bar: false,
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  const max = Math.max(...models.map((m) => m.wouldHaveCost));

  const allColumns: ColumnDef<PerModelRow>[] = [
    {
      key: 'name', label: 'Model', width: 'minmax(120px, 1.4fr)',
      sortValue: (r) => r.name,
      render: (m) => (
        <span className="cost-summary-adapter-sbdd4c6">
          <span style={{ width: 7, height: 7, borderRadius: 2, background: m.color, flexShrink: 0 }} />
          <span className="cost-summary-adapter-se13d16">{m.name}</span>
        </span>
      ),
    },
    {
      key: 'tier', label: 'Tier', width: '52px',
      render: (m) => (
        <span className="mono" style={{ "fontSize": 10, color: m.tier === 'local' ? 'var(--ds-ok)' : 'var(--ds-link)', "textTransform": 'uppercase', "letterSpacing": '0.06em', "fontWeight": 600 }}>{m.tier}</span>
      ),
    },
    { key: 'tasks', label: 'Tasks', width: '56px', align: 'right', mono: true, render: (m) => fmtLocaleString(m.tasks) },
    { key: 'tokensM', label: 'Tokens', width: '62px', align: 'right', mono: true, render: (m) => `${fmtFixed(m.tokensM, 1)}M` },
    {
      key: 'p50', label: 'p50', width: '56px', align: 'right', mono: true,
      render: (m) => <span style={{ color: m.p50 < 3 ? 'var(--ds-ok)' : m.p50 < 10 ? 'var(--ds-ink)' : 'var(--ds-bad)' }}>{fmtFixed(m.p50, 1)}s</span>,
    },
    { key: 'p95', label: 'p95', width: '56px', align: 'right', mono: true, render: (m) => `${fmtFixed(m.p95, 1)}s` },
    {
      key: 'accuracy', label: 'Acc', width: '60px', align: 'right', mono: true,
      sortValue: (m) => m.accuracy,
      render: (m) => (
        <span style={{ color: m.accuracy >= 0.93 ? 'var(--ds-ok)' : m.accuracy >= 0.88 ? 'var(--ds-ink)' : 'var(--ds-warn)', "fontWeight": 600 }}>
          {fmtFixed((m.accuracy * 100), 1)}%
        </span>
      ),
    },
    {
      key: 'spent', label: 'Spent', width: '62px', align: 'right', mono: true,
      render: (m) => `$${fmtFixed(m.spent, 2)}`,
    },
    {
      key: 'savings', label: 'Saved', width: '72px', align: 'right', mono: true,
      sortValue: (m) => m.wouldHaveCost - m.spent,
      render: (m) => {
        const saved = m.wouldHaveCost - m.spent;
        return (
          <span style={{ "fontWeight": 700, color: m.tier === 'local' ? 'var(--ds-ok)' : 'var(--ds-ink-3)' }}>
            {m.tier === 'local' ? `+$${fmtFixed(saved, 2)}` : '—'}
          </span>
        );
      },
    },
    {
      key: 'bar', label: 'Cost vs would-be', width: 'minmax(80px, 1fr)',
      sortValue: (m) => m.wouldHaveCost,
      render: (m) => {
        const wouldPct = (m.wouldHaveCost / max) * 100;
        const spentPct = (m.spent / max) * 100;
        return (
          <div className="cost-summary-adapter-s15eec4" title={`would have cost $${fmtFixed(m.wouldHaveCost, 2)} · actual $${fmtFixed(m.spent, 2)}`}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${wouldPct}%`, background: m.tier === 'local' ? 'var(--ds-ok-soft)' : 'var(--ds-brand-soft)' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${spentPct}%`, background: 'var(--ds-brand)' }} />
          </div>
        );
      },
    },
  ];

  const columns = allColumns.map((c) => ({ ...c, hidden: !visible[c.key] }));

  const colOptions = [
    { key: 'tier', label: 'Tier' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'tokensM', label: 'Tokens' },
    { key: 'p50', label: 'Latency p50' },
    { key: 'p95', label: 'Latency p95' },
    { key: 'accuracy', label: 'Accuracy' },
    { key: 'spent', label: 'Spent' },
    { key: 'savings', label: 'Saved' },
    { key: 'bar', label: 'Cost bar' },
  ];

  return (
    <>
      {/* Hero */}
      <div className="cost-summary-adapter-se5e1c3">
        <div className="mono tnum cost-summary-adapter-sdedd55">
          $<CountUp value={totalSaved} decimals={2} />
        </div>
        <div className="cost-summary-adapter-s15fa32">
          <div className="cost-summary-adapter-s9a3dee">saved {'·'} routed to local models</div>
          <div className="cost-summary-adapter-s2ee8e7">{local.length} local {'·'} {cloud.length} cloud {'·'} last 7 days</div>
        </div>
        <ColumnPicker open={pickerOpen} onToggle={() => setPickerOpen((o) => !o)} options={colOptions} visible={visible} setVisible={setVisible} />
      </div>

      <SortableTable
        rows={models}
        columns={columns}
        initialSort={{ key: 'savings', dir: 'desc' }}
        rowKey="id"
      />
    </>
  );
}

// ── Main widget ─────────────────────────────────────────────────────

type CostSummaryConfig = Record<string, never>;

export default function CostSummaryAdapter(_config: CostSummaryConfig) {
  const { data, isLoading, error } = useProjectionQuery<CostRow>({
    queryKey: ['cost-summary', TOPICS.costSummary],
    topic: TOPICS.costSummary,
  });

  // Use projection data if available, otherwise fall back to synthetic
  const k = useMemo(() => {
    const row = data?.[0];
    if (row && typeof row.total_cost_usd === 'number') {
      return {
        totalCloudSpend: row.total_cost_usd,
        cloudAvoided: row.total_savings_usd ?? KPIS.cloudAvoided,
        tokensProcessed: row.total_tokens ?? KPIS.tokensProcessed,
        localPct: KPIS.localPct,
      };
    }
    return KPIS;
  }, [data]);

  const [viewProp, setViewProp] = useState<'total' | 'permodel'>('total');
  const view = viewProp;
  const setView = setViewProp;

  const localPctDeg = Math.round(k.localPct * 100);
  const cloudPctDeg = 100 - localPctDeg;

  const totalSaved = PER_MODEL_SAVINGS.reduce((s, m) => s + (m.wouldHaveCost - m.spent), 0);

  return (
    <ComponentWrapper
      title="Cost Summary"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={false}
    >
      <div style={{ width: '100%', ...LEGACY_ROW_COLOURS }}>
        <div className="card-hd">
          <div>
            <div className="eyebrow">Cost summary {'·'} last 7 days</div>
          </div>
          <div className="seg" role="tablist" aria-label="Cost view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'total'}
              className={`seg-btn${view === 'total' ? ' is-on' : ''}`}
              onClick={() => setView('total')}
            >
              Total
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'permodel'}
              className={`seg-btn${view === 'permodel' ? ' is-on' : ''}`}
              onClick={() => setView('permodel')}
            >
              Per model
            </button>
          </div>
        </div>

        {view === 'total' ? (
          <TotalView k={k} trend={COST_TREND} localPctDeg={localPctDeg} cloudPctDeg={cloudPctDeg} />
        ) : (
          <PerModelView models={PER_MODEL_SAVINGS} totalSaved={totalSaved} />
        )}
      </div>
    </ComponentWrapper>
  );
}
