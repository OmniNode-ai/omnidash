/**
 * OMN-12943 — shared UI primitives for the ported event-dash views.
 *
 * SOURCE: Claude Design prototype app/ui.jsx (re-authored as typed TSX).
 * All typographic styling lives in src/styles/event-dash.css (scoped under
 * `.ev-root`); these components apply only className + non-typographic inline
 * style (widths, dynamic colors via CSS vars, grid templates) so the
 * local/no-typography-inline ESLint rule stays satisfied.
 *
 * These are presentation-only primitives: they render values handed to them.
 * They never read projections or own truth — the page components fetch via
 * src/services/event-dash-api.ts and pass already-typed data down.
 */

import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

// ── formatting helpers ───────────────────────────────────────────────────────

export const fmtPct = (x: number | null | undefined): string =>
  x == null ? '—' : `${Math.round(x * 100)}%`;
export const fmtPct1 = (x: number | null | undefined): string =>
  x == null ? '—' : `${(x * 100).toFixed(1)}%`;
export const fmtMoney = (x: number | null | undefined): string =>
  x == null ? '—' : `$${Number(x).toFixed(2)}`;
export const fmtMoney4 = (x: number | null | undefined): string =>
  x == null ? '—' : `$${Number(x).toFixed(4)}`;
export const fmtTokens = (n: number | null | undefined): string => {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
};
export const fmtLatency = (ms: number | null | undefined): string => {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
};
export const shortId = (id: string | null | undefined): string => {
  if (!id) return '—';
  if (id.length <= 16 || id.indexOf('-') === -1) {
    return id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
  }
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
};

// ── atoms ────────────────────────────────────────────────────────────────────

export type BadgeKind = 'ok' | 'fail' | 'warn' | 'info' | 'muted' | 'accent';

export function Badge({ kind = 'muted', children }: { kind?: BadgeKind; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

export function Dot({ kind = 'muted' }: { kind?: 'ok' | 'fail' | 'warn' | 'info' | 'muted' }) {
  return <span className={`dot ${kind}`} />;
}

export function StateBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <Badge kind="ok">
      <Dot kind="ok" />
      passed
    </Badge>
  ) : (
    <Badge kind="fail">failed</Badge>
  );
}

export function KPI({
  label,
  value,
  sub,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="kpi">
      <div className="k-l">{label}</div>
      <div className={`k-v${accent ? ' k-accent' : ''}`}>{value}</div>
      {sub ? <div className="k-sub">{sub}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  sub,
  right,
  children,
  pad = true,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  pad?: boolean;
}) {
  return (
    <div className="panel">
      {title || right ? (
        <div className="panel-h">
          {title ? <span className="pt">{title}</span> : null}
          {sub ? <span className="ps">{sub}</span> : null}
          {right ? <span className="right">{right}</span> : null}
        </div>
      ) : null}
      <div className={pad ? 'panel-b' : ''} style={pad ? undefined : { padding: 0 }}>
        {children}
      </div>
    </div>
  );
}

// ── horizontal bar row ───────────────────────────────────────────────────────

export function BarRow({
  label,
  value,
  pct,
  color = 'blue',
}: {
  label: ReactNode;
  value: ReactNode;
  pct: number;
  color?: string;
}) {
  return (
    <div className="barrow">
      <div className="lab">{label}</div>
      <div className="val">{value}</div>
      <div className="track2 bar-track">
        <div className={`bar-fill m-${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

// ── code block with light highlighting ───────────────────────────────────────

type HlToken = ReactNode;

function hlPython(line: string): HlToken[] {
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|return|import|from|class|if|else|elif|for|in|None|True|False|get)\b/g;
  const out: HlToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1]) out.push(<span key={k++} className="tok-str">{m[1]}</span>);
    else out.push(<span key={k++} className="tok-key">{m[2]}</span>);
    last = re.lastIndex;
  }
  out.push(line.slice(last));
  return out;
}

function hlYaml(line: string): HlToken[] {
  const m = line.match(/^(\s*)([\w.-]+)(:)(.*)$/);
  if (!m) return [line];
  return [m[1], <span key="k" className="tok-key">{m[2]}</span>, m[3], <span key="v" className="tok-str">{m[4]}</span>];
}

export function CodeBlock({
  title,
  lang,
  code,
}: {
  title?: string;
  lang: 'python' | 'yaml' | 'text';
  code: string;
}) {
  const lines = String(code).split('\n');
  const hl = lang === 'python' ? hlPython : lang === 'yaml' ? hlYaml : (l: string): HlToken[] => [l];
  return (
    <div className="code">
      {title ? (
        <div className="code-h">
          {title}
          <span className="lang">{lang}</span>
        </div>
      ) : null}
      <pre>
        {lines.map((ln, i) => (
          <Fragment key={i}>
            {hl(ln)}
            {'\n'}
          </Fragment>
        ))}
      </pre>
    </div>
  );
}

// ── key/value grid ───────────────────────────────────────────────────────────

export interface KVItem {
  k: ReactNode;
  v: ReactNode;
  accent?: boolean;
}

export function KV({ items }: { items: (KVItem | null | false)[] }) {
  const real = items.filter((it): it is KVItem => Boolean(it));
  return (
    <div className="kv">
      {real.map((it, i) => (
        <div key={i}>
          <div className="k">{it.k}</div>
          <div className={`v${it.accent ? ' accent' : ''}`}>{it.v}</div>
        </div>
      ))}
    </div>
  );
}

// ── generic expandable data table ────────────────────────────────────────────

export interface DataColumn<T> {
  key: string;
  label: string;
  num?: boolean;
  width?: string;
  grow?: boolean;
  truncate?: boolean;
  render?: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  renderDetail,
  activeKey,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  renderDetail?: (row: T) => ReactNode;
  activeKey?: string | null;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const colSize = (c: DataColumn<T>): string =>
    c.width ? c.width : c.grow ? 'minmax(0,2.6fr)' : c.num ? 'minmax(0,0.9fr)' : 'minmax(0,1fr)';
  const template = `26px ${columns.map(colSize).join(' ')}`;
  const gridStyle: CSSProperties = { gridTemplateColumns: template };
  return (
    <div className="dt">
      <div className="dt-head" style={gridStyle}>
        <div />
        {columns.map((c) => (
          <div key={c.key} className={c.num ? 'num' : undefined}>
            {c.label}
          </div>
        ))}
      </div>
      {rows.map((r) => {
        const key = rowKey(r);
        const isOpen = Boolean(open[key]);
        const isActive = activeKey != null && key === activeKey;
        return (
          <div className={`row${isOpen ? ' open' : ''}${isActive ? ' active' : ''}`} key={key}>
            <div
              className="row-main"
              style={gridStyle}
              onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
            >
              <div className="cflex">
                <ChevronRight className="caret" size={14} />
              </div>
              {columns.map((c) => (
                <div key={c.key} className={`${c.num ? 'num ' : ''}${c.truncate ? 'truncate' : ''}`.trim() || undefined}>
                  {c.render ? c.render(r) : (r as Record<string, ReactNode>)[c.key]}
                </div>
              ))}
            </div>
            {isOpen && renderDetail ? (
              <div className="row-detail">
                <div className="row-detail-inner">{renderDetail(r)}</div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── honest empty / degraded / loading states ─────────────────────────────────

export function EvEmpty({
  title,
  reason,
  note,
}: {
  title: string;
  reason?: string | null;
  note?: string;
}) {
  return (
    <div className="ev-empty">
      <div className="ev-empty-title">{title}</div>
      {reason ? <div className="ev-empty-reason">{reason}</div> : null}
      {note ? <div className="ev-empty-note">{note}</div> : null}
    </div>
  );
}

/** Freshness chip — honest stale/fresh indicator driven by the projection envelope. */
export function FreshnessChip({
  freshness,
  latestEventAt,
}: {
  freshness: 'fresh' | 'stale' | 'degraded' | 'unknown';
  latestEventAt: string | null;
}) {
  if (freshness === 'fresh') {
    return (
      <span className="live-pill">
        <span className="pulse" />
        live
      </span>
    );
  }
  const label = latestEventAt ? `stale · last event ${latestEventAt.replace('T', ' ').slice(0, 19)}` : 'degraded';
  return (
    <span className="live-pill stale" title={label}>
      <span className="pulse" />
      {freshness === 'unknown' ? 'no data' : 'stale'}
    </span>
  );
}
