import { formatDashboardCount } from '@/lib/dashboard-count';
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

import { Fragment, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { isTenantNotConfiguredReason } from '@/data-source/projection-tenant';
import { TenantNotConfiguredState } from '../TenantNotConfiguredState';
import { ConceptIcon, FieldIcon } from '../FieldIcon';
import { modelIdentityStyle } from '../model-identity';
import { fieldTone, isUnavailableField } from '../field-identity';

// ── formatting helpers ───────────────────────────────────────────────────────

export const fmtPct = (x: number | null | undefined): string =>
  x == null ? '—' : `${Math.round(x * 100)}%`;
export const fmtPct1 = (x: number | null | undefined): string =>
  x == null ? '—' : `${(x * 100).toFixed(1)}%`;
export const fmtMoney = (x: number | null | undefined): string =>
  x == null ? '—' : `$${Number(x).toFixed(2)}`;
/** Four decimals, grouped like the dollar figures beside it (OMN-21166), with the sign before the currency. */
export const fmtMoney4 = (x: number | null | undefined): string => {
  if (x == null) return '—';
  const amount = Number(x);
  const text = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return amount < 0 ? `-$${text}` : `$${text}`;
};
export const fmtTokens = (n: number | null | undefined): string => {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
};
export const fmtLatency = (ms: number | null | undefined): string => {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
};
// OMN-21166 AC6: delegation.decisions.v1 serves `id` as an integer, so an id
// may arrive as a number; it is shown as its digits, and only null, undefined
// or an empty string read as missing.
export const shortId = (raw: string | number | null | undefined): string => {
  if (raw == null || raw === '') return '—';
  const id = String(raw);
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
  icon,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  icon?: ReactNode;
  tone?: 'blue' | 'green' | 'purple' | 'amber';
}) {
  return (
    <div className="kpi" data-tone={tone ?? fieldTone(label, value)} data-field-tone={fieldTone(label, value)} data-field-unavailable={isUnavailableField(value)} data-unavailable={typeof value === 'string' && /^(Not measured|Not served|Baseline unresolved|—$)/.test(value)}>
      <div className="k-l">{fieldTone(label, value) ? <FieldIcon label={label} value={value} size={15} /> : icon}{label}</div>
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
  const panelConcepts: Record<string, string> = {
    'SELECTED RUN': 'selected',
    'MODEL ROUTING': 'tier-mix',
    'QUALITY GATE': 'quality',
    'SAVINGS vs CLOUD BASELINE': 'savings',
    'TOKEN USAGE': 'tokens',
    'RECENT DELEGATIONS': 'recent',
  };
  const labels: Record<string, string> = {
    'SELECTED RUN': 'Selected run', 'MODEL ROUTING': 'Model routing',
    'QUALITY GATE': 'Quality gate', 'SAVINGS vs CLOUD BASELINE': 'Savings vs cloud baseline',
    'TOKEN USAGE': 'Token usage', 'RECENT DELEGATIONS': 'Recent delegations',
  };
  const label = typeof title === 'string' ? labels[title] ?? title : title;
  const concept = typeof title === 'string' ? panelConcepts[title] : undefined;
  return (
    <div className="panel" data-panel-title={typeof title === 'string' ? title : undefined}>
      {title || right ? (
        <div className="panel-h">
          {title ? <h2 className="pt" data-page-heading tabIndex={-1}>{concept && <span className="ev-panel-icon" aria-hidden="true"><ConceptIcon concept={concept} label={typeof label === 'string' ? label : undefined} size={16} /></span>}{label}</h2> : null}
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
        <div key={i} data-field-tone={fieldTone(it.k, it.v)} data-field-unavailable={isUnavailableField(it.v)}
          style={fieldTone(it.k, it.v) === 'model' && typeof it.v === 'string' && !isUnavailableField(it.v) ? modelIdentityStyle(it.v) : undefined}>
          <div className="k"><FieldIcon label={it.k} value={it.v} />{it.k}</div>
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
  pageSize,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  renderDetail?: (row: T) => ReactNode;
  activeKey?: string | null;
  pageSize?: number;
}) {
  const detailId = useId();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
  const size = pageSize && pageSize >= 1 ? Math.floor(pageSize) : Math.max(1, rows.length);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * size, (current + 1) * size);
  const colSize = (c: DataColumn<T>): string =>
    c.width ? c.width : c.grow ? 'minmax(0,2.6fr)' : c.num ? 'minmax(0,0.9fr)' : 'minmax(0,1fr)';
  const template = `26px ${columns.map(colSize).join(' ')}`;
  const gridStyle: CSSProperties = { gridTemplateColumns: template };
  return (
    <div className={`dt${pageSize ? ' dt-paged' : ''}`}>
      <div className="dt-head" style={gridStyle}>
        <div />
        {columns.map((c) => (
          <div key={c.key} className={c.num ? 'num' : undefined}>
            {c.label}
          </div>
        ))}
      </div>
      {shown.map((r) => {
        const key = rowKey(r);
        const isOpen = Boolean(open[key]);
        const isActive = activeKey != null && key === activeKey;
        return (
          <div className={`row${isOpen ? ' open' : ''}${isActive ? ' active' : ''}`} key={key}>
            <div
              className="row-main"
              style={gridStyle}
              onClick={renderDetail ? () => setOpen((o) => ({ ...o, [key]: !o[key] })) : undefined}
            >
              <div className="cflex">
                {renderDetail && <button type="button" className="row-disclosure" aria-label={`Toggle details for ${key}`} aria-expanded={isOpen}
                  aria-controls={`${detailId}-${encodeURIComponent(key)}`} onClick={event => {
                    event.stopPropagation(); setOpen(o => ({ ...o, [key]: !o[key] }));
                  }}><ChevronRight className="caret" size={14} aria-hidden="true" /></button>}
              </div>
              {columns.map((c) => (
                <div key={c.key} data-label={c.label} className={`${c.num ? 'num ' : ''}${c.truncate ? 'truncate' : ''}`.trim() || undefined}>
                  {c.render ? c.render(r) : (r as Record<string, ReactNode>)[c.key]}
                </div>
              ))}
            </div>
            {isOpen && renderDetail ? (
              <div className="row-detail" id={`${detailId}-${encodeURIComponent(key)}`}>
                <div className="row-detail-inner">{renderDetail(r)}</div>
              </div>
            ) : null}
          </div>
        );
      })}
      {pages > 1 && <nav className="ev-table-paging" aria-label="Record pages">
        <span aria-live="polite">{current * size + 1}–{Math.min((current + 1) * size, rows.length)} of {formatDashboardCount(rows.length)}</span>
        <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous page</button>
        <button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>Next page</button>
      </nav>}
    </div>
  );
}

// ── honest empty / degraded / loading states ─────────────────────────────────

/**
 * OMN-21166 (Chrome walk, 2026-10-18): a bare HTTP status reads as a sentence, the status kept beside it
 * ("HTTP 503" → "Not served by this runtime yet (HTTP 503)"). Any other reason is shown as given.
 */
export function readableReason(reason: string): string {
  const status = /^HTTP (\d{3})(?: .*)?$/.exec(reason.trim());
  if (!status) return reason;
  const code = Number(status[1]);
  if (code === 404 || code === 503) return `Not served by this runtime yet (${reason.trim()})`;
  if (code >= 500) return `The runtime could not answer (${reason.trim()})`;
  return reason;
}


export function EvEmpty({
  title,
  reason,
  note,
}: {
  title: string;
  reason?: string | null;
  note?: string;
}) {
  // OMN-19994: a tenant-scoped read refused for want of a tenant is the typed state, not an empty panel.
  if (isTenantNotConfiguredReason(reason)) {
    return (
      <div className="ev-empty">
        <TenantNotConfiguredState />
      </div>
    );
  }
  return (
    <div className="ev-empty">
      <div className="ev-empty-title">{title}</div>
      {reason ? <div className="ev-empty-reason">{readableReason(reason)}</div> : null}
      {note ? <div className="ev-empty-note">{note}</div> : null}
    </div>
  );
}

// ── page-level badge derivation ──────────────────────────────────────────────

/**
 * Minimal shape extracted from a settled ProjectionResult for badge derivation.
 * Keeping it narrow means derivePageBadge() stays testable without coupling to
 * query internals or the full ProjectionResult type.
 */
export interface ProjectionSnapshot {
  rowCount: number;
  /** Wire freshness from the projection envelope. */
  freshness: 'fresh' | 'stale' | 'degraded' | 'unknown';
}

export type PageBadgeState = 'live' | 'stale' | 'no-data' | 'degraded' | 'loading';

/**
 * OMN-12943: derive a single page-level badge state from all authoritative
 * projections for a page, not from any single query's freshness field.
 *
 * Rules (in priority order):
 *   loading  — no settled snapshots yet
 *   degraded — all rows === 0 AND at least one projection explicitly reported
 *              freshness 'degraded' (backend signal, not a client parse failure)
 *   no-data  — all rows === 0 with no explicit degradation
 *   live     — rows exist and at least one projection is 'fresh'
 *   stale    — rows exist but none are 'fresh' (includes 'unknown' freshness,
 *              which is treated conservatively as stale-not-degraded because
 *              'unknown' can arise from a malformed envelope, not only true
 *              backend degradation — see normalize() in event-dash-api.ts)
 */
export function derivePageBadge(snapshots: ProjectionSnapshot[]): PageBadgeState {
  if (snapshots.length === 0) return 'loading';
  const totalRows = snapshots.reduce((sum, s) => sum + s.rowCount, 0);
  if (totalRows === 0) {
    return snapshots.some((s) => s.freshness === 'degraded') ? 'degraded' : 'no-data';
  }
  return snapshots.some((s) => s.freshness === 'fresh') ? 'live' : 'stale';
}

// ── freshness chip ────────────────────────────────────────────────────────────

/**
 * Freshness chip — renders the derived page badge state in the page header.
 * Accepts the output of derivePageBadge() so the chip is a pure renderer with
 * no badge-derivation logic of its own.
 */
export function FreshnessChip({
  state,
  latestEventAt,
}: {
  state: PageBadgeState;
  /** Shown as a tooltip on stale to indicate when data was last seen. */
  latestEventAt?: string | null;
}) {
  if (state === 'live') {
    return (
      <span className="live-pill">
        <span className="pulse" />
        live
      </span>
    );
  }
  if (state === 'no-data') {
    return (
      <span className="live-pill stale">
        <span className="pulse" />
        no data
      </span>
    );
  }
  if (state === 'degraded') {
    return (
      <span className="live-pill stale" title="backend reported degraded">
        <span className="pulse" />
        degraded
      </span>
    );
  }
  // stale (covers 'stale' and 'loading' fallback — loading is resolved at the page level)
  const label = latestEventAt
    ? `stale · last event ${latestEventAt.replace('T', ' ').slice(0, 19)}`
    : 'stale';
  return (
    <span className="live-pill stale" title={label}>
      <span className="pulse" />
      stale
    </span>
  );
}
