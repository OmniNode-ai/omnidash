/**
 * OMN-12943 — Experimentation Platform (ported from prototype view-experiments.jsx).
 *
 * SOURCE: Claude Design prototype app/view-experiments.jsx (ExperimentsView).
 * Per the live :13002 census + OMN-12955 closure loop:
 *   - context.experiment-scores.v1 → SERVED via node_projection_context_roi
 *     (OMN-12955): the ContextExperimentHero + ContextHeatmap panels read the
 *     live context_roi_scores projection and render an honest empty state until
 *     fresh experiment output lands.
 *   - baselines.roi.v1 → NOT SERVED (unknown_topic) — still a recorded-evidence
 *     surface pending its own projection.
 *   - ab-compare.v1 → served but DEGRADED ("table 'public.llm_call_metrics' not found")
 *   - delegation.quality-gate.v1 + delegation.decisions.v1 → READY
 * AB-compare renders its honest degraded state from the envelope; QualityDist is
 * DERIVED from the real quality-gate + per-decision rows. No data.jsx fixture
 * ships, and nothing fabricates the unavailable projections.
 */

import { EvPageShell } from '@/components/dashboard/event-dash/EvPageShell';
import {
  EvEmpty,
  Panel,
  fmtPct,
} from '@/components/dashboard/event-dash/primitives';
// OMN-12833 (A4): Badge, fmtLatency, fmtMoney4, fmtTokens removed while AbCompare is commented out.
// Restore alongside the AbCompare function and its <AbCompare /> render call below.
import {
  useContextExperimentScores,
  useDelegationDecisions,
  useDelegationQualityGate,
} from '@/components/dashboard/event-dash/useEventDashData';
// OMN-12833 (A4): useAbCompare removed while AbCompare is commented out. Restore alongside it.
import { aggregateByArm, buildSegmentModelMatrix } from './context-roi-experiment';
// OMN-12833 (A4): aggregateAbCompareByModel removed while AbCompare is commented out. Restore alongside it.
// import { aggregateAbCompareByModel } from './ab-compare-aggregate';

// ── quality score distribution (derived from real decisions + quality gate) ──

function QualityDist() {
  const { data: qData } = useDelegationQualityGate();
  const { data: dData } = useDelegationDecisions();
  const q = qData?.rows[0];
  const decisions = dData?.rows ?? [];

  if (!q && decisions.length === 0) {
    return (
      <Panel title="QUALITY SCORE DISTRIBUTION">
        <EvEmpty title="No quality data" reason={qData?.degradedReason ?? dData?.degradedReason} />
      </Panel>
    );
  }

  // Two honest bands derived from the live deterministic gate: fail (0) vs pass (1).
  // The prototype's 5-band fixture is NOT reproduced — the live gate is binary.
  const passed = q ? q.total_passed : decisions.filter((d) => d.quality_gate_passed).length;
  const failed = q ? q.total_failed : decisions.filter((d) => !d.quality_gate_passed).length;
  const bands = [
    { band: '0 · fail', count: failed },
    { band: '1 · pass', count: passed },
  ];
  const max = Math.max(1, ...bands.map((b) => b.count));
  const total = passed + failed;
  return (
    <Panel title="QUALITY SCORE DISTRIBUTION" sub={`n=${total} delegated runs · deterministic gate (binary)`}>
      <div className="ev-hist">
        {bands.map((b) => (
          <div className="ev-hist-col" key={b.band}>
            <div className="mono ev-hist-count">{b.count}</div>
            <div className="ev-hist-bar" style={{ height: `${(b.count / max) * 100}%` }} />
            <div className="mono ev-hist-label">{b.band}</div>
          </div>
        ))}
      </div>
      <div className="chart-axis ev-hist-axis">quality score band (0 = fail · 1 = full pass)</div>
    </Panel>
  );
}

/* OMN-12833 (A4): AbCompare commented out — ab-compare.v1 is degraded because
   public.llm_call_metrics does not exist in the projection DB yet. Restore by
   uncommenting this function and the <AbCompare /> call below once the AB-compare
   emitter materialises the backing table.

// ── A/B model compare (per-model rollup of per-call rows, OMN-12993) ──────────
function AbCompare() {
  const { data, isLoading } = useAbCompare();
  if (isLoading || !data) {
    return <Panel title="A/B MODEL COMPARE"><EvEmpty title="Loading…" /></Panel>;
  }
  if (data.rows.length === 0) {
    return (
      <Panel title="A/B MODEL COMPARE" right={<Badge kind="warn">degraded</Badge>}>
        <EvEmpty
          title="A/B compare projection degraded"
          reason={data.degradedReason ?? 'ab-compare.v1 returned no rows'}
          note="Backing table public.llm_call_metrics is not present in the projection DB. Rows will appear once the AB-compare emitter materializes."
        />
      </Panel>
    );
  }

  const models = aggregateAbCompareByModel(data.rows);
  return (
    <Panel title="A/B MODEL COMPARE" sub="per model · live">
      {models.map((m) => (
        <div className="barrow" key={m.modelId === '' ? '__blank_model__' : m.modelId}>
          <div className="lab">{m.label}</div>
          <div className="val">
            {m.runs} runs · {fmtLatency(m.avgLatencyMs)} avg
            {m.hasUsage
              ? ` · ${fmtTokens(m.avgTokens)} tok · ${fmtMoney4(m.totalCostUsd)}`
              : ' · — tok · — usage'}
          </div>
        </div>
      ))}
    </Panel>
  );
}
*/

// ── context-ROI experiment closure loop (OMN-12955) ──────────────────────────
// Reads the live context_roi_scores projection
// (onex.snapshot.projection.context.experiment-scores.v1) materialized by the
// omnimarket node_projection_context_roi reducer from the context-ROI runner
// terminal event. Per-(run × task × arm × trial) rows are aggregated into the
// hero summary and the segment×model heatmap via the pure helpers in
// context-roi-experiment.ts. Empty/degraded states are honest: nothing is
// fabricated when the projection has no fresh rows yet.

function ContextExperimentHero() {
  const { data, isLoading } = useContextExperimentScores();
  if (isLoading || !data) {
    return (
      <Panel title="CONTEXT-INJECTION EXPERIMENT" right={<span className="src-tag">OMN-12955</span>}>
        <EvEmpty title="Loading…" />
      </Panel>
    );
  }
  const rows = data.rows;
  if (rows.length === 0) {
    return (
      <Panel title="CONTEXT-INJECTION EXPERIMENT" right={<span className="src-tag">OMN-12955</span>}>
        <EvEmpty
          title="No context-ROI experiment output yet"
          reason={data.degradedReason ?? 'context_roi_scores projection is served but has no rows'}
          note="The hero renders once a context-ROI run completes and node_projection_context_roi materializes its rows. No fixture is shown."
        />
      </Panel>
    );
  }

  const arms = aggregateByArm(rows);
  const off = arms.find((a) => a.subset === 'off');
  const offRate = off && off.trials > 0 ? off.firstPass / off.trials : null;
  const runIds = new Set(rows.map((r) => r.run_id));

  return (
    <Panel
      title="CONTEXT-INJECTION EXPERIMENT"
      sub={`${rows.length} trials · ${runIds.size} run(s) · live`}
      right={<span className="src-tag">OMN-12955</span>}
    >
      {arms.map((a) => {
        const rate = a.trials > 0 ? a.firstPass / a.trials : 0;
        const delta = offRate != null && a.subset !== 'off' ? rate - offRate : null;
        return (
          <div className="barrow" key={a.subset}>
            <div className="lab">{a.subset}</div>
            <div className="val">
              {a.trials} trials · first-pass {fmtPct(rate)}
              {delta != null ? ` · Δvs off ${delta >= 0 ? '+' : ''}${fmtPct(delta)}` : ''}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

function ContextHeatmap() {
  const { data, isLoading } = useContextExperimentScores();
  if (isLoading || !data) {
    return (
      <Panel title="CONTEXT-EFFECTIVENESS HEATMAP">
        <EvEmpty title="Loading…" />
      </Panel>
    );
  }
  const rows = data.rows;
  if (rows.length === 0) {
    return (
      <Panel title="CONTEXT-EFFECTIVENESS HEATMAP">
        <EvEmpty
          title="Heatmap has no experiment scores yet"
          reason={data.degradedReason ?? 'context_roi_scores projection is served but has no rows'}
          note="Renders the segment×model pass-rate matrix once context-ROI runs land. No mock heatmap."
        />
      </Panel>
    );
  }

  // segment (context_factor_subset) × model pass-rate matrix.
  const matrix = buildSegmentModelMatrix(rows);
  const segmentList = matrix.segments;
  const modelList = matrix.models;

  return (
    <Panel title="CONTEXT-EFFECTIVENESS HEATMAP" sub={`${segmentList.length} segment(s) × ${modelList.length} model(s) · live`}>
      <div className="ev-heatmap">
        {segmentList.map((seg) => (
          <div className="ev-heatmap-row" key={seg}>
            <div className="lab">{seg}</div>
            {modelList.map((model) => {
              const rate = matrix.cell(seg, model);
              return (
                <div className="ev-heatmap-cell" key={model} title={`${seg} × ${model}`}>
                  <span className="mono">{rate != null ? fmtPct(rate) : '—'}</span>
                  <span className="ev-heatmap-model">{model}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function ExperimentsPage() {
  // OMN-12833 (A4): upstream-blocked badge removed — the two broken panels are
  // commented out below, so the warning no longer applies to the beta render.
  // const decisionsQ = useDelegationDecisions();
  // const headRight = decisionsQ.data ? <Badge kind="warn">experiment projections partially upstream-blocked</Badge> : null;

  return (
    <EvPageShell
      crumb="OmniDash · Experimentation"
      title="Experimentation Platform"
      sub="Context ablation · quality distribution"
    >
      <ContextExperimentHero />

      <ContextHeatmap />

      {/* OMN-12833 (A4): A/B compare hidden — ab-compare.v1 is degraded because
          public.llm_call_metrics does not exist in the projection DB yet.
          Uncomment once the AB-compare emitter materialises the backing table.
      <AbCompare />
      */}

      {/* OMN-12833 (A4): Baselines ROI hidden — baselines.roi.v1 is unknown_topic
          (projection not yet materialised by the backend).
          Uncomment once the baselines-roi projection is served.
      <Panel title="BASELINES ROI" right={<Badge kind="muted">not wired</Badge>}>
        <EvEmpty
          title="Baselines ROI projection not served"
          reason="topic onex.snapshot.projection.baselines.roi.v1 not served (unknown_topic)"
          note="Promotion recommendations render once the baselines-roi projection is materialized."
        />
      </Panel>
      */}

      <QualityDist />

      <div className="note ev-exp-footer">
        Context-ablation scores (context.experiment-scores.v1) are served live via
        node_projection_context_roi (OMN-12955) and render an honest empty state
        until fresh context-ROI runs land. Quality score distribution derives from
        the live delegation quality-gate and per-decision rows.
      </div>
    </EvPageShell>
  );
}
