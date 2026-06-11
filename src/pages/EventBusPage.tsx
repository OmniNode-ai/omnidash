/**
 * OMN-12943 — Event Bus (ported from prototype view-bus.jsx).
 *
 * SOURCE: Claude Design prototype app/view-bus.jsx (BusView).
 * Correlation-centric view of real bus activity. The simulated BusProvider /
 * playback (app/bus.jsx) does NOT ship: the "now on bus" surface and ticker
 * reflect the newest REAL rows polled from the delegation.decisions and
 * node-generation-completed projections. ProjectionHealth is a LIVE census of
 * the known topic set (each probed via the service layer), not a hardcoded list.
 */

import { EvPageShell } from '@/components/dashboard/event-dash/EvPageShell';
import {
  Badge,
  DataTable,
  EvEmpty,
  FreshnessChip,
  KPI,
  KV,
  Panel,
  StateBadge,
  fmtLatency,
  shortId,
  type DataColumn,
} from '@/components/dashboard/event-dash/primitives';
import {
  useDelegationDecisions,
  useNodeGenerations,
} from '@/components/dashboard/event-dash/useEventDashData';
import type {
  DelegationDecisionRow,
  NodeGenerationRow,
} from '@/services/event-dash-api';

// ── unified correlation row (delegation + SEA) ───────────────────────────────

interface BusCorrelation {
  id: string;
  source: 'sea' | 'delegation';
  subject: string;
  model: string;
  passed: boolean;
  latencyMs: number | null;
  createdAt: string;
  events: number;
}

function nodeName(r: NodeGenerationRow): string {
  const m = r.contract_yaml.match(/name:\s*([\w.-]+)/);
  return m ? m[1] : r.task_description.slice(0, 40);
}

function buildCorrelations(
  decisions: DelegationDecisionRow[],
  generations: NodeGenerationRow[],
): BusCorrelation[] {
  const del: BusCorrelation[] = decisions.map((r) => ({
    id: r.correlation_id,
    source: 'delegation',
    subject: r.task_type,
    model: r.model_name,
    passed: r.quality_gate_passed,
    latencyMs: r.latency_ms,
    createdAt: r.created_at,
    events: 5,
  }));
  const sea: BusCorrelation[] = generations.map((r) => ({
    id: r.correlation_id,
    source: 'sea',
    subject: nodeName(r),
    model: r.model_id,
    passed: r.contract_passed,
    latencyMs: r.total_latency_e2e_ms,
    createdAt: r.created_at,
    events: 6,
  }));
  return [...sea, ...del].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ── now-on-bus (newest real row) ─────────────────────────────────────────────

function NowOnBus({ latest, fresh }: { latest: BusCorrelation | null; fresh: boolean }) {
  if (!latest) return null;
  return (
    <div className="ev-nowbus">
      <span className={`live-pill${fresh ? '' : ' stale'}`}><span className="pulse" />{fresh ? 'Live' : 'Stale'}</span>
      <span className={`dot ${latest.passed ? 'ok' : 'fail'}`} />
      <span className="ev-nowbus-title">{latest.source === 'sea' ? 'SEA generation' : 'Delegation decision'} · {latest.subject}</span>
      <span className="mono dim3">{latest.source === 'sea' ? 'node-generation-completed.v1' : 'delegation.decisions.v1'}</span>
      <span className="mono dim3 ev-nowbus-cid">{shortId(latest.id)}</span>
    </div>
  );
}

// ── live projection / API health census ──────────────────────────────────────

interface HealthRow {
  name: string;
  topic: string;
  rowCount: number;
  freshness: string;
  status: 'ready' | 'degraded' | 'unknown';
  reason: string | null;
}

function CorrelationTable({ correlations }: { correlations: BusCorrelation[] }) {
  const cols: DataColumn<BusCorrelation>[] = [
    { key: 'id', label: 'Correlation', width: 'minmax(0,1.5fr)', render: (r) => <span className={`mono ${r.source === 'sea' ? 'c-amber' : 'c-blue'}`}>{shortId(r.id)}</span> },
    { key: 'source', label: 'Source', width: 'minmax(0,0.9fr)', render: (r) => <span className={`lane-tag ${r.source}`}>{r.source === 'sea' ? 'SEA' : 'delegation'}</span> },
    { key: 'subject', label: 'Subject', grow: true, truncate: true, render: (r) => <span className="mono">{r.subject}</span> },
    { key: 'model', label: 'Model', truncate: true, width: 'minmax(0,1.6fr)', render: (r) => <span className="mono dim">{r.model.length > 20 ? `${r.model.slice(0, 18)}…` : r.model}</span> },
    { key: 'state', label: 'State', width: 'minmax(0,0.9fr)', render: (r) => <StateBadge passed={r.passed} /> },
    { key: 'events', label: 'Events', num: true, width: 'minmax(0,0.7fr)', render: (r) => <span className="mono">{r.events}</span> },
    { key: 'latency', label: 'Latency', num: true, width: 'minmax(0,0.9fr)', render: (r) => fmtLatency(r.latencyMs) },
    { key: 'created_at', label: 'Created', num: true, width: 'minmax(0,1.3fr)', render: (r) => <span className="mono dim">{r.createdAt.replace('T', ' ').slice(0, 19)}</span> },
  ];
  return (
    <Panel
      title="CORRELATIONS ON THE BUS"
      sub="every correlation_id · SEA + delegation lifecycles"
      pad={false}
      right={<span className="note">{correlations.length} correlations · newest tracks the bus</span>}
    >
      <DataTable
        columns={cols}
        rows={correlations.slice(0, 80)}
        rowKey={(r) => r.id}
        activeKey={correlations[0]?.id ?? null}
        renderDetail={(r) => (
          <KV
            items={[
              { k: 'Correlation', v: r.id, accent: true },
              { k: 'Source', v: r.source === 'sea' ? 'self-extending agent' : 'delegation' },
              { k: 'Subject', v: r.subject },
              { k: 'Model', v: r.model },
              { k: 'Terminal state', v: r.passed ? 'passed' : 'failed' },
              { k: 'Created', v: r.createdAt.replace('T', ' ').slice(0, 19) },
            ]}
          />
        )}
      />
    </Panel>
  );
}

function ProjectionHealth({ rows }: { rows: HealthRow[] }) {
  const ready = rows.filter((r) => r.status === 'ready').length;
  const degraded = rows.filter((r) => r.status === 'degraded').length;
  const unknown = rows.filter((r) => r.status === 'unknown').length;
  const cols: DataColumn<HealthRow>[] = [
    { key: 'name', label: 'Projection', grow: true, render: (r) => <span>{r.name}<div className="mono dim3 ev-health-topic">{r.topic}</div></span> },
    { key: 'rowCount', label: 'Rows', num: true, render: (r) => <span className="mono">{r.rowCount}</span> },
    { key: 'freshness', label: 'Freshness', num: true, render: (r) => <span className="mono dim">{r.freshness}</span> },
    { key: 'status', label: 'Status', num: true, render: (r) => (r.status === 'ready' ? <Badge kind="ok">ready</Badge> : r.status === 'degraded' ? <Badge kind="warn">degraded</Badge> : <Badge kind="muted">unknown</Badge>) },
  ];
  return (
    <Panel title="PROJECTION / API HEALTH" sub={`${ready} ready · ${degraded} degraded · ${unknown} unknown`} pad={false}>
      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(r) => r.topic}
        renderDetail={(r) => (
          <KV
            items={[
              { k: 'Topic', v: r.topic, accent: true },
              { k: 'Rows returned', v: String(r.rowCount) },
              { k: 'Freshness', v: r.freshness },
              { k: 'Status', v: r.status },
              r.reason ? { k: 'Reason', v: r.reason } : null,
            ]}
          />
        )}
      />
    </Panel>
  );
}

export function EventBusPage() {
  const decisionsQ = useDelegationDecisions();
  const genQ = useNodeGenerations();

  const decisions = decisionsQ.data?.rows ?? [];
  const generations = genQ.data?.rows ?? [];
  const correlations = buildCorrelations(decisions, generations);
  const latest = correlations[0] ?? null;

  // Live health census from the two probed topics (both carry envelope state).
  const health: HealthRow[] = [];
  if (decisionsQ.data) {
    health.push({
      name: 'Delegation decisions',
      topic: 'onex.snapshot.projection.delegation.decisions.v1',
      rowCount: decisionsQ.data.rowCount,
      freshness: decisionsQ.data.freshness,
      status: decisionsQ.data.rowCount > 0 ? 'ready' : decisionsQ.data.isDegraded ? 'degraded' : 'unknown',
      reason: decisionsQ.data.degradedReason,
    });
  }
  if (genQ.data) {
    health.push({
      name: 'SEA node generations',
      topic: 'onex.evt.omnimarket.node-generation-completed.v1',
      rowCount: genQ.data.rowCount,
      freshness: genQ.data.freshness,
      status: genQ.data.rowCount > 0 ? 'ready' : genQ.data.isDegraded ? 'degraded' : 'unknown',
      reason: genQ.data.degradedReason,
    });
  }

  const fresh = decisionsQ.data?.freshness === 'fresh' || genQ.data?.freshness === 'fresh';
  const headRight = decisionsQ.data ? <FreshnessChip freshness={decisionsQ.data.freshness} latestEventAt={decisionsQ.data.latestEventAt} /> : null;

  return (
    <EvPageShell
      crumb="OmniDash · Event Bus"
      title="Event Bus"
      sub="Every dashboard is a projection of this stream — live correlation census"
      headRight={headRight}
    >
      <div className="grid cols-4">
        <KPI label="Correlations" value={correlations.length} accent sub="SEA + delegation lifecycles" />
        <KPI label="Delegation rows" value={decisionsQ.data ? decisionsQ.data.rowCount : '—'} sub="delegation.decisions.v1" />
        <KPI label="SEA rows" value={genQ.data ? genQ.data.rowCount : '—'} sub="node-generation-completed.v1" />
        <KPI label="WS invalidation" value={<span className="ev-kpi-sm c-amber">HTTP</span>} sub="state flows over the bus" />
      </div>

      <NowOnBus latest={latest} fresh={Boolean(fresh)} />

      {decisionsQ.isLoading && genQ.isLoading ? (
        <Panel title="CORRELATIONS ON THE BUS"><EvEmpty title="Loading…" /></Panel>
      ) : correlations.length === 0 ? (
        <Panel title="CORRELATIONS ON THE BUS">
          <EvEmpty title="No correlations on the bus" reason={decisionsQ.data?.degradedReason ?? genQ.data?.degradedReason} note="Neither delegation nor SEA projections returned rows." />
        </Panel>
      ) : (
        <CorrelationTable correlations={correlations} />
      )}

      <div className="grid cols-2 ev-align-start">
        {health.length > 0 ? <ProjectionHealth rows={health} /> : <Panel title="PROJECTION / API HEALTH"><EvEmpty title="Loading census…" /></Panel>}
        <Panel title="RUNTIME TOPOLOGY" sub="owned topics · live row counts">
          <KV
            items={[
              { k: 'Lane', v: 'stability-test (:13002 projection API)', accent: true },
              { k: 'Owned topics with data', v: String(health.filter((h) => h.rowCount > 0).length) },
            ]}
          />
          <div className="divider" />
          <div className="section-label">Owned topics</div>
          {health.map((h) => (
            <div className="ev-owned-topic" key={h.topic}>
              <span className="mono ev-owned-topic-name">{h.topic}</span>
              <span className="mono dim3">{h.rowCount} row{h.rowCount === 1 ? '' : 's'}</span>
            </div>
          ))}
        </Panel>
      </div>
    </EvPageShell>
  );
}
